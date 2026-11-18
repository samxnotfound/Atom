import { useEffect, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { format } from "date-fns";
import { ChartColumn, Check, ChevronLeft, ChevronRight, Download, Filter } from "lucide-react";
import { getSetting } from "../../data/settingsRepo";
import { logicalDateRange } from "../../domain/timeMath";
import { shiftRangeAnchor, type RangeKey } from "../../domain/analytics";
import { Segmented } from "../../ui/Segmented";
import { EmptyState } from "../../ui/EmptyState";
import { useNav } from "../../app/nav";
import { useReports, type ChartType } from "./reportsStore";
import { UNCAT_FILTER_ID, useReportData } from "./useReportData";
import { exportReportPdf } from "../../data/exportImport";
import { formatDuration } from "../../domain/durationParser";
import { KpiRow, KpiRowSkeleton } from "./KpiRow";
import { FocusTimeCard } from "./FocusTimeCard";
import { CategorySummaryCard } from "./CategorySummaryCard";
import { Heatmap } from "./Heatmap";

const RANGE_OPTIONS: ReadonlyArray<{ value: RangeKey; label: string }> = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "all", label: "All Time" },
  { value: "custom", label: "Custom" },
];

const CHART_OPTIONS: ReadonlyArray<{ value: ChartType; label: string }> = [
  { value: "bar", label: "Bar" },
  { value: "pie", label: "Pie" },
];

