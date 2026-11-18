import { describe, expect, it } from "vitest";
import {
  buildHeatmap,
  computeDailyTotals,
  computeReport,
  logicalDayKey,
  rangeBounds,
  splitByLogicalDay,
  summarizeRange,
  type RangeBounds,
  type ReportCategoryRef,
} from "../src/domain/analytics";
import type { SessionSlice } from "../src/data/types";

const DSM = 240; // day starts at 4:00 AM
const HOUR = 3_600_000;

/** Local timestamp helper. */
const at = (y: number, m: number, d: number, h = 0, min = 0): number =>
  new Date(y, m - 1, d, h, min).getTime();

const CATS: ReportCategoryRef[] = [
  { id: "deep", name: "Deep Work", color: "#2F7BFF" },
  { id: "study", name: "Study", color: "#22C55E" },
];

const slice = (
  id: string,
  started_at: number,
  ended_at: number,
  opts: Partial<SessionSlice> = {},
): SessionSlice => ({
  id,
  category_id: "deep",
  started_at,
  ended_at,
  actual_ms: ended_at - started_at,
  planned_ms: ended_at - started_at,
  completed: 1,
  ...opts,
});

const OPTS = { dayStartMinutes: DSM, weekStartsOn: 0 as const };

describe("logicalDayKey / splitByLogicalDay", () => {
  it("maps pre-dawn hours to the previous logical day", () => {
    // 2 AM Feb 23 with 4 AM day start belongs to Feb 22's logical day.
    expect(logicalDayKey(at(2026, 2, 23, 2), DSM)).toBe("2026-02-22");
    expect(logicalDayKey(at(2026, 2, 23, 5), DSM)).toBe("2026-02-23");
  });

  it("splits a session crossing midnight when day start is 00:00", () => {
    const segs = splitByLogicalDay(at(2026, 2, 22, 23), at(2026, 2, 23, 1), 0);
    expect(segs).toHaveLength(2);
    expect(segs[0]).toEqual({ start: at(2026, 2, 22, 23), end: at(2026, 2, 23, 0) });
    expect(segs[1]).toEqual({ start: at(2026, 2, 23, 0), end: at(2026, 2, 23, 1) });
  });

  it("keeps a late-night session whole with the 4 AM day start", () => {
    const segs = splitByLogicalDay(at(2026, 2, 22, 23), at(2026, 2, 23, 1), DSM);
    expect(segs).toHaveLength(1);
  });
});

