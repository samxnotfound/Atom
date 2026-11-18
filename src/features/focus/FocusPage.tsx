import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Pause, Play, Square, Trash2, MoonStar } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { DurationInput } from "./DurationInput";
import { CategoryPicker } from "./CategoryPicker";
import { TimerRing } from "./TimerRing";
import { TodayCard } from "./TodayCard";
import { POMODORO_DEFAULTS, normalizePomodoro, useTimer, type PomodoroConfig } from "./timerStore";
import { useStandby } from "../standby/standbyStore";
import {
  computeElapsed,
  computeRemaining,
  countdownProgress,
  formatElapsed,
  formatRemaining,
} from "../../domain/timer";
import { formatDuration, parseDuration } from "../../domain/durationParser";
import { getRecentTitles, updateSessionNote } from "../../data/sessionsRepo";
import { getSetting, setSetting } from "../../data/settingsRepo";
import { listActiveCategories } from "../../data/categoriesRepo";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { Segmented } from "../../ui/Segmented";
import { iconForCategory } from "../../ui/categoryIcons";

type Mode = "countdown" | "stopwatch" | "pomodoro";

const MODES: Array<{ value: Mode; label: string }> = [
  { value: "countdown", label: "Timer" },
  { value: "stopwatch", label: "Stopwatch" },
  { value: "pomodoro", label: "Pomodoro" },
];

export function FocusPage() {
  const status = useTimer((s) => s.status);
  if (status === "idle") return <IdleSetup />;
  if (status === "saved") return <SavedCardView />;
  return <ActiveSession />;
}

/* ---------------------------------- idle ---------------------------------- */

function IdleSetup() {
  const [mode, setMode] = useState<Mode>("countdown");
  const [durationText, setDurationText] = useState("25m");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [pomodoro, setPomodoro] = useState<PomodoroConfig>(POMODORO_DEFAULTS);
  const start = useTimer((s) => s.start);
  const openStandby = useStandby((s) => s.openStandby);

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: listActiveCategories,
  });

  useEffect(() => {
    void (async () => {
      const [savedPomodoro, defaultMs] = await Promise.all([
        getSetting("pomodoro", null),
        getSetting("defaultDurationMs", 25 * 60_000),
      ]);
      setPomodoro(normalizePomodoro(savedPomodoro));
      setDurationText(formatDuration(defaultMs));
    })();
  }, []);

  // Pick the first category once the list loads.
  useEffect(() => {
    setCategoryId((current) => current ?? categories[0]?.id ?? null);
  }, [categories]);

  const parsed = parseDuration(durationText);
  const durationMs = parsed.ok ? parsed.ms : null;
  const startDisabled = mode === "countdown" && durationMs === null;

  const handleStart = (enterStandby = false) => {
    if (durationMs !== null) void setSetting("defaultDurationMs", durationMs);
    start({
      mode,
      plannedMs:
        mode === "stopwatch" ? null : mode === "pomodoro" ? pomodoro.focusMs : durationMs,
      title: title.trim() || null,
      categoryId,
      pomodoro,
    });
    if (enterStandby) openStandby();
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col items-center gap-7">
        <Segmented options={MODES} value={mode} onChange={setMode} ariaLabel="Session mode" />

        {/* Constant-height slot: switching modes must not shift the layout. */}
        <div className="flex h-[108px] w-full max-w-[420px] items-center justify-center">
          {mode === "countdown" && <DurationInput value={durationText} onChange={setDurationText} />}

          {mode === "pomodoro" && (
            <PomodoroConfigRow
              config={pomodoro}
              onChange={(next) => {
                setPomodoro(next);
                void setSetting("pomodoro", next);
              }}
            />
          )}

          {mode === "stopwatch" && (
            <p className="text-center text-sm text-[var(--text-muted)]">
              Runs until you stop it — every second counts.
            </p>
          )}
        </div>

        <div className="flex w-full max-w-[420px] flex-col gap-2.5">
          <CategoryPicker value={categoryId} onChange={setCategoryId} />
          <TitleInput value={title} onChange={setTitle} />
        </div>

        <motion.button
          whileTap={{ scale: 0.94 }}
          whileHover={startDisabled ? undefined : { scale: 1.05 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          onClick={() => handleStart(false)}
          disabled={startDisabled}
          aria-label="Start focus session"
          className="circle grid size-20 place-items-center text-white disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: "var(--primary-grad)", boxShadow: "var(--glow)" }}
        >
          <Play size={30} fill="currentColor" className="ml-1" />
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.97 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          onClick={() => handleStart(true)}
          disabled={startDisabled}
          className="glass flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold text-[var(--text)] disabled:opacity-40"
        >
          <MoonStar size={15} />
          Start in Standby
        </motion.button>
      </div>

      <TodayCard />
    </div>
  );
}

function TitleInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data: recent = [] } = useQuery({
    queryKey: ["recentTitles"],
    queryFn: () => getRecentTitles(),
  });
  const listId = "recent-titles";
  return (
    <>
      <datalist id={listId}>
        {recent.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="What are you working on?"
        list={listId}
        maxLength={120}
        className="glass w-full rounded-[16px] px-4 py-2.5 text-sm outline-none placeholder:text-[var(--text-faint)] focus:shadow-[0_0_0_2px_var(--primary-400)]"
      />
    </>
  );
}

