import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import QualityBadge from "@/components/QualityBadge";
import { X, Trash, FloppyDisk, Phone, EnvelopeSimple, SpeakerHigh, PaperPlaneTilt } from "@phosphor-icons/react";
import { toast } from "sonner";

const STATUSES = ["New", "Contacted", "Qualified", "Converted", "Lost"];
const QUALITIES = ["", "hot", "warm", "cold"];

export default function LeadDetail({ leadId, onClose, onChange }) {
  const [data, setData] = useState(null);
  const [edit, setEdit] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!leadId) { setData(null); setEdit({}); return; }
    let cancelled = false;
    api.get(`/leads/${leadId}`).then((res) => {
      if (cancelled) return;
      const l = res.data.lead;
      setData(res.data);
      setEdit({
        full_name: l.full_name || "",
        phone: l.phone || "",
        email: l.email || "",
        location: l.location || l.location_pref || "",
        budget_min: l.budget_min || "",
        budget_max: l.budget_max || "",
        move_in_date: l.move_in_date || l.urgency || "",
        bedrooms: l.bedrooms ?? "",
        pets: l.pets === true ? "true" : (l.pets === false ? "false" : ""),
        notes: l.notes || "",
        status: l.status || "New",
        quality: l.quality || "",
        quality_score: l.quality_score || "",
      });
    }).catch(() => toast.error("Lead not found"));
    return () => { cancelled = true; };
  }, [leadId]);

  if (!leadId) return null;

  const save = async () => {
    setBusy(true);
    try {
      const payload = { ...edit };
      payload.budget_min = payload.budget_min ? Number(payload.budget_min) : null;
      payload.budget_max = payload.budget_max ? Number(payload.budget_max) : null;
      payload.bedrooms = payload.bedrooms !== "" ? Number(payload.bedrooms) : null;
      payload.quality_score = payload.quality_score ? Number(payload.quality_score) : null;
      payload.pets = payload.pets === "true" ? true : (payload.pets === "false" ? false : null);
      if (payload.quality === "") payload.quality = null;
      await api.patch(`/leads/${leadId}`, payload);
      toast.success("Lead updated");
      const res = await api.get(`/leads/${leadId}`);
      setData(res.data);
      onChange?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Update failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm("Delete this lead permanently?")) return;
    try {
      await api.delete(`/leads/${leadId}`);
      toast.success("Lead deleted");
      onChange?.(); onClose?.();
    } catch {
      toast.error("Delete failed");
    }
  };

  const resendEmails = async () => {
    try {
      const r = await api.post(`/email/resend/${leadId}`);
      const summary = Object.entries(r.data || {}).map(([k, v]) => `${k}: ${v}`).join(" · ");
      toast.success("Resend triggered", { description: summary });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Resend failed");
    }
  };

  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.value });
  const lead = data?.lead;

  return (
    <div className="fixed inset-0 z-50 flex justify-end lf-fade-in" data-testid="lead-detail-sheet">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-[var(--surface)] border-l border-[var(--border)] h-full overflow-y-auto lf-slide-up">
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-[var(--surface)] border-b border-[var(--border)]">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Lead detail</div>
            <h3 className="font-display text-xl tracking-tight truncate">{lead?.full_name || "Loading..."}</h3>
          </div>
          <div className="flex items-center gap-2">
            {lead?.quality && <QualityBadge quality={lead.quality} score={lead.quality_score} size="lg" />}
            <button onClick={onClose} className="btn-ghost" data-testid="lead-detail-close"><X size={16} /></button>
          </div>
        </div>

        {data && (
          <div className="px-6 py-6 space-y-6">

            {lead.call_summary && (
              <div className="card p-4" style={{ background: "var(--brand-soft)", borderColor: "rgba(42,75,65,0.2)" }} data-testid="ai-summary">
                <div className="text-[10px] uppercase tracking-wider text-[var(--brand)] font-medium mb-1">AI call summary</div>
                <div className="text-[13px] leading-relaxed text-[var(--text)]">{lead.call_summary}</div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {lead.phone && (
                <a href={`tel:${lead.phone}`} className="btn-primary text-[12px]" data-testid="call-button">
                  <Phone size={14} weight="duotone" /> Call {lead.full_name?.split(" ")[0]}
                </a>
              )}
              {lead.email && (
                <a href={`mailto:${lead.email}`} className="btn-secondary text-[12px]" data-testid="email-button">
                  <EnvelopeSimple size={14} weight="duotone" /> Email
                </a>
              )}
              {lead.recording_url && (
                <a href={lead.recording_url} target="_blank" rel="noreferrer" className="btn-secondary text-[12px]" data-testid="recording-link">
                  <SpeakerHigh size={14} weight="duotone" /> Listen to call
                </a>
              )}
              <button onClick={resendEmails} className="btn-ghost text-[12px]" data-testid="resend-emails-btn">
                <PaperPlaneTilt size={14} weight="duotone" /> Resend emails
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Full name</label>
                <input className="input" value={edit.full_name} onChange={set("full_name")} data-testid="detail-name" />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Phone</label>
                <input className="input font-mono" value={edit.phone} onChange={set("phone")} />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Email</label>
                <input type="email" className="input" value={edit.email} onChange={set("email")} data-testid="detail-email" />
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Location</label>
                <input className="input" value={edit.location} onChange={set("location")} />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Budget min ($)</label>
                <input type="number" className="input" value={edit.budget_min} onChange={set("budget_min")} />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Budget max ($)</label>
                <input type="number" className="input" value={edit.budget_max} onChange={set("budget_max")} />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Move-in</label>
                <input className="input" value={edit.move_in_date} onChange={set("move_in_date")} placeholder="e.g. ASAP, March 1, next month" />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Bedrooms</label>
                <input type="number" min="0" className="input" value={edit.bedrooms} onChange={set("bedrooms")} />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Pets</label>
                <select className="input" value={edit.pets} onChange={set("pets")}>
                  <option value="">Unknown</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Status</label>
                <select className="input" value={edit.status} onChange={set("status")} data-testid="detail-status">
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Quality</label>
                <select className="input" value={edit.quality} onChange={set("quality")}>
                  {QUALITIES.map((q) => <option key={q} value={q}>{q || "—"}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Score (1-10)</label>
                <input type="number" min="1" max="10" step="1" className="input" value={edit.quality_score} onChange={set("quality_score")} />
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Notes</label>
                <textarea rows={4} className="input" value={edit.notes} onChange={set("notes")} />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border)]">
              <button onClick={remove} className="btn-ghost text-[var(--danger-text)]" data-testid="detail-delete">
                <Trash size={14} weight="duotone" /> Delete
              </button>
              <button onClick={save} disabled={busy} className="btn-primary" data-testid="detail-save">
                <FloppyDisk size={14} weight="duotone" /> {busy ? "Saving..." : "Save changes"}
              </button>
            </div>

            {lead.transcript && (
              <details className="card p-4">
                <summary className="cursor-pointer text-[12px] uppercase tracking-wider text-[var(--text-muted)] font-medium">
                  Full transcript
                </summary>
                <pre className="mt-3 text-[12px] whitespace-pre-wrap font-mono text-[var(--text)]">{lead.transcript}</pre>
              </details>
            )}

            <div>
              <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-2">Activity</div>
              <div className="space-y-2">
                {data.activity.length === 0 && <div className="text-[13px] text-[var(--text-faint)]">No activity yet.</div>}
                {data.activity.map((a) => (
                  <div key={a.id} className="text-[12px] flex items-start gap-3">
                    <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--brand)] flex-shrink-0" />
                    <div className="flex-1">
                      <div className="text-[var(--text)]">{a.message}</div>
                      <div className="text-[11px] text-[var(--text-faint)]">
                        {new Date(a.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {data.calls?.length > 0 && (
              <div>
                <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-2">Linked calls</div>
                <div className="space-y-2">
                  {data.calls.map((c) => (
                    <div key={c.id} className="card p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[12px]">
                        <Phone size={14} weight="duotone" />
                        <span className="font-mono">{c.caller_phone || "—"}</span>
                        {c.duration_seconds != null && <span className="text-[var(--text-muted)]">{c.duration_seconds}s</span>}
                      </div>
                      <StatusBadge status={c.status} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