describe("rangeBounds", () => {
  it("day range is the logical day with a logical-day prev", () => {
    const now = at(2026, 11, 14, 10); // Saturday
    const b = rangeBounds("day", now, OPTS);
    expect(b.start).toBe(at(2026, 11, 14, 4));
    expect(b.end).toBe(at(2026, 11, 15, 4));
    expect(b.prevStart).toBe(at(2026, 11, 13, 4));
    expect(b.prevEnd).toBe(b.start);
    expect(b.unit).toBe("hour");
    expect(b.label).toContain("Nov 14, 2026");
  });

  it("week starts on Sunday by default", () => {
    const now = at(2026, 11, 14, 10); // Sat
    const b = rangeBounds("week", now, OPTS);
    expect(b.start).toBe(at(2026, 11, 8, 4)); // Sun
    expect(b.end).toBe(at(2026, 11, 15, 4));
    expect(b.prevStart).toBe(at(2026, 11, 1, 4));
    expect(b.unit).toBe("day");
  });

  it("week honors weekStartsOn = 1 (Mon)", () => {
    const now = at(2026, 11, 14, 10); // Sat
    const b = rangeBounds("week", now, { ...OPTS, weekStartsOn: 1 });
    expect(b.start).toBe(at(2026, 11, 9, 4)); // Mon
    expect(b.end).toBe(at(2026, 11, 16, 4));
  });

  it("month bounds align to the first logical day of the month", () => {
    const now = at(2026, 2, 22, 10);
    const b = rangeBounds("month", now, OPTS);
    expect(b.start).toBe(at(2026, 2, 1, 4));
    expect(b.end).toBe(at(2026, 3, 1, 4));
    expect(b.prevStart).toBe(at(2026, 1, 1, 4));
    expect(b.label).toBe("February 2026");
  });

  it("year bounds align to Jan 1", () => {
    const b = rangeBounds("year", at(2026, 2, 22, 10), OPTS);
    expect(b.start).toBe(at(2026, 1, 1, 4));
    expect(b.end).toBe(at(2027, 1, 1, 4));
    expect(b.prevStart).toBe(at(2025, 1, 1, 4));
    expect(b.unit).toBe("month");
  });

  it("all time has no previous period", () => {
    const b = rangeBounds("all", at(2026, 11, 14, 10), OPTS);
    expect(b.start).toBe(0);
    expect(b.prevStart).toBeNull();
  });

  it("custom range gets an equal-length previous period", () => {
    const cs = at(2026, 11, 2, 4);
    const ce = at(2026, 11, 9, 4);
    const b = rangeBounds("custom", at(2026, 11, 14, 10), { ...OPTS, customStart: cs, customEnd: ce });
    expect(b.start).toBe(cs);
    expect(b.end).toBe(ce);
    expect(b.prevStart).toBe(cs - (ce - cs));
    expect(b.prevEnd).toBe(cs);
    expect(b.unit).toBe("day");
    // The exclusive end is Nov 9 04:00; the last included date is Nov 8.
    expect(b.label).toContain("Nov 8, 2026");
  });

  it("labels a single logical day once instead of the following date", () => {
    const cs = at(2026, 11, 2, 4);
    const ce = at(2026, 11, 3, 4);
    const b = rangeBounds("custom", at(2026, 11, 14, 10), { ...OPTS, customStart: cs, customEnd: ce });
    expect(b.label).toBe("Nov 2, 2026");
  });

  it("normalizes a reversed custom range instead of returning it empty", () => {
    const cs = at(2026, 11, 9, 4);
    const ce = at(2026, 11, 2, 4);
    const b = rangeBounds("custom", at(2026, 11, 14, 10), { ...OPTS, customStart: cs, customEnd: ce });
    expect(b.start).toBe(ce);
    expect(b.end).toBe(cs);
    expect(b.start).toBeLessThan(b.end);
  });
});

