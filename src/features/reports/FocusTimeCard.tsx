import { Info, Layers } from "lucide-react";
import { formatDuration } from "../../domain/durationParser";
import type { Bucket, CategoryStat, Kpis, ReportCategoryRef } from "../../domain/analytics";
import { BarChart } from "./BarChart";
import { DonutChart } from "./DonutChart";
import { useReports } from "./reportsStore";

interface FocusTimeCardProps {
  kpis: Kpis;
  buckets: Bucket[];
  goalMs: number;
  categoryStats: CategoryStat[];
  categories: ReportCategoryRef[];
}

/** Main "Focus Time" card: stat block row + bar/donut chart (§5.5). */
export function FocusTimeCard({ kpis, buckets, goalMs, categoryStats, categories }: FocusTimeCardProps) {
  const { chartType, stacked, setStacked } = useReports();

  const stats: Array<{ label: string; value: string }> = [
    { label: "Total Time", value: formatDuration(kpis.totalMs) },
    { label: "Sessions", value: `${kpis.count}` },
    { label: "Avg per Day", value: formatDuration(kpis.avgPerDayMs) },
  ];

  const hasCategories = categoryStats.length > 1;

  return (
    <div className="glass rounded-[24px] p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <p className="text-[13px] font-semibold tracking-tight text-[var(--text-muted)]">Focus Time</p>
          <span title="Focus time tracked in the selected period, bucketed to fit the range.">
            <Info size={13} className="text-[var(--text-faint)]" />
          </span>
        </div>
        {chartType === "bar" && hasCategories && (
          <button
            onClick={() => setStacked(!stacked)}
            aria-pressed={stacked}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
              stacked
                ? "bg-white text-[var(--text)] shadow-sm"
                : "bg-white/40 text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            <Layers size={12} />
            Stacked
          </button>
        )}
      </div>

      {/* Stat block row */}
      <div className="mt-3 flex items-center gap-6">
        {stats.map((s) => (
          <div key={s.label}>
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
              {s.label}
            </p>
            <p className="tnum text-[20px] font-semibold tracking-tight">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4">
        {chartType === "bar" ? (
          <BarChart buckets={buckets} goalMs={goalMs} stacked={stacked} categories={categories} />
        ) : (
          <DonutChart categories={categoryStats} totalMs={kpis.totalMs} />
        )}
      </div>
    </div>
  );
}
