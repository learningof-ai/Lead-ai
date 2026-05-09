"""Email module — Resend integration + LeaseFlow's two HTML templates.

Ported from the original TypeScript templates. Both templates use table-based
layouts and inline CSS so they survive Gmail / Outlook / Apple Mail.
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import resend

logger = logging.getLogger("leaseflow.email")


# --------------------------------------------------------------------------
# Lead scoring
# --------------------------------------------------------------------------

def score_to_quality(score: Optional[float]) -> str:
    """1-10 score → 'hot' / 'warm' / 'cold' / 'unknown'."""
    if score is None:
        return "unknown"
    try:
        s = float(score)
    except (TypeError, ValueError):
        return "unknown"
    if s >= 7:
        return "hot"
    if s >= 4:
        return "warm"
    return "cold"


def derive_status_from_outcome_and_quality(outcome: Optional[str], quality: str) -> str:
    """Map Vapi outcome + quality → our pipeline status."""
    if outcome == "not_interested" or outcome == "wrong_number":
        return "Lost"
    if outcome == "no_contact_info" or outcome == "incomplete":
        return "Contacted"
    if quality == "hot":
        return "Qualified"
    return "New"


# --------------------------------------------------------------------------
# Formatting helpers
# --------------------------------------------------------------------------

def fmt_duration(sec: Optional[int]) -> str:
    if sec is None:
        return "—"
    m = int(sec) // 60
    s = int(sec) % 60
    return f"{m}m {s}s"


def fmt_budget(bmin: Optional[float], bmax: Optional[float]) -> str:
    if not bmin and not bmax:
        return "—"
    if bmin and bmax:
        return f"${int(bmin):,} – ${int(bmax):,}/mo"
    if bmin:
        return f"${int(bmin):,}+/mo"
    return f"Up to ${int(bmax):,}/mo"


def quality_palette(quality: str) -> Dict[str, str]:
    return {
        "hot":     {"bg": "#FAEEDA", "text": "#633806", "border": "#EF9F27"},
        "warm":    {"bg": "#E6F1FB", "text": "#0C447C", "border": "#378ADD"},
        "cold":    {"bg": "#F1EFE8", "text": "#444441", "border": "#B4B2A9"},
    }.get(quality, {"bg": "#F1EFE8", "text": "#444441", "border": "#B4B2A9"})


# --------------------------------------------------------------------------
# Manager notification email
# --------------------------------------------------------------------------

def _row(label: str, value: str) -> str:
    if not value or value == "—":
        return ""
    return (
        f'<tr><td style="padding:8px 12px;font-size:13px;color:#5F5E5A;'
        f'border-bottom:1px solid #F1EFE8;white-space:nowrap;width:140px;">{label}</td>'
        f'<td style="padding:8px 12px;font-size:13px;color:#2C2C2A;'
        f'border-bottom:1px solid #F1EFE8;">{value}</td></tr>'
    )


def manager_notification_html(lead: Dict[str, Any], manager_name: str = "Property Manager") -> str:
    quality = lead.get("quality") or "unknown"
    pal = quality_palette(quality)
    score = lead.get("quality_score")
    name = lead.get("full_name") or ""
    phone = lead.get("phone") or ""
    email = lead.get("email") or ""
    budget = fmt_budget(lead.get("budget_min"), lead.get("budget_max"))
    move_in = lead.get("move_in_date") or ""
    bedrooms = lead.get("bedrooms")
    location = lead.get("location") or lead.get("location_pref") or ""
    pets = lead.get("pets")
    pets_str = "Yes" if pets is True else ("No" if pets is False else "—")
    outcome = (lead.get("outcome") or "unknown").replace("_", " ")
    summary = lead.get("call_summary") or ""
    recording = lead.get("recording_url") or ""
    duration = fmt_duration(lead.get("duration_seconds"))
    started = lead.get("call_started_at") or lead.get("created_at")
    try:
        call_date = datetime.fromisoformat(str(started).replace("Z", "+00:00")).strftime("%a %b %-d, %-I:%M %p") if started else "Just now"
    except Exception:
        call_date = "Just now"
    call_id = lead.get("vapi_call_id") or lead.get("id") or ""
    first_name = name.split(" ")[0] if name else "lead"

    score_block = ""
    if isinstance(score, (int, float)) and score:
        pct = max(0, min(100, int(float(score) * 10)))
        score_block = (
            '<div style="margin-bottom:24px;">'
            '<p style="margin:0 0 6px;font-size:12px;color:#888780;font-weight:500;">Lead quality score</p>'
            '<div style="display:flex;align-items:center;gap:10px;">'
            '<div style="flex:1;background:#F1EFE8;border-radius:4px;height:8px;overflow:hidden;">'
            f'<div style="width:{pct}%;height:8px;background:{pal["border"]};border-radius:4px;"></div>'
            '</div>'
            f'<span style="font-size:15px;font-weight:600;color:{pal["text"]};min-width:32px;text-align:right;">{int(float(score))}/10</span>'
            '</div></div>'
        )

    summary_block = (
        '<div style="background:#F7F6F3;border-radius:8px;padding:16px 20px;margin-bottom:24px;">'
        '<p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#888780;text-transform:uppercase;letter-spacing:0.5px;">AI call summary</p>'
        f'<p style="margin:0;font-size:14px;color:#2C2C2A;line-height:1.6;">{summary}</p>'
        '</div>'
    ) if summary else ""

    cta_buttons = []
    if phone:
        cta_buttons.append(
            f'<td style="padding-right:10px;">'
            f'<a href="tel:{phone}" style="display:inline-block;background:#2C2C2A;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:500;">Call {first_name}</a>'
            f'</td>'
        )
    if recording:
        cta_buttons.append(
            f'<td style="padding-right:10px;">'
            f'<a href="{recording}" style="display:inline-block;background:#ffffff;color:#2C2C2A;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:500;border:1px solid #D3D1C7;">Listen to call</a>'
            f'</td>'
        )
    cta_html = (
        '<table cellpadding="0" cellspacing="0" style="margin-bottom:8px;"><tr>' +
        "".join(cta_buttons) + '</tr></table>'
    ) if cta_buttons else ""

    quality_badge_label = "Unscored" if quality == "unknown" else f"{quality} lead"

    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>New lead captured — LeaseFlow</title></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;">

<tr><td style="background:#2A4B41;border-radius:12px 12px 0 0;padding:24px 32px;">
<table width="100%" cellpadding="0" cellspacing="0"><tr>
<td><p style="margin:0;font-size:18px;font-weight:600;color:#ffffff;letter-spacing:-0.3px;">LeaseFlow</p>
<p style="margin:4px 0 0;font-size:13px;color:#A3D1BB;">Voice lead capture</p></td>
<td align="right"><span style="display:inline-block;background:{pal['bg']};color:{pal['text']};border:1px solid {pal['border']};padding:5px 14px;border-radius:20px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">{quality_badge_label}</span></td>
</tr></table></td></tr>

<tr><td style="background:#ffffff;padding:28px 32px;">
<p style="margin:0 0 4px;font-size:22px;font-weight:600;color:#2C2C2A;">{('New lead: ' + name) if name else 'New voice lead captured'}</p>
<p style="margin:0 0 24px;font-size:13px;color:#888780;">{call_date} &nbsp;·&nbsp; {duration} call</p>
{score_block}
<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #F1EFE8;border-radius:8px;overflow:hidden;margin-bottom:24px;">
{_row('Name', name or '—')}
{_row('Phone', phone or '—')}
{_row('Email', email or '—')}
{_row('Budget', budget)}
{_row('Move-in', move_in or '—')}
{_row('Bedrooms', f'{bedrooms} bed' if bedrooms else '—')}
{_row('Location', location or '—')}
{_row('Pets', pets_str)}
{_row('Outcome', outcome)}
</table>
{summary_block}
{cta_html}
</td></tr>

<tr><td style="background:#F1EFE8;border-radius:0 0 12px 12px;padding:16px 32px;">
<p style="margin:0;font-size:12px;color:#888780;line-height:1.6;">
Hi {manager_name} — this lead was captured by your LeaseFlow voice assistant.
Call ID: <span style="font-family:monospace;font-size:11px;">{call_id}</span></p>
</td></tr>

</table></td></tr></table></body></html>"""


