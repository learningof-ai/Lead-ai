import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useRealtime } from "@/context/RealtimeContext";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import QualityBadge from "@/components/QualityBadge";
import EmptyState from "@/components/EmptyState";
import {
  Phone, TrendUp, Users, ChartBar, ArrowUpRight, BookOpenText,
} from "@phosphor-icons/react";

function StatCard({ label, value, hint, icon: Icon, accent }) {
  return (
    <div className="card p-6 card-hover" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-2">{label}</div>
          <div className="font-display text-4xl tracking-tight leading-none text-[var(--text)]">{value}</div>
          {hint && <div className="text-[12px] text-[var(--text-muted)] mt-2">{hint}</div>}
        </div>
        {Icon && (
          <div className="w-9 h-9 flex items-center justify-center" style={{ background: accent || "var(--brand-soft)", color: "var(--brand)" }}>
            <Icon weight="duotone" size={18} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const { subscribe } = useRealtime();

  const load = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([
        api.get("/stats"),
        api.get("/leads?limit=8"),
      ]);
      setStats(s.data);
      setRecent(l.data.items || []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => subscribe((msg) => {
    if (msg.event === "lead_created" || msg.event === "lead_updated" || msg.event === "lead_deleted") {
      load();
    }
  }), [subscribe, load]);

  const maxDaily = Math.max(1, ...(stats?.daily?.map((d) => d.count) || [1]));

  return (
    <div className="px-8 py-10 max-w-7xl mx-auto" data-testid="dashboard-page">
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        subtitle="Real-time view of leads captured by your Vapi agent and your team's pipeline progress."
        right={<>
          <Link to="/setup-guide" className="btn-secondary"><BookOpenText size={14} weight="duotone" /> Setup Guide</Link>
          <Link to="/leads" className="btn-primary">All leads <ArrowUpRight size={14} weight="bold" /></Link>
        </>}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Leads today" value={stats?.leads_today ?? "—"} hint={`${stats?.total_leads ?? 0} total`} icon={Users} />
        <StatCard label="Calls today" value={stats?.calls_today ?? "—"} hint={`${stats?.active_calls ?? 0} active now`} icon={Phone} />
        <StatCard label="Converted" value={stats?.converted ?? "—"} hint="lifetime" icon={TrendUp} />
        <StatCard label="Conversion rate" value={`${stats?.conversion_rate ?? 0}%`} hint="of total leads" icon={ChartBar} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card p-6" data-testid="weekly-chart">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Past 7 days</div>
              <div className="font-display text-xl tracking-tight">Lead volume</div>
            </div>
          </div>
          <div className="flex items-end gap-3 h-44">
            {(stats?.daily || []).map((d) => (
              <div key={d.day} className="flex-1 flex flex-col items-center gap-2" data-testid={`bar-${d.day}`}>
                <div className="w-full flex items-end justify-center" style={{ height: '100%' }}>
                  <div
                    className="w-full transition-all duration-500"
                    style={{
                      height: `${(d.count / maxDaily) * 100}%`,
                      minHeight: d.count > 0 ? "4px" : "1px",
                      background: d.count > 0 ? "var(--brand)" : "var(--border)",
                    }}
                  />
                </div>
                <div className="text-[11px] text-[var(--text-muted)]">{d.day}</div>
                <div className="text-[12px] font-medium text-[var(--text)]">{d.count}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-6" data-testid="status-breakdown">
          <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Pipeline</div>
          <div className="font-display text-xl tracking-tight mb-4">By status</div>
          <div className="space-y-3">
            {Object.entries(stats?.by_status || {}).map(([k, v]) => {
              const total = Object.values(stats?.by_status || {}).reduce((a, b) => a + b, 0) || 1;
              return (
                <div key={k}>
                  <div className="flex items-center justify-between mb-1">
                    <StatusBadge status={k} />
                    <span className="text-[12px] tabular-nums text-[var(--text)]">{v}</span>
                  </div>
                  <div className="h-1 bg-[var(--surface-muted)]">
                    <div className="h-1 bg-[var(--brand)]" style={{ width: `${(v / total) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-2xl tracking-tight">Recent leads</h2>
          <Link to="/leads" className="btn-ghost">View all <ArrowUpRight size={14} weight="bold" /></Link>
        </div>
        {recent.length === 0 ? (
          <EmptyState
            title="No leads yet"
            description="Once your Vapi agent captures a call, leads will land here in real time. Start with the Setup Guide to wire it up."
            image="https://images.unsplash.com/photo-1769063238167-d00e112147c0?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA4Mzl8MHwxfHNlYXJjaHwyfHxtb2Rlcm4lMjBhcGFydG1lbnQlMjBpbnRlcmlvciUyMGVtcHR5fGVufDB8fHx8MTc3ODA5MDE2Nnww&ixlib=rb-4.1.0&q=85"
            ctaLabel="Open Setup Guide"
            ctaTo="/setup-guide"
          />
        ) : (
          <div className="card divide-y" data-testid="recent-leads">
            {recent.map((l) => (
              <Link key={l.id} to={`/leads?focus=${l.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-[var(--surface-hover)] transition-colors" data-testid={`recent-lead-${l.id}`}>
                <div className="w-9 h-9 bg-[var(--brand-soft)] text-[var(--brand)] flex items-center justify-center font-display text-sm uppercase">
                  {(l.full_name || "?").slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium truncate">{l.full_name}</div>
                  <div className="text-[12px] text-[var(--text-muted)] truncate">
                    {[l.location, l.budget, l.property_type].filter(Boolean).join(" · ") || l.phone || "—"}
                  </div>
                </div>
                <StatusBadge status={l.status} />
                <QualityBadge quality={l.quality} score={l.quality_score} />
                <span className="text-[11px] text-[var(--text-faint)] tabular-nums w-20 text-right">
                  {new Date(l.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
