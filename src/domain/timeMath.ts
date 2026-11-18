import { addDays, startOfDay } from "date-fns";

/**
 * Local-day bounds [start, end) honoring a "day starts at" offset
 * (default 4:00 AM, SPEC §5.6). DST-safe: the anchor is a real local date.
 */
export function localDayBounds(now: number, dayStartMinutes = 240): { start: number; end: number } {
  const offsetMs = dayStartMinutes * 60_000;
  const anchor = now - offsetMs;
  const dayStart = startOfDay(anchor).getTime() + offsetMs;
  const dayEnd = startOfDay(addDays(anchor, 1)).getTime() + offsetMs;
  return { start: dayStart, end: dayEnd };
}

/**
 * Bounds for an inclusive calendar-date range picked in a date input.
 * Input dates are local midnights, which belong to the *previous* logical day
 * when the day starts later (e.g. 04:00); anchor at noon so each picked date
 * maps to its own logical day.
 */
export function logicalDateRange(
  from: Date,
  toInclusive: Date,
  dayStartMinutes = 240,
): { start: number; end: number } {
  const noon = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime();
  return {
    start: localDayBounds(noon(from), dayStartMinutes).start,
    end: localDayBounds(noon(addDays(toInclusive, 1)), dayStartMinutes).start,
  };
}
