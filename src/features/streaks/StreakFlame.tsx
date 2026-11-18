import { Flame } from "lucide-react";
import { formatDuration } from "../../domain/durationParser";
import { useStreakData } from "./useStreakData";

/**
 * Focus header flame (§5.6): glows warm once today's goal is met, dims to
 * "at risk" in the evening when the streak is alive but today is short.
 */
export function StreakFlame() {
  const { stats, settings } = useStreakData();
  const atRisk = !stats.todayActive && stats.current > 0 && new Date().getHours() >= 18;

  const title = stats.todayActive
    ? "Today's goal reached — your streak is safe."
    : stats.current > 0
      ? `${formatDuration(settings.goalMs - stats.todayMs)} more today keeps your streak alive.`
      : `Focus ${formatDuration(settings.goalMs)} today to start a streak.`;

  return (
    <span
      title={title}
      aria-label={title}
      className={`glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] ${
        stats.todayActive
          ? "font-semibold text-[#B45309]"
          : atRisk
            ? "font-semibold text-[var(--text-muted)]"
            : "font-medium text-[var(--text-faint)]"
      }`}
      style={
        stats.todayActive ? { boxShadow: "0 0 18px rgba(245,158,11,0.35)" } : undefined
      }
    >
      <Flame
        size={14}
        strokeWidth={2.2}
        className={
          stats.todayActive
            ? "text-[#F59E0B]"
            : atRisk
              ? "text-[#B45309]/70"
              : "text-[var(--text-faint)]"
        }
      />
      <span className="tnum">{stats.current}</span>
      <span>{stats.current === 1 ? "day" : "days"}</span>
    </span>
  );
}
