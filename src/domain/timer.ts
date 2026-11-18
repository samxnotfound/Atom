export type SessionMode = "countdown" | "stopwatch" | "pomodoro";

/**
 * Pure timer state. All math derives from timestamps — never incremented
 * per tick — so sleep, lag and throttling cannot skew it (SPEC §3).
 */
export interface TimerState {
  mode: SessionMode;
  plannedMs: number | null; // null for stopwatch and pomodoro breaks without plan
  startedAt: number; // UTC ms, segment start
  pausedTotalMs: number;
  pausedAt: number | null; // set while paused
}

export function computeElapsed(s: TimerState, now: number): number {
  const pausedExtra = s.pausedAt !== null ? Math.max(0, now - s.pausedAt) : 0;
  return Math.max(0, now - s.startedAt - s.pausedTotalMs - pausedExtra);
}

export function computeRemaining(s: TimerState, now: number): number | null {
  if (s.plannedMs === null) return null;
  return Math.max(0, s.plannedMs - computeElapsed(s, now));
}

export function isCountdownDone(s: TimerState, now: number): boolean {
  if (s.plannedMs === null) return false;
  return computeElapsed(s, now) >= s.plannedMs;
}

/** 0..1 progress toward the planned duration (stopwatch → 0). */
export function countdownProgress(s: TimerState, now: number): number {
  if (s.plannedMs === null) return 0;
  return Math.min(1, computeElapsed(s, now) / s.plannedMs);
}

export function formatSeconds(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Elapsed displays floor: never shows time that wasn't focused. */
export function formatElapsed(ms: number): string {
  return formatSeconds(Math.floor(ms / 1000));
}

/** Remaining displays ceil: shows the planned value first, 0:00 at true zero. */
export function formatRemaining(ms: number): string {
  return formatSeconds(Math.ceil(ms / 1000));
}

/**
 * Recovery after the app was closed/crashed: a running session must not count
 * the downtime up to relaunch (an overnight crash is not focus time). Treat
 * the gap since the last heartbeat as pause, which preserves the original
 * started_at for timeline/history. A paused session is already frozen.
 */
export function excludeDowntime<T extends TimerState>(
  s: T,
  lastHeartbeat: number,
  now: number,
): T {
  if (s.pausedAt !== null) return s;
  const gap = Math.max(0, now - Math.max(lastHeartbeat, s.startedAt));
  if (gap === 0) return s;
  return { ...s, pausedTotalMs: s.pausedTotalMs + gap };
}

/** Last instant the recovered session was known to hold focus. */
export function recoveryEndAt(
  startedAt: number,
  pausedAt: number | null,
  lastHeartbeat: number,
): number {
  return Math.max(startedAt, pausedAt ?? lastHeartbeat);
}
