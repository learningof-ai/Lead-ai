import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useRealtime } from "@/context/RealtimeContext";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import LeadDetail from "@/components/LeadDetail";
import QualityBadge from "@/components/QualityBadge";
import {
  Plus, MagnifyingGlass, DownloadSimple, X, FunnelSimple,
} from "@phosphor-icons/react";
import { toast } from "sonner";

const STATUSES = ["New", "Contacted", "Qualified", "Converted", "Lost"];

function NewLeadModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({
    full_name: "", phone: "", location: "", budget: "",
    property_type: "", urgency: "", notes: "", status: "New", source: "Manual",
  });
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/leads", form);
      toast.success("Lead created");
      onCreated?.();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to create lead");
    } finally {
      setBusy(false);
    }
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 lf-fade-in" onClick={onClose} data-testid="new-lead-modal">
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="bg-white border border-[var(--border)] w-full max-w-lg p-6 lf-slide-up">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Manual entry</div>
            <h3 className="font-display text-2xl tracking-tight">New lead</h3>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost" data-testid="new-lead-close"><X size={16} /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Full name *</label>
            <input data-testid="new-lead-name" required className="input" value={form.full_name} onChange={set("full_name")} />
          </div>
          <div className="col-span-2">
            <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Phone</label>
            <input data-testid="new-lead-phone" className="input" value={form.phone} onChange={set("phone")} />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Location</label>
            <input className="input" value={form.location} onChange={set("location")} />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Budget</label>
            <input className="input" value={form.budget} onChange={set("budget")} />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Property type</label>
            <input className="input" value={form.property_type} onChange={set("property_type")} />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Urgency</label>
            <input className="input" value={form.urgency} onChange={set("urgency")} />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Status</label>
            <select className="input" value={form.status} onChange={set("status")}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Source</label>
            <input className="input" value={form.source} onChange={set("source")} />
          </div>
          <div className="col-span-2">
            <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Notes</label>
            <textarea className="input" rows={3} value={form.notes} onChange={set("notes")} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 mt-5">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={busy} className="btn-primary" data-testid="new-lead-submit">
            {busy ? "Saving..." : "Save lead"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function Leads() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [focusId, setFocusId] = useState(searchParams.get("focus") || null);
  const { subscribe } = useRealtime();

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    const res = await api.get(`/leads?${params.toString()}`);
    setItems(res.data.items || []);
    setTotal(res.data.total || 0);
  }, [q, status]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => subscribe((msg) => {
    if (["lead_created", "lead_updated", "lead_deleted"].includes(msg.event)) load();
  }), [subscribe, load]);

  const downloadCsv = async () => {
    try {
      const res = await api.get("/leads.csv", { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url; a.download = "leaseflow_leads.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("CSV download failed");
    }
  };

  const focusLead = (id) => {
    setFocusId(id);
    setSearchParams(id ? { focus: id } : {});
  };

  return (
    <div className="px-8 py-10 max-w-7xl mx-auto" data-testid="leads-page">
      <PageHeader
        eyebrow={`${total} captured`}
        title="Leads"
        subtitle="Every lead from manual entry, Vapi calls, and any other source."
        right={<>
          <button onClick={downloadCsv} className="btn-secondary" data-testid="export-csv-btn"><DownloadSimple size={14} weight="duotone" /> CSV</button>
          <button onClick={() => setShowModal(true)} className="btn-primary" data-testid="new-lead-btn"><Plus size={14} weight="bold" /> New lead</button>
        </>}
      />

      <div className="card p-3 mb-4 flex flex-wrap items-center gap-2" data-testid="leads-filters">
        <div className="flex-1 min-w-[200px] flex items-center gap-2 px-3 border border-[var(--border)] bg-[var(--bg)]">
          <MagnifyingGlass size={14} className="text-[var(--text-muted)]" />
          <input
            data-testid="leads-search"
            placeholder="Search by name, phone, location..."
            className="bg-transparent border-0 outline-none flex-1 py-2 text-[13px]"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <FunnelSimple size={14} className="text-[var(--text-muted)] ml-2" />
        <button onClick={() => setStatus("")} className={`btn-ghost text-[12px] ${status === "" ? "bg-[var(--surface-hover)] text-[var(--text)]" : ""}`} data-testid="filter-all">All</button>
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setStatus(s)} data-testid={`filter-${s}`}
                  className={`btn-ghost text-[12px] ${status === s ? "bg-[var(--surface-hover)] text-[var(--text)]" : ""}`}>{s}</button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="No leads match your filters"
          description="Try clearing the search or status filter, or capture your first call from the Setup Guide."
          image="https://images.unsplash.com/photo-1769063238167-d00e112147c0?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA4Mzl8MHwxfHNlYXJjaHwyfHxtb2Rlcm4lMjBhcGFydG1lbnQlMjBpbnRlcmlvciUyMGVtcHR5fGVufDB8fHx8MTc3ODA5MDE2Nnww&ixlib=rb-4.1.0&q=85"
          ctaLabel="Open Setup Guide"
          ctaTo="/setup-guide"
        />
      ) : (
        <div className="card overflow-hidden" data-testid="leads-table">
          <div className="grid grid-cols-12 px-4 py-2.5 bg-[var(--surface-muted)] text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium">
            <div className="col-span-3">Name</div>
            <div className="col-span-2">Phone / Email</div>
            <div className="col-span-2">Location</div>
            <div className="col-span-1">Budget</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-1">Quality</div>
            <div className="col-span-1 text-right">Captured</div>
          </div>
          <div className="divide-y">
            {items.map((l) => {
              const budget = l.budget || (l.budget_min && l.budget_max
                ? `$${Math.round(l.budget_min)}–${Math.round(l.budget_max)}`
                : (l.budget_min ? `$${Math.round(l.budget_min)}+` : ""));
              return (
              <button key={l.id} onClick={() => focusLead(l.id)} data-testid={`lead-row-${l.id}`}
                      className="w-full text-left grid grid-cols-12 px-4 py-3 hover:bg-[var(--surface-hover)] transition-colors items-center text-[13px]">
                <div className="col-span-3 flex items-center gap-3 min-w-0">
                  <div className="w-7 h-7 bg-[var(--brand-soft)] text-[var(--brand)] flex items-center justify-center text-[11px] font-medium uppercase">
                    {(l.full_name || "?").slice(0, 1)}
                  </div>
                  <span className="truncate font-medium">{l.full_name}</span>
                </div>
                <div className="col-span-2 min-w-0">
                  <div className="font-mono text-[12px] text-[var(--text-muted)] truncate">{l.phone || "—"}</div>
                  {l.email && <div className="text-[11px] text-[var(--text-faint)] truncate">{l.email}</div>}
                </div>
                <div className="col-span-2 text-[var(--text-muted)] truncate">{l.location || l.location_pref || "—"}</div>
                <div className="col-span-1 truncate">{budget || "—"}</div>
                <div className="col-span-2"><StatusBadge status={l.status} /></div>
                <div className="col-span-1"><QualityBadge quality={l.quality} score={l.quality_score} /></div>
                <div className="col-span-1 text-right text-[11px] text-[var(--text-faint)] tabular-nums">
                  {new Date(l.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </div>
              </button>
            );})}
          </div>
        </div>
      )}

      <NewLeadModal open={showModal} onClose={() => setShowModal(false)} onCreated={load} />
      <LeadDetail leadId={focusId} onClose={() => focusLead(null)} onChange={load} />
    </div>
  );
}
