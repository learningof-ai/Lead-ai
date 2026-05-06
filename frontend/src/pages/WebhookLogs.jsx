import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { ArrowsClockwise, FunnelSimple } from "@phosphor-icons/react";

const STATUSES = ["", "inserted", "unauthorized", "invalid", "failed"];

export default function WebhookLogs() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const PAGE = 50;

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("limit", PAGE);
    params.set("skip", page * PAGE);
    if (status) params.set("status", status);
    const res = await api.get(`/webhook-logs?${params.toString()}`);
    setItems(res.data.items || []);
    setTotal(res.data.total || 0);
  }, [status, page]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="px-8 py-10 max-w-7xl mx-auto" data-testid="webhook-logs-page">
      <PageHeader
        eyebrow={`${total} entries`}
        title="Webhook logs"
        subtitle="Every request to /api/public/vapi-webhook — auth outcomes, validation errors, insertions."
        right={<button onClick={load} className="btn-secondary" data-testid="logs-refresh"><ArrowsClockwise size={14} weight="duotone" /> Refresh</button>}
      />

      <div className="card p-2 mb-4 flex items-center gap-2 flex-wrap" data-testid="logs-filter">
        <FunnelSimple size={14} className="text-[var(--text-muted)] ml-2" />
        {STATUSES.map((s) => (
          <button key={s} onClick={() => { setPage(0); setStatus(s); }}
                  className={`btn-ghost text-[12px] ${status === s ? "bg-[var(--surface-hover)] text-[var(--text)]" : ""}`}
                  data-testid={`logs-filter-${s || 'all'}`}>
            {s || "All"}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden" data-testid="logs-table">
        <div className="grid grid-cols-12 px-4 py-2 bg-[var(--surface-muted)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
          <div className="col-span-2">Time</div>
          <div className="col-span-1">HTTP</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2">Stage</div>
          <div className="col-span-2">Agent</div>
          <div className="col-span-2">IP</div>
          <div className="col-span-1 text-right">Latency</div>
        </div>
        <div className="divide-y">
          {items.length === 0 && (
            <div className="px-4 py-10 text-center text-[var(--text-muted)] text-[13px]">No log entries match.</div>
          )}
          {items.map((l) => (
            <div key={l.id} className="grid grid-cols-12 px-4 py-2.5 items-center text-[12px]" data-testid={`log-row-${l.id}`}>
              <div className="col-span-2 font-mono text-[11px] text-[var(--text-muted)]">
                {new Date(l.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </div>
              <div className={`col-span-1 font-mono ${l.http_status >= 200 && l.http_status < 300 ? "text-[var(--success-text)]" : "text-[var(--danger-text)]"}`}>
                {l.http_status}
              </div>
              <div className="col-span-2"><StatusBadge status={l.status} /></div>
              <div className="col-span-2 text-[var(--text-muted)]">{l.stage}</div>
              <div className="col-span-2 font-mono text-[11px] truncate">{l.agent_id || "—"}</div>
              <div className="col-span-2 font-mono text-[11px] text-[var(--text-muted)] truncate">{l.ip || "—"}</div>
              <div className="col-span-1 text-right tabular-nums text-[var(--text-muted)]">{l.duration_ms}ms</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between mt-4 text-[12px] text-[var(--text-muted)]">
        <div>Page {page + 1} · showing {items.length} of {total}</div>
        <div className="flex gap-2">
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="btn-secondary" data-testid="logs-prev">Previous</button>
          <button onClick={() => setPage((p) => p + 1)} disabled={(page + 1) * PAGE >= total} className="btn-secondary" data-testid="logs-next">Next</button>
        </div>
      </div>
    </div>
  );
}
