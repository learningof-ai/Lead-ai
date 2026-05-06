import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useRealtime } from "@/context/RealtimeContext";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import { Phone, Clock } from "@phosphor-icons/react";

function fmtDuration(seconds) {
  if (seconds == null || isNaN(seconds)) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function LiveCard({ session }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (session.status === "ended") return;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [session.status]);

  const startedAt = session.connected_at || session.started_at || session.created_at;
  let duration = session.duration_seconds;
  if (duration == null && startedAt) {
    duration = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  }

  return (
    <div className="card p-4 card-hover" data-testid={`live-card-${session.id}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-[var(--brand-soft)] text-[var(--brand)] flex items-center justify-center">
            <Phone size={16} weight="duotone" />
          </div>
          <div>
            <div className="font-mono text-[13px] text-[var(--text)]">{session.caller_phone || "Unknown caller"}</div>
            <div className="text-[11px] text-[var(--text-muted)]">{session.agent_id}</div>
          </div>
        </div>
        <StatusBadge status={session.status} />
      </div>
      <div className="flex items-center gap-3 text-[12px] text-[var(--text-muted)]">
        <Clock size={13} weight="duotone" />
        <span className="tabular-nums">{fmtDuration(duration)}</span>
        {session.lead_id && <span className="lf-badge" style={{ background: "var(--brand-soft)", color: "var(--brand)", borderColor: "rgba(42,75,65,0.2)" }}>linked to lead</span>}
      </div>
      {session.end_reason && (
        <div className="text-[11px] text-[var(--text-faint)] mt-2">Ended: {session.end_reason}</div>
      )}
    </div>
  );
}

export default function LiveCalls() {
  const [sessions, setSessions] = useState([]);
  const { subscribe } = useRealtime();

  const load = useCallback(async () => {
    const res = await api.get("/call-sessions?limit=80");
    setSessions(res.data.items || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => subscribe((msg) => {
    if (msg.event === "call_session") load();
  }), [subscribe, load]);

  const active = sessions.filter((s) => ["ringing", "connected"].includes(s.status));
  const ended = sessions.filter((s) => !["ringing", "connected"].includes(s.status)).slice(0, 30);

  const ringing = active.filter((s) => s.status === "ringing").length;
  const connected = active.filter((s) => s.status === "connected").length;

  return (
    <div className="px-8 py-10 max-w-7xl mx-auto" data-testid="live-calls-page">
      <PageHeader
        eyebrow="Real time"
        title="Live calls"
        subtitle="Watch calls as they ring, connect, and complete. Updates push instantly via WebSocket."
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <div className="card p-4">
          <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Active</div>
          <div className="font-display text-3xl tracking-tight">{active.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Ringing</div>
          <div className="font-display text-3xl tracking-tight" style={{ color: "var(--warning-text)" }}>{ringing}</div>
        </div>
        <div className="card p-4">
          <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Connected</div>
          <div className="font-display text-3xl tracking-tight" style={{ color: "var(--success-text)" }}>{connected}</div>
        </div>
        <div className="card p-4">
          <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Total today</div>
          <div className="font-display text-3xl tracking-tight">{sessions.length}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <h2 className="font-display text-xl tracking-tight mb-3">Active sessions</h2>
          {active.length === 0 ? (
            <EmptyState
              title="Standing by"
              description="No live calls right now. When your Vapi agent picks up, you'll see them stream in here."
              image="https://images.unsplash.com/photo-1555960840-b1b7fcbec685?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1OTV8MHwxfHNlYXJjaHwxfHxjbGVhbiUyMGRlc2slMjBwaG9uZXxlbnwwfHx8fDE3NzgwOTAxNjZ8MA&ixlib=rb-4.1.0&q=85"
              ctaLabel="Make a test call from Setup Guide"
              ctaTo="/setup-guide"
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {active.map((s) => <LiveCard key={s.id} session={s} />)}
            </div>
          )}
        </div>

        <div>
          <h2 className="font-display text-xl tracking-tight mb-3">Recently ended</h2>
          <div className="card divide-y" data-testid="ended-calls-list">
            {ended.length === 0 ? (
              <div className="px-4 py-6 text-[13px] text-[var(--text-muted)] text-center">No ended calls yet.</div>
            ) : ended.map((s) => (
              <div key={s.id} className="px-4 py-3 flex items-center justify-between gap-3 text-[12px]" data-testid={`ended-${s.id}`}>
                <div className="min-w-0">
                  <div className="font-mono truncate">{s.caller_phone || "—"}</div>
                  <div className="text-[11px] text-[var(--text-faint)]">
                    {new Date(s.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
                <span className="tabular-nums text-[var(--text-muted)]">{fmtDuration(s.duration_seconds)}</span>
                <StatusBadge status={s.status} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
