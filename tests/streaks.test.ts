import { describe, expect, it } from "vitest";
import {
  computeBadges,
  computeStreakStats,
  MAX_BANKED_FREEZES,
  STREAK_MIN_MS,
  streakStatsForSessions,
} from "../src/domain/streaks";
import { computeDailyTotals } from "../src/domain/analytics";
import type { SessionSlice } from "../src/data/types";

const MIN = 60_000;
const HOUR = 3_600_000;
const DSM = 240; // day starts at 4:00 AM

/** Local timestamp helper. */
const at = (y: number, m: number, d: number, h = 10, min = 0): number =>
  new Date(y, m - 1, d, h, min).getTime();

const day = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const dailyOf = (entries: Record<string, number>): Map<string, number> =>
  new Map(Object.entries(entries));

/** Consecutive active days from a start date, with optional gaps. */
function range(start: number, days: number, ms = HOUR): Record<string, number> {
  const out: Record<string, number> = {};
  const d = new Date(start);
  for (let i = 0; i < days; i++) {
    out[day(d.getFullYear(), d.getMonth() + 1, d.getDate())] = ms;
    d.setDate(d.getDate() + 1);
  }
  return out;
}

const slice = (id: string, started_at: number, ended_at: number): SessionSlice => ({
  id,
  category_id: "deep",
  started_at,
  ended_at,
  actual_ms: ended_at - started_at,
  planned_ms: ended_at - started_at,
  completed: 1,
});

describe("streak threshold", () => {
  it("fails at 59:59 and passes at exactly 60:00", () => {
    const now = at(2026, 11, 14, 20);
    const below = dailyOf({ "2026-11-14": HOUR - 1000 });
    const exact = dailyOf({ "2026-11-14": HOUR });

    const b = computeStreakStats(below, now, { goalMs: STREAK_MIN_MS, dayStartMinutes: DSM });
    expect(b.todayActive).toBe(false);
    expect(b.activeDays).toBe(0);
    expect(b.current).toBe(0);

    const e = computeStreakStats(exact, now, { goalMs: STREAK_MIN_MS, dayStartMinutes: DSM });
    expect(e.todayActive).toBe(true);
    expect(e.activeDays).toBe(1);
    expect(e.current).toBe(1);
  });

  it("sums multiple sessions in the same day", () => {
    const now = at(2026, 11, 14, 22);
    const sessions = [
      slice("a", at(2026, 11, 14, 9), at(2026, 11, 14, 9, 30)),
      slice("b", at(2026, 11, 14, 15), at(2026, 11, 14, 15, 30)),
    ];
    const stats = streakStatsForSessions(sessions, now, { dayStartMinutes: DSM });
    expect(stats.todayMs).toBe(HOUR);
    expect(stats.current).toBe(1);

    const short = [
      slice("a", at(2026, 11, 14, 9), at(2026, 11, 14, 9, 30)),
      slice("b", at(2026, 11, 14, 15), at(2026, 11, 14, 15, 29) + 59_000),
    ];
    expect(streakStatsForSessions(short, now, { dayStartMinutes: DSM }).todayActive).toBe(false);
  });

  it("honors a custom threshold", () => {
    const now = at(2026, 11, 14, 20);
    const daily = dailyOf({ "2026-11-13": 30 * MIN, "2026-11-14": 30 * MIN });
    const short = computeStreakStats(daily, now, { goalMs: 30 * MIN, dayStartMinutes: DSM });
    expect(short.current).toBe(2);

    const long = computeStreakStats(daily, now, { goalMs: 60 * MIN, dayStartMinutes: DSM });
    expect(long.current).toBe(0);
  });
});

