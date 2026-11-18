import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { DEFAULT_APP_SETTINGS, getAppSettings } from "../../data/settingsRepo";
import { getSessionsSliceSince } from "../../data/sessionsRepo";
import { buildHeatmap, computeDailyTotals } from "../../domain/analytics";
import { computeStreakStats } from "../../domain/streaks";

/** Streak stats derived from stored sessions + goal settings. */
export function useStreakData() {
  const settings = useQuery({
    queryKey: ["appSettings"],
    queryFn: getAppSettings,
    staleTime: Infinity,
  });
  const sessions = useQuery({
    queryKey: ["reportSessions"],
    queryFn: () => getSessionsSliceSince(0),
  });

  const s = settings.data ?? DEFAULT_APP_SETTINGS;

  const daily = useMemo(
    () => computeDailyTotals(sessions.data ?? [], s.dayStartMinutes),
    [sessions.data, s.dayStartMinutes],
  );

  const stats = useMemo(
    () =>
      computeStreakStats(daily, Date.now(), {
        goalMs: s.goalMs,
        dayStartMinutes: s.dayStartMinutes,
        weekStartsOn: s.weekStartsOn,
      }),
    [daily, s.dayStartMinutes, s.goalMs, s.weekStartsOn],
  );

  const heat = useMemo(
    () =>
      buildHeatmap(daily, Date.now(), {
        weekStartsOn: s.weekStartsOn,
        dayStartMinutes: s.dayStartMinutes,
        goalMs: s.goalMs,
      }),
    [daily, s.weekStartsOn, s.dayStartMinutes, s.goalMs],
  );

  return {
    stats,
    heat,
    settings: s,
    loading: sessions.isLoading || settings.isLoading,
    hasAnySessions: (sessions.data ?? []).length > 0,
  };
}
