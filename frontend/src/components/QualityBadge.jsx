import { Flame, Thermometer, Snowflake, Question } from "@phosphor-icons/react";

const STYLES = {
  hot:  { bg: "#FAEEDA", text: "#633806", border: "#EF9F27", Icon: Flame, label: "Hot" },
  warm: { bg: "#E6F1FB", text: "#0C447C", border: "#378ADD", Icon: Thermometer, label: "Warm" },
  cold: { bg: "#F1EFE8", text: "#444441", border: "#B4B2A9", Icon: Snowflake, label: "Cold" },
};

export default function QualityBadge({ quality, score, size = "sm" }) {
  if (!quality || quality === "unknown") return null;
  const s = STYLES[quality];
  if (!s) return null;
  const Icon = s.Icon;
  const padding = size === "lg" ? "px-2.5 py-1 text-[12px]" : "px-2 py-0.5 text-[11px]";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium uppercase tracking-wider ${padding}`}
      style={{ background: s.bg, color: s.text, borderColor: s.border }}
      data-testid={`quality-${quality}`}
    >
      <Icon size={size === "lg" ? 13 : 11} weight="fill" />
      {s.label}{typeof score === "number" && score ? ` ${Math.round(score)}` : ""}
    </span>
  );
}
