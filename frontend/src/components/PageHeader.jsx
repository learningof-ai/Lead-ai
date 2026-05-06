import { Spinner } from "@phosphor-icons/react";

export default function PageHeader({ title, subtitle, eyebrow, right }) {
  return (
    <div className="flex items-end justify-between gap-6 mb-8" data-testid="page-header">
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)] mb-2">
            {eyebrow}
          </div>
        )}
        <h1 className="font-display text-4xl tracking-tight leading-none text-[var(--text)]">{title}</h1>
        {subtitle && (
          <p className="text-[var(--text-muted)] mt-2 text-[14px] max-w-2xl">{subtitle}</p>
        )}
      </div>
      {right && <div className="flex items-center gap-2 flex-shrink-0">{right}</div>}
    </div>
  );
}

export function FullPageLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
      <Spinner size={32} className="animate-spin text-[var(--brand)]" />
    </div>
  );
}
