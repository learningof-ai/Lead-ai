import { useEffect, useState, useCallback } from "react";
import { api, API_BASE } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import CopyField from "@/components/CopyField";
import StatusBadge from "@/components/StatusBadge";
import { Plus, ArrowsClockwise, PaperPlaneTilt, ShieldCheck, X, ToggleLeft, ToggleRight, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

function Stepper({ step }) {
  const steps = [
    "Register your agent",
    "Copy webhook URL & secret",
    "Add capture_rental_lead tool in Vapi",
    "Send a test call",
    "You're live",
  ];
  return (
    <ol className="space-y-3 mb-8" data-testid="setup-stepper">
      {steps.map((s, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <li key={i} className="flex items-start gap-3" data-testid={`step-${i}`}>
            <div className={`w-7 h-7 flex items-center justify-center text-[12px] flex-shrink-0 border ${done ? "bg-[var(--brand)] border-[var(--brand)] text-white" : active ? "bg-[var(--brand-soft)] border-[var(--brand)] text-[var(--brand)] font-medium" : "bg-transparent border-[var(--border)] text-[var(--text-muted)]"}`}>
              {done ? "✓" : i + 1}
            </div>
            <div className={`text-[14px] pt-1 ${active ? "text-[var(--text)] font-medium" : done ? "text-[var(--text-muted)]" : "text-[var(--text-faint)]"}`}>{s}</div>
          </li>
        );
      })}
    </ol>
  );
}

function CreateAgentModal({ open, onClose, onCreated }) {
  const [agentId, setAgentId] = useState("agent_");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/agents", { agent_id: agentId, name });
      toast.success("Agent created");
      onCreated?.();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 lf-fade-in" onClick={onClose} data-testid="create-agent-modal">
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="bg-white border border-[var(--border)] w-full max-w-md p-6 lf-slide-up">
        <div className="flex items-start justify-between mb-4">
          <h3 className="font-display text-2xl tracking-tight">Register agent</h3>
          <button type="button" onClick={onClose} className="btn-ghost"><X size={16} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Agent ID (from Vapi)</label>
            <input data-testid="agent-id-input" required className="input font-mono" value={agentId} pattern="^agent_[a-zA-Z0-9_-]+$"
                   onChange={(e) => setAgentId(e.target.value)} placeholder="agent_abb6aa93..." />
            <p className="text-[11px] text-[var(--text-faint)] mt-1">In Vapi dashboard → Assistants → click your assistant → copy the assistant ID. Must start with <code className="font-mono">agent_</code>.</p>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Display name</label>
            <input data-testid="agent-name-input" required className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Leasing Specialist" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={busy} className="btn-primary" data-testid="create-agent-submit">{busy ? "Creating..." : "Register agent"}</button>
        </div>
      </form>
    </div>
  );
}

