import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { SkyBackground } from "./SkyBackground";
import { TitleBar } from "./TitleBar";
import { Dock } from "./Dock";
import { SettingsDialog } from "./SettingsDialog";
import { useNav, type Page } from "./nav";
import { FocusPage, HistoryPage, ReportsPage } from "./pages";
import { useDatabaseReady } from "../data/db";
import { DatabaseErrorState } from "./DatabaseErrorState";
import { Splash } from "./Splash";
import { RecoveryGate } from "../features/focus/RecoveryGate";
import { StandbyOverlay } from "../features/standby/StandbyOverlay";
import { useStandby } from "../features/standby/standbyStore";
import { usePrefs } from "./prefsStore";
import { useAppearance } from "./appearanceStore";
import { runDailyBackup } from "../data/dataLifecycle";
import { dedupeSeedCategories } from "../data/categoriesRepo";
import { StreakFlame } from "../features/streaks/StreakFlame";
import { useTimer } from "../features/focus/timerStore";
import { computeElapsed, computeRemaining, formatElapsed, formatRemaining } from "../domain/timer";

const PAGES_COMPONENT: Record<Page, () => JSX.Element> = {
  focus: FocusPage,
  history: HistoryPage,
  reports: ReportsPage,
};

const PAGE_TITLES: Record<Page, string> = {
  focus: "Focus",
  history: "History",
  reports: "Reports",
};

export function App() {
  const active = useNav((s) => s.active);
  const standbyOpen = useStandby((s) => s.open);
  const loadStandby = useStandby((s) => s.load);
  const status = useDatabaseReady();
  const reduceMotion = useAppearance((s) => s.settings.reduceMotion);
  const mica = useAppearance((s) => s.settings.mica);

  useEffect(() => {
    if (status === "ready") {
      void dedupeSeedCategories().catch(() => undefined);
      void loadStandby();
      void usePrefs.getState().load();
      void useAppearance.getState().load();
      void runDailyBackup().catch(() => undefined);
    }
  }, [status, loadStandby]);

  if (status === "loading") return <Splash />;
  if (status === "error") return <DatabaseErrorState />;

  const Page = PAGES_COMPONENT[active];

  return (
    <MotionConfig reducedMotion={reduceMotion ? "always" : "never"}>
      <div className="flex h-full flex-col">
        {!mica && <SkyBackground />}
      <TitleBar />
      <main className="relative flex-1 overflow-y-auto px-8 pb-36 pt-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="mx-auto max-w-[1100px]"
          >
            <div className="flex items-center justify-between gap-4">
              <h1 className="text-[28px] font-semibold tracking-tight">{PAGE_TITLES[active]}</h1>
              {active === "focus" && <StreakFlame />}
            </div>
            <div
              className={`mt-6 flex min-h-[420px] ${
                active === "focus" ? "items-center justify-center" : "items-start"
              }`}
            >
              <Page />
            </div>
          </motion.div>
        </AnimatePresence>
      </main>
      <Dock />
      <SettingsDialog />
      <RecoveryGate />
      <AnimatePresence>{standbyOpen && <StandbyOverlay key="standby" />}</AnimatePresence>
      <SpaceShortcut />
      <CloseGuard />
      <WindowTitle />
      </div>
    </MotionConfig>
  );
}

/** Space pauses/resumes the running session, app-wide, when no field is focused. */
function SpaceShortcut() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.tagName === "BUTTON" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.code !== "Space") return;
      // A modal owns the keyboard while open (typed confirm, stop prompt…).
      // Standby is a non-modal dialog and keeps Space working.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const s = useTimer.getState();
      if (s.status !== "running" && s.status !== "paused") return;
      e.preventDefault();
      s.togglePause();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}

/** Confirm-on-close while a session runs (SPEC §5.7). */
function CloseGuard() {
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    void win.onCloseRequested((event) => {
      const status = useTimer.getState().status;
      const { confirmClose } = usePrefs.getState().prefs;
      if (!confirmClose || (status !== "running" && status !== "paused")) return;
      event.preventDefault();
      setPending(true);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  const keepRunning = () => setPending(false);
  const endAndSave = () => {
    setPending(false);
    // The save must finish before the window tears down; on failure the
    // active row survives for recovery on next launch.
    void useTimer.getState().resolveStop(true).then(() => getCurrentWindow().destroy());
  };

  if (!pending) return null;
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-[#0E1726]/25 backdrop-blur-[2px]">
      <div role="dialog" aria-modal="true" className="glass w-[400px] rounded-[24px] p-6">
        <p className="text-[15px] font-semibold tracking-tight">Session still running</p>
        <p className="mt-1.5 text-sm text-[var(--text-muted)]">
          End and save the session, or keep it running?
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={keepRunning}
            className="rounded-2xl bg-white/70 px-4 py-2 text-sm font-medium shadow-sm"
          >
            Keep running
          </button>
          <button
            onClick={endAndSave}
            className="rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm"
            style={{ background: "var(--primary-grad)", boxShadow: "var(--glow)" }}
          >
            End &amp; save
          </button>
        </div>
      </div>
    </div>
  );
}

/** Window title mirrors the session (SPEC §5.1). */
function WindowTitle() {
  const status = useTimer((s) => s.status);
  const timer = useTimer((s) => s.timer);
  const nowMs = useTimer((s) => s.nowMs);
  const lastTitle = useRef<string | null>(null);

  const title =
    (status === "running" || status === "paused") && timer
      ? `${status === "paused" ? "Paused · " : ""}${
          timer.plannedMs !== null
            ? formatRemaining(computeRemaining(timer, nowMs) ?? 0)
            : formatElapsed(computeElapsed(timer, nowMs))
        } · Atom`
      : "Atom";

  useEffect(() => {
    // The store ticks at 250 ms but the title string only changes once per
    // second — skip the redundant native calls between changes.
    if (lastTitle.current === title) return;
    lastTitle.current = title;
    void getCurrentWindow().setTitle(title);
  }, [title]);
  return null;
}
