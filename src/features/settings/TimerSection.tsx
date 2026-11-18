import { useEffect, useState, type ReactNode } from "react";
import * as Switch from "@radix-ui/react-switch";
import * as Slider from "@radix-ui/react-slider";
import { POMODORO_DEFAULTS, normalizePomodoro, type PomodoroConfig } from "../focus/timerStore";
import { usePrefs } from "../../app/prefsStore";
import { getSetting, setSetting } from "../../data/settingsRepo";
import { formatDuration } from "../../domain/durationParser";

/** Settings → Timer (SPEC §5.7): default duration, Pomodoro, chime, notify. */
export function TimerSection() {
  const prefs = usePrefs((s) => s.prefs);
  const updatePrefs = usePrefs((s) => s.update);
  const [defaultMin, setDefaultMin] = useState(25);
  const [pomodoro, setPomodoro] = useState<PomodoroConfig>(POMODORO_DEFAULTS);

  useEffect(() => {
    void (async () => {
      const [ms, pomo] = await Promise.all([
        getSetting<number>("defaultDurationMs", 25 * 60_000),
        getSetting("pomodoro", null),
      ]);
      setDefaultMin(Math.round(ms / 60_000));
      setPomodoro(normalizePomodoro(pomo));
    })();
  }, []);

  const minutesField = (
    label: string,
    key: "focusMs" | "shortBreakMs" | "longBreakMs",
    min: number,
    max: number,
  ) => (
    <label className="flex flex-col gap-1.5">
      <span className="flex h-5 items-end justify-center text-center text-[11px] font-medium leading-none text-[var(--text-muted)]">
        {label}
      </span>
      <input
        type="number"
        min={min}
        max={max}
        value={Math.round(pomodoro[key] / 60_000)}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isFinite(n)) return;
          const next = { ...pomodoro, [key]: Math.min(max, Math.max(min, n)) * 60_000 };
          setPomodoro(next);
          void setSetting("pomodoro", next);
        }}
        className="tnum glass h-9 w-full rounded-xl px-2 text-center text-[15px] font-semibold outline-none"
      />
    </label>
  );

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto pr-1">
      <Field label="Default duration" hint="Pre-filled on the Focus page.">
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={720}
            value={defaultMin}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (!Number.isFinite(n)) return;
              setDefaultMin(n);
            }}
            onBlur={() => {
              const clamped = Math.min(720, Math.max(1, Math.round(defaultMin)));
              setDefaultMin(clamped);
              void setSetting("defaultDurationMs", clamped * 60_000);
            }}
            aria-label="Default duration in minutes"
            className="tnum w-20 rounded-xl border border-[var(--surface-border)] bg-white/80 px-3 py-2 text-[13px] outline-none focus:border-[var(--primary-400)]"
          />
          <span className="text-[13px] text-[var(--text-muted)]">min</span>
          <span className="tnum ml-auto text-[12px] font-medium text-[var(--text-muted)]">
            = {formatDuration(defaultMin * 60_000)}
          </span>
        </div>
      </Field>

      <Field label="Pomodoro" hint="Focus, break lengths and cycles.">
        <div className="glass grid w-full grid-cols-5 items-end gap-2 rounded-[16px] px-4 py-3">
          {minutesField("Focus", "focusMs", 1, 180)}
          {minutesField("Short break", "shortBreakMs", 1, 30)}
          {minutesField("Long break", "longBreakMs", 1, 60)}
          <label className="flex flex-col gap-1.5">
            <span className="flex h-5 items-end justify-center text-center text-[11px] font-medium leading-none text-[var(--text-muted)]">
              Cycles
            </span>
            <input
              type="number"
              min={2}
              max={12}
              value={pomodoro.cyclesBeforeLong}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isFinite(n)) return;
                const next = { ...pomodoro, cyclesBeforeLong: Math.min(12, Math.max(2, n)) };
                setPomodoro(next);
                void setSetting("pomodoro", next);
              }}
              className="tnum glass h-9 w-full rounded-xl px-2 text-center text-[15px] font-semibold outline-none"
            />
          </label>
          <label className="flex cursor-pointer flex-col gap-1.5">
            <span className="flex h-5 items-end justify-center text-center text-[11px] font-medium leading-none text-[var(--text-muted)]">
              Auto-start
            </span>
            <span className="grid h-9 place-items-center">
              <input
                type="checkbox"
                checked={pomodoro.autoStartNext}
                onChange={(e) => {
                  const next = { ...pomodoro, autoStartNext: e.target.checked };
                  setPomodoro(next);
                  void setSetting("pomodoro", next);
                }}
                className="size-5 accent-[var(--primary-500)]"
              />
            </span>
          </label>
        </div>
      </Field>

      <Field label="Completion chime" hint="Soft tone when a focus segment or break ends.">
        <div className="flex items-center gap-4">
          <Switch.Root
            checked={prefs.chime}
            onCheckedChange={(v) => updatePrefs({ chime: v })}
            aria-label="Completion chime"
            className="relative h-6 w-11 rounded-full bg-[var(--primary-500)]/25 data-[state=checked]:bg-[image:var(--primary-grad)] transition-colors"
          >
            <Switch.Thumb className="circle block size-4 translate-x-1 bg-white shadow transition-transform data-[state=checked]:translate-x-6" />
          </Switch.Root>
          {prefs.chime && (
            <div className="flex flex-1 items-center gap-3">
              <span className="text-[12px] text-[var(--text-muted)]">Volume</span>
              <Slider.Root
                className="relative flex h-5 flex-1 touch-none items-center"
                value={[prefs.chimeVolume]}
                min={0}
                max={1}
                step={0.05}
                onValueChange={([v]) => updatePrefs({ chimeVolume: v })}
                aria-label="Chime volume"
              >
                <Slider.Track className="relative h-1 w-full rounded-full bg-[var(--primary-500)]/20">
                  <Slider.Range className="absolute h-full rounded-full bg-[image:var(--primary-grad)]" />
                </Slider.Track>
                <Slider.Thumb className="circle block size-4 bg-white shadow-md" />
              </Slider.Root>
              <span className="tnum w-8 text-right text-[12px] font-medium text-[var(--text-muted)]">
                {Math.round(prefs.chimeVolume * 100)}%
              </span>
            </div>
          )}
        </div>
      </Field>

      <Field label="Notifications" hint="Native notification when a session ends and Atom is not focused.">
        <Switch.Root
          checked={prefs.notify}
          onCheckedChange={(v) => updatePrefs({ notify: v })}
          aria-label="Completion notifications"
          className="relative h-6 w-11 rounded-full bg-[var(--primary-500)]/25 data-[state=checked]:bg-[image:var(--primary-grad)] transition-colors"
        >
          <Switch.Thumb className="circle block size-4 translate-x-1 bg-white shadow transition-transform data-[state=checked]:translate-x-6" />
        </Switch.Root>
      </Field>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white/45 p-3.5">
      <p className="text-[13px] font-semibold">{label}</p>
      <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">{hint}</p>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}