describe("computeReport", () => {
  // Week: Sun Nov 8 04:00 → Sun Nov 15 04:00 (2026).
  const bounds = rangeBounds("week", at(2026, 11, 14, 10), OPTS);

  it("buckets daily totals across the week", () => {
    const sessions = [
      slice("a", at(2026, 11, 9, 9), at(2026, 11, 9, 10)), // Mon 1h
      slice("b", at(2026, 11, 10, 20), at(2026, 11, 10, 21, 30)), // Tue 1.5h
    ];
    const r = computeReport(sessions, bounds, { categories: CATS, dayStartMinutes: DSM });
    expect(r.buckets).toHaveLength(7);
    expect(r.buckets[1].label).toBe("Mon 9");
    expect(r.buckets[1].totalMs).toBe(HOUR);
    expect(r.buckets[2].totalMs).toBe(1.5 * HOUR);
  });

  it("splits sessions crossing midnight across day buckets", () => {
    // 23:30 → 00:30 with day start 00:00 splits 0.5h/0.5h; with 4 AM start it stays whole.
    const s = slice("x", at(2026, 11, 9, 23, 30), at(2026, 11, 10, 0, 30));
    const r4 = computeReport([s], bounds, { categories: CATS, dayStartMinutes: DSM });
    expect(r4.buckets[1].totalMs).toBe(HOUR);
    expect(r4.buckets[2].totalMs).toBe(0);

    const r0 = computeReport([s], { ...bounds, start: at(2026, 11, 9), end: at(2026, 11, 16) }, {
      categories: CATS,
      dayStartMinutes: 0,
    });
    // Range starts Mon Nov 9 (00:00 day start): bucket 0 = Nov 9, bucket 1 = Nov 10.
    expect(r0.buckets[0].totalMs).toBe(0.5 * HOUR);
    expect(r0.buckets[1].totalMs).toBe(0.5 * HOUR);
  });

  it("clips sessions that extend beyond the range", () => {
    // Session runs from before the week start into Monday.
    const s = slice("c", at(2026, 11, 8, 2), at(2026, 11, 8, 6)); // 2–6 AM Sun; 2–4 AM belongs to prev logical day
    const r = computeReport([s], bounds, { categories: CATS, dayStartMinutes: DSM });
    expect(r.kpis.count).toBe(1);
    expect(r.kpis.totalMs).toBe(2 * HOUR); // only the 4–6 AM part is in this logical week
    expect(r.buckets[0].totalMs).toBe(2 * HOUR);
  });

  it("computes KPIs including avg per day, longest and completion rate", () => {
    const sessions = [
      slice("a", at(2026, 11, 9, 9), at(2026, 11, 9, 10), { completed: 1 }),
      slice("b", at(2026, 11, 10, 20), at(2026, 11, 10, 21), { completed: 0 }),
      slice("long", at(2026, 11, 11, 9), at(2026, 11, 11, 12), { completed: 1 }),
    ];
    const r = computeReport(sessions, bounds, { categories: CATS, dayStartMinutes: DSM });
    expect(r.kpis.totalMs).toBe(5 * HOUR);
    expect(r.kpis.count).toBe(3);
    expect(r.kpis.avgPerDayMs).toBeCloseTo((5 * HOUR) / 7, 0);
    expect(r.kpis.avgSessionMs).toBeCloseTo(5 * HOUR / 3, 0);
    expect(r.kpis.longestMs).toBe(3 * HOUR);
    expect(r.kpis.completionRate).toBeCloseTo(2 / 3, 2);
  });

  it("computes % deltas vs the previous period", () => {
    const sessions = [
      slice("cur", at(2026, 11, 9, 9), at(2026, 11, 9, 11)), // 2h this week
      slice("prev", at(2026, 11, 2, 9), at(2026, 11, 2, 10)), // 1h prev week
    ];
    const r = computeReport(sessions, bounds, { categories: CATS, dayStartMinutes: DSM });
    expect(r.prevKpis?.totalMs).toBe(HOUR);
    expect(r.deltas.totalMs).toBeCloseTo(100, 0);
  });

  it("omits deltas when the previous period is empty", () => {
    const r = computeReport([slice("a", at(2026, 11, 9, 9), at(2026, 11, 9, 10))], bounds, {
      categories: CATS,
      dayStartMinutes: DSM,
    });
    expect(r.prevKpis?.totalMs).toBe(0);
    expect(r.deltas.totalMs).toBeNull();
  });

  it("stacks categories inside buckets and ranks category stats", () => {
    const sessions = [
      slice("a", at(2026, 11, 9, 9), at(2026, 11, 9, 10), { category_id: "deep" }),
      slice("b", at(2026, 11, 9, 10), at(2026, 11, 9, 11), { category_id: "study" }),
      slice("c", at(2026, 11, 10, 9), at(2026, 11, 10, 10), { category_id: null }),
    ];
    const r = computeReport(sessions, bounds, { categories: CATS, dayStartMinutes: DSM });
    expect(r.buckets[1].byCategory["deep"]).toBe(HOUR);
    expect(r.buckets[1].byCategory["study"]).toBe(HOUR);
    expect(r.buckets[2].byCategory["__uncat"]).toBe(HOUR);
    // Stable sort keeps insertion order on a tie: deep (1h), study (1h), uncategorized (1h).
    expect(r.categories[0].name).toBe("Deep Work");
    expect(r.categories.map((c) => c.totalMs)).toEqual([HOUR, HOUR, HOUR]);
    const unc = r.categories.find((c) => c.name === "Uncategorized");
    expect(unc?.color).toBe("#64748B");
    expect(unc?.count).toBe(1);
  });

  it("fills hourly buckets for a day range", () => {
    const db: RangeBounds = { ...bounds, start: at(2026, 11, 13, 4), end: at(2026, 11, 14, 4), unit: "hour" };
    const s = slice("a", at(2026, 11, 13, 9, 30), at(2026, 11, 13, 10, 15));
    const r = computeReport([s], db, { categories: CATS, dayStartMinutes: DSM });
    expect(r.buckets).toHaveLength(24);
    expect(r.buckets[5].label).toBe("9 AM");
    expect(r.buckets[5].totalMs).toBe(30 * 60_000);
    expect(r.buckets[6].totalMs).toBe(15 * 60_000);
  });

  it("starts all-time buckets at the earliest session, not 1970", () => {
    const all = rangeBounds("all", at(2026, 11, 14, 10), OPTS);
    const r = computeReport(
      [slice("a", at(2026, 11, 9, 9), at(2026, 11, 9, 10))],
      all,
      { categories: CATS, dayStartMinutes: DSM },
    );
    expect(r.bounds.start).toBe(at(2026, 11, 9, 4));
    expect(r.buckets).toHaveLength(1);
    expect(r.buckets[0].label).toBe("Nov");
    expect(r.buckets[0].totalMs).toBe(HOUR);
  });

  it("hourly buckets survive a session starting mid-hour", () => {
    const db: RangeBounds = { ...bounds, start: at(2026, 11, 13, 4), end: at(2026, 11, 14, 4), unit: "hour" };
    const s = slice("a", at(2026, 11, 13, 3, 45), at(2026, 11, 13, 4, 30)); // starts before range
    const r = computeReport([s], db, { categories: CATS, dayStartMinutes: DSM });
    expect(r.buckets[0].totalMs).toBe(30 * 60_000); // 4:00–4:30 clipped into the 4 AM cell
    expect(r.kpis.totalMs).toBe(30 * 60_000);
  });
});

