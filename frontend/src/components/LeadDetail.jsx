import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import { X, Trash, FloppyDisk, Phone } from "@phosphor-icons/react";
import { toast } from "sonner";

const STATUSES = ["New", "Contacted", "Qualified", "Converted", "Lost"];

export default function LeadDetail({ leadId, onClose, onChange }) {
  const [data, setData] = useState(null);
  const [edit, setEdit] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!leadId) { setData(null); setEdit({}); return; }
    let cancelled = false;
    api.get(`/leads/${leadId}`).then((res) => {
      if (cancelled) return;
      setData(res.data);
      setEdit({
        full_name: res.data.lead.full_name || "",
        phone: res.data.lead.phone || "",
        location: res.data.lead.location || "",
        budget: res.data.lead.budget || "",
        property_type: res.data.lead.property_type || "",
        urgency: res.data.lead.urgency || "",
        notes: res.data.lead.notes || "",
        status: res.data.lead.status || "New",
      });
    }).catch(() => toast.error("Lead not found"));
    return () => { cancelled = true; };
  }, [leadId]);

  if (!leadId) return null;

  const save = async () => {
    setBusy(true);
    try {
      await api.patch(`/leads/${leadId}`, edit);
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
    } catch (e) {
      toast.error("Delete failed");
    }
  };

  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.value });

  return (
    <div className="fixed inset-0 z-50 flex justify-end lf-fade-in" data-testid="lead-detail-sheet">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-[var(--surface)] border-l border-[var(--border)] h-full overflow-y-auto lf-slide-up">
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-[var(--surface)] border-b border-[var(--border)]">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Lead detail</div>
            <h3 className="font-display text-xl tracking-tight">{data?.lead?.full_name || "Loading..."}</h3>
          </div>
          <button onClick={onClose} className="btn-ghost" data-testid="lead-detail-close"><X size={16} /></button>
        </div>

        {data && (
          <div className="px-6 py-6 space-y-6">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Full name</label>
                <input className="input" value={edit.full_name} onChange={set("full_name")} data-testid="detail-name" />
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Phone</label>
                <input className="input font-mono" value={edit.phone} onChange={set("phone")} />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Location</label>
                <input className="input" value={edit.location} onChange={set("location")} />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Budget</label>
                <input className="input" value={edit.budget} onChange={set("budget")} />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Property type</label>
                <input className="input" value={edit.property_type} onChange={set("property_type")} />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Urgency</label>
                <input className="input" value={edit.urgency} onChange={set("urgency")} />
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Status</label>
                <select className="input" value={edit.status} onChange={set("status")} data-testid="detail-status">
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
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
