"""LeaseFlow backend — FastAPI + MongoDB.

Single-file route registry to keep the surface area small. Heavy logic lives in
auth.py, vapi_webhook.py, sheets.py, realtime.py.
"""
from __future__ import annotations

import csv
import io
import logging
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import (APIRouter, Body, Depends, FastAPI, HTTPException, Query,
                     Request, Response, WebSocket, WebSocketDisconnect)
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware

from auth import (User, bootstrap_admin, create_token, get_current_user,
                  hash_password, require_owner, verify_password)
from realtime import hub
from sheets import (append_leads, get_service_account_email, parse_json_key,
                    test_connection)
from vapi_webhook import router as vapi_router

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ---------------------------------------------------------------------------
# App + DB bootstrap
# ---------------------------------------------------------------------------
app = FastAPI(title="LeaseFlow API")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
mongo_client = AsyncIOMotorClient(MONGO_URL)
db = mongo_client[DB_NAME]
app.state.db = db

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("leaseflow")

api = APIRouter(prefix="/api")

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class SignupReq(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    full_name: str = Field(min_length=1, max_length=200)


class LoginReq(BaseModel):
    email: EmailStr
    password: str


class TokenResp(BaseModel):
    token: str
    user: User


class CreateAgentReq(BaseModel):
    agent_id: str = Field(pattern=r"^agent_[a-zA-Z0-9_-]+$", min_length=8, max_length=200)
    name: str = Field(min_length=1, max_length=200)


class UpdateAgentReq(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None


class Agent(BaseModel):
    id: str
    user_id: str
    agent_id: str
    name: str
    webhook_secret: str
    is_active: bool = True
    created_at: datetime


class LeadCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)
    phone: Optional[str] = None
    location: Optional[str] = None
    budget: Optional[str] = None
    property_type: Optional[str] = None
    urgency: Optional[str] = None
    notes: Optional[str] = None
    status: str = "New"
    source: str = "Manual"


class LeadUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    budget: Optional[str] = None
    property_type: Optional[str] = None
    urgency: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None


class SheetsConfigReq(BaseModel):
    sheet_id: str = Field(min_length=10)
    service_account_json: str = Field(min_length=20)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _gen_webhook_secret() -> str:
    return f"whsec_{secrets.token_hex(32)}"


def _scrub(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Remove _id and password_hash from a Mongo doc."""
    if not doc:
        return doc
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return doc


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


@api.get("/")
async def root():
    return {"app": "LeaseFlow", "status": "ok",
            "time": datetime.now(timezone.utc).isoformat()}


@api.get("/health")
async def health():
    try:
        await db.command("ping")
        db_ok = True
    except Exception:
        db_ok = False
    return {"ok": db_ok, "db": db_ok}


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


@api.post("/auth/signup", response_model=TokenResp)
async def signup(req: SignupReq):
    email = req.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    # First user becomes "owner", rest are "member"
    count = await db.users.count_documents({})
    role = "owner" if count == 0 else "member"
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.users.insert_one({
        "user_id": user_id,
        "email": email,
        "password_hash": hash_password(req.password),
        "full_name": req.full_name.strip(),
        "role": role,
        "created_at": now_iso,
    })
    token = create_token(user_id, email, role)
    return TokenResp(
        token=token,
        user=User(user_id=user_id, email=email, full_name=req.full_name.strip(),
                  role=role, created_at=datetime.fromisoformat(now_iso)),
    )


@api.post("/auth/login", response_model=TokenResp)
async def login(req: LoginReq):
    email = req.email.lower()
    user_doc = await db.users.find_one({"email": email})
    if not user_doc or not verify_password(req.password, user_doc.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_token(user_doc["user_id"], user_doc["email"], user_doc["role"])
    created_at = user_doc["created_at"]
    if isinstance(created_at, str):
        created_at = datetime.fromisoformat(created_at)
    return TokenResp(
        token=token,
        user=User(user_id=user_doc["user_id"], email=user_doc["email"],
                  full_name=user_doc["full_name"], role=user_doc["role"],
                  created_at=created_at),
    )


@api.get("/auth/me", response_model=User)
async def me(user: User = Depends(get_current_user)):
    return user


@api.get("/auth/team", response_model=List[User])
async def team(user: User = Depends(get_current_user)):
    cursor = db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", 1)
    out: List[User] = []
    async for u in cursor:
        if isinstance(u.get("created_at"), str):
            u["created_at"] = datetime.fromisoformat(u["created_at"])
        out.append(User(**u))
    return out


# ---------------------------------------------------------------------------
# Agents
# ---------------------------------------------------------------------------


@api.get("/agents", response_model=List[Agent])
async def list_agents(user: User = Depends(get_current_user)):
    cursor = db.agents.find({}, {"_id": 0}).sort("created_at", 1)
    out: List[Agent] = []
    async for a in cursor:
        if isinstance(a.get("created_at"), str):
            a["created_at"] = datetime.fromisoformat(a["created_at"])
        out.append(Agent(**a))
    return out


@api.post("/agents", response_model=Agent)
async def create_agent(req: CreateAgentReq, user: User = Depends(get_current_user)):
    existing = await db.agents.find_one({"agent_id": req.agent_id})
    if existing:
        raise HTTPException(status_code=409, detail="agent_id already exists")
    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user.user_id,
        "agent_id": req.agent_id,
        "name": req.name.strip(),
        "webhook_secret": _gen_webhook_secret(),
        "is_active": True,
        "created_at": now_iso,
    }
    await db.agents.insert_one(doc.copy())
    doc["created_at"] = datetime.fromisoformat(now_iso)
    return Agent(**doc)


@api.patch("/agents/{agent_pk}", response_model=Agent)
async def update_agent(agent_pk: str, req: UpdateAgentReq,
                       user: User = Depends(get_current_user)):
    update: Dict[str, Any] = {}
    if req.name is not None:
        update["name"] = req.name.strip()
    if req.is_active is not None:
        update["is_active"] = req.is_active
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    res = await db.agents.find_one_and_update(
        {"id": agent_pk}, {"$set": update}, return_document=True, projection={"_id": 0}
    )
    if not res:
        raise HTTPException(status_code=404, detail="Agent not found")
    if isinstance(res.get("created_at"), str):
        res["created_at"] = datetime.fromisoformat(res["created_at"])
    return Agent(**res)


@api.post("/agents/{agent_pk}/regenerate-secret", response_model=Agent)
async def regen_secret(agent_pk: str, user: User = Depends(require_owner)):
    new_secret = _gen_webhook_secret()
    res = await db.agents.find_one_and_update(
        {"id": agent_pk}, {"$set": {"webhook_secret": new_secret}},
        return_document=True, projection={"_id": 0},
    )
    if not res:
        raise HTTPException(status_code=404, detail="Agent not found")
    if isinstance(res.get("created_at"), str):
        res["created_at"] = datetime.fromisoformat(res["created_at"])
    return Agent(**res)


@api.delete("/agents/{agent_pk}")
async def delete_agent(agent_pk: str, user: User = Depends(require_owner)):
    res = await db.agents.delete_one({"id": agent_pk})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Agent not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Leads
# ---------------------------------------------------------------------------

LEAD_STATUSES = ["New", "Contacted", "Qualified", "Converted", "Lost"]


@api.get("/leads")
async def list_leads(
    user: User = Depends(get_current_user),
    status: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    skip: int = Query(0, ge=0),
):
    query: Dict[str, Any] = {}
    if status:
        query["status"] = status
    if q:
        query["$or"] = [
            {"full_name": {"$regex": q, "$options": "i"}},
            {"phone": {"$regex": q, "$options": "i"}},
            {"location": {"$regex": q, "$options": "i"}},
            {"notes": {"$regex": q, "$options": "i"}},
        ]
    total = await db.leads.count_documents(query)
    cursor = db.leads.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit)
    items = await cursor.to_list(length=limit)
    return {"total": total, "items": items}


@api.post("/leads")
async def create_lead(req: LeadCreate, user: User = Depends(get_current_user)):
    if req.status not in LEAD_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    now_iso = datetime.now(timezone.utc).isoformat()
    lead_id = str(uuid.uuid4())
    doc = {
        "id": lead_id,
        "user_id": user.user_id,
        "full_name": req.full_name,
        "phone": req.phone,
        "location": req.location,
        "budget": req.budget,
        "property_type": req.property_type,
        "urgency": req.urgency,
        "notes": req.notes,
        "source": req.source,
        "status": req.status,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    await db.leads.insert_one(doc.copy())
    await db.lead_activity.insert_one({
        "id": str(uuid.uuid4()),
        "lead_id": lead_id,
        "user_id": user.user_id,
        "kind": "created",
        "message": f"Lead created manually by {user.full_name}",
        "created_at": now_iso,
    })
    await hub.broadcast("lead_created", doc)
    return doc


@api.get("/leads/{lead_id}")
async def get_lead(lead_id: str, user: User = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    activity = await db.lead_activity.find({"lead_id": lead_id}, {"_id": 0}) \
        .sort("created_at", -1).to_list(length=200)
    sessions = await db.call_sessions.find({"lead_id": lead_id}, {"_id": 0}) \
        .sort("created_at", -1).to_list(length=50)
    return {"lead": lead, "activity": activity, "calls": sessions}


@api.patch("/leads/{lead_id}")
async def update_lead(lead_id: str, req: LeadUpdate,
                      user: User = Depends(get_current_user)):
    update: Dict[str, Any] = {k: v for k, v in req.model_dump().items() if v is not None}
    if "status" in update and update["status"] not in LEAD_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    prev = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not prev:
        raise HTTPException(status_code=404, detail="Lead not found")
    await db.leads.update_one({"id": lead_id}, {"$set": update})
    if "status" in update and update["status"] != prev.get("status"):
        await db.lead_activity.insert_one({
            "id": str(uuid.uuid4()),
            "lead_id": lead_id,
            "user_id": user.user_id,
            "kind": "status_change",
            "message": f"{prev.get('status')} → {update['status']} by {user.full_name}",
            "created_at": update["updated_at"],
        })
    new_doc = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    await hub.broadcast("lead_updated", new_doc or {})
    return new_doc


@api.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str, user: User = Depends(get_current_user)):
    res = await db.leads.delete_one({"id": lead_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    await db.lead_activity.delete_many({"lead_id": lead_id})
    await hub.broadcast("lead_deleted", {"id": lead_id})
    return {"ok": True}


@api.get("/leads.csv")
async def export_leads_csv(user: User = Depends(get_current_user)):
    cursor = db.leads.find({}, {"_id": 0}).sort("created_at", -1)
    leads = await cursor.to_list(length=10000)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["created_at", "full_name", "phone", "location", "budget",
                     "property_type", "urgency", "status", "source", "notes"])
    for lead_doc in leads:
        writer.writerow([
            lead_doc.get("created_at", ""), lead_doc.get("full_name", ""), lead_doc.get("phone", "") or "",
            lead_doc.get("location", "") or "", lead_doc.get("budget", "") or "",
            lead_doc.get("property_type", "") or "", lead_doc.get("urgency", "") or "",
            lead_doc.get("status", ""), lead_doc.get("source", ""), lead_doc.get("notes", "") or "",
        ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="leaseflow_leads.csv"'},
    )


# ---------------------------------------------------------------------------
# Dashboard stats
# ---------------------------------------------------------------------------


@api.get("/stats")
async def stats(user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=6)

    total_leads = await db.leads.count_documents({})
    leads_today = await db.leads.count_documents(
        {"created_at": {"$gte": today_start.isoformat()}}
    )
    converted = await db.leads.count_documents({"status": "Converted"})
    conv_rate = round((converted / total_leads) * 100, 1) if total_leads else 0.0

    calls_today = await db.call_sessions.count_documents(
        {"created_at": {"$gte": today_start.isoformat()}}
    )
    active_calls = await db.call_sessions.count_documents(
        {"status": {"$in": ["ringing", "connected"]}}
    )

    # Last 7 days bar data
    daily: List[Dict[str, Any]] = []
    for i in range(7):
        day_start = (week_start + timedelta(days=i))
        day_end = day_start + timedelta(days=1)
        n = await db.leads.count_documents({
            "created_at": {"$gte": day_start.isoformat(),
                           "$lt": day_end.isoformat()}
        })
        daily.append({"day": day_start.strftime("%a"), "count": n})

    # Status breakdown
    pipe = [{"$group": {"_id": "$status", "count": {"$sum": 1}}}]
    by_status_raw = await db.leads.aggregate(pipe).to_list(length=20)
    by_status = {s: 0 for s in LEAD_STATUSES}
    for r in by_status_raw:
        if r["_id"] in by_status:
            by_status[r["_id"]] = r["count"]

    return {
        "total_leads": total_leads,
        "leads_today": leads_today,
        "converted": converted,
        "conversion_rate": conv_rate,
        "calls_today": calls_today,
        "active_calls": active_calls,
        "daily": daily,
        "by_status": by_status,
    }


# ---------------------------------------------------------------------------
# Call sessions (read-only — they're written by the webhook)
# ---------------------------------------------------------------------------


@api.get("/call-sessions")
async def list_sessions(
    user: User = Depends(get_current_user),
    active_only: bool = Query(False),
    limit: int = Query(100, ge=1, le=500),
):
    query: Dict[str, Any] = {}
    if active_only:
        query["status"] = {"$in": ["ringing", "connected"]}
    cursor = db.call_sessions.find(query, {"_id": 0}).sort("created_at", -1).limit(limit)
    items = await cursor.to_list(length=limit)
    return {"items": items}


@api.get("/call-sessions/{session_id}/transcripts")
async def get_transcripts(session_id: str, user: User = Depends(get_current_user)):
    items = await db.call_transcripts.find({"session_id": session_id}, {"_id": 0}) \
        .sort("created_at", 1).to_list(length=500)
    return {"items": items}


# ---------------------------------------------------------------------------
# Webhook logs
# ---------------------------------------------------------------------------


@api.get("/webhook-logs")
async def list_webhook_logs(
    user: User = Depends(get_current_user),
    limit: int = Query(100, ge=1, le=500),
    skip: int = Query(0, ge=0),
    status: Optional[str] = Query(None),
):
    query: Dict[str, Any] = {}
    if status:
        query["status"] = status
    total = await db.webhook_logs.count_documents(query)
    cursor = db.webhook_logs.find(query, {"_id": 0}).sort("created_at", -1) \
        .skip(skip).limit(limit)
    items = await cursor.to_list(length=limit)
    return {"total": total, "items": items}


# ---------------------------------------------------------------------------
# Vapi setup info
# ---------------------------------------------------------------------------


@api.get("/setup/info")
async def setup_info(request: Request, user: User = Depends(get_current_user)):
    base_url = str(request.base_url).rstrip("/")
    agents_count = await db.agents.count_documents({})
    leads_count = await db.leads.count_documents({})
    sheets_cfg = await db.google_sheets_config.find_one({}, {"_id": 0,
                                                              "service_account_json": 0})
    return {
        "webhook_url": f"{base_url}/api/public/vapi-webhook",
        "global_secret_set": bool(os.environ.get("VAPI_WEBHOOK_SECRET")),
        "agents_count": agents_count,
        "leads_count": leads_count,
        "sheets_connected": bool(sheets_cfg),
        "tool_schema": {
            "type": "function",
            "function": {
                "name": "capture_rental_lead",
                "description": "Save the qualified rental-lead details captured during the call.",
                "parameters": {
                    "type": "object",
                    "required": ["agent_id"],
                    "properties": {
                        "agent_id": {"type": "string",
                                     "description": "The Vapi assistant ID, must be the same agent_id you registered in LeaseFlow (format agent_xxx)."},
                        "caller_phone": {"type": "string"},
                        "extracted_name": {"type": "string"},
                        "extracted_location": {"type": "string"},
                        "extracted_budget": {"type": "string"},
                        "extracted_property_type": {"type": "string"},
                        "extracted_urgency": {"type": "string"},
                        "notes": {"type": "string"}
                    }
                }
            }
        }
    }


@api.post("/setup/test-webhook")
async def test_webhook(
    payload: Dict[str, Any] = Body(...),
    user: User = Depends(get_current_user),
):
    """Simulate a Vapi tool call against our own webhook locally to verify wiring."""
    import httpx
    agent_id = payload.get("agent_id")
    secret = payload.get("secret")
    use_bad_secret = payload.get("bad_secret", False)
    if not agent_id or not secret:
        raise HTTPException(status_code=400, detail="agent_id and secret required")
    body = {
        "agent_id": agent_id,
        "caller_phone": "+15551230000",
        "extracted_name": "Test Caller",
        "extracted_location": "Test City",
        "extracted_budget": "$1500",
        "extracted_property_type": "apartment",
        "extracted_urgency": "this week",
        "notes": "🧪 Generated by Setup Wizard test button",
    }
    sent_secret = (secret + "_BAD") if use_bad_secret else secret
    headers = {"Content-Type": "application/json", "x-vapi-secret": sent_secret,
               "x-request-id": f"test_{uuid.uuid4().hex}"}
    started = datetime.now(timezone.utc)
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            r = await client.post("http://127.0.0.1:8001/api/public/vapi-webhook",
                                   json=body, headers=headers)
            duration_ms = int((datetime.now(timezone.utc) - started).total_seconds() * 1000)
            try:
                resp_json = r.json()
            except Exception:
                resp_json = {"raw": r.text[:500]}
            return {"status_code": r.status_code, "duration_ms": duration_ms,
                    "response": resp_json}
        except Exception as e:
            return {"status_code": 0, "duration_ms": 0, "response": {"error": str(e)}}


# ---------------------------------------------------------------------------
# Google Sheets sync
# ---------------------------------------------------------------------------


@api.get("/sheets/config")
async def get_sheets_config(user: User = Depends(get_current_user)):
    cfg = await db.google_sheets_config.find_one({}, {"_id": 0})
    if not cfg:
        return {"connected": False}
    json_key = cfg.get("service_account_json")
    if isinstance(json_key, str):
        parsed = parse_json_key(json_key)
    else:
        parsed = json_key
    return {
        "connected": True,
        "sheet_id": cfg.get("sheet_id"),
        "service_account_email": get_service_account_email(parsed) if parsed else None,
        "last_sync_at": cfg.get("last_sync_at"),
        "last_sync_count": cfg.get("last_sync_count", 0),
    }


@api.post("/sheets/config")
async def set_sheets_config(req: SheetsConfigReq, user: User = Depends(require_owner)):
    parsed = parse_json_key(req.service_account_json)
    if not parsed:
        raise HTTPException(status_code=400, detail="Invalid service account JSON")
    try:
        result = test_connection(parsed, req.sheet_id)
    except Exception as e:
        raise HTTPException(status_code=400,
                            detail=f"Could not access sheet: {e}. Did you share it with {get_service_account_email(parsed)}?")
    await db.google_sheets_config.delete_many({})
    await db.google_sheets_config.insert_one({
        "id": str(uuid.uuid4()),
        "sheet_id": req.sheet_id,
        "service_account_json": req.service_account_json,
        "service_account_email": get_service_account_email(parsed),
        "sheet_title": result.get("title"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "last_sync_at": None,
        "last_sync_count": 0,
    })
    return {"ok": True, "service_account_email": get_service_account_email(parsed),
            "sheet_title": result.get("title")}


@api.delete("/sheets/config")
async def delete_sheets_config(user: User = Depends(require_owner)):
    await db.google_sheets_config.delete_many({})
    return {"ok": True}


@api.post("/sheets/sync")
async def sync_sheets(
    body: Dict[str, Any] = Body(default={}),
    user: User = Depends(get_current_user),
):
    cfg = await db.google_sheets_config.find_one({}, {"_id": 0})
    if not cfg:
        raise HTTPException(status_code=400, detail="Google Sheets not configured")
    parsed = parse_json_key(cfg["service_account_json"])
    if not parsed:
        raise HTTPException(status_code=400, detail="Stored service account JSON invalid")
    only_new = body.get("only_new", True)
    query: Dict[str, Any] = {}
    if only_new and cfg.get("last_sync_at"):
        query["created_at"] = {"$gt": cfg["last_sync_at"]}
    leads = await db.leads.find(query, {"_id": 0}).sort("created_at", 1).to_list(length=10000)
    if not leads:
        return {"synced": 0, "message": "Already up to date"}
    try:
        n = append_leads(parsed, cfg["sheet_id"], leads)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Sheets API error: {e}")
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.google_sheets_config.update_one(
        {"id": cfg["id"]},
        {"$set": {"last_sync_at": now_iso, "last_sync_count": n}},
    )
    return {"synced": n, "last_sync_at": now_iso}


# ---------------------------------------------------------------------------
# Demo data seeder (helps the user see something before first real call)
# ---------------------------------------------------------------------------


@api.post("/demo/seed")
async def demo_seed(user: User = Depends(require_owner)):
    # Create a demo agent if none exist
    if await db.agents.count_documents({}) == 0:
        await db.agents.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user.user_id,
            "agent_id": "agent_demo_leasing_specialist",
            "name": "Leasing Specialist (Demo)",
            "webhook_secret": _gen_webhook_secret(),
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    samples = [
        ("Maya Patel", "+14155551001", "Mission District, SF", "$2800",
         "1 bedroom apartment", "this week", "New",
         "Wants pet-friendly, 1BR near BART"),
        ("James Carter", "+14155551002", "Brooklyn Heights, NY", "$3200",
         "studio", "this month", "Contacted", "Remote worker, needs natural light"),
        ("Sofia Reyes", "+12135551003", "Silver Lake, LA", "$2400",
         "1 bedroom apartment", "ASAP", "Qualified", "Pre-approved, good credit"),
        ("Daniel Wright", "+13125551004", "Lincoln Park, Chicago", "$1900",
         "studio", "next month", "New", "Recent grad, first apartment"),
        ("Aisha Khan", "+12145551005", "Uptown, Dallas", "$2600",
         "2 bedroom apartment", "this week", "Converted",
         "Signed lease — moving in next Friday"),
        ("Liam Walsh", "+13035551006", "RiNo, Denver", "$2200",
         "loft", "browsing", "Lost", "Found another place"),
        ("Hannah Lee", "+12065551007", "Capitol Hill, Seattle", "$2750",
         "1 bedroom apartment", "this week", "Contacted",
         "Wants south-facing windows"),
        ("Marcus Bell", "+14045551008", "Old Fourth Ward, Atlanta", "$2100",
         "2 bedroom townhome", "ASAP", "Qualified", "Couple with one cat"),
    ]
    inserted = 0
    base_dt = datetime.now(timezone.utc)
    for i, s in enumerate(samples):
        ts = (base_dt - timedelta(hours=i * 6)).isoformat()
        lead_id = str(uuid.uuid4())
        await db.leads.insert_one({
            "id": lead_id, "user_id": user.user_id,
            "full_name": s[0], "phone": s[1], "location": s[2],
            "budget": s[3], "property_type": s[4], "urgency": s[5],
            "status": s[6], "source": "Vapi Call (demo)", "notes": s[7],
            "created_at": ts, "updated_at": ts,
        })
        await db.lead_activity.insert_one({
            "id": str(uuid.uuid4()), "lead_id": lead_id, "user_id": user.user_id,
            "kind": "created", "message": "Demo lead seeded", "created_at": ts,
        })
        inserted += 1
    return {"ok": True, "inserted": inserted}


@api.post("/demo/clear")
async def demo_clear(user: User = Depends(require_owner)):
    await db.leads.delete_many({"source": {"$in": ["Vapi Call (demo)"]}})
    await db.lead_activity.delete_many({"message": "Demo lead seeded"})
    return {"ok": True}


# ---------------------------------------------------------------------------
# WebSocket
# ---------------------------------------------------------------------------


@app.websocket("/api/ws")
async def ws_endpoint(websocket: WebSocket):
    await hub.connect(websocket)
    try:
        while True:
            msg = await websocket.receive_text()
            if msg == "ping":
                await websocket.send_text('{"event":"pong","data":{}}')
    except WebSocketDisconnect:
        pass
    finally:
        await hub.disconnect(websocket)


# ---------------------------------------------------------------------------
# Mount
# ---------------------------------------------------------------------------


app.include_router(api)
app.include_router(vapi_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup() -> None:
    await db.users.create_index("email", unique=True)
    await db.agents.create_index("agent_id", unique=True)
    await db.agents.create_index("id", unique=True)
    await db.leads.create_index("id", unique=True)
    await db.leads.create_index([("created_at", -1)])
    await db.leads.create_index("status")
    await db.call_sessions.create_index("vapi_call_id", unique=True)
    await db.call_sessions.create_index("id", unique=True)
    await db.call_sessions.create_index([("created_at", -1)])
    await db.call_transcripts.create_index([("session_id", 1), ("created_at", 1)])
    await db.webhook_logs.create_index([("created_at", -1)])
    await db.webhook_ip_attempts.create_index([("ip", 1), ("created_at", -1)])
    await bootstrap_admin(db)
    logger.info("LeaseFlow startup complete")


@app.on_event("shutdown")
async def on_shutdown() -> None:
    mongo_client.close()
