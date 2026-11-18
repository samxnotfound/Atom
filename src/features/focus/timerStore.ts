import { create } from "zustand";
import {
  computeElapsed,
  excludeDowntime,
  isCountdownDone,
  type SessionMode,
  type TimerState,
} from "../../domain/timer";
import { insertSession } from "../../data/sessionsRepo";
import { clearActive, heartbeatActive, upsertActive } from "../../data/activeSessionRepo";
import type { ActiveSessionRow } from "../../data/types";
import { playChime, notifyCompletion } from "../../app/completionFx";
import { usePrefs } from "../../app/prefsStore";
import { invalidateSessionData } from "../../app/queryClient";

export const POMODORO_DEFAULTS = {
  focusMs: 25 * 60_000,
  shortBreakMs: 5 * 60_000,
  longBreakMs: 15 * 60_000,
  cyclesBeforeLong: 4,
  autoStartNext: false,
} as const;

export interface PomodoroConfig {
  focusMs: number;
  shortBreakMs: number;
  longBreakMs: number;
  cyclesBeforeLong: number;
  autoStartNext: boolean;
}

/**
 * Validates a stored/loaded Pomodoro config against the same clamps the
 * settings UI enforces, falling back field-by-field to the defaults. Stored
 * values are never trusted (SPEC 5.3: stored data is untrusted input).
 */
export function normalizePomodoro(raw: unknown): PomodoroConfig {
  const r = (raw ?? {}) as Partial<PomodoroConfig>;
  const clampMin = (v: unknown, fallback: number, min: number, max: number): number => {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
  };
  return {
    focusMs: clampMin(r.focusMs, POMODORO_DEFAULTS.focusMs, 60_000, 180 * 60_000),
    shortBreakMs: clampMin(r.shortBreakMs, POMODORO_DEFAULTS.shortBreakMs, 60_000, 30 * 60_000),
    longBreakMs: clampMin(r.longBreakMs, POMODORO_DEFAULTS.longBreakMs, 60_000, 60 * 60_000),
    cyclesBeforeLong: clampMin(r.cyclesBeforeLong, POMODORO_DEFAULTS.cyclesBeforeLong, 2, 12),
    autoStartNext: r.autoStartNext === true,
  };
}

export interface StartOptions {
  mode: SessionMode;
  plannedMs: number | null;
  title: string | null;
  categoryId: string | null;
  pomodoro: PomodoroConfig;
}

export interface SavedCard {
  id: string;
  title: string | null;
  actualMs: number;
  phase: "focus" | "break";
  breakKind: "short" | "long" | null;
  /** The mode that finished, so "Start another" repeats it (not Pomodoro). */
  mode: SessionMode;
  plannedMs: number | null;
}

const TICK_MS = 250;
const HEARTBEAT_MS = 5000;

export type TimerStatus = "idle" | "running" | "paused" | "saved";

interface TimerStore {
  status: TimerStatus;
  timer: (TimerState & { id: string }) | null;
  categoryId: string | null;
  title: string | null;
  phase: "focus" | "break";
  breakKind: "short" | "long" | null;
  completedFocusSegments: number;
  pomodoro: PomodoroConfig | null;
  nowMs: number;
  savedCard: SavedCard | null;
  flash: string | null;
  stopDialogOpen: boolean;

  start: (opts: StartOptions) => void;
  startBreak: (kind: "short" | "long") => void;
  startAnother: () => void;
  startNextFocusSegment: () => void;
  pause: () => void;
  resume: () => void;
  togglePause: () => void;
  addFiveMinutes: () => void;
  requestStop: () => void;
  resolveStop: (save: boolean, note?: string, endedAt?: number) => Promise<void>;
  discard: () => void;
  dismissSavedCard: () => void;
  dismissFlash: () => void;
  rehydrate: (row: ActiveSessionRow, pomodoro: PomodoroConfig | null) => void;
  tick: () => void;
}

