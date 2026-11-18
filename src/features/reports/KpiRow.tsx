import { useEffect, useRef, useState } from "react";
import { animate } from "framer-motion";
import { TrendingDown, TrendingUp } from "lucide-react";
import { formatDuration } from "../../domain/durationParser";
import type { Deltas, Kpis } from "../../domain/analytics";

/** Animates a number up from its previous value. */
function useCountUp(value: number): number {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const controls = animate(prev.current, value, {
      duration: 0.55,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(v),
      onComplete: () => {
        prev.current = value;
      },
    });
    return () => controls.stop();
  }, [value]);
  return display;
}

interface KpiDef {
  label: string;
  value: number;
  format: (n: number) => string;
  delta: number | null;
}

function KpiCard({ def }: { def: KpiDef }) {
  const shown = useCountUp(def.value);
  return (
    <div className="glass rounded-[20px] px-3 py-3.5">
      <p className="truncate text-[10.5px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {def.label}
      </p>
      <p className="tnum mt-1.5 truncate text-[19px] font-semibold tracking-tight">
        {def.format(shown)}
      </p>
      <p className="tnum mt-1 flex h-[14px] items-center gap-1 text-[10.5px] font-medium">
        {def.delta !== null && Math.abs(def.delta) >= 0.5 && (
          <span
            className={`inline-flex items-center gap-0.5 ${
              def.delta >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"
            }`}
          >
            {def.delta >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {Math.abs(Math.round(def.delta))}%
          </span>
        )}
      </p>
    </div>
  );
}

export function KpiRow({
  kpis,
  deltas,
  streakDays,
  longestStreak,
}: {
  kpis: Kpis;
  deltas: Deltas;
  streakDays: number;
  longestStreak: number;
}) {
  const defs: KpiDef[] = [
    { label: "Total focus", value: kpis.totalMs, format: (n) => formatDuration(n), delta: deltas.totalMs },
    { label: "Sessions", value: kpis.count, format: (n) => `${Math.round(n)}`, delta: deltas.count },
    { label: "Avg / day", value: kpis.avgPerDayMs, format: (n) => formatDuration(n), delta: deltas.avgPerDayMs },
    { label: "Avg session", value: kpis.avgSessionMs, format: (n) => formatDuration(n), delta: deltas.avgSessionMs },
    { label: "Longest", value: kpis.longestMs, format: (n) => formatDuration(n), delta: deltas.longestMs },
    {
      label: "Completion",
      value: kpis.completionRate * 100,
      format: (n) => `${Math.round(n)}%`,
      delta: deltas.completionRate,
    },
    { label: "Streak", value: streakDays, format: (n) => `${Math.round(n)}d`, delta: null },
    { label: "Best streak", value: longestStreak, format: (n) => `${Math.round(n)}d`, delta: null },
  ];

  return (
    <div className="grid grid-cols-8 gap-2" role="list" aria-label="Key metrics">
      {defs.map((d) => (
        <KpiCard key={d.label} def={d} />
      ))}
    </div>
  );
}

export function KpiRowSkeleton() {
  return (
    <div className="grid grid-cols-8 gap-2" aria-hidden>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="glass h-[86px] animate-pulse rounded-[20px]" />
      ))}
    </div>
  );
}