describe("day boundary", () => {
  // 23:30 Nov 13 → 00:15 Nov 14, plus 01:00 → 01:30 Nov 14.
  const sessions = [
    slice("late", at(2026, 11, 13, 23, 30), at(2026, 11, 14, 0, 15)),
    slice("early", at(2026, 11, 14, 1), at(2026, 11, 14, 1, 30)),
  ];

  it("counts pre-dawn work toward the previous logical day", () => {
    const daily = computeDailyTotals(sessions, DSM);
    expect(daily.get("2026-11-13")).toBe(75 * MIN);
    expect(daily.has("2026-11-14")).toBe(false);

    const stats = computeStreakStats(daily, at(2026, 11, 14, 10), {
      goalMs: HOUR,
      dayStartMinutes: DSM,
    });
    expect(stats.activeDays).toBe(1);
    expect(stats.current).toBe(1); // yesterday's streak is still alive today
  });

  it("splits at midnight when the day starts at 00:00", () => {
    const daily = computeDailyTotals(sessions, 0);
    expect(daily.get("2026-11-13")).toBe(30 * MIN);
    expect(daily.get("2026-11-14")).toBe(45 * MIN);
  });
});

describe("freezes", () => {
  it("earns a freeze at 7 days and spends it on the next missed day", () => {
    const now = at(2026, 11, 9, 20);
    const daily = dailyOf({
      ...range(at(2026, 11, 1, 12), 7), // Nov 1–7
      "2026-11-09": HOUR, // gap on Nov 8
    });
    const stats = computeStreakStats(daily, now, { goalMs: HOUR, dayStartMinutes: DSM });

    expect(stats.current).toBe(8);
    expect(stats.frozenDays.has("2026-11-08")).toBe(true);
    expect(stats.week.find((d) => d.key === "2026-11-08")?.frozen).toBe(true);
    expect(stats.freezeBank).toBe(0);
  });

  it("breaks the streak when no freeze is banked", () => {
    const now = at(2026, 11, 6, 20);
    const daily = dailyOf({
      "2026-11-01": HOUR,
      "2026-11-02": HOUR,
      "2026-11-03": HOUR,
      // Nov 4 gap
      "2026-11-05": HOUR,
      "2026-11-06": HOUR,
    });
    const stats = computeStreakStats(daily, now, { goalMs: HOUR, dayStartMinutes: DSM });
    expect(stats.current).toBe(2);
    expect(stats.longest).toBe(3);
    expect(stats.frozenDays.size).toBe(0);
  });

  it("never spends freezes on trailing gaps after the last active day", () => {
    const now = at(2026, 11, 14, 20);
    const daily = dailyOf(range(at(2026, 11, 1, 12), 7)); // ends Nov 7
    const stats = computeStreakStats(daily, now, { goalMs: HOUR, dayStartMinutes: DSM });

    expect(stats.current).toBe(0);
    expect(stats.longest).toBe(7);
    expect(stats.freezeBank).toBe(1);
    expect(stats.frozenDays.size).toBe(0);
  });

  it("banks at most two freezes", () => {
    const now = at(2026, 11, 21, 20);
    const daily = dailyOf(range(at(2026, 11, 1, 12), 21));
    const stats = computeStreakStats(daily, now, { goalMs: HOUR, dayStartMinutes: DSM });
    expect(stats.current).toBe(21);
    expect(stats.freezeBank).toBe(MAX_BANKED_FREEZES);
  });

  it("bridges two separate missed days with two freezes", () => {
    const now = at(2026, 11, 18, 20);
    const daily = dailyOf({
      ...range(at(2026, 11, 1, 12), 14), // Nov 1–14, earns 2
      // Nov 15 gap
      "2026-11-16": HOUR,
      // Nov 17 gap
      "2026-11-18": HOUR,
    });
    const stats = computeStreakStats(daily, now, { goalMs: HOUR, dayStartMinutes: DSM });
    expect(stats.current).toBe(16);
    expect([...stats.frozenDays].sort()).toEqual(["2026-11-15", "2026-11-17"]);
    expect(stats.freezeBank).toBe(0);
  });

  it("keeps a streak alive when today is still in progress", () => {
    const now = at(2026, 11, 14, 9);
    const daily = dailyOf({
      "2026-11-12": HOUR,
      "2026-11-13": HOUR,
      "2026-11-14": 10 * MIN, // in progress
    });
    const stats = computeStreakStats(daily, now, { goalMs: HOUR, dayStartMinutes: DSM });
    expect(stats.current).toBe(2);
    expect(stats.todayActive).toBe(false);
  });
});

