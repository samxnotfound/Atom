import { useMemo, useState } from "react";
import { formatDuration } from "../../domain/durationParser";
import type { CategoryStat } from "../../domain/analytics";

const SIZE = 200;
const STROKE = 26;
const R = (SIZE - STROKE) / 2 - 2;
const C = 2 * Math.PI * R;
const GAP_PX = 2.5;
const MAX_SLICES = 7;
const OTHER_COLOR = "#94A3B8";

interface DonutChartProps {
  categories: CategoryStat[];
  totalMs: number;
}

/** Category share donut with slice gaps, hover highlight and legend. */
export function DonutChart({ categories, totalMs }: DonutChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  const slices = useMemo(() => {
    const top = categories.slice(0, MAX_SLICES);
    const restMs = categories.slice(MAX_SLICES).reduce((sum, c) => sum + c.totalMs, 0);
    const list = top.map((c) => ({ name: c.name, color: c.color, totalMs: c.totalMs, pct: c.pct }));
    if (restMs > 0 && totalMs > 0) {
      list.push({ name: "Other", color: OTHER_COLOR, totalMs: restMs, pct: (restMs / totalMs) * 100 });
    }
    return list;
  }, [categories, totalMs]);

  if (totalMs <= 0) {
    return (
      <div className="grid h-[200px] place-items-center text-[13px] text-[var(--text-muted)]">
        No focus in this period yet.
      </div>
    );
  }

  let cumulative = 0;
  const center = hovered !== null ? slices[hovered] : null;

  return (
    <div className="flex items-center gap-5">
      <div
        className="relative shrink-0"
        style={{ width: SIZE, height: SIZE }}
        role="img"
        aria-label={`Focus by category: ${slices
          .map((s) => `${s.name} ${Math.round(s.pct)}%`)
          .join(", ")}`}
      >
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90">
          {slices.map((s, i) => {
            const frac = s.totalMs / totalMs;
            const dash = Math.max(0, frac * C - GAP_PX);
            const offset = -(cumulative * C) - GAP_PX / 2;
            cumulative += frac;
            return (
              <circle
                key={s.name}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke={s.color}
                strokeWidth={hovered === i ? STROKE + 5 : STROKE}
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={offset}
                opacity={hovered === null || hovered === i ? 1 : 0.35}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                style={{ transition: "opacity 0.15s ease, stroke-width 0.15s ease", cursor: "pointer" }}
              />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          {center ? (
            <div>
              <p className="max-w-[110px] truncate text-[12px] font-semibold">{center.name}</p>
              <p className="tnum text-[18px] font-semibold tracking-tight">{formatDuration(center.totalMs)}</p>
              <p className="tnum text-[11px] text-[var(--text-muted)]">{Math.round(center.pct)}%</p>
            </div>
          ) : (
            <div>
              <p className="tnum text-[22px] font-semibold tracking-tight">{formatDuration(totalMs)}</p>
              <p className="text-[11px] text-[var(--text-muted)]">total focus</p>
            </div>
          )}
        </div>
      </div>

      {/* Legend — labels + % mean color is never the only signal */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {slices.map((s, i) => (
          <div
            key={s.name}
            tabIndex={0}
            className={`flex items-center gap-2 rounded-lg px-1.5 py-1 text-[12px] transition-colors ${
              hovered === i ? "bg-white/70" : ""
            }`}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(i)}
            onBlur={() => setHovered(null)}
          >
            <span className="circle size-2.5 shrink-0" style={{ background: s.color }} />
            <span className="min-w-0 flex-1 truncate">{s.name}</span>
            <span className="tnum shrink-0 text-[var(--text-muted)]">{formatDuration(s.totalMs)}</span>
            <span className="tnum w-10 shrink-0 text-right font-medium">{Math.round(s.pct)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
