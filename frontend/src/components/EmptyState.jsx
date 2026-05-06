import { Link } from "react-router-dom";
import { ArrowRight } from "@phosphor-icons/react";

export default function EmptyState({ title, description, image, ctaLabel, ctaTo, ctaOnClick }) {
  return (
    <div className="card p-12 flex flex-col items-center text-center" data-testid="empty-state">
      {image && (
        <div className="w-44 h-44 mb-6 overflow-hidden border border-[var(--border)]">
          <img src={image} alt="" className="w-full h-full object-cover" loading="lazy" />
        </div>
      )}
      <h3 className="font-display text-2xl tracking-tight text-[var(--text)] mb-2">{title}</h3>
      {description && (
        <p className="text-[var(--text-muted)] max-w-md mb-6 leading-relaxed">{description}</p>
      )}
      {ctaLabel && (ctaTo ? (
        <Link to={ctaTo} className="btn-primary" data-testid="empty-state-cta">
          {ctaLabel} <ArrowRight size={14} weight="bold" />
        </Link>
      ) : (
        <button onClick={ctaOnClick} className="btn-primary" data-testid="empty-state-cta">
          {ctaLabel} <ArrowRight size={14} weight="bold" />
        </button>
      ))}
    </div>
  );
}
