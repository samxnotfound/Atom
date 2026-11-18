import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DEFAULT_APP_SETTINGS, getAppSettings, setSetting } from "../../data/settingsRepo";
import { formatDuration } from "../../domain/durationParser";
import { Segmented } from "../../ui/Segmented";

const MIN_THRESHOLD_MIN = 5;
const MAX_THRESHOLD_MIN = 480;

const WEEK_OPTIONS = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
] as const;

/** Goals: streak threshold, week start, day boundary (SPEC §5.6, §5.7). */
export function GoalsSection() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["appSettings"],
    queryFn: getAppSettings,
    staleTime: Infinity,
  });
  const settings = data ?? DEFAULT_APP_SETTINGS;

  const [threshold, setThreshold] = useState(String(Math.round(settings.goalMs / 60_000)));

  useEffect(() => {
    setThreshold(String(Math.round(settings.goalMs / 60_000)));
  }, [settings.goalMs]);

  const save = async (key: string, value: unknown) => {
    await setSetting(key, value);
    await queryClient.invalidateQueries({ queryKey: ["appSettings"] });
  };

  const commitThreshold = () => {
    const n = Number(threshold);
    const minutes = Number.isFinite(n)
      ? Math.min(MAX_THRESHOLD_MIN, Math.max(MIN_THRESHOLD_MIN, Math.round(n)))
      : Math.round(settings.goalMs / 60_000);
    setThreshold(String(minutes));
    void save("goals.streakThresholdMs", minutes * 60_000);
  };

  const hh = String(Math.floor(settings.dayStartMinutes / 60)).padStart(2, "0");
  const mm = String(settings.dayStartMinutes % 60).padStart(2, "0");

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto pr-1">
      <Field
        label="Streak threshold"
        hint="A day counts toward your streak when total focus time reaches this."
      >
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={MIN_THRESHOLD_MIN}
            max={MAX_THRESHOLD_MIN}
            step={5}
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            onBlur={commitThreshold}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            aria-label="Streak threshold in minutes"
            className="tnum w-20 rounded-xl border border-[var(--surface-border)] bg-white/80 px-3 py-2 text-[13px] outline-none focus:border-[var(--primary-400)]"
          />
          <span className="text-[13px] text-[var(--text-muted)]">min</span>
          <span className="tnum ml-auto text-[12px] font-medium text-[var(--text-muted)]">
            = {formatDuration(settings.goalMs)}
          </span>
        </div>
      </Field>

      <Field label="Week starts on" hint="Used by reports, the week strip and the heatmap.">
        <Segmented
          options={WEEK_OPTIONS}
          value={String(settings.weekStartsOn)}
          onChange={(v) => void save("goals.weekStart", Number(v) as 0 | 1)}
          ariaLabel="Week start"
        />
      </Field>

      <Field
        label="Day starts at"
        hint="Late-night sessions before this time count toward the previous day."
      >
        <input
          type="time"
          value={`${hh}:${mm}`}
          onChange={(e) => {
            const [h, m] = e.target.value.split(":").map(Number);
            if (Number.isFinite(h) && Number.isFinite(m)) {
              void save("goals.dayStartMinutes", h * 60 + m);
            }
          }}
          aria-label="Day start time"
          className="tnum rounded-xl border border-[var(--surface-border)] bg-white/80 px-3 py-2 text-[13px] outline-none focus:border-[var(--primary-400)]"
        />
      </Field>
    </div>
  );
}

function Field({
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
