"""Vapi webhook handler — security-hardened port of the original TypeScript route.

Two payload branches:
  1. capture_rental_lead tool call → insert into `leads` and broadcast via WS
  2. Vapi event (status-update / transcript / end-of-call-report / conversation-update)
     → upsert `call_sessions` and append `call_transcripts`

All security measures from the original are preserved:
  - 16KB body cap
  - JSON content-type enforcement
  - Per-IP sliding-window rate limit (60 req/min)
  - Timing-safe HMAC-SHA256 secret comparison via SHA-256 digests
  - Generic 401 for ALL auth failure modes (no agent_id enumeration)
  - Idempotency replay on x-request-id
  - Structured JSON logging
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse
from motor.motor_asyncio import AsyncIOMotorDatabase

from realtime import hub

router = APIRouter()
logger = logging.getLogger("vapi-webhook")

MAX_BODY_BYTES = 16 * 1024
RL_WINDOW_SEC = 60
RL_MAX = 60
DUMMY_SECRET = "whsec_" + ("0" * 64)

PHONE_RE = re.compile(r"^[+0-9 ()\-\.]+$")
AGENT_ID_RE = re.compile(r"^agent_[a-zA-Z0-9_-]+$")


def _safe_eq(a: str, b: str) -> bool:
    """Constant-time, constant-length compare via SHA-256 digests."""
    ah = hashlib.sha256(a.encode("utf-8")).digest()
    bh = hashlib.sha256(b.encode("utf-8")).digest()
    return hmac.compare_digest(ah, bh)


def _trim(s: Any, max_len: int) -> Optional[str]:
    if s is None:
        return None
    if not isinstance(s, str):
        return None
    s = s.strip()
    if not s:
        return None
    return s[:max_len]


def _log(level: str, request_id: str, stage: str, **fields: Any) -> None:
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "level": level,
        "scope": "vapi-webhook",
        "request_id": request_id,
        "stage": stage,
        **fields,
    }
    msg = json.dumps(entry, default=str)
    if level == "error":
        logger.error(msg)
    elif level == "warn":
        logger.warning(msg)
    else:
        logger.info(msg)


def _json_response(status: int, body: Dict[str, Any], request_id: str,
                   extra_headers: Optional[Dict[str, str]] = None) -> JSONResponse:
    headers = {
        "x-request-id": request_id,
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "no-referrer",
        "Cache-Control": "no-store",
    }
    if extra_headers:
        headers.update(extra_headers)
    return JSONResponse(status_code=status, content={"request_id": request_id, **body},
                        headers=headers)


def _stage_to_status(stage: str) -> str:
    if stage == "success":
        return "inserted"
    if stage in ("unauthorized", "rate_limited"):
        return "unauthorized"
    if stage in ("invalid_body", "invalid_json", "invalid_payload",
                 "unsupported_media_type", "payload_too_large"):
        return "invalid"
    if stage in ("misconfigured", "profile_lookup_failed", "unknown_agent", "insert_failed"):
        return "failed"
    return "authorized"


async def _check_rate_limit(db: AsyncIOMotorDatabase, ip: str) -> Dict[str, Any]:
    """Sliding window using webhook_ip_attempts collection."""
    since = datetime.now(timezone.utc) - timedelta(seconds=RL_WINDOW_SEC)
    cursor = db.webhook_ip_attempts.find(
        {"ip": ip, "created_at": {"$gte": since.isoformat()}},
        {"_id": 0, "created_at": 1},
    ).sort("created_at", 1)
    rows = await cursor.to_list(length=RL_MAX + 5)
    used = len(rows)
    if used >= RL_MAX:
        oldest = rows[0]["created_at"]
        oldest_dt = datetime.fromisoformat(oldest) if isinstance(oldest, str) else oldest
        if oldest_dt.tzinfo is None:
            oldest_dt = oldest_dt.replace(tzinfo=timezone.utc)
        retry_at = oldest_dt + timedelta(seconds=RL_WINDOW_SEC)
        retry_after_ms = int((retry_at - datetime.now(timezone.utc)).total_seconds() * 1000)
        return {"allowed": False, "used": used, "limit": RL_MAX,
                "retry_after_ms": max(1000, retry_after_ms)}
    return {"allowed": True, "used": used, "limit": RL_MAX, "retry_after_ms": 0}


async def _record_ip_attempt(db: AsyncIOMotorDatabase, ip: str, agent_id: Optional[str],
                             outcome: str) -> None:
    try:
        await db.webhook_ip_attempts.insert_one({
            "id": str(uuid.uuid4()),
            "ip": ip or "unknown",
            "agent_id": agent_id,
            "outcome": outcome,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        # Opportunistic prune
        if secrets.randbelow(50) == 0:
            cutoff = datetime.now(timezone.utc) - timedelta(minutes=10)
            await db.webhook_ip_attempts.delete_many(
                {"created_at": {"$lt": cutoff.isoformat()}}
            )
    except Exception:
        pass


async def _record_log(db: AsyncIOMotorDatabase, **entry: Any) -> None:
    try:
        await db.webhook_logs.insert_one({
            "id": str(uuid.uuid4()),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "source": "vapi",
            **entry,
        })
    except Exception as e:
        logger.error(f"webhook_log insert failed: {e}")


def _validate_lead_payload(body: Dict[str, Any]) -> Dict[str, Any]:
    """Returns {ok, data?, errors?}."""
    errors: Dict[str, str] = {}
    agent_id = body.get("agent_id")
    if not isinstance(agent_id, str) or not AGENT_ID_RE.match(agent_id.strip()):
        errors["agent_id"] = "must match agent_<id>"
    caller_phone = body.get("caller_phone")
    if caller_phone is not None:
        if not isinstance(caller_phone, str) or not PHONE_RE.match(caller_phone.strip()):
            errors["caller_phone"] = "invalid phone"
        elif not (3 <= len(caller_phone.strip()) <= 50):
            errors["caller_phone"] = "length 3-50"
    name = _trim(body.get("extracted_name"), 200)
    location = _trim(body.get("extracted_location"), 200)
    budget = _trim(body.get("extracted_budget"), 50)
    ptype = _trim(body.get("extracted_property_type"), 50)
    urgency = _trim(body.get("extracted_urgency"), 50)
    notes_raw = body.get("notes")
    notes = None
    if notes_raw is not None:
        if not isinstance(notes_raw, str):
            errors["notes"] = "must be string"
        elif len(notes_raw) > 2000:
            errors["notes"] = "max 2000"
        else:
            notes = notes_raw.strip()
    if errors:
        return {"ok": False, "errors": errors}
    return {
        "ok": True,
        "data": {
            "agent_id": agent_id.strip(),
            "caller_phone": caller_phone.strip() if isinstance(caller_phone, str) else None,
            "extracted_name": name,
            "extracted_location": location,
            "extracted_budget": budget,
            "extracted_property_type": ptype,
            "extracted_urgency": urgency,
            "notes": notes,
        },
    }


def _looks_like_vapi_event(j: Any) -> bool:
    if not isinstance(j, dict):
        return False
    msg = j.get("message")
    return isinstance(msg, dict) and isinstance(msg.get("type"), str) and isinstance(msg.get("call"), dict)


def _map_status(s: Optional[str]) -> str:
    if s in ("queued", "ringing"):
        return "ringing"
    if s in ("in-progress", "forwarding"):
        return "connected"
    if s == "ended":
        return "ended"
    return "ringing"


@router.post("/api/public/vapi-webhook")
async def vapi_webhook(request: Request) -> Response:
    db: AsyncIOMotorDatabase = request.app.state.db
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    started_at = time.time()
    ip = (request.headers.get("cf-connecting-ip")
          or request.headers.get("x-forwarded-for", "").split(",")[0].strip()
          or request.client.host if request.client else "unknown")
    user_agent = request.headers.get("user-agent")
    content_length = request.headers.get("content-length")
    content_type = (request.headers.get("content-type") or "").lower()

    _log("info", request_id, "received", method="POST", ip=ip, user_agent=user_agent,
         content_length=content_length)

    # ---- finish helper (closure) --------------------------------------------------
    async def finish(status: int, body: Dict[str, Any], level: str, stage: str,
                     extra: Optional[Dict[str, Any]] = None,
                     extra_headers: Optional[Dict[str, str]] = None) -> JSONResponse:
        extra = extra or {}
        duration_ms = int((time.time() - started_at) * 1000)
        _log(level, request_id, stage, status=status, duration_ms=duration_ms, **extra)
        await _record_ip_attempt(db, ip, extra.get("agent_id"),
                                 "rate_limited" if stage == "rate_limited" else _stage_to_status(stage))
        await _record_log(
            db,
            request_id=request_id,
            status=_stage_to_status(stage),
            stage=stage,
            http_status=status,
            agent_id=extra.get("agent_id"),
            user_id=extra.get("user_id"),
            lead_id=extra.get("lead_id"),
            ip=ip,
            user_agent=user_agent,
            duration_ms=duration_ms,
            error_message=body.get("error") if level in ("error", "warn") else None,
            payload_summary={
                "has_phone": extra.get("has_phone"),
                "has_name": extra.get("has_name"),
                "content_type": content_type,
                "content_length": content_length,
                "reason": extra.get("reason"),
                "field_errors": extra.get("field_errors"),
                "event_type": extra.get("event_type"),
            },
        )
        return _json_response(status, body, request_id, extra_headers)
    # -----------------------------------------------------------------------------

    # Rate limit
    try:
        rl = await _check_rate_limit(db, ip)
    except Exception:
        rl = {"allowed": True, "used": 0, "limit": RL_MAX, "retry_after_ms": 0}
    if not rl["allowed"]:
        retry_after = max(1, int(rl["retry_after_ms"] / 1000))
        return await finish(429, {"error": "Too many requests"}, "warn", "rate_limited",
                            {"used": rl["used"], "limit": rl["limit"]},
                            {"Retry-After": str(retry_after)})

    # Auth header presence
    provided = request.headers.get("x-vapi-secret")
    if not provided:
        return await finish(401, {"error": "Unauthorized"}, "warn", "unauthorized",
                            {"reason": "no_secret"})

    # Content-type
    if "application/json" not in content_type:
        return await finish(415, {"error": "Unsupported Media Type"}, "warn",
                            "unsupported_media_type", {"reason": content_type})

    # Body size
    if content_length and int(content_length) > MAX_BODY_BYTES:
        return await finish(413, {"error": "Payload too large"}, "warn", "payload_too_large",
                            {"reason": "content_length"})
    raw = await request.body()
    if len(raw) > MAX_BODY_BYTES:
        return await finish(413, {"error": "Payload too large"}, "warn", "payload_too_large",
                            {"reason": "body_bytes"})

    # JSON parse
    try:
        body_json = json.loads(raw.decode("utf-8")) if raw else {}
    except Exception:
        return await finish(400, {"error": "Invalid JSON"}, "warn", "invalid_json")
    if not isinstance(body_json, dict):
        return await finish(400, {"error": "Payload must be a JSON object"}, "warn",
                            "invalid_payload", {"reason": "not_object"})

    expected_global = os.environ.get("VAPI_WEBHOOK_SECRET")

    # ============================================================================
    # Branch A: Vapi event payload
    # ============================================================================
    if _looks_like_vapi_event(body_json):
        m = body_json["message"]
        evt_type = m.get("type")
        if evt_type not in ("status-update", "transcript", "end-of-call-report",
                            "conversation-update"):
            return await finish(400, {"error": "Unsupported event type"}, "warn",
                                "invalid_payload", {"reason": evt_type})
        call = m.get("call") or {}
        vapi_call_id = call.get("id")
        if not isinstance(vapi_call_id, str) or not vapi_call_id:
            return await finish(400, {"error": "Missing call.id"}, "warn",
                                "invalid_payload", {"reason": "no_call_id"})

        agent_hint = (body_json.get("agent_id") or m.get("agent_id")
                      or call.get("assistantId"))
        if not isinstance(agent_hint, str) or not agent_hint:
            return await finish(400, {"error": "Missing agent_id"}, "warn",
                                "invalid_payload", {"reason": "no_agent_id"})

        agent_row = await db.agents.find_one({"agent_id": agent_hint}, {"_id": 0})
        secret = (agent_row or {}).get("webhook_secret")
        active = (agent_row or {}).get("is_active", True)
        candidate = secret or DUMMY_SECRET
        ok_user = bool(agent_row) and active and _safe_eq(provided, candidate)
        ok_global = bool(expected_global) and _safe_eq(provided, expected_global)
        if not agent_row or not active or (not ok_user and not ok_global):
            reason = ("unknown_agent" if not agent_row
                      else ("agent_disabled" if not active else "secret_mismatch"))
            return await finish(401, {"error": "Unauthorized"}, "warn", "unauthorized",
                                {"agent_id": agent_hint, "reason": reason})

        user_id = agent_row.get("user_id")
        caller_phone = (call.get("customer") or {}).get("number")

        base: Dict[str, Any] = {
            "user_id": user_id,
            "agent_id": agent_hint,
            "vapi_call_id": vapi_call_id,
            "caller_phone": caller_phone,
        }

        # Auto-link to lead by phone
        if caller_phone and user_id:
            digits = re.sub(r"\D+", "", caller_phone)
            if len(digits) >= 4:
                tail = digits[-min(len(digits), 10):]
                lead_match = await db.leads.find_one(
                    {"user_id": user_id, "phone": {"$regex": tail, "$options": "i"}},
                    {"_id": 0, "id": 1, "phone": 1},
                    sort=[("created_at", -1)],
                )
                if lead_match:
                    base["lead_id"] = lead_match["id"]
                    lead_digits = re.sub(r"\D+", "", lead_match.get("phone", "") or "")
                    if lead_digits and lead_digits == digits:
                        base["lead_link_confidence"] = "exact"
                    elif len(lead_digits) >= 10 and len(digits) >= 10 and lead_digits[-10:] == digits[-10:]:
                        base["lead_link_confidence"] = "strong"
                    else:
                        base["lead_link_confidence"] = "partial"
                else:
                    base["lead_link_confidence"] = "none"

        now_iso = datetime.now(timezone.utc).isoformat()
        if evt_type == "status-update":
            nxt = _map_status(m.get("status"))
            base["status"] = nxt
            if nxt == "connected":
                base["connected_at"] = now_iso
            if nxt == "ended":
                base["ended_at"] = now_iso
                if m.get("endedReason"):
                    base["end_reason"] = m["endedReason"]
        elif evt_type == "end-of-call-report":
            base["status"] = "ended"
            base["ended_at"] = now_iso
            if m.get("endedReason"):
                base["end_reason"] = m["endedReason"]
            dur = m.get("durationSeconds")
            if isinstance(dur, (int, float)):
                base["duration_seconds"] = round(dur)

        # Upsert
        existing = await db.call_sessions.find_one({"vapi_call_id": vapi_call_id}, {"_id": 0, "id": 1})
        if existing:
            session_id = existing["id"]
            await db.call_sessions.update_one({"id": session_id}, {"$set": base})
        else:
            session_id = str(uuid.uuid4())
            await db.call_sessions.insert_one({
                "id": session_id,
                "created_at": now_iso,
                "started_at": now_iso,
                "status": "ringing",
                **base,
            })

        # Append transcript
        if (evt_type in ("transcript", "conversation-update")
                and m.get("transcript") and m.get("role")
                and (m.get("transcriptType") or "final") == "final"):
            await db.call_transcripts.insert_one({
                "id": str(uuid.uuid4()),
                "session_id": session_id,
                "user_id": user_id,
                "role": m["role"],
                "text": str(m["transcript"])[:2000],
                "created_at": now_iso,
            })

        # Broadcast
        full = await db.call_sessions.find_one({"id": session_id}, {"_id": 0})
        await hub.broadcast("call_session", full or {"id": session_id})

        return await finish(200, {"success": True, "session_id": session_id, "event": evt_type},
                            "info", "success",
                            {"agent_id": agent_hint, "user_id": user_id,
                             "event_type": evt_type, "has_phone": bool(caller_phone)})

    # ============================================================================
    # Branch B: capture_rental_lead tool payload
    # ============================================================================
    parsed = _validate_lead_payload(body_json)
    if not parsed["ok"]:
        return await finish(400, {"error": "Invalid payload", "details": parsed["errors"]},
                            "warn", "invalid_payload",
                            {"field_errors": parsed["errors"]})
    p = parsed["data"]

    # Resolve agent
    agent_row = await db.agents.find_one({"agent_id": p["agent_id"]}, {"_id": 0})
    if not agent_row:
        # Unknown agent — generic 401 (no enumeration leak)
        # Still run a constant-time compare to keep timing flat
        _safe_eq(provided, DUMMY_SECRET)
        return await finish(401, {"error": "Unauthorized"}, "warn", "unauthorized",
                            {"agent_id": p["agent_id"], "reason": "unknown_agent"})

    if not agent_row.get("is_active", True):
        _safe_eq(provided, DUMMY_SECRET)
        return await finish(401, {"error": "Unauthorized"}, "warn", "unauthorized",
                            {"agent_id": p["agent_id"], "reason": "agent_disabled",
                             "user_id": agent_row.get("user_id")})

    candidate_secret = agent_row.get("webhook_secret") or DUMMY_SECRET
    ok_user = _safe_eq(provided, candidate_secret)
    ok_global = bool(expected_global) and _safe_eq(provided, expected_global)
    if not ok_user and not ok_global:
        return await finish(401, {"error": "Unauthorized"}, "warn", "unauthorized",
                            {"agent_id": p["agent_id"],
                             "user_id": agent_row.get("user_id"),
                             "reason": "secret_mismatch"})

    user_id = agent_row["user_id"]

    # Idempotency replay
    if request.headers.get("x-request-id"):
        prior = await db.webhook_logs.find_one(
            {"request_id": request_id, "status": "inserted"},
            {"_id": 0, "lead_id": 1},
        )
        if prior and prior.get("lead_id"):
            return await finish(200,
                                {"success": True, "lead_id": prior["lead_id"],
                                 "idempotent_replay": True},
                                "info", "success",
                                {"agent_id": p["agent_id"], "user_id": user_id,
                                 "lead_id": prior["lead_id"]})

    lead_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    lead_doc = {
        "id": lead_id,
        "user_id": user_id,
        "full_name": p["extracted_name"] or "Unknown caller",
        "phone": p["caller_phone"],
        "location": p["extracted_location"],
        "budget": p["extracted_budget"],
        "property_type": p["extracted_property_type"],
        "urgency": p["extracted_urgency"],
        "source": "Vapi Call",
        "status": "New",
        "notes": p["notes"],
        "agent_id": p["agent_id"],
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    try:
        await db.leads.insert_one(lead_doc.copy())
    except Exception as e:
        return await finish(500, {"error": "Insert failed"}, "error", "insert_failed",
                            {"agent_id": p["agent_id"], "user_id": user_id,
                             "db_error": str(e)})

    # Activity timeline entry
    await db.lead_activity.insert_one({
        "id": str(uuid.uuid4()),
        "lead_id": lead_id,
        "user_id": user_id,
        "kind": "created",
        "message": "Lead captured from Vapi call",
        "created_at": now_iso,
    })

    # Broadcast
    await hub.broadcast("lead_created", lead_doc)

    return await finish(200, {"success": True, "lead_id": lead_id}, "info", "success",
                        {"agent_id": p["agent_id"], "user_id": user_id,
                         "lead_id": lead_id, "has_phone": bool(p["caller_phone"]),
                         "has_name": bool(p["extracted_name"])})