describe("computeDailyTotals + heatmap", () => {
  it("assigns pre-dawn time to the previous logical day", () => {
    const sessions = [slice("a", at(2026, 11, 13, 23), at(2026, 11, 14, 2))];
    const daily = computeDailyTotals(sessions, DSM);
    expect(daily.get("2026-11-13")).toBe(3 * HOUR);
    expect(daily.has("2026-11-14")).toBe(false);
  });

  it("builds 53 columns with future days null and streak markers", () => {
    const sessions = [
      slice("a", at(2026, 11, 14, 9), at(2026, 11, 14, 11)), // today, 2h → streak day, level 3
      slice("b", at(2026, 11, 13, 9), at(2026, 11, 13, 9, 20)), // yesterday 20m → level 1
    ];
    const daily = computeDailyTotals(sessions, DSM);
    const cols = buildHeatmap(daily, at(2026, 11, 14, 10), {
      weekStartsOn: 0,
      dayStartMinutes: DSM,
      goalMs: HOUR,
    });
    expect(cols).toHaveLength(53);
    const todayCol = cols[cols.length - 1];
    const todayCell = todayCol.cells[6]; // Saturday is row 6 (Sun-first)
    expect(todayCell?.streakDay).toBe(true);
    expect(todayCell?.level).toBe(3);
    const yesterdayCell = cols[cols.length - 1].cells[5];
    expect(yesterdayCell?.level).toBe(1);
    expect(yesterdayCell?.streakDay).toBe(false);
  });
});

