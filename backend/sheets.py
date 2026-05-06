"""Google Sheets sync via Service Account JSON key.

We store the JSON key + target sheet ID per-account in the `google_sheets_config`
collection. Anyone in the team can sync. The sheet must be shared with the
service account email (read+write).
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

HEADER_ROW = [
    "Created At",
    "Full Name",
    "Phone",
    "Location",
    "Budget",
    "Property Type",
    "Urgency",
    "Status",
    "Source",
    "Notes",
]


def _service(json_key: Dict[str, Any]):
    creds = service_account.Credentials.from_service_account_info(json_key, scopes=SCOPES)
    return build("sheets", "v4", credentials=creds, cache_discovery=False)


def get_service_account_email(json_key: Dict[str, Any]) -> str:
    return json_key.get("client_email", "")


def ensure_header(svc, sheet_id: str, tab: str = "Leads") -> None:
    try:
        result = svc.spreadsheets().values().get(
            spreadsheetId=sheet_id, range=f"{tab}!A1:J1"
        ).execute()
        values = result.get("values", [])
        if not values or values[0] != HEADER_ROW:
            svc.spreadsheets().values().update(
                spreadsheetId=sheet_id,
                range=f"{tab}!A1:J1",
                valueInputOption="RAW",
                body={"values": [HEADER_ROW]},
            ).execute()
    except HttpError as e:
        if e.resp.status == 400 and "Unable to parse range" in str(e):
            # Tab missing — create it.
            svc.spreadsheets().batchUpdate(
                spreadsheetId=sheet_id,
                body={"requests": [{"addSheet": {"properties": {"title": tab}}}]},
            ).execute()
            svc.spreadsheets().values().update(
                spreadsheetId=sheet_id,
                range=f"{tab}!A1:J1",
                valueInputOption="RAW",
                body={"values": [HEADER_ROW]},
            ).execute()
        else:
            raise


def lead_to_row(lead: Dict[str, Any]) -> List[str]:
    return [
        str(lead.get("created_at", "")),
        str(lead.get("full_name", "") or ""),
        str(lead.get("phone", "") or ""),
        str(lead.get("location", "") or ""),
        str(lead.get("budget", "") or ""),
        str(lead.get("property_type", "") or ""),
        str(lead.get("urgency", "") or ""),
        str(lead.get("status", "") or ""),
        str(lead.get("source", "") or ""),
        str(lead.get("notes", "") or ""),
    ]


def append_leads(json_key: Dict[str, Any], sheet_id: str, leads: List[Dict[str, Any]],
                 tab: str = "Leads") -> int:
    if not leads:
        return 0
    svc = _service(json_key)
    ensure_header(svc, sheet_id, tab)
    rows = [lead_to_row(lead) for lead in leads]
    svc.spreadsheets().values().append(
        spreadsheetId=sheet_id,
        range=f"{tab}!A:J",
        valueInputOption="RAW",
        insertDataOption="INSERT_ROWS",
        body={"values": rows},
    ).execute()
    return len(rows)


def test_connection(json_key: Dict[str, Any], sheet_id: str) -> Dict[str, Any]:
    svc = _service(json_key)
    meta = svc.spreadsheets().get(spreadsheetId=sheet_id, fields="properties.title").execute()
    return {"ok": True, "title": meta.get("properties", {}).get("title", "")}


def parse_json_key(raw: str) -> Optional[Dict[str, Any]]:
    try:
        data = json.loads(raw)
    except Exception:
        return None
    required = {"type", "client_email", "private_key", "project_id"}
    if not required.issubset(data.keys()):
        return None
    return data
