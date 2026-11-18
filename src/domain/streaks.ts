import { addDays, format, startOfDay, startOfWeek } from "date-fns";
import type { SessionSlice } from "../data/types";
import { computeDailyTotals } from "./analytics";

/**
 * Streak system (SPEC §5.6). Pure functions only.
 *
 * A day counts when total focused time that day is >= goalMs (default 1 h).
 * Freezes are derived deterministically from history (no stored state), so
 * editing or importing sessions always recomputes the same answer:
 *   - earn 1 freeze each time the running streak reaches a multiple of 7 days
 *   - bank at most 2
 *   - a banked freeze auto-covers one missed day between active days, so the
 *     streak continues (the frozen day itself does not add to the count)
 *   - trailing missed days never consume a freeze
 */

export const STREAK_MIN_MS = 3_600_000;
export const MAX_BANKED_FREEZES = 2;
export const FREEZE_EARN_EVERY = 7;

export const DAY_MILESTONES = [3, 7, 14, 30, 50, 100, 200, 365] as const;
export const HOUR_MILESTONES = [10, 50, 100, 500, 1000] as const;

const HOUR_MS = 3_600_000;

export interface StreakDay {
  key: string;
  ts: number;
  ms: number;
  active: boolean;
  frozen: boolean;
  isToday: boolean;
  isFuture: boolean;
}

export interface StreakBadge {
  id: string;
  kind: "days" | "hours";
  target: number;
  label: string;
  achieved: boolean;
}

export interface StreakStats {
  goalMs: number;
  /** Consecutive active days up to today (today still in progress doesn't break it). */
  current: number;
  longest: number;
  activeDays: number;
  totalMs: number;
  todayMs: number;
  todayActive: boolean;
  freezeBank: number;
  frozenDays: Set<string>;
  /** Seven dots for the current week (weekStartsOn first). */
  week: StreakDay[];
  /** Every logical day from the first active day through today. */
  days: StreakDay[];
  badges: StreakBadge[];
}

export interface StreakOptions {
  goalMs?: number;
  dayStartMinutes?: number;
  weekStartsOn?: 0 | 1;
}

function parseDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function computeBadges(longest: number, totalMs: number): StreakBadge[] {
  const dayBadges: StreakBadge[] = DAY_MILESTONES.map((d) => ({
    id: `days-${d}`,
    kind: "days" as const,
    target: d,
    label: `${d}-day streak`,
    achieved: longest >= d,
  }));
  const hourBadges: StreakBadge[] = HOUR_MILESTONES.map((h) => ({
    id: `hours-${h}`,
    kind: "hours" as const,
    target: h,
    label: `${h} hours focused`,
    achieved: totalMs >= h * HOUR_MS,
  }));
  return [...dayBadges, ...hourBadges];
}

export function computeStreakStats(
  daily: ReadonlyMap<string, number>,
  now: number,
  opts: StreakOptions = {},
): StreakStats {
  const goalMs = opts.goalMs ?? STREAK_MIN_MS;
  const dayStartMinutes = opts.dayStartMinutes ?? 240;
  const weekStartsOn = opts.weekStartsOn ?? 0;
  const offset = dayStartMinutes * 60_000;

  const todayStart = startOfDay(new Date(now - offset)).getTime() + offset;
  const todayDate = new Date(todayStart);
  const todayKey = format(todayDate, "yyyy-MM-dd");

  let totalMs = 0;
  let activeDays = 0;
  let earliest: Date | null = null;
  for (const [key, ms] of daily) {
    totalMs += ms;
    if (ms < goalMs) continue;
    activeDays++;
    const d = parseDayKey(key);
    if (earliest === null || d < earliest) earliest = d;
  }

  const days: StreakDay[] = [];
  const dayByKey = new Map<string, StreakDay>();

  if (earliest !== null) {
    let cursor = earliest;
    while (cursor.getTime() <= todayDate.getTime()) {
      const key = format(cursor, "yyyy-MM-dd");
      const ms = daily.get(key) ?? 0;
      const day: StreakDay = {
        key,
        ts: cursor.getTime() + offset,
        ms,
        active: ms >= goalMs,
        frozen: false,
        isToday: key === todayKey,
        isFuture: false,
      };
      days.push(day);
      dayByKey.set(key, day);
      cursor = addDays(cursor, 1);
    }
  }

  let lastActiveIdx = -1;
  for (let i = 0; i < days.length; i++) if (days[i].active) lastActiveIdx = i;

  const frozenDays = new Set<string>();
  let freezeBank = 0;
  let run = 0;
  let longest = 0;

  for (let i = 0; i <= lastActiveIdx; i++) {
    const day = days[i];
    if (day.active) {
      run++;
      if (run > longest) longest = run;
      if (run % FREEZE_EARN_EVERY === 0) {
        freezeBank = Math.min(MAX_BANKED_FREEZES, freezeBank + 1);
      }
    } else if (freezeBank > 0) {
      freezeBank--;
      day.frozen = true;
      frozenDays.add(day.key);
    } else {
      run = 0;
    }
  }

  // The streak is still alive if the last active day is today (in progress) or
  // yesterday; older trailing gaps mean it was broken.
  const yesterdayKey = format(addDays(todayDate, -1), "yyyy-MM-dd");
  const lastActiveKey = lastActiveIdx >= 0 ? days[lastActiveIdx].key : null;
  const current =
    lastActiveKey !== null && (lastActiveKey === todayKey || lastActiveKey === yesterdayKey)
      ? run
      : 0;

  const weekStart = startOfWeek(todayDate, { weekStartsOn });
  const week: StreakDay[] = [];
  for (let d = 0; d < 7; d++) {
    const date = addDays(weekStart, d);
    const key = format(date, "yyyy-MM-dd");
    const existing = dayByKey.get(key);
    if (existing) {
      week.push(existing);
      continue;
    }
    const ms = daily.get(key) ?? 0;
    week.push({
      key,
      ts: date.getTime() + offset,
      ms,
      active: ms >= goalMs,
      frozen: false,
      isToday: key === todayKey,
      isFuture: date.getTime() > todayDate.getTime(),
    });
  }

  const todayMs = daily.get(todayKey) ?? 0;

  return {
    goalMs,
    current,
    longest,
    activeDays,
    totalMs,
    todayMs,
    todayActive: todayMs >= goalMs,
    freezeBank,
    frozenDays,
    week,
    days,
    badges: computeBadges(longest, totalMs),
  };
}

/** Convenience: daily totals + stats from raw session rows. */
export function streakStatsForSessions(
  sessions: SessionSlice[],
  now: number,
  opts: StreakOptions = {},
): StreakStats {
  const daily = computeDailyTotals(sessions, opts.dayStartMinutes ?? 240);
  return computeStreakStats(daily, now, opts);
}

