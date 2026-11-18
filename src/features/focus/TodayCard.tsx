import { useQuery } from "@tanstack/react-query";
import { Flame } from "lucide-react";
import { getTodayStats } from "../../data/sessionsRepo";
import { DEFAULT_APP_SETTINGS, getAppSettings } from "../../data/settingsRepo";
import { formatDuration } from "../../domain/durationParser";

export function TodayCard() {
  const { data: appSettings } = useQuery({
    queryKey: ["appSettings"],
    queryFn: getAppSettings,
    staleTime: Infinity,
  });
  const goalMs = appSettings?.goalMs ?? DEFAULT_APP_SETTINGS.goalMs;
  const dayStartMinutes = appSettings?.dayStartMinutes ?? DEFAULT_APP_SETTINGS.dayStartMinutes;

  const { data } = useQuery({
    queryKey: ["todayStats", dayStartMinutes],
    queryFn: () => getTodayStats(Date.now(), dayStartMinutes),
    refetchInterval: 30_000,
  });

  const totalMs = data?.totalMs ?? 0;
  const count = data?.count ?? 0;
  const progress = Math.min(1, totalMs / goalMs);
  const met = totalMs >= goalMs;

  const r = 20;
  const c = 2 * Math.PI * r;

  return (
    <div className="glass rounded-[24px] p-5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold tracking-tight text-[var(--text-muted)]">Today</p>
        <span
          className={`circle grid size-8 place-items-center ${
            met
              ? "bg-[#F59E0B]/15 text-[#F59E0B] shadow-[0_0_14px_rgba(245,158,11,0.5)]"
              : "bg-white/50 text-[var(--text-faint)]"
          }`}
          aria-label={met ? "Streak line reached" : "Streak line not reached yet"}
        >
          <Flame size={16} strokeWidth={2.2} />
        </span>
      </div>

      <div className="mt-3 flex items-center gap-4">
        <svg width="48" height="48" viewBox="0 0 48 48" className="-rotate-90" aria-hidden>
          <circle cx="24" cy="24" r={r} fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="5" />
          <circle
            cx="24"
            cy="24"
            r={r}
            fill="none"
            stroke="var(--primary-500)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - progress)}
            style={{ transition: "stroke-dashoffset 0.4s ease" }}
          />
        </svg>
        <div>
          <p className="tnum text-[24px] font-semibold tracking-tight">{formatDuration(totalMs)}</p>
          <p className="text-[12px] font-medium text-[var(--text-muted)]">
            {count === 1 ? "1 session" : `${count} sessions`} · streak line {formatDuration(goalMs)}
          </p>
        </div>
      </div>
    </div>
  );
}
