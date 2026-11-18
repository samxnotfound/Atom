import { Snowflake } from "lucide-react";
import { formatDuration } from "../../domain/durationParser";
import type { HeatmapColumn } from "../../domain/analytics";

const LEVEL_BG: Record<number, string> = {
  0: "rgba(255,255,255,0.45)",
  1: "#BFDCFF",
  2: "#8CC6FF",
  3: "#2F7BFF",
};

interface HeatmapProps {
  columns: HeatmapColumn[];
  weekStartsOn: 0 | 1;
  /** Logical-day keys covered by a streak freeze (§5.6). */
  frozenKeys?: ReadonlySet<string>;
}

/** GitHub-style yearly calendar in blues, with a ring marker on streak days. */
export function Heatmap({ columns, weekStartsOn, frozenKeys }: HeatmapProps) {
  const dowLabels = weekStartsOn === 0 ? ["S", "M", "T", "W", "T", "F", "S"] : ["M", "T", "W", "T", "F", "S", "S"];

  return (
    <div
      className="overflow-x-auto"
      role="img"
      aria-label="Yearly activity heatmap: one column per week, darker cells mean more focus time"
    >
      <div className="min-w-max">
        {/* Month labels */}
        <div className="flex gap-[3px] pb-1 pl-6">
          {columns.map((col, i) => (
            <div key={i} className="relative w-[12px]">
              {col.monthLabel && (
                <span className="absolute left-0 top-0 whitespace-nowrap text-[9px] font-medium text-[var(--text-faint)]">
                  {col.monthLabel}
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-[3px]">
          {/* Weekday labels */}
          <div className="flex w-[21px] shrink-0 flex-col gap-[3px] pr-1">
            {dowLabels.map((l, i) => (
              <span key={i} className="flex h-[11px] items-center text-[8.5px] text-[var(--text-faint)]">
                {i % 2 === 1 ? l : ""}
              </span>
            ))}
          </div>

          {/* Columns */}
          {columns.map((col, i) => (
            <div key={i} className="flex flex-col gap-[3px]">
              {col.cells.map((cell, d) => {
                if (cell === null) {
                  return <div key={d} className="size-[11px] rounded-[3px] bg-transparent" />;
                }
                const frozen = frozenKeys?.has(cell.key) ?? false;
                return (
                  <div
                    key={d}
                    className="grid size-[11px] place-items-center rounded-[3px]"
                    style={{
                      background: LEVEL_BG[cell.level],
                      boxShadow:
                        cell.streakDay && cell.level === 3
                          ? "inset 0 0 0 2px rgba(15,64,150,0.55)"
                          : undefined,
                    }}
                    title={`${cell.key} · ${cell.ms > 0 ? formatDuration(cell.ms) : "no focus"}${
                      cell.streakDay ? " · streak day" : ""
                    }${frozen ? " · streak freeze" : ""}`}
                  >
                    {frozen && (
                      <Snowflake
                        size={8}
                        strokeWidth={2.6}
                        className={cell.level >= 2 ? "text-white" : "text-[#1F62E0]"}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="mt-2.5 flex items-center gap-1.5 pl-6 text-[10px] text-[var(--text-muted)]">
          <span>Less</span>
          {[0, 1, 2, 3].map((l) => (
            <span key={l} className="size-[10px] rounded-[3px]" style={{ background: LEVEL_BG[l] }} />
          ))}
          <span>More</span>
          <span
            className="ml-2 size-[10px] rounded-[3px]"
            style={{ background: LEVEL_BG[3], boxShadow: "inset 0 0 0 2px rgba(15,64,150,0.55)" }}
          />
          <span>streak day (1h+)</span>
          <Snowflake size={10} className="ml-2 text-[var(--primary-600)]" />
          <span>streak freeze</span>
        </div>
      </div>
    </div>
  );
}
