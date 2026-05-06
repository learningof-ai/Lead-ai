"""LeaseFlow backend regression tests.

Covers: auth, agents CRUD, leads CRUD/CSV, stats, setup, sheets, demo seed/clear,
webhook logs, and the public Vapi webhook (lead branch + Vapi event branch + auth +
content-type + body cap + idempotency).
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://lead-capture-hub-42.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
PUBLIC_WEBHOOK = f"{API}/public/vapi-webhook"

ADMIN_EMAIL = "admin@form.rentals"
ADMIN_PASS = "leaseflow2026"
GLOBAL_SECRET = "whsec_f14bc523b82be53d61caf19d90f83cb32f19ad2a1434b6ba57338c0124b6ba67"


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def test_agent(auth_headers):
    """Create a unique test agent and clean it up at the end."""
    agent_id = f"agent_test_{uuid.uuid4().hex[:8]}"
    r = requests.post(f"{API}/agents",
                      json={"agent_id": agent_id, "name": "TEST_Agent"},
                      headers=auth_headers, timeout=15)
    assert r.status_code == 200, f"create agent failed: {r.text}"
    data = r.json()
    yield data
    # Cleanup
    try:
        requests.delete(f"{API}/agents/{data['id']}", headers=auth_headers, timeout=15)
    except Exception:
        pass


# -----------------------------------------------------------------------------
# Health
# -----------------------------------------------------------------------------
class TestHealth:
    def test_root(self):
        r = requests.get(f"{API}/", timeout=10)
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_health(self):
        r = requests.get(f"{API}/health", timeout=10)
        assert r.status_code == 200
        assert r.json()["ok"] is True


# -----------------------------------------------------------------------------
# Auth
# -----------------------------------------------------------------------------
class TestAuth:
    def test_admin_login(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "token" in d and d["user"]["email"] == ADMIN_EMAIL
        assert d["user"]["role"] == "owner"

    def test_login_bad_pwd(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"}, timeout=15)
        assert r.status_code == 401

    def test_me(self, auth_headers):
        r = requests.get(f"{API}/auth/me", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_me_no_token(self):
        r = requests.get(f"{API}/auth/me", timeout=10)
        assert r.status_code in (401, 403)

    def test_team_list(self, auth_headers):
        r = requests.get(f"{API}/auth/team", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# -----------------------------------------------------------------------------
# Agents CRUD
# -----------------------------------------------------------------------------
class TestAgents:
    def test_list_agents(self, auth_headers):
        r = requests.get(f"{API}/agents", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_duplicate_agent(self, auth_headers, test_agent):
        r = requests.post(f"{API}/agents",
                          json={"agent_id": test_agent["agent_id"], "name": "dup"},
                          headers=auth_headers, timeout=10)
        assert r.status_code == 409

    def test_invalid_agent_id_format(self, auth_headers):
        r = requests.post(f"{API}/agents",
                          json={"agent_id": "bad-id", "name": "x"},
                          headers=auth_headers, timeout=10)
        assert r.status_code == 422

    def test_patch_agent(self, auth_headers, test_agent):
        r = requests.patch(f"{API}/agents/{test_agent['id']}",
                           json={"name": "TEST_Renamed"},
                           headers=auth_headers, timeout=10)
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Renamed"

    def test_regen_secret(self, auth_headers, test_agent):
        old = test_agent["webhook_secret"]
        r = requests.post(f"{API}/agents/{test_agent['id']}/regenerate-secret",
                          headers=auth_headers, timeout=10)
        assert r.status_code == 200
        new = r.json()["webhook_secret"]
        assert new != old
        # Restore to original via regen so subsequent tests use known secret
        # We update the fixture's secret reference
        test_agent["webhook_secret"] = new


# -----------------------------------------------------------------------------
# Public Vapi webhook
# -----------------------------------------------------------------------------
class TestVapiWebhook:
    def test_missing_secret_401(self):
        r = requests.post(PUBLIC_WEBHOOK,
                          json={"agent_id": "agent_anything"},
                          headers={"Content-Type": "application/json"}, timeout=15)
        assert r.status_code == 401
        assert "request_id" in r.json()

    def test_wrong_content_type_415(self, test_agent):
        r = requests.post(PUBLIC_WEBHOOK,
                          data="agent_id=foo",
                          headers={"Content-Type": "text/plain",
                                   "x-vapi-secret": test_agent["webhook_secret"]},
                          timeout=15)
        assert r.status_code == 415

    def test_unknown_agent_401(self, test_agent):
        r = requests.post(PUBLIC_WEBHOOK,
                          json={"agent_id": "agent_does_not_exist_xyz"},
                          headers={"Content-Type": "application/json",
                                   "x-vapi-secret": test_agent["webhook_secret"]},
                          timeout=15)
        assert r.status_code == 401

    def test_wrong_secret_401(self, test_agent):
        r = requests.post(PUBLIC_WEBHOOK,
                          json={"agent_id": test_agent["agent_id"]},
                          headers={"Content-Type": "application/json",
                                   "x-vapi-secret": "whsec_" + "f" * 64},
                          timeout=15)
        assert r.status_code == 401

    def test_body_too_large_413(self, test_agent):
        big = "x" * (17 * 1024)
        r = requests.post(PUBLIC_WEBHOOK,
                          data=big,
                          headers={"Content-Type": "application/json",
                                   "x-vapi-secret": test_agent["webhook_secret"]},
                          timeout=15)
        assert r.status_code == 413

    def test_capture_lead_success(self, test_agent):
        payload = {
            "agent_id": test_agent["agent_id"],
            "caller_phone": "+15558881111",
            "extracted_name": "TEST_Webhook Lead",
            "extracted_location": "Test City",
            "extracted_budget": "$2000",
            "extracted_property_type": "studio",
            "extracted_urgency": "this week",
            "notes": "TEST_ webhook insert",
        }
        r = requests.post(PUBLIC_WEBHOOK, json=payload,
                          headers={"Content-Type": "application/json",
                                   "x-vapi-secret": test_agent["webhook_secret"]},
                          timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("success") is True
        assert "lead_id" in d
        # store for later tests via class attr
        TestVapiWebhook.created_lead_id = d["lead_id"]

    def test_capture_lead_global_secret(self, test_agent):
        r = requests.post(PUBLIC_WEBHOOK,
                          json={"agent_id": test_agent["agent_id"],
                                "extracted_name": "TEST_GlobalSecret"},
                          headers={"Content-Type": "application/json",
                                   "x-vapi-secret": GLOBAL_SECRET},
                          timeout=15)
        assert r.status_code == 200

    def test_idempotency_replay(self, test_agent):
        rid = f"test_{uuid.uuid4().hex}"
        headers = {"Content-Type": "application/json",
                   "x-vapi-secret": test_agent["webhook_secret"],
                   "x-request-id": rid}
        body = {"agent_id": test_agent["agent_id"], "extracted_name": "TEST_Idempo"}
        r1 = requests.post(PUBLIC_WEBHOOK, json=body, headers=headers, timeout=15)
        assert r1.status_code == 200
        lead1 = r1.json()["lead_id"]
        r2 = requests.post(PUBLIC_WEBHOOK, json=body, headers=headers, timeout=15)
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2["lead_id"] == lead1
        assert d2.get("idempotent_replay") is True

    def test_vapi_event_status_update(self, test_agent):
        payload = {
            "agent_id": test_agent["agent_id"],
            "message": {
                "type": "status-update",
                "status": "in-progress",
                "call": {"id": f"call_test_{uuid.uuid4().hex[:8]}"},
            },
        }
        r = requests.post(PUBLIC_WEBHOOK, json=payload,
                          headers={"Content-Type": "application/json",
                                   "x-vapi-secret": test_agent["webhook_secret"]},
                          timeout=15)
        assert r.status_code == 200, r.text
        assert "session_id" in r.json()

    def test_invalid_payload_400(self, test_agent):
        r = requests.post(PUBLIC_WEBHOOK,
                          json={"agent_id": "not-valid-format"},
                          headers={"Content-Type": "application/json",
                                   "x-vapi-secret": test_agent["webhook_secret"]},
                          timeout=15)
        assert r.status_code == 400


# -----------------------------------------------------------------------------
# Leads CRUD
# -----------------------------------------------------------------------------
class TestLeads:
    def test_list_leads(self, auth_headers):
        r = requests.get(f"{API}/leads", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert "items" in d and "total" in d

    def test_create_get_update_delete(self, auth_headers):
        # create
        c = requests.post(f"{API}/leads",
                          json={"full_name": "TEST_Lead CRUD", "phone": "+15550009999",
                                "status": "New", "source": "Manual"},
                          headers=auth_headers, timeout=10)
        assert c.status_code == 200
        lid = c.json()["id"]
        # get
        g = requests.get(f"{API}/leads/{lid}", headers=auth_headers, timeout=10)
        assert g.status_code == 200
        assert g.json()["lead"]["full_name"] == "TEST_Lead CRUD"
        # patch
        u = requests.patch(f"{API}/leads/{lid}", json={"status": "Qualified"},
                           headers=auth_headers, timeout=10)
        assert u.status_code == 200
        assert u.json()["status"] == "Qualified"
        # verify activity logged
        g2 = requests.get(f"{API}/leads/{lid}", headers=auth_headers, timeout=10)
        kinds = [a["kind"] for a in g2.json()["activity"]]
        assert "status_change" in kinds
        # delete
        d = requests.delete(f"{API}/leads/{lid}", headers=auth_headers, timeout=10)
        assert d.status_code == 200
        # verify gone
        g3 = requests.get(f"{API}/leads/{lid}", headers=auth_headers, timeout=10)
        assert g3.status_code == 404

    def test_filters(self, auth_headers):
        r = requests.get(f"{API}/leads?status=New", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it["status"] == "New"

    def test_csv_export(self, auth_headers):
        r = requests.get(f"{API}/leads.csv", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")
        assert "full_name" in r.text


# -----------------------------------------------------------------------------
# Stats / Setup / Demo / Sheets / Logs
# -----------------------------------------------------------------------------
class TestMisc:
    def test_stats(self, auth_headers):
        r = requests.get(f"{API}/stats", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        d = r.json()
        for k in ("total_leads", "leads_today", "conversion_rate", "daily", "by_status"):
            assert k in d
        assert len(d["daily"]) == 7
        for s in ("New", "Contacted", "Qualified", "Converted", "Lost"):
            assert s in d["by_status"]

    def test_setup_info(self, auth_headers):
        r = requests.get(f"{API}/setup/info", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert "/api/public/vapi-webhook" in d["webhook_url"]
        assert d["tool_schema"]["function"]["name"] == "capture_rental_lead"

    def test_setup_test_webhook_valid(self, auth_headers, test_agent):
        r = requests.post(f"{API}/setup/test-webhook",
                          json={"agent_id": test_agent["agent_id"],
                                "secret": test_agent["webhook_secret"]},
                          headers=auth_headers, timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d["status_code"] == 200
        assert "lead_id" in d["response"]

    def test_setup_test_webhook_bad(self, auth_headers, test_agent):
        r = requests.post(f"{API}/setup/test-webhook",
                          json={"agent_id": test_agent["agent_id"],
                                "secret": test_agent["webhook_secret"],
                                "bad_secret": True},
                          headers=auth_headers, timeout=20)
        assert r.status_code == 200
        assert r.json()["status_code"] == 401

    def test_sheets_config_get_initial(self, auth_headers):
        r = requests.get(f"{API}/sheets/config", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        # may or may not be connected; just verify shape
        assert "connected" in r.json()

    def test_sheets_config_invalid_json_400(self, auth_headers):
        r = requests.post(f"{API}/sheets/config",
                          json={"sheet_id": "1234567890abc",
                                "service_account_json": "not valid json at all xxx"},
                          headers=auth_headers, timeout=15)
        assert r.status_code == 400

    def test_demo_seed_then_clear(self, auth_headers):
        s = requests.post(f"{API}/demo/seed", headers=auth_headers, timeout=20)
        assert s.status_code == 200
        assert s.json()["inserted"] >= 1
        # clear
        c = requests.post(f"{API}/demo/clear", headers=auth_headers, timeout=20)
        assert c.status_code == 200

    def test_webhook_logs(self, auth_headers):
        r = requests.get(f"{API}/webhook-logs?limit=20", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert "items" in d and "total" in d


# -----------------------------------------------------------------------------
# Cleanup TEST_ leads at the end
# -----------------------------------------------------------------------------
@pytest.fixture(scope="session", autouse=True)
def _final_cleanup(request, admin_token):
    yield
    try:
        h = {"Authorization": f"Bearer {admin_token}"}
        r = requests.get(f"{API}/leads?q=TEST_&limit=1000", headers=h, timeout=15)
        if r.ok:
            for it in r.json().get("items", []):
                if it.get("full_name", "").startswith("TEST_") or "TEST_" in (it.get("notes") or "") or it.get("full_name") == "Test Caller":
                    requests.delete(f"{API}/leads/{it['id']}", headers=h, timeout=10)
        # also clear demo
        requests.post(f"{API}/demo/clear", headers=h, timeout=15)
    except Exception:
        pass