describe("longest streak", () => {
  it("keeps the best run across a break", () => {
    const now = at(2026, 11, 11, 20);
    const daily = dailyOf({
      ...range(at(2026, 11, 1, 12), 5), // Nov 1–5
      // Nov 6 gap
      "2026-11-07": HOUR,
      "2026-11-08": HOUR,
      "2026-11-09": HOUR,
      "2026-11-10": HOUR,
      "2026-11-11": HOUR,
    });
    const stats = computeStreakStats(daily, now, { goalMs: HOUR, dayStartMinutes: DSM });
    expect(stats.longest).toBe(5);
    expect(stats.current).toBe(5);
  });

  it("walks consecutive calendar days across the US spring-forward date", () => {
    const now = at(2026, 3, 10, 20);
    const daily = dailyOf(range(at(2026, 3, 4, 12), 7)); // Mar 4–10, DST on Mar 8
    const stats = computeStreakStats(daily, now, { goalMs: HOUR, dayStartMinutes: DSM });
    expect(stats.current).toBe(7);
    expect(stats.longest).toBe(7);
    expect(stats.days[stats.days.length - 1]?.key).toBe("2026-03-10");
  });
});

describe("imported history", () => {
  it("derives streaks and totals from arbitrary old sessions", () => {
    const now = at(2026, 11, 14, 10);
    const daily = dailyOf({
      "2024-01-01": 2 * HOUR,
      "2024-01-02": HOUR,
      "2024-01-03": HOUR,
      "2025-06-10": 30 * MIN,
    });
    const stats = computeStreakStats(daily, now, { goalMs: HOUR, dayStartMinutes: DSM });
    expect(stats.current).toBe(0);
    expect(stats.longest).toBe(3);
    expect(stats.activeDays).toBe(3);
    expect(stats.totalMs).toBe(4.5 * HOUR);
  });
});

describe("week strip", () => {
  const now = at(2026, 11, 14, 20); // Saturday
  const daily = dailyOf({
    "2026-11-08": 20 * MIN, // Sun
    "2026-11-10": HOUR, // Tue
    "2026-11-14": 45 * MIN, // today
  });

  it("lists Sunday-first weeks with today marked", () => {
    const stats = computeStreakStats(daily, now, { goalMs: HOUR, dayStartMinutes: DSM });
    expect(stats.week).toHaveLength(7);
    expect(stats.week[0].key).toBe("2026-11-08");
    expect(stats.week[0].ms).toBe(20 * MIN);
    expect(stats.week[2].active).toBe(true);
    expect(stats.week[6].isToday).toBe(true);
    expect(stats.week.filter((d) => d.isFuture)).toHaveLength(0);
  });

  it("omits next week's days when the week starts Monday", () => {
    const stats = computeStreakStats(daily, now, {
      goalMs: HOUR,
      dayStartMinutes: DSM,
      weekStartsOn: 1,
    });
    expect(stats.week[0].key).toBe("2026-11-09");
    expect(stats.week[5].isToday).toBe(true);
    expect(stats.week[6].isFuture).toBe(true);
  });
});

describe("badges", () => {
  it("unlocks day and hour milestones independently", () => {
    const badges = computeBadges(7, 12 * HOUR);
    expect(badges.find((b) => b.id === "days-3")?.achieved).toBe(true);
    expect(badges.find((b) => b.id === "days-7")?.achieved).toBe(true);
    expect(badges.find((b) => b.id === "days-14")?.achieved).toBe(false);
    expect(badges.find((b) => b.id === "hours-10")?.achieved).toBe(true);
    expect(badges.find((b) => b.id === "hours-50")?.achieved).toBe(false);
    expect(badges).toHaveLength(13);
  });
});
