import { describe, expect, it } from "vitest";
import {
  formatDuration,
  MAX_DURATION_MS,
  MIN_DURATION_MS,
  parseDuration,
} from "../src/domain/durationParser";

describe("parseDuration", () => {
  const ok = (input: string, ms: number) =>
    it(`accepts ${JSON.stringify(input)} → ${ms}ms`, () => {
      const r = parseDuration(input);
      expect(r).toEqual({ ok: true, ms });
    });

  // Bare numbers = minutes
  ok("25", 25 * 60_000);
  ok("90", 90 * 60_000);
  ok("  25  ", 25 * 60_000);

  // Explicit minutes
  ok("25m", 25 * 60_000);
  ok("25M", 25 * 60_000);

  // Hours
  ok("1h", 3_600_000);
  ok("1.5h", 5_400_000);
  ok("12h", 12 * 3_600_000);

  // Combined
  ok("1h30", 90 * 60_000);
  ok("1h30m", 90 * 60_000);
  ok("1h 30m", 90 * 60_000);
  ok("2h 15m", 135 * 60_000);
  ok("1.5h30", 120 * 60_000);

  // Clock style
  ok("1:30", 90 * 60_000);
  ok("0:45", 45 * 60_000);

  // Audit §3.4: comma decimal, word minutes, h:m:s, full-width digits
  ok("1,5h", 90 * 60_000);
  ok("90 min", 90 * 60_000);
  ok("90mins", 90 * 60_000);
  ok("45 minutes", 45 * 60_000);
  ok("1:30:00", 90 * 60_000);
  ok("1:00:30", 60.5 * 60_000);
  ok("２５", 25 * 60_000);
  ok("１：３０", 90 * 60_000);

  it("rejects empty input", () => {
    expect(parseDuration("").ok).toBe(false);
    expect(parseDuration("   ").ok).toBe(false);
  });

  it("rejects garbage", () => {
    for (const bad of ["abc", "1:2:3:4", "h", "m", "25x", "-5", "1;", "1h,,30"]) {
      expect(parseDuration(bad).ok, bad).toBe(false);
    }
  });

  it("rejects minutes > 59 in clock form", () => {
    expect(parseDuration("1:90").ok).toBe(false);
    expect(parseDuration("1:30:90").ok).toBe(false);
  });

  it("enforces the 1 min – 12 h range", () => {
    expect(parseDuration("0").ok).toBe(false);
    expect(parseDuration("0.5m").ok).toBe(false);
    expect(parseDuration("12h").ok).toBe(true);
    expect(parseDuration("12h1m").ok).toBe(false);
    expect(parseDuration("13h").ok).toBe(false);
    expect(parseDuration(`${MAX_DURATION_MS / 60_000 + 1}`).ok).toBe(false);
  });

  it("range constants are consistent", () => {
    expect(MIN_DURATION_MS).toBe(60_000);
    expect(MAX_DURATION_MS).toBe(12 * 3_600_000);
  });
});

describe("formatDuration", () => {
  it("formats minutes only", () => {
    expect(formatDuration(45 * 60_000)).toBe("45m");
  });
  it("formats hours only", () => {
    expect(formatDuration(3_600_000)).toBe("1h");
  });
  it("formats mixed", () => {
    expect(formatDuration(90 * 60_000)).toBe("1h 30m");
  });
  it("rounds to whole minutes", () => {
    expect(formatDuration(90_500)).toBe("2m");
  });
});
