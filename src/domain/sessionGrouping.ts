import { format } from "date-fns";
import { localDayBounds } from "./timeMath";
import type { SessionRow } from "../data/types";

export interface DayGroup {
  /** UTC ms of the local day start (with the day-start offset applied). */
  dayStart: number;
  label: string;
  totalMs: number;
  sessions: SessionRow[];
}

/** Labels a day group: Today / Yesterday / "Mon, Nov 9". */
export function dayLabel(dayStart: number, now: number, dayStartMinutes = 240): string {
  const today = localDayBounds(now, dayStartMinutes).start;
  const yesterday = localDayBounds(now - 24 * 3_600_000, dayStartMinutes).start;
  if (dayStart === today) return "Today";
  if (dayStart === yesterday) return "Yesterday";
  return format(dayStart, "EEE, MMM d");
}

/** Groups sessions into local days, newest day first, chronological within a day. */
export function groupSessionsByDay(
  sessions: SessionRow[],
  now: number,
  dayStartMinutes = 240,
): DayGroup[] {
  const map = new Map<number, SessionRow[]>();
  for (const s of sessions) {
    const { start } = localDayBounds(s.started_at, dayStartMinutes);
    const list = map.get(start);
    if (list) list.push(s);
    else map.set(start, [s]);
  }
  const groups: DayGroup[] = [];
  for (const [dayStart, list] of map) {
    list.sort((a, b) => a.started_at - b.started_at);
    groups.push({
      dayStart,
      label: dayLabel(dayStart, now, dayStartMinutes),
      totalMs: list.reduce((sum, s) => sum + s.actual_ms, 0),
      sessions: list,
    });
  }
  groups.sort((a, b) => b.dayStart - a.dayStart);
  return groups;
}
