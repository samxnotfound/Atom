import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Timer } from "lucide-react";
import { format } from "date-fns";
import { getHistorySessions } from "../../data/sessionsRepo";
import { listAllCategories } from "../../data/categoriesRepo";
import { DEFAULT_APP_SETTINGS, getAppSettings } from "../../data/settingsRepo";
import { groupSessionsByDay } from "../../domain/sessionGrouping";
import { formatElapsed } from "../../domain/timer";
import type { SessionRow } from "../../data/types";
import { iconForCategory } from "../../ui/categoryIcons";
import { EmptyState } from "../../ui/EmptyState";
import { SessionEditDialog } from "../sessions/SessionEditDialog";
import { useNav } from "../../app/nav";

const SEARCH_DEBOUNCE_MS = 150;

export function HistoryPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [editing, setEditing] = useState<SessionRow | null>(null);

  // Debounce so every keystroke doesn't hit SQLite (§7 idle CPU).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  const settings = useQuery({
    queryKey: ["appSettings"],
    queryFn: getAppSettings,
    staleTime: Infinity,
  });
  // All categories incl. archived: history must keep showing the real
  // name/icon/color instead of a wrong "Uncategorized".
  const { data: categories = [] } = useQuery({
    queryKey: ["categoriesAll"],
    queryFn: listAllCategories,
  });
  const { data: sessions, isLoading } = useQuery({
    queryKey: ["history", debouncedSearch, categoryId],
    queryFn: () => getHistorySessions({ search: debouncedSearch, categoryId }),
  });

  const groups = sessions
    ? groupSessionsByDay(sessions, Date.now(), settings.data?.dayStartMinutes ?? DEFAULT_APP_SETTINGS.dayStartMinutes)
    : [];

  const closeEditor = () => {
    setEditing(null);
    void queryClient.invalidateQueries({ queryKey: ["history"] });
    void queryClient.invalidateQueries({ queryKey: ["todayStats"] });
    void queryClient.invalidateQueries({ queryKey: ["recentTitles"] });
    void queryClient.invalidateQueries({ queryKey: ["reportSessions"] });
  };

  return (
    <div className="mx-auto flex w-full max-w-[980px] flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="glass flex flex-1 items-center gap-2 rounded-[16px] px-3.5 py-2">
          <Search size={15} className="shrink-0 text-[var(--text-faint)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sessions…"
            aria-label="Search sessions"
            className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--text-faint)]"
          />
        </div>
        <select
          value={categoryId ?? ""}
          onChange={(e) => setCategoryId(e.target.value || null)}
          aria-label="Filter by category"
          className="glass shrink-0 rounded-[16px] px-3 py-2.5 text-[13px] font-medium outline-none"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <SkeletonList />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={Timer}
          title={search || categoryId ? "Nothing matches" : "No sessions yet"}
          body={
            search || categoryId
              ? "Try a different search or filter."
              : "Everything you track will show up here, grouped by day."
          }
          action={search || categoryId ? undefined : { label: "Start focusing", onClick: () => useNav.getState().setActive("focus") }}
        />
      ) : (
        <div className="flex flex-col">
          {groups.map((group) => (
            <section key={group.dayStart} aria-label={group.label}>
              <div className="flex items-center gap-3 py-2">
                <span className="rounded-full bg-white/75 px-3 py-1 text-[12px] font-semibold shadow-sm">
                  {group.label}
                </span>
                <span className="h-px flex-1 bg-white/50" />
                <span className="tnum rounded-full bg-white/75 px-3 py-1 text-[12px] font-semibold shadow-sm">
                  {formatElapsed(group.totalMs)}
                </span>
              </div>
              <div className="flex flex-col gap-1.5 pb-3">
                {group.sessions.map((s) => (
                  <SessionCard key={s.id} session={s} categories={categories} onClick={() => setEditing(s)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {editing && <SessionEditDialog session={editing} onClose={closeEditor} />}
    </div>
  );
}

function SessionCard({
  session,
  categories,
  onClick,
}: {
  session: SessionRow;
  categories: Array<{ id: string; name: string; color: string; icon: string | null }>;
  onClick: () => void;
}) {
  const category = categories.find((c) => c.id === session.category_id) ?? null;
  const Icon = iconForCategory(category?.icon);
  const color = category?.color ?? "#64748B";
  const name = category?.name ?? "Uncategorized";

  return (
    <button
      onClick={onClick}
      className="glass flex items-center gap-3 rounded-[20px] px-4 py-3 text-left transition-transform hover:scale-[1.005] active:scale-[0.995]"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-[14px] font-medium">
            {session.title || "Untitled session"}
          </p>
          <p className="tnum shrink-0 text-[14px] font-semibold">{formatElapsed(session.actual_ms)}</p>
        </div>
        <div className="mt-1 flex items-center gap-2 text-[12px]">
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium"
            style={{ background: `${color}1F`, color }}
          >
            <Icon size={11} />
            {name}
          </span>
          <span className="tnum text-[var(--text-muted)]">
            {format(session.started_at, "HH:mm")} – {format(session.ended_at, "HH:mm")}
          </span>
          {session.source === "manual" && (
            <span className="text-[11px] text-[var(--text-faint)]">manual</span>
          )}
        </div>
      </div>
    </button>
  );
}

function SkeletonList() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="glass h-[68px] animate-pulse rounded-[20px]" />
      ))}
    </div>
  );
}