def manager_notification_text(lead: Dict[str, Any]) -> str:
    return (
        f"New LeaseFlow lead captured\n\n"
        f"Name:     {lead.get('full_name') or 'Unknown'}\n"
        f"Phone:    {lead.get('phone') or '—'}\n"
        f"Email:    {lead.get('email') or '—'}\n"
        f"Budget:   {fmt_budget(lead.get('budget_min'), lead.get('budget_max'))}\n"
        f"Move-in:  {lead.get('move_in_date') or '—'}\n"
        f"Bedrooms: {lead.get('bedrooms') or '—'}\n"
        f"Quality:  {lead.get('quality') or 'unknown'} ({lead.get('quality_score') or '?'}/10)\n\n"
        f"Summary: {lead.get('call_summary') or 'No summary available.'}\n\n"
        f"Call ID: {lead.get('vapi_call_id') or lead.get('id')}\n"
        f"Duration: {fmt_duration(lead.get('duration_seconds'))}\n"
        f"{('Recording: ' + lead['recording_url']) if lead.get('recording_url') else ''}\n"
    )


# --------------------------------------------------------------------------
# Lead thank-you email
# --------------------------------------------------------------------------

def lead_confirmation_html(lead: Dict[str, Any], property_name: str = "LeaseFlow") -> str:
    name = lead.get("full_name") or ""
    first = name.split(" ")[0] if name else "there"
    bmin = lead.get("budget_min")
    bmax = lead.get("budget_max")
    move_in = lead.get("move_in_date") or ""
    bedrooms = lead.get("bedrooms")

    rows = []
    if bmin or bmax:
        rows.append(
            f'<tr><td style="padding:7px 0;font-size:14px;color:#5F5E5A;">Budget</td>'
            f'<td style="padding:7px 0;font-size:14px;color:#2C2C2A;text-align:right;">'
            f'{fmt_budget(bmin, bmax)}</td></tr>'
        )
    if move_in:
        rows.append(
            f'<tr><td style="padding:7px 0;font-size:14px;color:#5F5E5A;">Move-in</td>'
            f'<td style="padding:7px 0;font-size:14px;color:#2C2C2A;text-align:right;">{move_in}</td></tr>'
        )
    if bedrooms:
        rows.append(
            f'<tr><td style="padding:7px 0;font-size:14px;color:#5F5E5A;">Bedrooms</td>'
            f'<td style="padding:7px 0;font-size:14px;color:#2C2C2A;text-align:right;">{bedrooms} bed</td></tr>'
        )

    summary_card = (
        '<div style="background:#F7F6F3;border-radius:10px;padding:18px 20px;margin-bottom:28px;">'
        '<p style="margin:0 0 12px;font-size:12px;font-weight:600;color:#888780;text-transform:uppercase;letter-spacing:0.6px;">What you shared</p>'
        '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">'
        + "".join(rows) +
        '</table></div>'
    ) if rows else ""

    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Thanks for reaching out — {property_name}</title></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;">

