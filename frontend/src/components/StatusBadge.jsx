const STATUS_STYLES = {
  // Lead statuses
  New: { bg: "var(--info-bg)", text: "var(--info-text)", border: "var(--info-border)" },
  Contacted: { bg: "var(--warning-bg)", text: "var(--warning-text)", border: "var(--warning-border)" },
  Qualified: { bg: "var(--brand-soft)", text: "var(--brand)", border: "rgba(42,75,65,0.3)" },
  Converted: { bg: "var(--success-bg)", text: "var(--success-text)", border: "var(--success-border)" },
  Lost: { bg: "var(--surface-muted)", text: "var(--text-muted)", border: "var(--border)" },
  // Call statuses
  ringing: { bg: "var(--warning-bg)", text: "var(--warning-text)", border: "var(--warning-border)", pulse: true },
  connected: { bg: "var(--success-bg)", text: "var(--success-text)", border: "var(--success-border)", pulse: true },
  ended: { bg: "var(--surface-muted)", text: "var(--text-muted)", border: "var(--border)" },
  failed: { bg: "var(--danger-bg)", text: "var(--danger-text)", border: "var(--danger-border)" },
  // Webhook log statuses
  inserted: { bg: "var(--success-bg)", text: "var(--success-text)", border: "var(--success-border)" },
  authorized: { bg: "var(--info-bg)", text: "var(--info-text)", border: "var(--info-border)" },
  unauthorized: { bg: "var(--danger-bg)", text: "var(--danger-text)", border: "var(--danger-border)" },
  invalid: { bg: "var(--warning-bg)", text: "var(--warning-text)", border: "var(--warning-border)" },
  failed_log: { bg: "var(--danger-bg)", text: "var(--danger-text)", border: "var(--danger-border)" },
};

export default function StatusBadge({ status, label }) {
  const key = status === "failed" ? "failed_log" : status;
  const s = STATUS_STYLES[status] || STATUS_STYLES[key] || {
    bg: "var(--surface-muted)", text: "var(--text-muted)", border: "var(--border)",
  };
  return (
    <span className="lf-badge" style={{ background: s.bg, color: s.text, borderColor: s.border }}>
      {s.pulse && <span className="lf-pulse-dot" />}
      {label || status}
    </span>
  );
}