function PomodoroConfigRow({
  config,
  onChange,
}: {
  config: PomodoroConfig;
  onChange: (c: PomodoroConfig) => void;
}) {
  const minutesField = (
    label: string,
    key: "focusMs" | "shortBreakMs" | "longBreakMs",
    min: number,
    max: number,
  ) => (
    <label className="flex flex-col gap-1.5">
      <span className="flex h-5 items-end justify-center text-center text-[12px] font-medium leading-none text-[var(--text-muted)]">
        {label}
      </span>
      <input
        type="number"
        min={min}
        max={max}
        value={Math.round(config[key] / 60_000)}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isFinite(n)) return;
          onChange({ ...config, [key]: Math.min(max, Math.max(min, n)) * 60_000 });
        }}
        className="tnum glass h-9 w-full rounded-xl px-2 text-center text-[15px] font-semibold outline-none"
      />
    </label>
  );
  return (
    <div className="glass grid w-full grid-cols-5 items-end gap-2 rounded-[20px] px-4 py-4">
      {minutesField("Focus", "focusMs", 1, 180)}
      {minutesField("Short break", "shortBreakMs", 1, 30)}
      {minutesField("Long break", "longBreakMs", 1, 60)}
      <label className="flex flex-col gap-1.5">
        <span className="flex h-5 items-end justify-center text-center text-[12px] font-medium leading-none text-[var(--text-muted)]">
          Cycles
        </span>
        <input
          type="number"
          min={2}
          max={12}
          value={config.cyclesBeforeLong}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isFinite(n)) return;
            onChange({ ...config, cyclesBeforeLong: Math.min(12, Math.max(2, n)) });
          }}
          className="tnum glass h-9 w-full rounded-xl px-2 text-center text-[15px] font-semibold outline-none"
        />
      </label>
      <label className="flex cursor-pointer flex-col gap-1.5">
        <span className="flex h-5 items-end justify-center text-center text-[12px] font-medium leading-none text-[var(--text-muted)]">
          Auto-start
        </span>
        <span className="grid h-9 place-items-center">
          <input
            type="checkbox"
            checked={config.autoStartNext}
            onChange={(e) => onChange({ ...config, autoStartNext: e.target.checked })}
            className="size-5 accent-[var(--primary-500)]"
          />
        </span>
      </label>
    </div>
  );
}

/* --------------------------------- active --------------------------------- */

