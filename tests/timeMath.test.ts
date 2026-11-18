import { describe, expect, it } from "vitest";
import { localDayBounds, logicalDateRange } from "../src/domain/timeMath";

/** 2026-11-14 is a Saturday. Times in local ISO strings. */
function ts(iso: string): number {
  return new Date(iso).getTime();
}

describe("localDayBounds", () => {
  it("uses the local calendar day start (midnight) when offset is 0", () => {
    const { start, end } = localDayBounds(ts("2026-11-14T15:00:00"), 0);
    expect(new Date(start).getHours()).toBe(0);
    expect(end - start).toBe(24 * 3_600_000);
  });

  it("default 4:00 AM start: 3 AM belongs to the previous day", () => {
    const early = ts("2026-11-14T03:00:00");
    const late = ts("2026-11-14T23:00:00");
    const earlyBounds = localDayBounds(early);
    const lateBounds = localDayBounds(late);
    expect(earlyBounds.start).toBe(lateBounds.start - 24 * 3_600_000);
  });

  it("4 AM belongs to the current day", () => {
    const at4 = ts("2026-11-14T04:00:00");
    const { start } = localDayBounds(at4);
    expect(new Date(start).getDate()).toBe(14);
    expect(new Date(start).getHours()).toBe(4);
  });

  it("bounds span exactly 24h", () => {
    const { start, end } = localDayBounds(ts("2026-11-14T12:00:00"));
    expect(end - start).toBe(24 * 3_600_000);
  });
});

describe("logicalDateRange", () => {
  it("maps picked midnights to their own logical day with a 4 AM start", () => {
    const { start, end } = logicalDateRange(
      new Date(2026, 0, 1),
      new Date(2026, 0, 5),
      240,
    );
    // Jan 1–5 inclusive → Jan 1 04:00 through Jan 6 04:00.
    expect(start).toBe(ts("2026-01-01T04:00:00"));
    expect(end).toBe(ts("2026-01-06T04:00:00"));
  });

  it("handles a single-day range", () => {
    const { start, end } = logicalDateRange(
      new Date(2026, 0, 5),
      new Date(2026, 0, 5),
      240,
    );
    expect(end - start).toBe(24 * 3_600_000);
  });
});