describe("pause allocation (actual_ms ≠ wall span)", () => {
  // Week: Sun Nov 8 04:00 → Sun Nov 15 04:00 (2026).
  const bounds = rangeBounds("week", at(2026, 11, 14, 10), OPTS);

  /** A session with 1h of pause inside a 2h wall span. */
  const paused = (id: string, started_at: number, ended_at: number): SessionSlice =>
    slice(id, started_at, ended_at, { actual_ms: (ended_at - started_at) / 2 });

  it("reports actual time, not wall time, in KPIs", () => {
    const s = paused("a", at(2026, 11, 9, 9), at(2026, 11, 9, 11)); // 2h wall, 1h actual
    const r = computeReport([s], bounds, { categories: CATS, dayStartMinutes: DSM });
    expect(r.kpis.totalMs).toBe(HOUR);
    expect(r.kpis.avgSessionMs).toBe(HOUR);
    expect(r.kpis.longestMs).toBe(HOUR);
  });

  it("keeps a late-starting session on the day it started", () => {
    const s = paused("a", at(2026, 11, 9, 23), at(2026, 11, 10, 1)); // 1h actual
    const r = computeReport([s], { ...bounds, start: at(2026, 11, 9), end: at(2026, 11, 16) }, {
      categories: CATS,
      dayStartMinutes: 0,
    });
    expect(r.buckets[0].totalMs).toBe(HOUR);
    expect(r.buckets[1].totalMs).toBe(0);
  });

  it("clips a paused session to its focus window", () => {
    // Wall 2–6 AM (4h, 3h actual → focus 2–5 AM); range starts 4 AM → 1h inside.
    const s = slice("a", at(2026, 11, 8, 2), at(2026, 11, 8, 6), { actual_ms: 3 * HOUR });
    const r = computeReport([s], bounds, { categories: CATS, dayStartMinutes: DSM });
    expect(r.kpis.totalMs).toBe(HOUR);
    expect(r.buckets[0].totalMs).toBe(HOUR);
  });

  it("does not leak a long overnight recovery into the next day", () => {
    // Mirrors the real row: 15:10 → 07:57 wall, only 35m of focus.
    const s = slice("b", at(2026, 11, 17, 15, 10), at(2026, 11, 18, 7, 57), {
      actual_ms: 2_105_003,
    });
    const daily = computeDailyTotals([s], DSM);
    expect(daily.get("2026-11-17")).toBe(2_105_003);
    expect(daily.has("2026-11-18")).toBe(false);

    const week = rangeBounds("week", at(2026, 11, 18, 17, 36), OPTS);
    const r = computeReport([s], week, { categories: CATS, dayStartMinutes: DSM });
    expect(r.buckets.find((b) => b.label === "Tue 17")?.totalMs).toBe(2_105_003);
    expect(r.buckets.find((b) => b.label === "Wed 18")?.totalMs).toBe(0);
  });

  it("assigns focus to the logical day it starts in", () => {
    // 23:00 → 01:00 stays inside the Nov 13 logical day (day starts 4 AM).
    const s = paused("a", at(2026, 11, 13, 23), at(2026, 11, 14, 1));
    const daily = computeDailyTotals([s], DSM);
    expect(daily.get("2026-11-13")).toBe(HOUR);
    // Cross the 4 AM boundary: 23:00 → 05:00 wall (6h), 1h actual → all before 00:00.
    const s2 = slice("b", at(2026, 11, 13, 23), at(2026, 11, 14, 5), { actual_ms: HOUR });
    const daily2 = computeDailyTotals([s2], DSM);
    expect(daily2.get("2026-11-13")).toBe(HOUR);
    expect(daily2.has("2026-11-14")).toBe(false);
  });

  it("sums back exactly to actual_ms across the full range", () => {
    const sessions = [
      paused("a", at(2026, 11, 9, 9), at(2026, 11, 9, 11)),
      paused("b", at(2026, 11, 10, 20), at(2026, 11, 10, 21, 30)), // 90m wall, 45m actual
    ];
    const r = computeReport(sessions, bounds, { categories: CATS, dayStartMinutes: DSM });
    expect(r.kpis.totalMs).toBe(HOUR + 0.75 * HOUR);
  });

  it("never counts a fully-paused session", () => {
    const s = slice("a", at(2026, 11, 9, 9), at(2026, 11, 9, 11), { actual_ms: 0 });
    const r = computeReport([s], bounds, { categories: CATS, dayStartMinutes: DSM });
    expect(r.kpis.totalMs).toBe(0);
    expect(r.buckets[1].totalMs).toBe(0);
    expect(r.categories).toHaveLength(0);
  });
});

describe("summarizeRange (Today card stats)", () => {
  it("counts sessions overlapping the window, not only ones started inside", () => {
    // Logical day Nov 14: [04:00 Nov 14, 04:00 Nov 15).
    const start = at(2026, 11, 14, 4);
    const end = at(2026, 11, 15, 4);
    const sessions = [
      slice("inside", at(2026, 11, 14, 9), at(2026, 11, 14, 10)),
      slice("overlap", at(2026, 11, 13, 23), at(2026, 11, 14, 6)), // started "yesterday"
      slice("before", at(2026, 11, 13, 9), at(2026, 11, 13, 10)),
    ];
    const r = summarizeRange(sessions, start, end);
    expect(r.count).toBe(2);
    // Overlap: focus runs 23:00–06:00; 04:00–06:00 = 2h inside, + 1h inside.
    expect(r.totalMs).toBe(3 * HOUR);
  });

  it("ignores a paused session whose focus ended before the window", () => {
    const start = at(2026, 11, 14, 4);
    const end = at(2026, 11, 15, 4);
    // Wall 23:00 → 05:00 (6h), 1h actual → focus 23:00–00:00, before the window.
    const s = slice("a", at(2026, 11, 13, 23), at(2026, 11, 14, 5), { actual_ms: HOUR });
    const r = summarizeRange([s], start, end);
    expect(r.count).toBe(0);
    expect(r.totalMs).toBe(0);
  });
});