function ActiveSession() {
  const timer = useTimer((s) => s.timer);
  const phase = useTimer((s) => s.phase);
  const breakKind = useTimer((s) => s.breakKind);
  const nowMs = useTimer((s) => s.nowMs);
  const completedFocusSegments = useTimer((s) => s.completedFocusSegments);
  const pomodoro = useTimer((s) => s.pomodoro);
  const flash = useTimer((s) => s.flash);
  const stopDialogOpen = useTimer((s) => s.stopDialogOpen);
  const openStandby = useStandby((s) => s.openStandby);
  const { togglePause, addFiveMinutes, requestStop, resolveStop, discard, dismissFlash } =
    useTimer.getState();

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(dismissFlash, 3000);
    return () => clearTimeout(t);
  }, [flash, dismissFlash]);

  if (!timer) return null;

  const isBreak = phase === "break";
  const remaining = computeRemaining(timer, nowMs);
  const progress = countdownProgress(timer, nowMs);
  const elapsed = computeElapsed(timer, nowMs);

  return (
    <div className="flex flex-col items-center gap-6">
      {flash && (
        <div className="glass rounded-full px-4 py-1.5 text-[13px] font-medium text-[var(--text-muted)]">
          {flash}
        </div>
      )}

      <div className="flex flex-col items-center gap-2">
        {isBreak ? (
          <span className="rounded-full bg-white/60 px-3 py-1 text-[12px] font-semibold uppercase tracking-wide text-[var(--primary-600)]">
            {breakKind === "long" ? "Long break" : "Short break"}
          </span>
        ) : (
          timer.mode === "pomodoro" &&
          pomodoro && (
            <div
              className="flex gap-1.5"
              aria-label={`${completedFocusSegments} focus segments completed`}
            >
              {Array.from({ length: pomodoro.cyclesBeforeLong }).map((_, i) => (
                <span
                  key={i}
                  className={`circle size-1.5 ${
                    i < completedFocusSegments % pomodoro.cyclesBeforeLong
                      ? "bg-[var(--primary-500)]"
                      : "bg-white/70"
                  }`}
                />
              ))}
            </div>
          )
        )}
        <SessionMeta />
      </div>

      <TimerRing progress={timer.plannedMs === null ? null : progress}>
        <p className="tnum text-[56px] font-extralight tracking-tight" style={{ fontWeight: 200 }}>
          {remaining !== null ? formatRemaining(remaining) : formatElapsed(elapsed)}
        </p>
      </TimerRing>

      <div className="flex items-center gap-3">
        <ControlButton label={timer.pausedAt !== null ? "Resume" : "Pause"} onClick={togglePause}>
          {timer.pausedAt !== null ? (
            <Play size={20} fill="currentColor" className="ml-0.5" />
          ) : (
            <Pause size={20} fill="currentColor" />
          )}
        </ControlButton>
        {timer.plannedMs !== null && (
          <ControlButton label="+5 min" onClick={addFiveMinutes}>
            <span className="text-[13px] font-bold">+5m</span>
          </ControlButton>
        )}
        {!isBreak && (
          <ControlButton label="Standby" onClick={openStandby}>
            <MoonStar size={18} />
          </ControlButton>
        )}
        {isBreak ? (
          <ControlButton label="End break" onClick={discard} danger>
            <Square size={18} fill="currentColor" />
          </ControlButton>
        ) : (
          <>
            <ControlButton label="Stop & save" onClick={requestStop} danger>
              <Square size={18} fill="currentColor" />
            </ControlButton>
            <ControlButton label="Discard" onClick={() => resolveStop(false)} danger>
              <Trash2 size={18} />
            </ControlButton>
          </>
        )}
      </div>

      {!isBreak && (
        <StopDialog
          open={stopDialogOpen}
          elapsedMs={elapsed}
          onResolve={resolveStop}
        />
      )}
    </div>
  );
}

function SessionMeta() {
  const categoryId = useTimer((s) => s.categoryId);
  const title = useTimer((s) => s.title);
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: listActiveCategories,
  });
  const category = categories.find((c) => c.id === categoryId) ?? null;
  const Icon = iconForCategory(category?.icon);
  const color = category?.color ?? "#64748B";
  const name = category?.name ?? "Uncategorized";

  return (
    <div className="flex items-center gap-2 text-[13px]">
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium"
        style={{ background: `${color}1F`, color }}
      >
        <Icon size={13} />
        {name}
      </span>
      {title && <span className="max-w-[280px] truncate text-[var(--text-muted)]">{title}</span>}
    </div>
  );
}

