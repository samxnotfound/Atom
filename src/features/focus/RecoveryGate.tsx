import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { History } from "lucide-react";
import { ensureSeedCategories } from "../../data/categoriesRepo";
import { loadActive } from "../../data/activeSessionRepo";
import { getSetting } from "../../data/settingsRepo";
import type { ActiveSessionRow } from "../../data/types";
import { normalizePomodoro, useTimer, type PomodoroConfig } from "./timerStore";
import { computeElapsed, excludeDowntime, formatElapsed, recoveryEndAt } from "../../domain/timer";

/**
 * Runs once after the DB is ready: seeds default categories on first run,
 * then offers recovery of a persisted session after a crash (SPEC §3).
 */
export function RecoveryGate() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<ActiveSessionRow | null>(null);
  const [pomodoro, setPomodoro] = useState<PomodoroConfig | null>(null);
  const { rehydrate, resolveStop } = useTimer.getState();

  useEffect(() => {
    void (async () => {
      await ensureSeedCategories();
      void queryClient.invalidateQueries({ queryKey: ["categories"] });
      const [row, storedPomodoro] = await Promise.all([
        loadActive(),
        getSetting<unknown>("pomodoro", null),
      ]);
      setPomodoro(normalizePomodoro(storedPomodoro));
      if (row) setPending(row);
    })();
  }, [queryClient]);

  if (!pending) return null;

  const now = Date.now();
  const elapsed = computeElapsed(
    excludeDowntime(
      {
        mode: pending.mode,
        plannedMs: pending.planned_ms,
        startedAt: pending.started_at,
        pausedTotalMs: pending.paused_total_ms,
        pausedAt: pending.paused_at,
      },
      pending.last_heartbeat,
      now,
    ),
    now,
  );
  const wasPaused = pending.paused_at !== null;

  const resume = () => {
    rehydrate(pending, pomodoro);
    setPending(null);
  };

  const save = () => {
    const endedAt = recoveryEndAt(pending.started_at, pending.paused_at, pending.last_heartbeat);
    rehydrate(pending, pomodoro);
    void resolveStop(true, undefined, endedAt);
    setPending(null);
  };

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-[#0E1726]/25 backdrop-blur-[2px]">
      <div className="glass w-[400px] rounded-[24px] p-6 text-center" role="alertdialog" aria-label="Recover session">
        <span className="circle mx-auto grid size-12 place-items-center bg-[var(--primary-500)]/12 text-[var(--primary-500)]">
          <History size={22} />
        </span>
        <h2 className="mt-3 text-[17px] font-semibold tracking-tight">Unfinished session</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {wasPaused ? "Paused at" : "Tracked so far"}{" "}
          <span className="tnum font-semibold text-[var(--text)]">{formatElapsed(elapsed)}</span>
          {pending.title ? ` · ${pending.title}` : ""}
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <button
            onClick={save}
            className="glass rounded-2xl px-4 py-2.5 text-sm font-semibold text-[var(--text)]"
          >
            Save what was tracked
          </button>
          <button
            onClick={resume}
            className="rounded-2xl px-4 py-2.5 text-sm font-semibold text-white"
            style={{ background: "var(--primary-grad)", boxShadow: "var(--glow)" }}
          >
            Resume
          </button>
        </div>
      </div>
    </div>
  );
}
