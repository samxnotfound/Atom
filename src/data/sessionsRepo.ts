import { loadDb } from "./db";
import type { NewSession, SessionRow, SessionSlice } from "./types";
import { localDayBounds } from "../domain/timeMath";
import { summarizeRange } from "../domain/analytics";

/**
 * Idempotent save: recovery re-writes the same session id after a crash
 * between insert and clearActive (SPEC 5.3 data safety). Re-saving must
 * upsert, never fail on the primary key and drop the session.
 */
export async function insertSession(s: NewSession): Promise<void> {
  const db = await loadDb();
  await db.execute(
    `INSERT INTO sessions
      (id, category_id, title, note, mode, planned_ms, actual_ms,
       started_at, ended_at, completed, source, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT(id) DO UPDATE SET
       category_id = excluded.category_id,
       title = excluded.title,
       note = excluded.note,
       mode = excluded.mode,
       planned_ms = excluded.planned_ms,
       actual_ms = excluded.actual_ms,
       started_at = excluded.started_at,
       ended_at = excluded.ended_at,
       completed = excluded.completed,
       source = excluded.source,
       created_at = excluded.created_at`,
    [
      s.id,
      s.category_id,
      s.title,
      s.note,
      s.mode,
      s.planned_ms,
      s.actual_ms,
      s.started_at,
      s.ended_at,
      s.completed ? 1 : 0,
      s.source,
      s.ended_at,
    ],
  );
}

export interface TodayStats {
  totalMs: number;
  count: number;
}

/**
 * Focus time of the logical day [start, end). Sessions overlapping the
 * window count — one started yesterday that ends inside today belongs to
 * today. Focus time is clamped to the window, so a cross-boundary session
 * contributes only its share, never its whole actual_ms to both days.
 */
export async function getTodayStats(now: number, dayStartMinutes = 240): Promise<TodayStats> {
  const db = await loadDb();
  const { start, end } = localDayBounds(now, dayStartMinutes);
  const rows = await db.select<
    Pick<SessionSlice, "started_at" | "ended_at" | "actual_ms">[]
  >(
    `SELECT started_at, ended_at, actual_ms
     FROM sessions
     WHERE started_at < $2 AND ended_at > $1`,
    [start, end],
  );
  return summarizeRange(rows, start, end);
}

export async function getRecentTitles(limit = 8): Promise<string[]> {
  const db = await loadDb();
  const rows = await db.select<{ title: string }[]>(
    `SELECT DISTINCT title FROM sessions
     WHERE title IS NOT NULL AND title != ''
     ORDER BY started_at DESC LIMIT $1`,
    [limit],
  );
  return rows.map((r) => r.title);
}

export async function updateSessionNote(id: string, note: string): Promise<void> {
  const db = await loadDb();
  await db.execute(`UPDATE sessions SET note = $2 WHERE id = $1`, [id, note]);
}

export interface HistoryFilter {
  search?: string;
  categoryId?: string | null; // null = all
  limit?: number;
}

export async function getHistorySessions(filter: HistoryFilter = {}): Promise<SessionRow[]> {
  const db = await loadDb();
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filter.search && filter.search.trim() !== "") {
    const like = `%${filter.search.trim().replace(/[%_]/g, "\\$&")}%`;
    clauses.push(`(title LIKE $${params.length + 1} ESCAPE '\\' OR note LIKE $${params.length + 1} ESCAPE '\\')`);
    params.push(like);
  }
  if (filter.categoryId) {
    clauses.push(`category_id = $${params.length + 1}`);
    params.push(filter.categoryId);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = filter.limit ?? 2000;

  return db.select<SessionRow[]>(
    `SELECT id, category_id, title, note, mode, planned_ms, actual_ms,
            started_at, ended_at, completed, source, created_at
     FROM sessions ${where}
     ORDER BY started_at DESC
     LIMIT $${params.length + 1}`,
    [...params, limit],
  );
}

export interface SessionPatch {
  title?: string | null;
  note?: string | null;
  category_id?: string | null;
  started_at?: number;
  ended_at?: number;
  actual_ms?: number;
  planned_ms?: number | null;
  completed?: boolean;
}

export async function updateSession(id: string, patch: SessionPatch): Promise<void> {
  const db = await loadDb();
  const sets: string[] = [];
  const params: unknown[] = [];
  const push = (col: string, value: unknown) => {
    sets.push(`${col} = $${params.length + 1}`);
    params.push(value);
  };

  if (patch.title !== undefined) push("title", patch.title);
  if (patch.note !== undefined) push("note", patch.note);
  if (patch.category_id !== undefined) push("category_id", patch.category_id);
  if (patch.started_at !== undefined) push("started_at", patch.started_at);
  if (patch.ended_at !== undefined) push("ended_at", patch.ended_at);
  if (patch.actual_ms !== undefined) push("actual_ms", patch.actual_ms);
  if (patch.planned_ms !== undefined) push("planned_ms", patch.planned_ms);
  if (patch.completed !== undefined) push("completed", patch.completed ? 1 : 0);

  params.push(id);
  await db.execute(`UPDATE sessions SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
}

export async function deleteSession(id: string): Promise<void> {
  const db = await loadDb();
  await db.execute(`DELETE FROM sessions WHERE id = $1`, [id]);
}

/** Minimal projection for analytics aggregation (SPEC §5.5). */
export async function getSessionsSliceSince(sinceTs: number): Promise<SessionSlice[]> {
  const db = await loadDb();
  return db.select<SessionSlice[]>(
    `SELECT id, category_id, started_at, ended_at, actual_ms, planned_ms, completed
     FROM sessions WHERE started_at >= $1 ORDER BY started_at`,
    [sinceTs],
  );
}
