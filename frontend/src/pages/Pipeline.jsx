import { useEffect, useState, useCallback } from "react";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  closestCenter,
} from "@dnd-kit/core";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import { api } from "@/lib/api";
import { useRealtime } from "@/context/RealtimeContext";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { toast } from "sonner";

const COLUMNS = [
  { key: "New", title: "New", subtitle: "fresh from Vapi or manual entry" },
  { key: "Contacted", title: "Contacted", subtitle: "team has reached out" },
  { key: "Qualified", title: "Qualified", subtitle: "credit + budget verified" },
  { key: "Converted", title: "Converted", subtitle: "lease signed" },
  { key: "Lost", title: "Lost", subtitle: "didn't move forward" },
];

function LeadCard({ lead, isOverlay = false }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id });
  return (
    <div
      ref={isOverlay ? null : setNodeRef}
      {...(isOverlay ? {} : attributes)}
      {...(isOverlay ? {} : listeners)}
      data-testid={`kanban-card-${lead.id}`}
      className={`card p-3.5 cursor-grab active:cursor-grabbing transition-all ${isDragging ? "opacity-30" : ""} ${isOverlay ? "shadow-lg rotate-1" : "card-hover"}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="font-medium text-[13px] text-[var(--text)] truncate">{lead.full_name}</div>
      </div>
      <div className="text-[11px] text-[var(--text-muted)] space-y-0.5">
        {lead.phone && <div className="font-mono">{lead.phone}</div>}
        {lead.location && <div>{lead.location}</div>}
        {(lead.budget || lead.property_type) && (
          <div>{[lead.budget, lead.property_type].filter(Boolean).join(" · ")}</div>
        )}
      </div>
      <div className="flex items-center justify-between mt-3">
        <span className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider">
          {new Date(lead.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}
        </span>
        {lead.urgency && <span className="lf-badge" style={{ background: "var(--warning-bg)", color: "var(--warning-text)", borderColor: "var(--warning-border)" }}>{lead.urgency}</span>}
      </div>
    </div>
  );
}

function Column({ col, leads }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });
  return (
    <div className="kanban-column min-w-[300px] w-[300px] flex flex-col snap-start" data-testid={`kanban-column-${col.key}`}>
      <div className="flex items-baseline justify-between mb-3 px-1">
        <div>
          <div className="font-display text-lg tracking-tight text-[var(--text)]">{col.title}</div>
          <div className="text-[11px] text-[var(--text-muted)]">{col.subtitle}</div>
        </div>
        <span className="font-display text-xl tabular-nums text-[var(--text-muted)]" data-testid={`column-count-${col.key}`}>{leads.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 p-2 border border-dashed transition-colors ${isOver ? "bg-[var(--brand-soft)] border-[var(--brand)]" : "bg-[var(--surface-muted)]/40 border-[var(--border)]"}`}
        style={{ minHeight: 200 }}
      >
        <div className="space-y-2">
          {leads.map((l) => <LeadCard key={l.id} lead={l} />)}
          {leads.length === 0 && (
            <div className="text-[12px] text-[var(--text-faint)] text-center py-8">Drop a card here</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Pipeline() {
  const [leads, setLeads] = useState([]);
  const [activeLead, setActiveLead] = useState(null);
  const { subscribe } = useRealtime();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const load = useCallback(async () => {
    const res = await api.get("/leads?limit=500");
    setLeads(res.data.items || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => subscribe((msg) => {
    if (["lead_created", "lead_updated", "lead_deleted"].includes(msg.event)) load();
  }), [subscribe, load]);

  const onDragStart = (e) => {
    const lead = leads.find((l) => l.id === e.active.id);
    setActiveLead(lead || null);
  };

  const onDragEnd = async (e) => {
    setActiveLead(null);
    const { active, over } = e;
    if (!over) return;
    const lead = leads.find((l) => l.id === active.id);
    if (!lead || lead.status === over.id) return;
    const prevStatus = lead.status;
    setLeads((cur) => cur.map((l) => (l.id === lead.id ? { ...l, status: over.id } : l)));
    try {
      await api.patch(`/leads/${lead.id}`, { status: over.id });
      toast.success(`Moved to ${over.id}`);
    } catch (err) {
      setLeads((cur) => cur.map((l) => (l.id === lead.id ? { ...l, status: prevStatus } : l)));
      toast.error("Move failed");
    }
  };

  const grouped = COLUMNS.map((c) => ({
    col: c,
    leads: leads.filter((l) => l.status === c.key),
  }));

  return (
    <div className="px-8 py-10 max-w-[1600px] mx-auto" data-testid="pipeline-page">
      <PageHeader
        eyebrow={`${leads.length} leads in motion`}
        title="Pipeline"
        subtitle="Drag leads between columns as you progress them. Counts update live."
      />
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory">
          {grouped.map(({ col, leads }) => <Column key={col.key} col={col} leads={leads} />)}
        </div>
        <DragOverlay>
          {activeLead && <LeadCard lead={activeLead} isOverlay />}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