<tr><td align="center" style="padding-bottom:24px;">
<p style="margin:0;font-size:15px;font-weight:600;color:#2C2C2A;">{property_name}</p>
<p style="margin:2px 0 0;font-size:12px;color:#888780;">Powered by LeaseFlow</p>
</td></tr>

<tr><td style="background:#ffffff;border-radius:16px;padding:36px 40px;border:1px solid #E8E6E0;">
<p style="margin:0 0 6px;font-size:26px;font-weight:600;color:#2C2C2A;letter-spacing:-0.5px;">Thanks, {first}!</p>
<p style="margin:0 0 28px;font-size:15px;color:#5F5E5A;line-height:1.6;">
We received your inquiry and our team will be in touch within <strong style="color:#2C2C2A;">24 hours</strong> to discuss available rentals that match what you're looking for.
</p>
{summary_card}
<p style="margin:0 0 14px;font-size:13px;font-weight:600;color:#888780;text-transform:uppercase;letter-spacing:0.5px;">What happens next</p>
<table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px;">
<tr><td style="vertical-align:top;padding:0 16px 14px 0;width:32px;">
<div style="width:28px;height:28px;background:#EAF3DE;border-radius:50%;text-align:center;line-height:28px;font-size:12px;font-weight:600;color:#3B6D11;">1</div></td>
<td style="vertical-align:top;padding-bottom:14px;">
<p style="margin:4px 0 2px;font-size:14px;font-weight:500;color:#2C2C2A;">We review your preferences</p>
<p style="margin:0;font-size:13px;color:#888780;">Our team looks through available listings that match your budget and requirements.</p>
</td></tr>
<tr><td style="vertical-align:top;padding:0 16px 14px 0;">
<div style="width:28px;height:28px;background:#E1F5EE;border-radius:50%;text-align:center;line-height:28px;font-size:12px;font-weight:600;color:#0F6E56;">2</div></td>
<td style="vertical-align:top;padding-bottom:14px;">
<p style="margin:4px 0 2px;font-size:14px;font-weight:500;color:#2C2C2A;">We reach out within 24 hours</p>
<p style="margin:0;font-size:13px;color:#888780;">Expect a call or email with curated listings and available showing times.</p>
</td></tr>
<tr><td style="vertical-align:top;padding:0 16px 0 0;">
<div style="width:28px;height:28px;background:#EEEDFE;border-radius:50%;text-align:center;line-height:28px;font-size:12px;font-weight:600;color:#534AB7;">3</div></td>
<td style="vertical-align:top;">
<p style="margin:4px 0 2px;font-size:14px;font-weight:500;color:#2C2C2A;">Schedule a showing</p>
<p style="margin:0;font-size:13px;color:#888780;">Pick a time that works for you — in-person or virtual tours available.</p>
</td></tr></table>

