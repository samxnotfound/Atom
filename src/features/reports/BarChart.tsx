import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { formatDuration } from "../../domain/durationParser";
import type { Bucket, ReportCategoryRef } from "../../domain/analytics";

interface BarChartProps {
  buckets: Bucket[];
  goalMs: number;
  stacked: boolean;
  categories: ReportCategoryRef[];
}

/** Glossy blue bars over pale tracks, dashed gridlines, goal line, hover tooltip. */
export function BarChart({ buckets, goalMs, stacked, categories }: BarChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const catColor = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories) m.set(c.id, c.color);
    return m;
  }, [categories]);

  const max = Math.max(goalMs, ...buckets.map((b) => b.totalMs), 1);
  const goalPct = (goalMs / max) * 100;

  // Show every nth label when buckets are dense.
  const labelStep = buckets.length > 14 ? Math.ceil(buckets.length / 12) : 1;

  if (buckets.every((b) => b.totalMs === 0)) {
    return (
      <div className="grid h-[220px] place-items-center text-[13px] text-[var(--text-muted)]">
        No focus in this period yet.
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Plot area */}
      <div className="relative h-[220px]">
        {/* Dashed gridlines */}
        {[25, 50, 75].map((p) => (
          <div
            key={p}
            aria-hidden
            className="absolute inset-x-0 border-t border-dashed border-white/60"
            style={{ bottom: `${p}%` }}
          />
        ))}

        {/* Goal line */}
        {goalMs > 0 && (
          <div
            aria-hidden
            className="absolute inset-x-0 border-t-2 border-dashed"
            style={{ bottom: `${goalPct}%`, borderColor: "rgba(47,123,255,0.55)" }}
          >
            <span className="tnum absolute -top-4 right-0 text-[10px] font-medium text-[var(--primary-500)]">
              Goal {formatDuration(goalMs)}
            </span>
          </div>
        )}

        {/* Bars */}
        <div className="absolute inset-0 flex items-end gap-[6px]">
          {buckets.map((b, i) => {
            const pct = (b.totalMs / max) * 100;
            const segs = stacked
              ? Object.entries(b.byCategory).sort((a, z) => z[1] - a[1])
              : [];
            return (
              <div
                key={i}
                className="relative h-full flex-1"
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                tabIndex={0}
                role="img"
                aria-label={`${b.label}: ${formatDuration(b.totalMs)}`}
                onFocus={() => setHovered(i)}
                onBlur={() => setHovered(null)}
              >
                {/* Track */}
                <div className="absolute inset-x-0 bottom-0 top-0 rounded-[6px] bg-white/35" />
                {/* Bar */}
                <motion.div
                  className="absolute inset-x-0 bottom-0 overflow-hidden rounded-t-[6px]"
                  style={{
                    background:
                      stacked || b.totalMs === 0 ? undefined : "var(--primary-grad)",
                    boxShadow: b.totalMs > 0 && !stacked ? "var(--glow)" : undefined,
                  }}
                  initial={{ height: 0 }}
                  animate={{ height: `${pct}%` }}
                  transition={{ type: "spring", stiffness: 170, damping: 24 }}
                >
                  {stacked && (
                    <div className="flex h-full w-full flex-col-reverse">
                      {segs.map(([catId, ms]) => (
                        <div
                          key={catId}
                          style={{
                            height: `${b.totalMs > 0 ? (ms / b.totalMs) * 100 : 0}%`,
                            background: catColor.get(catId === "__uncat" ? "" : catId) ?? "#64748B",
                          }}
                        />
                      ))}
                    </div>
                  )}
                </motion.div>
              </div>
            );
          })}
        </div>

        {/* Tooltip */}
        {hovered !== null && buckets[hovered] && buckets[hovered].totalMs > 0 && (
          <div
            className="glass pointer-events-none absolute z-10 w-max max-w-[240px] rounded-[12px] px-3 py-2 text-left shadow-md"
            style={{
              left: `${((hovered + 0.5) / buckets.length) * 100}%`,
              bottom: `${Math.min((buckets[hovered].totalMs / max) * 100 + 4, 82)}%`,
              transform: "translateX(-50%)",
            }}
          >
            <p className="text-[11px] font-semibold">{buckets[hovered].label}</p>
            <p className="tnum text-[12px] font-semibold">{formatDuration(buckets[hovered].totalMs)}</p>
            <div className="mt-1 flex flex-col gap-0.5">
              {Object.entries(buckets[hovered].byCategory)
                .sort((a, z) => z[1] - a[1])
                .slice(0, 3)
                .map(([catId, ms]) => {
                  const name =
                    catId === "__uncat"
                      ? "Uncategorized"
                      : (categories.find((c) => c.id === catId)?.name ?? "Unknown");
                  const color = catColor.get(catId === "__uncat" ? "" : catId) ?? "#64748B";
                  return (
                    <div key={catId} className="flex items-center gap-1.5 text-[11px]">
                      <span className="circle size-2 shrink-0" style={{ background: color }} />
                      <span className="flex-1 truncate text-[var(--text-muted)]">{name}</span>
                      <span className="tnum">{formatDuration(ms)}</span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      {/* X labels */}
      <div className="mt-1.5 flex gap-[6px]">
        {buckets.map((b, i) => (
          <span
            key={i}
            className={`tnum flex-1 truncate text-center text-[9.5px] text-[var(--text-faint)] ${
              i % labelStep === 0 ? "" : "opacity-0"
            }`}
          >
            {b.label}
          </span>
        ))}
      </div>
    </div>
  );
}
