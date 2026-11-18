import { QueryClient } from "@tanstack/react-query";

/**
 * One client for the app, exported so non-component code (the timer store)
 * can invalidate reads after a session is actually written to SQLite.
 * Invalidating on the UI's "saved" state alone races the insert and leaves
 * Today/Reports showing stale totals.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      // Local SQLite reads: no refetch storms on window focus (§7 idle CPU);
      // mutations invalidate explicitly where needed.
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

const SESSION_QUERY_KEYS = [
  "todayStats",
  "reportSessions",
  "history",
  "recentTitles",
] as const;

/** Call after any committed session write/delete. */
export function invalidateSessionData(): void {
  for (const queryKey of SESSION_QUERY_KEYS) {
    void queryClient.invalidateQueries({ queryKey: [queryKey] });
  }
}