<div style="border-top:1px solid #F1EFE8;padding-top:20px;">
<p style="margin:0;font-size:13px;color:#888780;line-height:1.6;">
Have questions in the meantime? Just reply to this email or call us directly — we're happy to help.
</p></div>
</td></tr>

<tr><td align="center" style="padding-top:24px;">
<p style="margin:0;font-size:12px;color:#B4B2A9;line-height:1.6;">
{property_name} &nbsp;·&nbsp; This message was sent because you spoke with our AI leasing assistant.<br/>
If this wasn't you, please disregard this email.</p>
</td></tr>

</table></td></tr></table></body></html>"""


def lead_confirmation_text(lead: Dict[str, Any], property_name: str = "LeaseFlow") -> str:
    name = lead.get("full_name") or ""
    first = name.split(" ")[0] if name else "there"
    parts = [f"Hi {first},", "", f"Thanks for reaching out to {property_name}!", "",
             "We received your inquiry and our team will be in touch within 24 hours to discuss available rentals that match what you're looking for.", ""]
    if lead.get("budget_min") or lead.get("budget_max"):
        parts.append(f"Budget: {fmt_budget(lead.get('budget_min'), lead.get('budget_max'))}")
    if lead.get("move_in_date"):
        parts.append(f"Move-in: {lead['move_in_date']}")
    if lead.get("bedrooms"):
        parts.append(f"Bedrooms: {lead['bedrooms']}")
    parts += ["", "What happens next:",
              "1. We review your preferences and find matching listings",
              "2. We reach out within 24 hours with options and showing times",
              "3. You pick a time — in-person or virtual tours available", "",
              "Questions? Just reply to this email.", "",
              f"— The {property_name} Team"]
    return "\n".join(parts)


# --------------------------------------------------------------------------
# Send via Resend
# --------------------------------------------------------------------------

async def send_email(api_key: str, *, sender: str, to: str, subject: str,
                     html: str, text: str) -> Dict[str, Any]:
    """Non-blocking Resend send. Returns {ok, id?, error?}."""
    if not api_key:
        return {"ok": False, "error": "Resend API key not configured"}
    try:
        resend.api_key = api_key
        params = {
            "from": sender,
            "to": [to],
            "subject": subject,
            "html": html,
            "text": text,
        }
        result = await asyncio.to_thread(resend.Emails.send, params)
        if isinstance(result, dict) and result.get("id"):
            return {"ok": True, "id": result["id"]}
        return {"ok": True, "id": str(result)}
    except Exception as e:
        logger.exception("Resend send failed")
        return {"ok": False, "error": str(e)}


# --------------------------------------------------------------------------
# Email config helpers (DB-backed)
# --------------------------------------------------------------------------

async def get_email_config(db) -> Dict[str, Any]:
    """Returns the single email config row, or {} if none."""
    cfg = await db.email_config.find_one({}, {"_id": 0}) or {}
    return cfg


async def trigger_lead_emails(db, lead: Dict[str, Any]) -> Dict[str, str]:
    """Fire-and-forget both emails. Updates the lead doc with delivery status.
    Returns a small summary dict for logging.
    """
    cfg = await get_email_config(db)
    api_key = cfg.get("resend_api_key") or os.environ.get("RESEND_API_KEY") or ""
    sender = cfg.get("from_email") or "onboarding@resend.dev"
    manager_email = cfg.get("manager_email") or ""
    manager_name = cfg.get("manager_name") or "Property Manager"
    property_name = cfg.get("property_name") or "LeaseFlow"
    send_lead_thanks = cfg.get("send_lead_confirmation", True)

    results: Dict[str, str] = {}
    if not api_key:
        results["status"] = "skipped — no Resend API key"
        return results
    if not manager_email:
        results["manager"] = "skipped — no manager_email"
    else:
        first = (lead.get("full_name") or "").split(" ")[0]
        subj = f"[LeaseFlow] New {lead.get('quality') or 'lead'} {('— ' + first) if first else ''}".strip()
        r = await send_email(
            api_key, sender=sender, to=manager_email, subject=subj,
            html=manager_notification_html(lead, manager_name),
            text=manager_notification_text(lead),
        )
        results["manager"] = "sent" if r["ok"] else f"failed: {r.get('error')}"
        if r["ok"]:
            await db.leads.update_one(
                {"id": lead["id"]},
                {"$set": {"agent_notified": True,
                          "agent_notified_at": datetime.now(timezone.utc).isoformat()}},
            )

    if send_lead_thanks and lead.get("email"):
        r2 = await send_email(
            api_key, sender=sender, to=lead["email"],
            subject=f"Thanks for reaching out to {property_name}",
            html=lead_confirmation_html(lead, property_name),
            text=lead_confirmation_text(lead, property_name),
        )
        results["lead"] = "sent" if r2["ok"] else f"failed: {r2.get('error')}"
        if r2["ok"]:
            await db.leads.update_one(
                {"id": lead["id"]},
                {"$set": {"lead_thanked": True,
                          "lead_thanked_at": datetime.now(timezone.utc).isoformat()}},
            )
    else:
        results["lead"] = "skipped — no lead email" if not lead.get("email") else "skipped — disabled"

    return results
