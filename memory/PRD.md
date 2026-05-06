# LeaseFlow — Product Requirements Doc

## Original problem statement
Build a private internal lead-capture dashboard to fix the audit issue: the Vapi "Leasing Specialist" agent had **zero tools attached**, so calls extracted info but no leads were saved. Migrate the existing Lovable + Supabase repo to the Emergent stack (FastAPI + React + MongoDB), plus add: real-time lead notifications, a Kanban volume board, and Google Sheets sync. Private use only — me + my team. Domain: `form.rentals`.

## Architecture
- **Backend**: FastAPI + Motor (async MongoDB) + WebSocket fan-out + JWT auth
- **Frontend**: React 19 + React Router 7 + Tailwind + Phosphor icons + @dnd-kit
- **Data store**: MongoDB (no Supabase)
- **Real-time**: native WebSocket at `/api/ws`
- **Auth**: JWT email+password (bcrypt). First user becomes `owner`, subsequent are `members`. Default admin auto-seeded from env on startup: `admin@form.rentals` / `leaseflow2026`.
- **Google Sheets**: Service-account JSON key (no OAuth flow needed — perfect for an internal tool)
- **Webhook**: `POST /api/public/vapi-webhook` — security-hardened port of the original TS route

## User personas
- **Owner**: full access — registers Vapi agents, manages the team, connects Google Sheets, regenerates secrets
- **Member**: views and edits leads, runs Sheets sync, runs Vapi tests

## Core requirements (static)
1. Capture every Vapi call as a lead in MongoDB
2. Show leads in real time as they land (toast + audio chime)
3. Track lead progress through pipeline stages (New → Contacted → Qualified → Converted → Lost)
4. Audit log of every webhook attempt (auth ok / auth fail / validation error / insertion)
5. Self-service onboarding via in-app setup guide
6. Push leads to a Google Sheet for offline review
7. CSV export
8. Demo data seeder so the dashboard isn't empty before the first real call

## What's been implemented (2026-05-06)
### Backend
- `auth.py` — bcrypt + JWT + bootstrap admin seeder
- `realtime.py` — WebSocket hub fan-out
- `sheets.py` — Google Sheets service-account client
- `vapi_webhook.py` — security-hardened webhook (timing-safe HMAC, 16KB cap, 60 req/min per-IP rate limit, idempotency replay, generic 401 for all auth failure modes, Vapi event branch with phone→lead auto-link by digit-tail match, transcript persistence)
- `server.py` — auth, agents CRUD, leads CRUD + filters + CSV, stats, webhook logs, sheets config + sync, demo seed/clear, WebSocket endpoint
- 34 pytest tests passing

### Frontend
- Login (split-pane image+form), Signup, ProtectedRoute
- Dashboard (4 KPI cards, 7-day bar chart, status breakdown, recent leads list)
- Leads (search, status filters, lead detail side-sheet with activity timeline + linked calls, manual entry modal, CSV export)
- Pipeline (drag-drop kanban with 5 columns + live counts)
- Live Calls (WebSocket-powered cards with duration ticker, ringing/connected pulse animation)
- Vapi Setup wizard (step indicator, register-agent modal, copyable URL/secret/agent_id, JSON tool schema, Send-test buttons for valid + bad secret)
- Setup Guide (6-step explainer with deep-links to settings)
- Webhook Logs (paginated audit table with status filter)
- Settings (Google Sheets card, Team members card, Demo data seed/clear)
- Real-time toast + audio chime when a new lead arrives via WebSocket

### Design system
- Forest Green (#2A4B41) + Bone (#F9F8F6) palette — explicitly NOT purple/violet AI-gradient cliché
- Fraunces serif display font (uncommon, gorgeous) + IBM Plex Sans body + IBM Plex Mono code
- Sharp corners (rounded-none) per "neo-brutalist but elegant" archetype
- Phosphor duotone icons throughout
- Custom CSS variables in `index.css`, no shadcn theme overrides

## Prioritized backlog (P0/P1/P2)
### P0 (none — MVP done)
### P1 — high-value next
- [ ] **WhatsApp / SMS auto-reply when a new lead lands** (Twilio / WhatsApp Business)
- [ ] Per-team-member assignment + "owned by" filter on Pipeline
- [ ] Email digests (every morning, leads from past 24h)
### P2 — polish
- [ ] Lead deduplication (auto-merge by phone)
- [ ] Vapi call recordings playback
- [ ] Lead-source tagging (Zillow vs. Vapi vs. Manual)
- [ ] Multi-spreadsheet support (different sheets per lead source / status)

## Next tasks
- Hook up form.rentals custom domain via Emergent platform → update Vapi tool URL
- Have the user create a real Vapi tool and test against `agent_abb6aa93`
- (Optional) Add WhatsApp follow-up auto-reply when a lead lands

## Test credentials
See `/app/memory/test_credentials.md`
