import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { DEFAULT_APP_SETTINGS, getAppSettings } from "../../data/settingsRepo";
import { getSessionsSliceSince } from "../../data/sessionsRepo";
import { listActiveCategories, listAllCategories } from "../../data/categoriesRepo";
import {
  buildHeatmap,
  computeDailyTotals,
  computeReport,
  rangeBounds,
  type RangeBounds,
} from "../../domain/analytics";
import { computeStreakStats } from "../../domain/streaks";
import { useReports } from "./reportsStore";

/** Filter id for sessions without a category (reportsStore stores raw ids). */
export const UNCAT_FILTER_ID = "__uncat";

export function useReportData() {
  const { range, anchorMs, customStart, customEnd, categoryIds } = useReports();

  const settings = useQuery({
    queryKey: ["appSettings"],
    queryFn: getAppSettings,
    staleTime: Infinity,
  });

  const sessions = useQuery({
    queryKey: ["reportSessions"],
    queryFn: () => getSessionsSliceSince(0),
  });

  // All categories incl. archived: archived rows still own their sessions'
  // names and colors in reports (nothing becomes "Uncategorized" by surprise).
  const categories = useQuery({
    queryKey: ["categoriesAll"],
    queryFn: listAllCategories,
  });

  const activeCategories = useQuery({
    queryKey: ["categories"],
    queryFn: listActiveCategories,
  });

  const s = settings.data ?? DEFAULT_APP_SETTINGS;

  const bounds: RangeBounds = useMemo(
    () => rangeBounds(range, anchorMs ?? Date.now(), { ...s, customStart, customEnd }),
    [range, anchorMs, customStart, customEnd, s.dayStartMinutes, s.weekStartsOn, sessions.data],
  );

  const filtered = useMemo(() => {
    const all = sessions.data ?? [];
    if (categoryIds.length === 0) return all;
    const wantUncat = categoryIds.includes(UNCAT_FILTER_ID);
    const catSet = new Set(categoryIds.filter((c) => c !== UNCAT_FILTER_ID));
    return all.filter(
      (x) => (x.category_id === null ? wantUncat : catSet.has(x.category_id)),
    );
  }, [sessions.data, categoryIds]);

  const report = useMemo(
    () => computeReport(filtered, bounds, { categories: categories.data ?? [], dayStartMinutes: s.dayStartMinutes }),
    [filtered, bounds, categories.data, s.dayStartMinutes],
  );

  const dailyTotals = useMemo(
    () => computeDailyTotals(sessions.data ?? [], s.dayStartMinutes),
    [sessions.data, s.dayStartMinutes],
  );

  // Single streak source of truth for Reports and the Focus header flame.
  const streak = useMemo(
    () =>
      computeStreakStats(dailyTotals, Date.now(), {
        goalMs: s.goalMs,
        dayStartMinutes: s.dayStartMinutes,
        weekStartsOn: s.weekStartsOn,
      }),
    [dailyTotals, s.goalMs, s.dayStartMinutes, s.weekStartsOn],
  );

  const heatmap = useMemo(
    () =>
      buildHeatmap(dailyTotals, Date.now(), {
        weekStartsOn: s.weekStartsOn,
        dayStartMinutes: s.dayStartMinutes,
        goalMs: s.goalMs,
      }),
    [dailyTotals, s.weekStartsOn, s.dayStartMinutes, s.goalMs],
  );

  return {
    loading: sessions.isLoading || categories.isLoading,
    hasAnySessions: (sessions.data ?? []).length > 0,
    settings: s,
    bounds,
    report,
    heatmap,
    streakDays: streak.current,
    longestStreak: streak.longest,
    frozenKeys: streak.frozenDays,
    categories: activeCategories.data ?? [],
    // Chart legends/colors must resolve archived categories too.
    allCategories: categories.data ?? [],
  };
}