function TestPanel({ agent, onSent }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [bad, setBad] = useState(null);

  const run = async (badSecret) => {
    setRunning(true);
    try {
      const r = await api.post("/setup/test-webhook", {
        agent_id: agent.agent_id,
        secret: agent.webhook_secret,
        bad_secret: badSecret,
      });
      if (badSecret) setBad(r.data);
      else setResult(r.data);
      onSent?.();
    } catch (e) {
      toast.error("Test failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button onClick={() => run(false)} disabled={running} className="btn-primary" data-testid="test-webhook-btn">
          <PaperPlaneTilt size={14} weight="duotone" /> Send test (valid secret)
        </button>
        <button onClick={() => run(true)} disabled={running} className="btn-secondary" data-testid="test-bad-secret-btn">
          <ShieldCheck size={14} weight="duotone" /> Send with bad secret
        </button>
      </div>
      {result && (
        <div className="card p-4 space-y-1.5 text-[12px]" data-testid="test-result">
          <div className="flex items-center gap-2">
            <span className="text-[var(--text-muted)]">Status:</span>
            <span className={`font-mono ${result.status_code === 200 ? "text-[var(--success-text)]" : "text-[var(--danger-text)]"}`}>
              {result.status_code} {result.status_code === 200 ? "OK" : "FAIL"}
            </span>
            <span className="text-[var(--text-faint)]">· {result.duration_ms}ms</span>
          </div>
          {result.response?.lead_id && (
            <div className="text-[12px] text-[var(--success-text)]">✓ Lead created: <code className="font-mono">{result.response.lead_id}</code></div>
          )}
          {result.response?.error && (
            <div className="text-[var(--danger-text)]">{result.response.error}</div>
          )}
        </div>
      )}
      {bad && (
        <div className="card p-4 text-[12px]" data-testid="bad-secret-result">
          <div className="flex items-center gap-2">
            <span className="text-[var(--text-muted)]">Bad secret response:</span>
            <span className={`font-mono ${bad.status_code === 401 ? "text-[var(--success-text)]" : "text-[var(--danger-text)]"}`}>
              {bad.status_code} {bad.status_code === 401 ? "(correctly rejected ✓)" : "(should be 401!)"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function VapiSetup() {
  const { user } = useAuth();
  const [info, setInfo] = useState(null);
  const [agents, setAgents] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    const [i, a] = await Promise.all([api.get("/setup/info"), api.get("/agents")]);
    setInfo(i.data);
    setAgents(a.data);
    if (a.data.length > 0 && !selectedId) setSelectedId(a.data[0].id);
  }, [selectedId]);

  useEffect(() => { load(); }, [load]);

  const selected = agents.find((a) => a.id === selectedId);
  const step = !agents.length ? 0 : !selected ? 0 : 2; // simplified

  const regenerate = async () => {
    if (!selected) return;
    if (!confirm("Regenerate the secret? Your existing Vapi tool will stop working until you paste the new secret.")) return;
    try {
      const r = await api.post(`/agents/${selected.id}/regenerate-secret`);
      toast.success("New secret generated");
      setAgents((cur) => cur.map((a) => (a.id === selected.id ? r.data : a)));
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    }
  };

  const toggleActive = async () => {
    if (!selected) return;
    try {
      const r = await api.patch(`/agents/${selected.id}`, { is_active: !selected.is_active });
      setAgents((cur) => cur.map((a) => (a.id === selected.id ? r.data : a)));
    } catch {}
  };

  const remove = async () => {
    if (!selected) return;
    if (!confirm("Delete this agent? Webhook calls using its agent_id will be rejected.")) return;
    try {
      await api.delete(`/agents/${selected.id}`);
      setSelectedId(null);
      load();
    } catch {}
  };

  const toolJson = JSON.stringify({
    type: "function",
    function: {
      name: "capture_rental_lead",
      description: "Save the qualified rental-lead details once they've been captured during the call.",
      parameters: {
        type: "object",
        required: ["agent_id"],
        properties: {
          agent_id: { type: "string", description: `Must equal "${selected?.agent_id || "agent_xxx"}".` },
          caller_phone: { type: "string", description: "The caller's phone number, e.g. +14155551234." },
          extracted_name: { type: "string", description: "The caller's full name." },
          extracted_location: { type: "string", description: "The neighbourhood / city they're moving to." },
          extracted_budget: { type: "string", description: "The caller's monthly budget." },
          extracted_property_type: { type: "string", description: "studio, 1BR, 2BR, loft, townhome, ..." },
          extracted_urgency: { type: "string", description: "ASAP / this week / this month / browsing." },
          notes: { type: "string", description: "Anything else worth remembering." },
        },
      },
    },
  }, null, 2);

  return (
    <div className="px-8 py-10 max-w-3xl mx-auto" data-testid="vapi-setup-page">
      <PageHeader
        eyebrow="Step-by-step"
        title="Vapi Setup"
        subtitle="Wire your Vapi assistant to LeaseFlow in five minutes."
        right={<button onClick={() => setShowCreate(true)} className="btn-primary" data-testid="register-agent-btn"><Plus size={14} weight="bold" /> Register agent</button>}
      />

      <Stepper step={step} />

      {agents.length === 0 ? (
        <div className="card p-8 text-center">
          <h3 className="font-display text-xl mb-2">No agents registered yet</h3>
          <p className="text-[var(--text-muted)] mb-4">Start by registering your Vapi assistant.</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary" data-testid="register-first-agent">
            <Plus size={14} weight="bold" /> Register your first agent
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="card p-4">
            <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-2">Agent</label>
            <div className="flex flex-wrap gap-2">
              {agents.map((a) => (
                <button key={a.id} onClick={() => setSelectedId(a.id)} data-testid={`agent-tab-${a.id}`}
                        className={`px-3 py-2 text-[13px] border ${selectedId === a.id ? "bg-[var(--brand)] text-white border-[var(--brand)]" : "border-[var(--border)] hover:bg-[var(--surface-hover)]"}`}>
                  {a.name} {!a.is_active && <span className="opacity-60 ml-1">(disabled)</span>}
                </button>
              ))}
            </div>
          </div>

          {selected && (
            <>
              <section className="card p-6 space-y-4" data-testid="webhook-config-card">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Step 2</div>
                    <h3 className="font-display text-xl">Webhook URL & secret</h3>
                  </div>
                  <button onClick={toggleActive} className="btn-ghost" data-testid="toggle-active-btn">
                    {selected.is_active ? <ToggleRight size={20} weight="duotone" color="var(--brand)" /> : <ToggleLeft size={20} weight="duotone" />}
                    <span>{selected.is_active ? "Active" : "Disabled"}</span>
                  </button>
                </div>
                <CopyField label="Server URL (paste this in Vapi tool)" value={`${API_BASE}/public/vapi-webhook`} testId="webhook-url" />
                <CopyField label="x-vapi-secret header value" value={selected.webhook_secret} testId="webhook-secret" />
                <CopyField label="agent_id (use as the value of agent_id parameter in tool calls)" value={selected.agent_id} testId="agent-id" />
                <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
                  <button onClick={regenerate} className="btn-ghost text-[12px] text-[var(--warning-text)]" data-testid="regenerate-secret-btn">
                    <ArrowsClockwise size={14} weight="duotone" /> Regenerate secret
                  </button>
                  {user?.role === "owner" && (
                    <button onClick={remove} className="btn-ghost text-[12px] text-[var(--danger-text)]"><Trash size={14} weight="duotone" /> Delete agent</button>
                  )}
                </div>
              </section>

              <section className="card p-6 space-y-4" data-testid="tool-config-card">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Step 3</div>
                  <h3 className="font-display text-xl">Add the <code className="font-mono">capture_rental_lead</code> tool in Vapi</h3>
                  <p className="text-[var(--text-muted)] text-[13px] mt-1">In Vapi dashboard → Tools → Create function → set <strong>Server URL</strong> to the URL above, add <strong>x-vapi-secret</strong> as a custom header, and paste this JSON schema:</p>
                </div>
                <pre className="bg-[var(--surface-muted)] border border-[var(--border)] p-4 text-[11px] font-mono overflow-x-auto whitespace-pre" data-testid="tool-schema-json">
{toolJson}
                </pre>
              </section>

              <section className="card p-6 space-y-4" data-testid="test-card">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Step 4</div>
                  <h3 className="font-display text-xl">Send a test</h3>
                  <p className="text-[var(--text-muted)] text-[13px] mt-1">We'll POST a sample lead to your webhook from this server. If it inserts, your config is correct.</p>
                </div>
                <TestPanel agent={selected} onSent={load} />
              </section>
            </>
          )}
        </div>
      )}

      <CreateAgentModal open={showCreate} onClose={() => setShowCreate(false)} onCreated={load} />
    </div>
  );
}
