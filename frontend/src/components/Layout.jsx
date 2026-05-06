import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  House, ListChecks, Kanban, PhoneCall, PlugsConnected,
  ListMagnifyingGlass, GearSix, BookOpenText, SignOut, Phone,
} from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext";
import { useRealtime } from "@/context/RealtimeContext";
import { Toaster, toast } from "sonner";
import { useEffect } from "react";

const NAV = [
  { to: "/", label: "Dashboard", icon: House },
  { to: "/leads", label: "Leads", icon: ListChecks },
  { to: "/pipeline", label: "Pipeline", icon: Kanban },
  { to: "/live-calls", label: "Live Calls", icon: PhoneCall },
  { to: "/setup-guide", label: "Setup Guide", icon: BookOpenText },
  { to: "/vapi-setup", label: "Vapi Setup", icon: PlugsConnected },
  { to: "/webhook-logs", label: "Webhook Logs", icon: ListMagnifyingGlass },
  { to: "/settings", label: "Settings", icon: GearSix },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { connected, subscribe } = useRealtime();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.event === "lead_created") {
        const d = msg.data || {};
        toast.success(`New lead: ${d.full_name || "Unknown"}`, {
          description: [d.location, d.budget].filter(Boolean).join(" · ") || d.phone || "",
          duration: 6000,
          action: { label: "View", onClick: () => navigate(`/leads?focus=${d.id}`) },
        });
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.connect(g); g.connect(ctx.destination);
          o.frequency.value = 880; g.gain.value = 0.05;
          o.start(); o.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.1);
          g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
          o.stop(ctx.currentTime + 0.4);
        } catch {}
      }
    });
  }, [subscribe, navigate]);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen flex bg-[var(--bg)]" data-testid="app-shell">
      <Toaster position="top-right" richColors closeButton />
      <aside className="w-64 border-r border-[var(--border)] bg-[var(--surface)] flex flex-col" data-testid="sidebar">
        <div className="px-6 py-6 border-b border-[var(--border)]">
          <Link to="/" className="flex items-center gap-2.5" data-testid="brand-link">
            <div className="w-8 h-8 bg-[var(--brand)] flex items-center justify-center">
              <Phone weight="duotone" size={18} color="#fff" />
            </div>
            <div>
              <div className="font-display text-xl tracking-tight leading-none text-[var(--text)]">LeaseFlow</div>
              <div className="text-[10px] tracking-wider uppercase text-[var(--text-faint)] mt-0.5">form.rentals</div>
            </div>
          </Link>
        </div>

        <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5" data-testid="sidebar-nav">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                className={`flex items-center gap-3 px-3 py-2 text-[13px] font-medium transition-colors ${
                  active
                    ? "bg-[var(--brand-soft)] text-[var(--brand)]"
                    : "text-[var(--text)] hover:bg-[var(--surface-hover)]"
                }`}
              >
                <Icon weight={active ? "fill" : "duotone"} size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-4 py-3 border-t border-[var(--border)] flex items-center gap-2 justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2 h-2 rounded-full" style={{ background: connected ? "var(--success-text)" : "var(--text-faint)" }} />
            <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
              {connected ? "Live" : "Offline"}
            </span>
          </div>
        </div>

        <div className="px-4 py-4 border-t border-[var(--border)]">
          <div className="text-[12px] text-[var(--text)] truncate" data-testid="user-name">{user?.full_name}</div>
          <div className="text-[11px] text-[var(--text-muted)] truncate" data-testid="user-email">{user?.email}</div>
          <div className="flex items-center justify-between mt-2">
            <span className="lf-badge" style={{
              background: user?.role === "owner" ? "var(--success-bg)" : "var(--info-bg)",
              color: user?.role === "owner" ? "var(--success-text)" : "var(--info-text)",
              borderColor: user?.role === "owner" ? "var(--success-border)" : "var(--info-border)",
            }}>{user?.role}</span>
            <button onClick={handleLogout} data-testid="logout-button" className="btn-ghost text-[12px] px-2">
              <SignOut size={14} weight="duotone" /> Logout
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto" data-testid="main-content">
        {children}
      </main>
    </div>
  );
}
