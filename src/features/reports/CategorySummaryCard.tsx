import { formatDuration } from "../../domain/durationParser";
import type { CategoryStat } from "../../domain/analytics";

interface CategorySummaryCardProps {
  categoryStats: CategoryStat[];
  totalMs: number;
}

/** "Category Summary": stat row, segmented stacked bar, ranked list (§5.5). */
export function CategorySummaryCard({ categoryStats, totalMs }: CategorySummaryCardProps) {
  const total = formatDuration(totalMs);
  const top = categoryStats[0];

  return (
    <div className="glass rounded-[24px] p-5">
      <p className="text-[13px] font-semibold tracking-tight text-[var(--text-muted)]">Category Summary</p>

      <div className="mt-3 flex items-center gap-6">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">Total Time</p>
          <p className="tnum text-[20px] font-semibold tracking-tight">{total}</p>
        </div>
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">Categories</p>
          <p className="tnum text-[20px] font-semibold tracking-tight">{categoryStats.length}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">Top Category</p>
          <p className="truncate text-[20px] font-semibold tracking-tight">{top?.name ?? "—"}</p>
        </div>
      </div>

      {categoryStats.length > 0 && (
        <>
          {/* Segmented stacked bar */}
          <div
            className="mt-4 flex h-[14px] w-full gap-[2px] overflow-hidden rounded-full"
            role="img"
            aria-label="Focus time share by category"
          >
            {categoryStats.map((c) => (
              <div
                key={c.categoryId ?? "__uncat"}
                style={{ width: `${c.pct}%`, background: c.color }}
                title={`${c.name} · ${formatDuration(c.totalMs)} (${Math.round(c.pct)}%)`}
              />
            ))}
          </div>

          {/* Legend dots */}
          <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
            {categoryStats.slice(0, 6).map((c) => (
              <span key={c.categoryId ?? "__uncat"} className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                <span className="circle size-2" style={{ background: c.color }} />
                {c.name}
              </span>
            ))}
          </div>

          {/* Ranked list */}
          <div className="mt-3 flex flex-col divide-y divide-white/50">
            {categoryStats.map((c) => (
              <div key={c.categoryId ?? "__uncat"} className="flex items-center gap-2.5 py-2 text-[12.5px]">
                <span className="circle size-2.5 shrink-0" style={{ background: c.color }} />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="tnum shrink-0 text-[var(--text-muted)]">{c.count} {c.count === 1 ? "session" : "sessions"}</span>
                <span className="tnum w-14 shrink-0 text-right font-medium">{formatDuration(c.totalMs)}</span>
                <span className="tnum w-10 shrink-0 text-right text-[var(--text-muted)]">{Math.round(c.pct)}%</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