function ControlButton({
  label,
  onClick,
  children,
  danger = false,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <motion.button
        whileTap={{ scale: 0.92 }}
        whileHover={{ scale: 1.04 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        onClick={onClick}
        aria-label={label}
        className={`glass grid size-12 place-items-center rounded-2xl text-[var(--text)] ${
          danger ? "text-[var(--danger)]" : ""
        }`}
      >
        {children}
      </motion.button>
      <span className="text-[11px] font-medium text-[var(--text-muted)]">{label}</span>
    </div>
  );
}

function StopDialog({
  open,
  elapsedMs,
  onResolve,
}: {
  open: boolean;
  elapsedMs: number;
  onResolve: (save: boolean, note?: string) => void;
}) {
  if (elapsedMs < 60_000) {
    return (
      <ConfirmDialog
        open={open}
        title="Discard this session?"
        body={`Only ${formatElapsed(elapsedMs)} focused — nothing worth saving.`}
        confirmLabel="Discard"
        cancelLabel="Save anyway"
        danger
        onConfirm={() => onResolve(false)}
        onCancel={() => onResolve(true)}
      />
    );
  }
  return (
    <ConfirmDialog
      open={open}
      title={`Save the ${formatElapsed(elapsedMs)} you focused?`}
      confirmLabel="Save"
      cancelLabel="Discard"
      onConfirm={() => onResolve(true)}
      onCancel={() => onResolve(false)}
    />
  );
}

/* ------------------------------- saved card ------------------------------- */

function SavedCardView() {
  const savedCard = useTimer((s) => s.savedCard);
  const pomodoro = useTimer((s) => s.pomodoro);
  const { dismissSavedCard, startAnother, startBreak, startNextFocusSegment } =
    useTimer.getState();
  const [note, setNote] = useState("");
  const [noteSaved, setNoteSaved] = useState(false);
  const [noteError, setNoteError] = useState(false);

  if (!savedCard) return null;
  const isBreakEnd = savedCard.phase === "break";

  const saveNote = () => {
    if (note.trim() === "") return;
    setNoteError(false);
    updateSessionNote(savedCard.id, note.trim())
      .then(() => setNoteSaved(true))
      .catch((e) => {
        console.error("Saving note failed", e);
        setNoteError(true);
      });
  };

  return (
    <div className="flex justify-center">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="glass w-full max-w-[440px] rounded-[24px] p-6 text-center"
      >
        <span className="circle mx-auto grid size-12 place-items-center bg-[var(--success)]/15 text-[var(--success)]">
          <Check size={22} strokeWidth={2.5} />
        </span>
        <h2 className="mt-3 text-[17px] font-semibold tracking-tight">
          {isBreakEnd ? "Break finished" : "Session saved"}
        </h2>
        <p className="tnum mt-1 text-[28px] font-semibold tracking-tight">
          {formatElapsed(savedCard.actualMs)}
        </p>
        {savedCard.title && (
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">{savedCard.title}</p>
        )}

        {!isBreakEnd && !noteSaved && (
          <div className="mt-4 flex gap-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveNote()}
              placeholder="Add a note…"
              maxLength={500}
              className="glass flex-1 rounded-[16px] px-3.5 py-2 text-[13px] outline-none placeholder:text-[var(--text-faint)]"
            />
            <button
              onClick={saveNote}
              disabled={note.trim() === ""}
              className="rounded-[16px] bg-white/70 px-3.5 text-[13px] font-medium shadow-sm disabled:opacity-40"
            >
              Save
            </button>
          </div>
        )}
        {noteSaved && <p className="mt-4 text-[13px] text-[var(--text-muted)]">Note saved</p>}
        {noteError && (
          <p className="mt-4 text-[13px] font-medium text-[var(--danger)]">
            Note couldn't be saved — try again
          </p>
        )}

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {isBreakEnd ? (
            <PrimaryButton onClick={startNextFocusSegment}>Start focus</PrimaryButton>
          ) : (
            <>
              {savedCard.mode === "pomodoro" && pomodoro && (
                <SecondaryButton onClick={() => startBreak(savedCard.breakKind ?? "short")}>
                  Start a break
                </SecondaryButton>
              )}
              <PrimaryButton onClick={startAnother}>Start another</PrimaryButton>
            </>
          )}
          <SecondaryButton onClick={dismissSavedCard}>Done</SecondaryButton>
        </div>
      </motion.div>
    </div>
  );
}

function PrimaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      whileHover={{ scale: 1.02 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      onClick={onClick}
      className="rounded-2xl px-4 py-2.5 text-sm font-semibold text-white"
      style={{ background: "var(--primary-grad)", boxShadow: "var(--glow)" }}
    >
      {children}
    </motion.button>
  );
}

function SecondaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      whileHover={{ scale: 1.02 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      onClick={onClick}
      className="glass rounded-2xl px-4 py-2.5 text-sm font-semibold text-[var(--text)]"
    >
      {children}
    </motion.button>
  );
}
