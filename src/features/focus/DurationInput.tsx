import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import {
  formatDuration,
  MIN_DURATION_MS,
  MAX_DURATION_MS,
  nudgeDuration,
  parseDuration,
} from "../../domain/durationParser";

const CHIPS = ["15m", "25m", "45m", "60m", "90m", "2h"] as const;

interface DurationInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function DurationInput({ value, onChange }: DurationInputProps) {
  const parsed = useMemo(() => parseDuration(value), [value]);
  const valid = parsed.ok ? parsed.ms : null;
  const chipMs = useMemo(() => new Map(CHIPS.map((c) => [c, parseDuration(c)])), []);

  // Re-render each minute so "Ends at" never shows a stale clock time, and
  // resync immediately when the typed duration changes (otherwise a value
  // entered 50 s after the last tick previews a minute in the past).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (valid === null) return;
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [value, valid]);

  const endsAt = valid !== null ? format(now + valid, "h:mm a") : null;
  const showError = value.trim() !== "" && !parsed.ok;

  const nudge = (delta: number) => {
    const base = parsed.ok ? parsed.ms : 25 * 60_000;
    onChange(formatDuration(nudgeDuration(base, delta)));
  };

  return (
    <div className="flex flex-col items-center">
      <div
        className={`glass flex w-full max-w-[300px] items-center gap-1 rounded-[20px] py-1.5 pl-4 pr-1.5 transition-shadow ${
          showError ? "shadow-[0_0_0_2px_var(--danger)]" : ""
        }`}
      >
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="25m"
          inputMode="decimal"
          aria-label="Focus duration"
          aria-invalid={showError}
          className="tnum w-full bg-transparent text-center text-[26px] font-semibold tracking-tight outline-none placeholder:text-[var(--text-faint)]"
        />
        <div className="flex shrink-0 flex-col">
          <button
            onClick={() => nudge(1)}
            aria-label="Add 5 minutes"
            className="grid size-6 place-items-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-white/70 hover:text-[var(--text)]"
          >
            <ChevronUp size={14} />
          </button>
          <button
            onClick={() => nudge(-1)}
            aria-label="Subtract 5 minutes"
            className="grid size-6 place-items-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-white/70 hover:text-[var(--text)]"
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>

      <p aria-live="polite" className="mt-2 h-5 text-[13px] font-medium text-[var(--text-muted)]">
        {showError ? (
          <span className="text-[var(--danger)]">{parsed.reason}</span>
        ) : endsAt ? (
          <>Ends at {endsAt}</>
        ) : (
          <>
            {MIN_DURATION_MS / 60_000} min – {MAX_DURATION_MS / 3_600_000} h · bare numbers = minutes
          </>
        )}
      </p>

      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {CHIPS.map((chip) => {
          const p = chipMs.get(chip);
          const active = p?.ok && valid === p.ms;
          return (
            <button
              key={chip}
              onClick={() => onChange(chip)}
              aria-pressed={!!active}
              className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition-all ${
                active
                  ? "bg-[image:var(--primary-grad)] text-white shadow-[var(--glow)]"
                  : "glass text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              {chip}
            </button>
          );
        })}
      </div>
    </div>
  );
}
