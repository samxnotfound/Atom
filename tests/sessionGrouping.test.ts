import { describe, expect, it } from "vitest";
import { groupSessionsByDay } from "../src/domain/sessionGrouping";
import type { SessionRow } from "../src/data/types";

const MIN = 60_000;

function session(id: string, startedAt: number, actualMs = 30 * MIN): SessionRow {
  return {
    id,
    category_id: null,
    title: id,
    note: null,
    mode: "countdown",
    planned_ms: null,
    actual_ms: actualMs,
    started_at: startedAt,
    ended_at: startedAt + actualMs,
    completed: 1,
    source: "timer",
    created_at: startedAt,
  };
}

describe("groupSessionsByDay", () => {
  it("groups by local day, newest first, chronological within a day", () => {
    const now = new Date("2026-11-14T12:00:00").getTime();
    const todayMorning = new Date("2026-11-14T09:00:00").getTime();
    const todayAfternoon = new Date("2026-11-14T15:00:00").getTime();
    const yesterdayEvening = new Date("2026-11-13T21:00:00").getTime();

    const groups = groupSessionsByDay(
      [session("a", todayAfternoon), session("b", yesterdayEvening), session("c", todayMorning)],
      now,
      0, // midnight day start for deterministic tests
    );

    expect(groups.map((g) => g.label)).toEqual(["Today", "Yesterday"]);
    expect(groups[0].sessions.map((s) => s.id)).toEqual(["c", "a"]);
    expect(groups[1].sessions.map((s) => s.id)).toEqual(["b"]);
  });

  it("default 4 AM day start: 3 AM work belongs to the previous day", () => {
    const now = new Date("2026-11-14T12:00:00").getTime();
    const lateNight = new Date("2026-11-14T03:00:00").getTime(); // belongs to Nov 13
    const groups = groupSessionsByDay([session("n", lateNight)], now);
    expect(groups[0].label).toBe("Yesterday");
  });

  it("day totals sum actual focus time", () => {
    const now = new Date("2026-11-14T12:00:00").getTime();
    const s1 = new Date("2026-11-14T09:00:00").getTime();
    const s2 = new Date("2026-11-14T10:00:00").getTime();
    const groups = groupSessionsByDay(
      [session("a", s1, 25 * MIN), session("b", s2, 35 * MIN)],
      now,
      0,
    );
    expect(groups[0].totalMs).toBe(60 * MIN);
  });

  it("empty input yields no groups", () => {
    expect(groupSessionsByDay([], Date.now())).toEqual([]);
  });
});