function newSegment(plannedMs: number | null, mode: SessionMode): TimerState & { id: string } {
  const startedAt = Date.now();
  return {
    id: crypto.randomUUID(),
    mode,
    plannedMs,
    startedAt,
    pausedTotalMs: 0,
    pausedAt: null,
  };
}

let ticker: ReturnType<typeof setInterval> | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;

function startLoops(): void {
  if (ticker === null) {
    ticker = setInterval(() => {
      useTimer.getState().tick();
    }, TICK_MS);
  }
  if (heartbeat === null) {
    heartbeat = setInterval(() => {
      const t = useTimer.getState().timer;
      // A rejected heartbeat must not become an unhandled rejection every 5 s.
      if (t) void heartbeatActive(t.id, Date.now()).catch(() => undefined);
    }, HEARTBEAT_MS);
  }
}

function stopLoops(): void {
  if (ticker !== null) {
    clearInterval(ticker);
    ticker = null;
  }
  if (heartbeat !== null) {
    clearInterval(heartbeat);
    heartbeat = null;
  }
}

export const useTimer = create<TimerStore>((set, get) => {
  function persist(): void {
    const s = get();
    const t = s.timer;
    if (!t) return;
    void upsertActive({
      id: t.id,
      category_id: s.categoryId,
      title: s.title,
      mode: t.mode,
      planned_ms: t.plannedMs,
      started_at: t.startedAt,
      paused_total_ms: t.pausedTotalMs,
      paused_at: t.pausedAt,
      last_heartbeat: Date.now(),
      segment_index: s.completedFocusSegments,
      phase: s.phase,
      break_kind: s.breakKind,
    }).catch((e) => {
      console.error("Failed to persist the active session", e);
      set({ flash: "Timer state couldn't be saved — keep Atom open until it can" });
    });
  }

  function persistSession(
    t: NonNullable<TimerStore["timer"]>,
    actualMs: number,
    note: string | null,
  ): Promise<void> {
    const s = get();
    const completed = t.plannedMs !== null ? actualMs >= t.plannedMs : true;
    return insertSession({
      id: t.id,
      category_id: s.categoryId,
      title: s.title,
      note,
      mode: t.mode,
      planned_ms: t.plannedMs,
      actual_ms: actualMs,
      started_at: t.startedAt,
      ended_at: Date.now(),
      completed,
      source: "timer",
    }).catch((e) => {
      console.error("Failed to save session", e);
      set({ flash: "Session couldn't be saved — it will be offered again on next launch" });
      throw e;
    });
  }

  function finishCountdown(): void {
    const s = get();
    const t = s.timer;
    if (!t) return;
    const actualMs = t.plannedMs ?? 0;

    const { chime, chimeVolume } = usePrefs.getState().prefs;
    if (chime) playChime(chimeVolume);
    void notifyCompletion(
      s.phase === "focus" ? "Focus session complete" : "Break over",
    );

    if (s.phase !== "focus") {
      // Break end: no session row is written (breaks never count as focus).
      const p = s.pomodoro;
      if (p && p.autoStartNext) {
        const next = newSegment(p.focusMs, "pomodoro");
        set({
          status: "running",
          timer: next,
          phase: "focus",
          breakKind: null,
          nowMs: next.startedAt,
          flash: "Break over — next focus segment started",
        });
        persist();
        return;
      }
      endWithCard(s.completedFocusSegments, {
        id: t.id,
        title: s.title,
        actualMs,
        phase: "break",
        breakKind: s.breakKind,
        mode: t.mode,
        plannedMs: t.plannedMs,
      });
      return;
    }

    const segments = s.completedFocusSegments + 1;
    // Free the slot before the async write so the ticker cannot re-fire
    // completion while insertSession is in flight.
    set({ status: "saved", timer: null, completedFocusSegments: segments, nowMs: Date.now() });

    const p = s.pomodoro;
    if (t.mode === "pomodoro" && p && p.autoStartNext) {
      const nextKind: "short" | "long" = segments % p.cyclesBeforeLong === 0 ? "long" : "short";
      void persistSession(t, actualMs, null)
        .then(() => {
          invalidateSessionData();
          actions.startBreak(nextKind);
          set({ flash: "Focus segment saved — break started" });
        })
        .catch(() => {
          // Already surfaced via flash; skip the auto-start rather than
          // chain a break onto an unsaved segment.
        });
      return;
    }

    void persistSession(t, actualMs, null)
      .then(() => {
        invalidateSessionData();
        endWithCard(segments, {
          id: t.id,
          title: s.title,
          actualMs,
          phase: "focus",
          breakKind: null,
          mode: t.mode,
          plannedMs: t.plannedMs,
        });
      })
      .catch(() => {
        // Already surfaced via flash; the active row stays for recovery.
      });
  }

  function endWithCard(segments: number, card: SavedCard): void {
    // A newer session may have started while the save was in flight —
    // never clobber it or delete its active row.
    if (get().timer !== null) return;
    stopLoops();
    void clearActive(card.id).catch(() => undefined);
    set({ status: "saved", timer: null, completedFocusSegments: segments, savedCard: card });
  }

  const actions = {
    status: "idle" as TimerStatus,
    timer: null,
    categoryId: null,
    title: null,
    phase: "focus" as const,
    breakKind: null,
    completedFocusSegments: 0,
    pomodoro: null,
    nowMs: Date.now(),
    savedCard: null,
    flash: null,
    stopDialogOpen: false,

    start: ({ mode, plannedMs, title, categoryId, pomodoro }: StartOptions) => {
      // Double-start guard: a second active row would make recovery
      // ambiguous (loadActive picks one arbitrarily).
      const cur = get().status;
      if (cur === "running" || cur === "paused") return;
      stopLoops();
      const t = newSegment(plannedMs, mode);
      set({
        status: "running",
        timer: t,
        categoryId,
        title,
        phase: "focus",
        breakKind: null,
        completedFocusSegments: 0,
        pomodoro,
        savedCard: null,
        flash: null,
        stopDialogOpen: false,
        nowMs: t.startedAt,
      });
      startLoops();
      persist();
    },

    startBreak: (kind: "short" | "long") => {
      const p = get().pomodoro;
      if (!p) return;
      stopLoops();
      const t = newSegment(kind === "short" ? p.shortBreakMs : p.longBreakMs, "pomodoro");
      set({
        status: "running",
        timer: t,
        phase: "break",
        breakKind: kind,
        savedCard: null,
        nowMs: t.startedAt,
      });
      startLoops();
      persist();
    },

    startAnother: () => {
      const s = get();
      const card = s.savedCard;
      if (!card) return;
      // Repeat the mode that just finished; a plain timer must not silently
      // become a Pomodoro segment.
      const plannedMs =
        card.mode === "stopwatch" ? null : (card.plannedMs ?? s.pomodoro?.focusMs ?? null);
      actions.start({
        mode: card.mode,
        plannedMs,
        title: s.title,
        categoryId: s.categoryId,
        pomodoro: s.pomodoro ?? POMODORO_DEFAULTS,
      });
    },

    startNextFocusSegment: () => {
      const p = get().pomodoro;
      if (!p) return;
      stopLoops();
      const t = newSegment(p.focusMs, "pomodoro");
      set({
        status: "running",
        timer: t,
        phase: "focus",
        breakKind: null,
        savedCard: null,
        nowMs: t.startedAt,
      });
      startLoops();
      persist();
    },

    pause: () => {
      const t = get().timer;
      if (!t || get().status !== "running") return;
      set({ status: "paused", timer: { ...t, pausedAt: Date.now() }, nowMs: Date.now() });
      persist();
    },

    resume: () => {
      const t = get().timer;
      if (!t || get().status !== "paused" || t.pausedAt === null) return;
      const pausedTotalMs = t.pausedTotalMs + Math.max(0, Date.now() - t.pausedAt);
      set({ status: "running", timer: { ...t, pausedTotalMs, pausedAt: null }, nowMs: Date.now() });
      persist();
    },

    togglePause: () => {
      const s = get();
      if (s.status === "running") actions.pause();
      else if (s.status === "paused") actions.resume();
    },

    addFiveMinutes: () => {
      const t = get().timer;
      if (!t || t.plannedMs === null) return;
      set({ timer: { ...t, plannedMs: t.plannedMs + 5 * 60_000 } });
      persist();
    },

    requestStop: () => {
      set({ stopDialogOpen: true });
    },

    resolveStop: (save: boolean, note?: string, endOverride?: number): Promise<void> => {
      set({ stopDialogOpen: false });
      const s = get();
      const t = s.timer;
      if (!t) return Promise.resolve();
      if (!save || s.phase !== "focus") {
        // Breaks never count as focus (SPEC §5.4): "end & save" during a
        // break discards the break — focus segments were already saved at
        // their completion.
        actions.discard();
        return Promise.resolve();
      }
      const now = Date.now();
      const actualMs = computeElapsed(t, now);
      const endedAt = endOverride ?? now;
      // Free the slot before the async write so the ticker cannot produce a
      // second completion decision mid-save.
      set({ status: "saved", timer: null, nowMs: now });
      const card: SavedCard = {
        id: t.id,
        title: s.title,
        actualMs,
        phase: "focus",
        breakKind: null,
        mode: t.mode,
        plannedMs: t.plannedMs,
      };
      return insertSession({
        id: t.id,
        category_id: s.categoryId,
        title: s.title,
        note: note ?? null,
        mode: t.mode,
        planned_ms: t.plannedMs,
        actual_ms: actualMs,
        started_at: t.startedAt,
        ended_at: endedAt,
        completed: t.plannedMs !== null ? actualMs >= t.plannedMs : true,
        source: "timer",
      })
        .then(() => {
          invalidateSessionData();
          endWithCard(s.completedFocusSegments, card);
        })
        .catch((e) => {
          console.error("Failed to save session", e);
          set({ flash: "Session couldn't be saved — it will be offered again on next launch" });
        });
    },

    discard: () => {
      const id = get().timer?.id;
      stopLoops();
      if (id) void clearActive(id).catch(() => undefined);
      else void clearActive().catch(() => undefined);
      set({ status: "idle", timer: null, stopDialogOpen: false, savedCard: null });
    },

    dismissSavedCard: () => {
      set({ status: "idle", savedCard: null });
    },

    dismissFlash: () => {
      set({ flash: null });
    },

    rehydrate: (row: ActiveSessionRow, pomodoro: PomodoroConfig | null) => {
      stopLoops();
      const now = Date.now();
      const recovered = excludeDowntime(
        {
          id: row.id,
          mode: row.mode,
          plannedMs: row.planned_ms,
          startedAt: row.started_at,
          pausedTotalMs: row.paused_total_ms,
          pausedAt: row.paused_at,
        },
        row.last_heartbeat,
        now,
      );
      set({
        status: row.paused_at !== null ? "paused" : "running",
        timer: recovered,
        categoryId: row.category_id,
        title: row.title,
        phase: row.phase,
        breakKind: row.break_kind,
        completedFocusSegments: row.segment_index,
        pomodoro: pomodoro ? normalizePomodoro(pomodoro) : null,
        savedCard: null,
        nowMs: Date.now(),
      });
      startLoops();
      persist();
    },

    tick: () => {
      const s = get();
      if (s.status !== "running") return;
      const t = s.timer;
      if (!t) return;
      const now = Date.now();
      if (t.plannedMs !== null && isCountdownDone(t, now)) {
        finishCountdown();
        return;
      }
      // Hidden/minimized window: completion detection and heartbeats keep
      // running; only the UI tick is skipped (SPEC §7 idle CPU).
      if (document.visibilityState !== "hidden") set({ nowMs: now });
    },
  };

  return actions;
});