export function ReportsPage() {
  const {
    range, anchorMs, customStart, customEnd, categoryIds, chartType,
    setRange, setAnchor, setCustom, toggleCategory, clearCategories, hydrateChartType,
  } = useReports();
  const { loading, hasAnySessions, settings, bounds, report, heatmap, streakDays, longestStreak, frozenKeys, categories, allCategories } =
    useReportData();

  // Persisted chart type (§5.5).
  useEffect(() => {
    void getSetting<ChartType>("reports.chartType", "bar").then(hydrateChartType);
  }, [hydrateChartType]);

  if (!hasAnySessions && !loading) {
    return (
      <EmptyState
        icon={ChartColumn}
        title="No data to report yet"
        body="Charts unlock after your first sessions."
        action={{ label: "Start focusing", onClick: () => useNav.getState().setActive("focus") }}
      />
    );
  }

  const canStep = bounds.prevStart !== null;
  const isCustom = range === "custom";

  return (
    <div className="flex w-full flex-col gap-4 pb-2">
      {/* Filter bar (sticky glass, §5.5) */}
      <div className="glass-strong sticky top-2 z-20 flex items-center gap-2 rounded-[20px] px-3 py-2">
        <Segmented options={RANGE_OPTIONS} value={range} onChange={setRange} ariaLabel="Report range" />

        {isCustom ? (
          <CustomRangeInputs
            start={customStart}
            end={customEnd}
            dayStartMinutes={settings.dayStartMinutes}
            onChange={setCustom}
          />
        ) : (
          <div className="glass flex items-center gap-0.5 rounded-full py-1 pl-1 pr-2">
            <button
              onClick={() => {
                const a = shiftRangeAnchor(bounds, -1);
                if (a !== null) setAnchor(a);
              }}
              disabled={!canStep}
              aria-label="Previous period"
              className="circle grid size-7 place-items-center text-[var(--text-muted)] transition-colors enabled:hover:bg-white/70 enabled:hover:text-[var(--text)] disabled:opacity-30"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="tnum min-w-[110px] px-1 text-center text-[12px] font-medium">
              {bounds.label}
            </span>
            <button
              onClick={() => {
                const a = shiftRangeAnchor(bounds, 1);
                if (a !== null) setAnchor(a);
              }}
              disabled={!canStep}
              aria-label="Next period"
              className="circle grid size-7 place-items-center text-[var(--text-muted)] transition-colors enabled:hover:bg-white/70 enabled:hover:text-[var(--text)] disabled:opacity-30"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        )}

        {!isCustom && range !== "all" && anchorMs !== null && (
          <button
            onClick={() => setAnchor(null)}
            className="rounded-full bg-white/50 px-2.5 py-1 text-[11px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
          >
            Today
          </button>
        )}

        <CategoryFilterButton
          categories={categories}
          selected={categoryIds}
          onToggle={toggleCategory}
          onClear={clearCategories}
        />

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() =>
              void exportReportPdf({
                rangeLabel: bounds.label,
                kpis: [
                  { label: "Total focus", value: formatDuration(report.kpis.totalMs) },
                  { label: "Sessions", value: String(report.kpis.count) },
                  { label: "Avg / day", value: formatDuration(report.kpis.avgPerDayMs) },
                  { label: "Avg session", value: formatDuration(report.kpis.avgSessionMs) },
                  { label: "Longest", value: formatDuration(report.kpis.longestMs) },
                  {
                    label: "Completion",
                    value: `${Math.round(report.kpis.completionRate * 100)}%`,
                  },
                  { label: "Best streak", value: `${longestStreak}d` },
                ],
                buckets: report.buckets.map((b) => ({ label: b.label, ms: b.totalMs })),
                categories: report.categories.map((c) => ({
                  name: c.name,
                  color: c.color,
                  ms: c.totalMs,
                  count: c.count,
                })),
              })
            }
            aria-label="Download PDF report"
            title="Download PDF report"
            className="glass grid size-8 place-items-center rounded-full text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
          >
            <Download size={15} />
          </button>
          <Segmented
            options={CHART_OPTIONS}
            value={chartType}
            onChange={(t) => useReports.getState().setChartType(t)}
            ariaLabel="Chart type"
          />
        </div>
      </div>

      {loading ? (
        <>
          <KpiRowSkeleton />
          <div className="glass h-[360px] animate-pulse rounded-[24px]" aria-hidden />
        </>
      ) : (
        <>
          <KpiRow
            kpis={report.kpis}
            deltas={report.deltas}
            streakDays={streakDays}
            longestStreak={longestStreak}
          />

          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-8">
              <FocusTimeCard
                kpis={report.kpis}
                buckets={report.buckets}
                goalMs={settings.goalMs}
                categoryStats={report.categories}
                categories={allCategories}
              />
            </div>
            <div className="col-span-4">
              <CategorySummaryCard categoryStats={report.categories} totalMs={report.kpis.totalMs} />
            </div>
          </div>

          <div className="glass rounded-[24px] p-5">
            <p className="text-[13px] font-semibold tracking-tight text-[var(--text-muted)]">Activity</p>
            <div className="mt-3">
              <Heatmap columns={heatmap} weekStartsOn={settings.weekStartsOn} frozenKeys={frozenKeys} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Inline date inputs for the custom range (logical-day aligned). */
function CustomRangeInputs({
  start,
  end,
  dayStartMinutes,
  onChange,
}: {
  start: number | null;
  end: number | null;
  dayStartMinutes: number;
  onChange: (start: number, end: number) => void;
}) {
  // end is exclusive and aligned to the day-start offset; step back over the
  // offset as well as 1 ms so the input shows the last included local date.
  const fromValue = start !== null ? format(new Date(start), "yyyy-MM-dd") : "";
  const toValue =
    end !== null ? format(new Date(end - dayStartMinutes * 60_000 - 1), "yyyy-MM-dd") : "";

  const apply = (fromStr: string, toStr: string) => {
    if (!fromStr || !toStr) return;
    const fromDate = new Date(`${fromStr}T00:00:00`);
    const toDate = new Date(`${toStr}T00:00:00`);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) return;
    const { start, end } = logicalDateRange(fromDate, toDate, dayStartMinutes);
    onChange(start, end);
  };

  return (
    <div className="flex items-center gap-1.5 text-[12px]">
      <input
        type="date"
        value={fromValue}
        onChange={(e) => apply(e.target.value, toValue)}
        aria-label="Custom range start"
        className="glass rounded-[12px] px-2 py-1.5"
      />
      <span className="text-[var(--text-faint)]">→</span>
      <input
        type="date"
        value={toValue}
        onChange={(e) => apply(fromValue, e.target.value)}
        aria-label="Custom range end"
        className="glass rounded-[12px] px-2 py-1.5"
      />
    </div>
  );
}

/** Round glass filter button with a category multi-select popover. */
function CategoryFilterButton({
  categories,
  selected,
  onToggle,
  onClear,
}: {
  categories: Array<{ id: string; name: string; color: string }>;
  selected: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label="Filter by category"
        className="circle relative grid size-9 place-items-center bg-white/50 text-[var(--text-muted)] shadow-sm transition-transform hover:scale-105 hover:text-[var(--text)]"
        style={{ border: "1px solid var(--surface-border)" }}
      >
        <Filter size={15} />
        {selected.length > 0 && (
          <span className="circle absolute -right-0.5 -top-0.5 grid size-4 place-items-center bg-[var(--primary-500)] text-[9px] font-bold text-white">
            {selected.length}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} className="glass z-50 w-60 rounded-[16px] p-1.5">
          {categories.length === 0 && (
            <p className="px-3 py-2 text-[12px] text-[var(--text-muted)]">No categories yet.</p>
          )}
          {categories.map((c) => {
            const active = selected.includes(c.id);
            return (
              <button
                key={c.id}
                onClick={() => onToggle(c.id)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] transition-colors ${
                  active ? "bg-white/80 font-medium" : "hover:bg-white/60"
                }`}
              >
                <span className="circle size-2.5" style={{ background: c.color }} />
                <span className="flex-1">{c.name}</span>
                {active && <Check size={14} className="text-[var(--primary-500)]" />}
              </button>
            );
          })}
          {/* Sentinel id: sessions with category_id NULL. Never collides with
              a real category id (see UNCAT_FILTER_ID). */}
          {(() => {
            const active = selected.includes(UNCAT_FILTER_ID);
            return (
              <button
                onClick={() => onToggle(UNCAT_FILTER_ID)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] transition-colors ${
                  active ? "bg-white/80 font-medium" : "hover:bg-white/60"
                }`}
              >
                <span className="circle size-2.5" style={{ background: "#64748B" }} />
                <span className="flex-1">Uncategorized</span>
                {active && <Check size={14} className="text-[var(--primary-500)]" />}
              </button>
            );
          })()}
          {selected.length > 0 && (
            <button
              onClick={() => {
                onClear();
                setOpen(false);
              }}
              className="mt-0.5 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[12px] text-[var(--text-muted)] transition-colors hover:bg-white/60"
            >
              Show all categories
            </button>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
