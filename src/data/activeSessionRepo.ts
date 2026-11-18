import { invoke } from "@tauri-apps/api/core";
import { loadDb } from "./db";
import type { ActiveSessionRow } from "./types";

const COLS = `id, category_id, title, mode, planned_ms, started_at,
  paused_total_ms, paused_at, last_heartbeat, segment_index, phase, break_kind`;

/**
 * The active session is a singleton. The Rust command deletes any previous
 * row and inserts this one in a single transaction: an upsert keyed by id
 * would leave a finished pomodoro segment (old id) next to the new one, and
 * crash recovery would then pick an arbitrary row.
 */
export async function upsertActive(s: ActiveSessionRow): Promise<void> {
  await invoke("save_active_session", { session: s });
}

export async function heartbeatActive(id: string, now: number): Promise<void> {
  const db = await loadDb();
  await db.execute(`UPDATE active_session SET last_heartbeat = $2 WHERE id = $1`, [id, now]);
}

/** Clear one session's row by id; omitting the id clears every row. */
export async function clearActive(id?: string): Promise<void> {
  const db = await loadDb();
  if (id === undefined) {
    await db.execute(`DELETE FROM active_session`);
    return;
  }
  // Id-scoped: a deferred delete from the previous segment must never remove
  // the newly started session's row.
  await db.execute(`DELETE FROM active_session WHERE id = $1`, [id]);
}

export async function loadActive(): Promise<ActiveSessionRow | null> {
  const db = await loadDb();
  // Legacy databases may hold more than one row; the newest heartbeat is the
  // session that was actually running when the app stopped.
  const rows = await db.select<ActiveSessionRow[]>(
    `SELECT ${COLS} FROM active_session ORDER BY last_heartbeat DESC LIMIT 1`,
  );
  return rows[0] ?? null;
}
