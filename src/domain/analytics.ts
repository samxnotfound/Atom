import {
  addDays,
  addMonths,
  addYears,
  differenceInCalendarDays,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";
import { localDayBounds } from "./timeMath";
import type { SessionSlice } from "../data/types";

/**
 * Reports aggregation (SPEC §5.5). Pure functions only — UI charts consume
 * this output and never aggregate themselves.
 */

export type RangeKey = "day" | "week" | "month" | "year" | "all" | "custom";
export type BucketUnit = "hour" | "day" | "month" | "year";

export interface ReportCategoryRef {
  id: string;
  name: string;
  color: string;
}

export interface RangeBounds {
  start: number;
  end: number;
  prevStart: number | null;
  prevEnd: number | null;
  label: string;
  unit: BucketUnit;
}

export interface RangeOptions {
  dayStartMinutes: number;
  weekStartsOn: 0 | 1;
  customStart?: number | null;
  customEnd?: number | null;
}

export interface Bucket {
  label: string;
  totalMs: number;
  byCategory: Record<string, number>;
}

export interface Kpis {
  totalMs: number;
  count: number;
  avgPerDayMs: number;
  avgSessionMs: number;
  longestMs: number;
  completionRate: number;
}

export interface Deltas {
  totalMs: number | null;
  count: number | null;
  avgPerDayMs: number | null;
  avgSessionMs: number | null;
  longestMs: number | null;
  completionRate: number | null;
}

export interface CategoryStat {
  categoryId: string | null;
  name: string;
  color: string;
  totalMs: number;
  count: number;
  pct: number;
}

export interface ReportResult {
  bounds: RangeBounds;
  buckets: Bucket[];
  kpis: Kpis;
  prevKpis: Kpis | null;
  deltas: Deltas;
  categories: CategoryStat[];
}

const UNCAT_NAME = "Uncategorized";
const UNCAT_COLOR = "#64748B";
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/* ---------------------------------- bounds --------------------------------- */

/**
 * Bounds for a report range anchored at `now` (or an explicit anchor).
 * Starts are logical-day starts honoring dayStart; all arithmetic is
 * calendar-based (DST-safe).
 */
export function rangeBounds(range: RangeKey, now: number, opts: RangeOptions): RangeBounds {
  const dsm = opts.dayStartMinutes;
  const offset = dsm * 60_000;
  const { start, end } = localDayBounds(now, dsm);

  switch (range) {
    case "day":
      return {
        start,
        end,
        prevStart: addDays(new Date(start), -1).getTime(),
        prevEnd: start,
        label: format(new Date(start), "EEE, MMM d, yyyy"),
        unit: "hour",
      };
    case "week": {
      const ws = startOfWeek(new Date(start), { weekStartsOn: opts.weekStartsOn }).getTime() + offset;
      const we = addDays(new Date(ws), 7).getTime();
      return {
        start: ws,
        end: we,
        prevStart: addDays(new Date(ws), -7).getTime(),
        prevEnd: ws,
        label: `${format(new Date(ws), "MMM d")} – ${format(new Date(we - 1), "MMM d, yyyy")}`,
        unit: "day",
      };
    }
    case "month": {
      const ms = startOfMonth(new Date(start - offset)).getTime() + offset;
      const me = addMonths(new Date(ms), 1).getTime();
      return {
        start: ms,
        end: me,
        prevStart: addMonths(new Date(ms), -1).getTime(),
        prevEnd: ms,
        label: format(new Date(ms), "MMMM yyyy"),
        unit: "day",
      };
    }
    case "year": {
      const ys = startOfYear(new Date(start - offset)).getTime() + offset;
      const ye = addYears(new Date(ys), 1).getTime();
      return {
        start: ys,
        end: ye,
        prevStart: addYears(new Date(ys), -1).getTime(),
        prevEnd: ys,
        label: format(new Date(ys), "yyyy"),
        unit: "month",
      };
    }
    case "all": {
      const spanDays = Math.max(1, differenceInCalendarDays(new Date(now), new Date(0)));
      return {
        start: 0,
        end: now,
        prevStart: null,
        prevEnd: null,
        label: "All time",
        unit: spanDays > 1095 ? "year" : "month",
      };
    }
    case "custom": {
      let cs = opts.customStart ?? addDays(new Date(start), -6).getTime();
      let ce = opts.customEnd ?? end;
      // A reversed pick (start after end) is still a valid request; normalize
      // it rather than producing an empty, nonsensical report.
      if (ce < cs) [cs, ce] = [ce, cs];
      const span = Math.max(HOUR_MS, ce - cs);
      const spanDays = Math.max(1, Math.round(span / DAY_MS));
      // The range end is exclusive at a logical-day boundary, so the last
      // included date is one day-start offset before it (not merely -1 ms).
      const lastDayEnd = ce - offset - 1;
      const sameDay =
        differenceInCalendarDays(new Date(lastDayEnd), new Date(cs - offset)) === 0;
      return {
        start: cs,
        end: ce,
        prevStart: cs - span,
        prevEnd: cs,
        label: sameDay
          ? format(new Date(cs), "MMM d, yyyy")
          : `${format(new Date(cs), "MMM d")} – ${format(new Date(lastDayEnd), "MMM d, yyyy")}`,
        unit: spanDays <= 7 ? "day" : spanDays <= 366 ? "month" : "year",
      };
    }
  }
}

/** Anchor for stepping one period forward/backward. */
export function shiftRangeAnchor(bounds: RangeBounds, dir: -1 | 1): number | null {
  return dir === 1 ? bounds.end : bounds.prevStart;
}

/* --------------------------------- helpers --------------------------------- */

/**
 * The window that actually holds focus: it starts when the session starts and
 * runs for actual_ms. Pause time is not persisted per segment, so spreading
 * actual_ms across the whole wall span would move focus into later days just
 * because the app sat paused. Every aggregate uses this window so totals sum
 * back to actual_ms and never leak into unrelated days.
 */
function focusWindow(
  s: Pick<SessionSlice, "started_at" | "ended_at" | "actual_ms">,
): { start: number; end: number } {
  const start = s.started_at;
  return {
    start,
    end: Math.max(start, Math.min(s.ended_at, start + Math.max(0, s.actual_ms))),
  };
}

/**
 * Focus stats for the window [start, end): every session with focus in the
 * window counts (a session started yesterday that ends inside today is part
 * of today). Used by the Today card and any range summary that reads raw rows.
 */
export function summarizeRange(
  sessions: Pick<SessionSlice, "started_at" | "ended_at" | "actual_ms">[],
  start: number,
  end: number,
): { totalMs: number; count: number } {
  let totalMs = 0;
  let count = 0;
  for (const s of sessions) {
    const focus = focusWindow(s);
    if (focus.start < end && focus.end > start) {
      count++;
      totalMs += Math.min(end, focus.end) - Math.max(start, focus.start);
    }
  }
  return { totalMs, count };
}

/** Key ("yyyy-MM-dd") of the logical day containing ts. */
export function logicalDayKey(ts: number, dayStartMinutes: number): string {
  return format(new Date(ts - dayStartMinutes * 60_000), "yyyy-MM-dd");
}

/** Splits [s, e) into consecutive logical-day segments (DST-safe). */
export function splitByLogicalDay(
  s: number,
  e: number,
  dayStartMinutes: number,
): Array<{ start: number; end: number }> {
  const segments: Array<{ start: number; end: number }> = [];
  let cur = s;
  while (cur < e) {
    const b = localDayBounds(cur, dayStartMinutes);
    const segEnd = Math.min(b.end, e);
    if (segEnd > cur) segments.push({ start: cur, end: segEnd });
    cur = b.end;
  }
  return segments;
}

function cellStartOf(cur: number, unit: BucketUnit, dsm: number): number {
  const offset = dsm * 60_000;
  switch (unit) {
    case "hour": {
      const d = new Date(cur);
      d.setMinutes(0, 0, 0);
      return d.getTime();
    }
    case "day":
      return localDayBounds(cur, dsm).start;
    case "month":
      return startOfMonth(new Date(cur - offset)).getTime() + offset;
    case "year":
      return startOfYear(new Date(cur - offset)).getTime() + offset;
  }
}

function cellEndOf(cellStart: number, unit: BucketUnit, dsm: number): number {
  switch (unit) {
    case "hour":
      return cellStart + HOUR_MS;
    case "day":
      return localDayBounds(cellStart, dsm).end;
    case "month":
      return addMonths(new Date(cellStart), 1).getTime();
    case "year":
      return addYears(new Date(cellStart), 1).getTime();
  }
}

/**
 * Walks [s, e) bucket-cell by bucket-cell, calling visit with the
 * *containing* cell's start and the milliseconds falling inside it.
 */
function walkCells(
  s: number,
  e: number,
  unit: BucketUnit,
  dsm: number,
  visit: (cellStart: number, ms: number) => void,
): void {
  let cur = s;
  while (cur < e) {
    const cellStart = cellStartOf(cur, unit, dsm);
    const segEnd = Math.min(cellEndOf(cellStart, unit, dsm), e);
    visit(cellStart, segEnd - Math.max(cellStart, cur));
    cur = segEnd;
  }
}

/** Empty bucket list for a bounds + unit, with a cellStart → index map. */
function buildBuckets(
  bounds: RangeBounds,
  dsm: number,
): { buckets: Bucket[]; indexByStart: Map<number, number> } {
  const buckets: Bucket[] = [];
  const indexByStart = new Map<number, number>();
  const spanDays = Math.max(1, Math.round((bounds.end - bounds.start) / DAY_MS));

  walkCells(bounds.start, bounds.end, bounds.unit, dsm, (cellStart) => {
    if (indexByStart.has(cellStart)) return;
    indexByStart.set(cellStart, buckets.length);
    let label: string;
    if (bounds.unit === "hour") label = format(new Date(cellStart), "h a");
    else if (bounds.unit === "day") label = format(new Date(cellStart), "EEE d");
    else if (bounds.unit === "month")
      label = format(new Date(cellStart), spanDays > 366 ? "MMM yy" : "MMM");
    else label = format(new Date(cellStart), "yyyy");
    buckets.push({ label, totalMs: 0, byCategory: {} });
  });

  return { buckets, indexByStart };
}

/* --------------------------------- KPI math -------------------------------- */

function kpisForRange(
  sessions: SessionSlice[],
  start: number,
  end: number,
  dsm: number,
  allSessionsEarliest: number | null,
): Kpis {
  let totalMs = 0;
  let count = 0;
  let completed = 0;
  let longest = 0;
  for (const s of sessions) {
    const focus = focusWindow(s);
    if (focus.start < end && focus.end > start) {
      count++;
      totalMs += Math.min(end, focus.end) - Math.max(start, focus.start);
      if (s.completed === 1) completed++;
      if (s.actual_ms > longest) longest = s.actual_ms;
    }
  }
  let dayCount: number;
  if (start === 0) {
    dayCount =
      allSessionsEarliest !== null
        ? Math.max(1, Math.round((end - allSessionsEarliest) / DAY_MS))
        : 1;
  } else {
    dayCount = Math.max(
      1,
      differenceInCalendarDays(new Date(end - dsm * 60_000), new Date(start - dsm * 60_000)),
    );
  }
  return {
    totalMs,
    count,
    avgPerDayMs: totalMs / dayCount,
    avgSessionMs: count > 0 ? totalMs / count : 0,
    longestMs: longest,
    completionRate: count > 0 ? completed / count : 0,
  };
}

function deltaPct(cur: number, prev: number): number | null {
  if (prev <= 0) return null;
  return ((cur - prev) / prev) * 100;
}

/* ------------------------------- main compute ------------------------------ */

/** All-time starts at 0, which would draw decades of empty buckets. */
function trimAllTimeBounds(bounds: RangeBounds, earliest: number | null, dsm: number): RangeBounds {
  if (bounds.start !== 0 || earliest === null) return bounds;
  const start = localDayBounds(earliest, dsm).start;
  if (start >= bounds.end) return bounds;
  const spanDays = Math.max(
    1,
    differenceInCalendarDays(
      new Date(bounds.end - dsm * 60_000),
      new Date(start - dsm * 60_000),
    ),
  );
  return { ...bounds, start, unit: spanDays > 1095 ? "year" : "month" };
}

/**
 * Aggregates sessions for one report view. `sessions` may span more than the
 * range (heatmap + streak reuse the same rows); anything outside [start, end)
 * is clipped or ignored. Sessions crossing midnight are split across days for
 * day-based bucketing (§5.5 Rules).
 */
export function computeReport(
  sessions: SessionSlice[],
  bounds: RangeBounds,
  opts: { categories: ReportCategoryRef[]; dayStartMinutes: number },
): ReportResult {
  const dsm = opts.dayStartMinutes;

  const earliestAll = sessions.reduce<number | null>(
    (min, s) => (min === null || s.started_at < min ? s.started_at : min),
    null,
  );
  const view = trimAllTimeBounds(bounds, earliestAll, dsm);
  const { start, end } = view;

  const { buckets, indexByStart } = buildBuckets(view, dsm);
  const catTotals = new Map<string | null, { ms: number; count: number }>();

  for (const s of sessions) {
    const focus = focusWindow(s);
    if (focus.start >= end || focus.end <= start) continue;
    const clipStart = Math.max(focus.start, start);
    const clipEnd = Math.min(focus.end, end);

    walkCells(clipStart, clipEnd, view.unit, dsm, (cellStart, ms) => {
      const idx = indexByStart.get(cellStart);
      if (idx === undefined) return;
      const bucket = buckets[idx];
      bucket.totalMs += ms;
      const catKey = s.category_id ?? "__uncat";
      bucket.byCategory[catKey] = (bucket.byCategory[catKey] ?? 0) + ms;
    });

    const catShare = clipEnd - clipStart;
    if (catShare > 0) {
      const cat = catTotals.get(s.category_id) ?? { ms: 0, count: 0 };
      cat.ms += catShare;
      cat.count += 1;
      catTotals.set(s.category_id, cat);
    }
  }

  const kpis = kpisForRange(sessions, bounds.start, end, dsm, earliestAll);
  const prevKpis =
    bounds.prevStart !== null && bounds.prevEnd !== null
      ? kpisForRange(sessions, bounds.prevStart, bounds.prevEnd, dsm, earliestAll)
      : null;

  const grandTotal = kpis.totalMs;
  const categoryStats: CategoryStat[] = [...catTotals.entries()]
    .map(([categoryId, v]) => {
      const ref = opts.categories.find((c) => c.id === categoryId);
      return {
        categoryId,
        name: ref?.name ?? UNCAT_NAME,
        color: ref?.color ?? UNCAT_COLOR,
        totalMs: v.ms,
        count: v.count,
        pct: grandTotal > 0 ? (v.ms / grandTotal) * 100 : 0,
      };
    })
    .sort((a, b) => b.totalMs - a.totalMs);

  return {
    bounds: view,
    buckets,
    kpis,
    prevKpis,
    deltas: {
      totalMs: prevKpis ? deltaPct(kpis.totalMs, prevKpis.totalMs) : null,
      count: prevKpis ? deltaPct(kpis.count, prevKpis.count) : null,
      avgPerDayMs: prevKpis ? deltaPct(kpis.avgPerDayMs, prevKpis.avgPerDayMs) : null,
      avgSessionMs: prevKpis ? deltaPct(kpis.avgSessionMs, prevKpis.avgSessionMs) : null,
      longestMs: prevKpis ? deltaPct(kpis.longestMs, prevKpis.longestMs) : null,
      completionRate:
        prevKpis && prevKpis.count > 0 ? deltaPct(kpis.completionRate, prevKpis.completionRate) : null,
    },
    categories: categoryStats,
  };
}

/* ----------------------------- heatmap + streak ---------------------------- */

/**
 * Daily totals keyed by logical-day key ("yyyy-MM-dd"), across the full
 * provided history (no clipping).
 */
export function computeDailyTotals(
  sessions: SessionSlice[],
  dayStartMinutes: number,
): Map<string, number> {
  const daily = new Map<string, number>();
  for (const s of sessions) {
    const focus = focusWindow(s);
    if (focus.end <= focus.start) continue;
    for (const seg of splitByLogicalDay(focus.start, focus.end, dayStartMinutes)) {
      const key = logicalDayKey(seg.start, dayStartMinutes);
      daily.set(key, (daily.get(key) ?? 0) + (seg.end - seg.start));
    }
  }
  return daily;
}

export interface HeatmapCell {
  key: string;
  ts: number;
  ms: number;
  level: 0 | 1 | 2 | 3;
  streakDay: boolean;
}

export interface HeatmapColumn {
  cells: Array<HeatmapCell | null>;
  monthLabel: string | null;
}

/**
 * GitHub-style year: columns = weeks, 7 cells per column. Future days are
 * null. Levels: 0 <10m, 1 <30m, 2 <60m, 3 ≥60m. Days ≥ goalMs are streak days.
 */
export function buildHeatmap(
  daily: Map<string, number>,
  now: number,
  opts: { weekStartsOn: 0 | 1; dayStartMinutes: number; goalMs: number; weeks?: number },
): HeatmapColumn[] {
  const dsm = opts.dayStartMinutes;
  const offset = dsm * 60_000;
  const todayAnchor = startOfDay(new Date(now - offset)).getTime() + offset;
  const weeks = opts.weeks ?? 53;

  const firstWeekStart = addDays(
    new Date(
      startOfWeek(new Date(todayAnchor), { weekStartsOn: opts.weekStartsOn }).getTime() + offset,
    ),
    -((weeks - 1) * 7),
  );

  const columns: HeatmapColumn[] = [];
  let lastLabeledMonth = -1;

  for (let w = 0; w < weeks; w++) {
    const colAnchor = addDays(firstWeekStart, w * 7);
    const cells: Array<HeatmapCell | null> = [];
    let monthLabel: string | null = null;

    for (let d = 0; d < 7; d++) {
      const ts = addDays(colAnchor, d).getTime();
      if (ts > todayAnchor) {
        cells.push(null);
        continue;
      }
      const key = logicalDayKey(ts, dsm);
      const ms = daily.get(key) ?? 0;
      const level: 0 | 1 | 2 | 3 = ms < 10 * 60_000 ? 0 : ms < 30 * 60_000 ? 1 : ms < 60 * 60_000 ? 2 : 3;
      cells.push({ key, ts, ms, level, streakDay: ms >= opts.goalMs });
    }

    for (const cell of cells) {
      if (!cell) continue;
      const cellDate = new Date(cell.ts);
      if (cellDate.getDate() <= 7 && cellDate.getMonth() !== lastLabeledMonth) {
        monthLabel = format(cellDate, "MMM");
        lastLabeledMonth = cellDate.getMonth();
        break;
      }
    }

    columns.push({ cells, monthLabel });
  }

  return columns;
}


