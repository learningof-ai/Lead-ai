import { useState } from "react";
import { Copy, Check } from "@phosphor-icons/react";

export default function CopyField({ value, label, mono = true, testId }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };
  return (
    <div className="space-y-1.5" data-testid={testId ? `${testId}-wrap` : undefined}>
      {label && (
        <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-medium">
          {label}
        </label>
      )}
      <div className="flex items-stretch border border-[var(--border)] bg-[var(--bg)]">
        <code
          className={`flex-1 px-3 py-2.5 text-[12px] overflow-x-auto whitespace-nowrap text-[var(--text)] ${mono ? "font-mono" : ""}`}
          data-testid={testId ? `${testId}-value` : undefined}
        >
          {value || <span className="text-[var(--text-faint)]">—</span>}
        </code>
        <button
          onClick={copy}
          data-testid={testId ? `${testId}-copy` : undefined}
          className="px-3 border-l border-[var(--border)] hover:bg-[var(--surface-hover)] transition-colors flex items-center gap-1.5 text-[12px]"
        >
          {copied ? (
            <><Check size={14} weight="bold" color="var(--success-text)" /> <span className="text-[var(--success-text)]">Copied</span></>
          ) : (
            <><Copy size={14} weight="duotone" /> Copy</>
          )}
        </button>
      </div>
    </div>
  );
}
