import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/context/AuthContext";
import { CheckCircle, XCircle, Plus, FloppyDisk, ArrowsClockwise, FileArrowUp, Trash, Plant, Users } from "@phosphor-icons/react";
import { toast } from "sonner";

function GoogleSheetsCard({ user }) {
  const [cfg, setCfg] = useState(null);
  const [sheetId, setSheetId] = useState("");
  const [json, setJson] = useState("");
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    const r = await api.get("/sheets/config");
    setCfg(r.data);
    if (r.data?.connected) setSheetId(r.data.sheet_id);
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!sheetId || !json) { toast.error("Sheet ID and JSON key required"); return; }
    setBusy(true);
    try {
      const r = await api.post("/sheets/config", { sheet_id: sheetId, service_account_json: json });
      toast.success(`Connected to "${r.data.sheet_title}"`);
      setJson("");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Connection failed");
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await api.post("/sheets/sync", { only_new: true });
      toast.success(r.data.message || `Synced ${r.data.synced} leads`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const disconnect = async () => {
    if (!confirm("Disconnect Google Sheets?")) return;
    await api.delete("/sheets/config");
    toast.success("Disconnected");
    load();
  };

  return (
    <section className="card p-6 space-y-4" data-testid="sheets-config">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Integration</div>
          <h3 className="font-display text-xl tracking-tight">Google Sheets sync</h3>
          <p className="text-[var(--text-muted)] text-[13px] mt-1">Push every new lead to a live Google Sheet your team can review.</p>
        </div>
        {cfg?.connected ? (
          <span className="lf-badge" style={{ background: "var(--success-bg)", color: "var(--success-text)", borderColor: "var(--success-border)" }}>
            <CheckCircle size={12} weight="fill" /> Connected
          </span>
        ) : (
          <span className="lf-badge" style={{ background: "var(--surface-muted)", color: "var(--text-muted)", borderColor: "var(--border)" }}>
            <XCircle size={12} weight="duotone" /> Not configured
          </span>
        )}
      </div>

      {cfg?.connected ? (
        <>
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Sheet ID</div>
              <div className="font-mono break-all">{cfg.sheet_id}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Service account</div>
              <div className="font-mono break-all">{cfg.service_account_email}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Last sync</div>
              <div>{cfg.last_sync_at ? new Date(cfg.last_sync_at).toLocaleString() : "Never"}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Last sync count</div>
              <div className="tabular-nums">{cfg.last_sync_count || 0}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--border)]">
            <button onClick={sync} disabled={syncing} className="btn-primary" data-testid="sheets-sync-btn">
              <ArrowsClockwise size={14} weight="duotone" /> {syncing ? "Syncing..." : "Sync now"}
            </button>
            {user?.role === "owner" && (
              <button onClick={disconnect} className="btn-ghost text-[var(--danger-text)]" data-testid="sheets-disconnect">
                <Trash size={14} weight="duotone" /> Disconnect
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="card p-4 text-[12px]" style={{ background: "var(--info-bg)", borderColor: "var(--info-border)", color: "var(--info-text)" }}>
            <div className="font-medium mb-1">Quick setup:</div>
            <ol className="list-decimal pl-5 space-y-0.5">
              <li>Go to <a className="underline" target="_blank" rel="noreferrer" href="https://console.cloud.google.com/iam-admin/serviceaccounts">Google Cloud → Service Accounts</a> → create one</li>
              <li>Add a <strong>JSON</strong> key, download it, paste below</li>
              <li>Enable the <a className="underline" target="_blank" rel="noreferrer" href="https://console.cloud.google.com/apis/library/sheets.googleapis.com">Sheets API</a></li>
              <li>Open your sheet → Share with the service account's <code>client_email</code> as Editor</li>
              <li>Copy the sheet ID from the URL: docs.google.com/spreadsheets/d/<strong>SHEET_ID</strong>/edit</li>
            </ol>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Sheet ID</label>
            <input data-testid="sheet-id-input" className="input font-mono" value={sheetId} onChange={(e) => setSheetId(e.target.value)} placeholder="1aBcDeFgHiJkLmNoPqRsTuVwXyZ..." />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Service account JSON key</label>
            <textarea data-testid="sheet-json-input" className="input font-mono" rows={6} value={json} onChange={(e) => setJson(e.target.value)} placeholder='{"type":"service_account","project_id":"...","client_email":"...","private_key":"..."}' />
          </div>
          <button onClick={save} disabled={busy || user?.role !== "owner"} className="btn-primary" data-testid="sheets-save-btn">
            <FloppyDisk size={14} weight="duotone" /> {busy ? "Saving..." : "Connect"}
          </button>
          {user?.role !== "owner" && <p className="text-[12px] text-[var(--text-muted)]">Only the owner can connect Google Sheets.</p>}
        </>
      )}
    </section>
  );
}

function TeamCard() {
  const [team, setTeam] = useState([]);
  useEffect(() => {
    api.get("/auth/team").then((r) => setTeam(r.data));
  }, []);
  return (
    <section className="card p-6" data-testid="team-card">
      <div className="flex items-center gap-3 mb-4">
        <Users size={20} weight="duotone" className="text-[var(--brand)]" />
        <h3 className="font-display text-xl tracking-tight">Team members</h3>
      </div>
      <div className="divide-y">
        {team.map((u) => (
          <div key={u.user_id} className="flex items-center justify-between py-2.5 text-[13px]">
            <div>
              <div className="font-medium">{u.full_name}</div>
              <div className="text-[11px] text-[var(--text-muted)]">{u.email}</div>
            </div>
            <span className="lf-badge" style={{
              background: u.role === "owner" ? "var(--success-bg)" : "var(--info-bg)",
              color: u.role === "owner" ? "var(--success-text)" : "var(--info-text)",
              borderColor: u.role === "owner" ? "var(--success-border)" : "var(--info-border)",
            }}>{u.role}</span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-[var(--text-faint)] mt-3">To add a teammate, send them the signup link — they'll join as a member automatically.</p>
    </section>
  );
}

function DemoDataCard({ user }) {
  const [busy, setBusy] = useState(false);
  if (user?.role !== "owner") return null;
  const seed = async () => {
    setBusy(true);
    try {
      const r = await api.post("/demo/seed");
      toast.success(`Seeded ${r.data.inserted} demo leads`);
    } finally { setBusy(false); }
  };
  const clear = async () => {
    if (!confirm("Remove all demo leads?")) return;
    setBusy(true);
    try {
      await api.post("/demo/clear");
      toast.success("Demo data cleared");
    } finally { setBusy(false); }
  };
  return (
    <section className="card p-6" data-testid="demo-card">
      <div className="flex items-center gap-3 mb-2">
        <Plant size={20} weight="duotone" className="text-[var(--brand)]" />
        <h3 className="font-display text-xl tracking-tight">Demo data</h3>
      </div>
      <p className="text-[var(--text-muted)] text-[13px] mb-4">Seed sample leads to play with the dashboard before your first real Vapi call.</p>
      <div className="flex gap-2">
        <button onClick={seed} disabled={busy} className="btn-primary" data-testid="seed-demo"><Plus size={14} weight="bold" /> Seed demo leads</button>
        <button onClick={clear} disabled={busy} className="btn-secondary" data-testid="clear-demo"><Trash size={14} weight="duotone" /> Clear demo</button>
      </div>
    </section>
  );
}

export default function Settings() {
  const { user } = useAuth();
  return (
    <div className="px-8 py-10 max-w-3xl mx-auto space-y-6" data-testid="settings-page">
      <PageHeader
        eyebrow="Account"
        title="Settings"
        subtitle="Manage integrations, team, and demo data."
      />
      <GoogleSheetsCard user={user} />
      <TeamCard />
      <DemoDataCard user={user} />
    </div>
  );
}
