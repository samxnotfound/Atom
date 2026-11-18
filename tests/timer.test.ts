import { describe, expect, it } from "vitest";
import {
  computeElapsed,
  computeRemaining,
  countdownProgress,
  excludeDowntime,
  formatElapsed,
  formatRemaining,
  isCountdownDone,
  recoveryEndAt,
  type TimerState,
} from "../src/domain/timer";

const MIN = 60_000;
const HOUR = 3_600_000;

function state(partial: Partial<TimerState> = {}): TimerState {
  return {
    mode: "countdown",
    plannedMs: 25 * MIN,
    startedAt: 1_000_000,
    pausedTotalMs: 0,
    pausedAt: null,
    ...partial,
  };
}

describe("computeElapsed", () => {
  it("derives elapsed from timestamps only", () => {
    const s = state({ startedAt: 0, plannedMs: 25 * MIN });
    expect(computeElapsed(s, 10 * MIN)).toBe(10 * MIN);
  });

  it("excludes accumulated pause time", () => {
    const s = state({ startedAt: 0, pausedTotalMs: 2 * MIN });
    expect(computeElapsed(s, 10 * MIN)).toBe(8 * MIN);
  });

  it("freezes while paused (open pause subtracted)", () => {
    const s = state({ startedAt: 0, pausedAt: 7 * MIN });
    expect(computeElapsed(s, 9 * MIN)).toBe(7 * MIN);
  });

  it("resumes correctly after pause closes", () => {
    // store closes the pause atomically: pausedAt cleared, total bumped
    const s = state({ startedAt: 0, pausedAt: null, pausedTotalMs: 2 * MIN });
    // paused 7→9 (2m); at t=12 elapsed = 12 - 2 = 10
    expect(computeElapsed(s, 12 * MIN)).toBe(10 * MIN);
  });

  it("stays exact across a sleep jump", () => {
    const s = state({ startedAt: 0 });
    // machine sleeps 30 min between ticks: timestamps make it exact
    expect(computeElapsed(s, 40 * MIN)).toBe(40 * MIN);
  });

  it("never goes negative on clock weirdness", () => {
    const s = state({ startedAt: 10 * MIN });
    expect(computeElapsed(s, 5 * MIN)).toBe(0);
  });
});

describe("computeRemaining / completion", () => {
  it("counts down to zero and stops there", () => {
    const s = state({ startedAt: 0, plannedMs: 10 * MIN });
    expect(computeRemaining(s, 3 * MIN)).toBe(7 * MIN);
    expect(computeRemaining(s, 10 * MIN)).toBe(0);
    expect(computeRemaining(s, 15 * MIN)).toBe(0);
  });

  it("isCountdownDone flips exactly at the planned time", () => {
    const s = state({ startedAt: 0, plannedMs: 10 * MIN });
    expect(isCountdownDone(s, 10 * MIN - 1)).toBe(false);
    expect(isCountdownDone(s, 10 * MIN)).toBe(true);
  });

  it("stopwatch never completes", () => {
    const s = state({ plannedMs: null, startedAt: 0 });
    expect(computeRemaining(s, HOUR)).toBeNull();
    expect(isCountdownDone(s, HOUR)).toBe(false);
  });

  it("pause extends the deadline", () => {
    const s = state({ startedAt: 0, plannedMs: 10 * MIN, pausedAt: 4 * MIN });
    expect(computeRemaining(s, 9 * MIN)).toBe(6 * MIN);
  });
});

describe("countdownProgress", () => {
  it("is elapsed/planned, clamped to 1", () => {
    const s = state({ startedAt: 0, plannedMs: 10 * MIN });
    expect(countdownProgress(s, 2.5 * MIN)).toBe(0.25);
    expect(countdownProgress(s, 20 * MIN)).toBe(1);
  });

  it("stopwatch progress is 0", () => {
    expect(countdownProgress(state({ plannedMs: null }), HOUR)).toBe(0);
  });
});

describe("crash recovery (excludeDowntime)", () => {
  it("does not count time after the last heartbeat as focus", () => {
    const s = state({ startedAt: 0, plannedMs: 25 * MIN });
    // Crashed after a 10-minute heartbeat, relaunched 8 hours later.
    const recovered = excludeDowntime(s, 10 * MIN, 8 * HOUR);
    expect(computeElapsed(recovered, 8 * HOUR)).toBe(10 * MIN);
    expect(recovered.startedAt).toBe(0); // original start preserved for history
  });

  it("leaves a paused session untouched", () => {
    const s = state({ startedAt: 0, pausedAt: 4 * MIN });
    const recovered = excludeDowntime(s, 4 * MIN, 8 * HOUR);
    expect(recovered).toEqual(s);
    expect(computeElapsed(recovered, 8 * HOUR)).toBe(4 * MIN);
  });

  it("is a no-op when the heartbeat is current", () => {
    const s = state({ startedAt: 0 });
    expect(excludeDowntime(s, 5 * MIN, 5 * MIN)).toEqual(s);
  });

  it("ends a running recovery at the last heartbeat", () => {
    expect(recoveryEndAt(10 * MIN, null, 35 * MIN)).toBe(35 * MIN);
  });

  it("ends a paused recovery at the pause instant", () => {
    expect(recoveryEndAt(10 * MIN, 25 * MIN, 8 * HOUR)).toBe(25 * MIN);
  });

  it("never ends a recovery before it started", () => {
    expect(recoveryEndAt(10 * MIN, null, 5 * MIN)).toBe(10 * MIN);
  });
});

describe("formatting", () => {
  it("elapsed floors, remaining ceils", () => {
    expect(formatElapsed(90_999)).toBe("01:30");
    expect(formatRemaining(90_001)).toBe("01:31");
  });

  it("switches to H:MM:SS at one hour", () => {
    expect(formatElapsed(HOUR + 5 * MIN + 9_000)).toBe("1:05:09");
    // 59:59.999 remaining ceils to a full hour → hour-form
    expect(formatRemaining(59 * MIN + 59_999)).toBe("1:00:00");
    expect(formatRemaining(59 * MIN + 59_000)).toBe("59:59");
  });

  it("never shows negative time", () => {
    expect(formatElapsed(-5_000)).toBe("00:00");
    expect(formatRemaining(-5_000)).toBe("00:00");
  });
});
