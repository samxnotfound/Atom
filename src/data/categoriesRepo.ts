import { invoke } from "@tauri-apps/api/core";
import { loadDb } from "./db";
import type { CategoryRow } from "./types";

const DAY_MS = 24 * 3_600_000;

const DEFAULT_CATEGORIES: Array<Pick<CategoryRow, "name" | "color" | "icon">> = [
  { name: "Deep Work", color: "#2F7BFF", icon: "brain" },
  { name: "Study", color: "#6366F1", icon: "graduation-cap" },
  { name: "Reading", color: "#14B8A6", icon: "book-open" },
  { name: "Coding", color: "#A855F7", icon: "code" },
  { name: "Writing", color: "#EC4899", icon: "pen-line" },
  { name: "Fitness", color: "#22C55E", icon: "dumbbell" },
  { name: "Creative", color: "#F59E0B", icon: "palette" },
  { name: "Admin", color: "#64748B", icon: "folder" },
];

/** Seeds the 8 default categories once, on first run (SPEC §3.2). */
let seedPromise: Promise<void> | null = null;

export function ensureSeedCategories(): Promise<void> {
  // A failed first-run seed must not be cached forever: the next launch (or
  // retry) should get another chance once the database is reachable.
  seedPromise ??= seedCategories().catch((e) => {
    seedPromise = null;
    throw e;
  });
  return seedPromise;
}

/** Re-seeds after a destructive wipe; the cached first-run promise is stale. */
export function reseedDefaultCategories(): Promise<void> {
  seedPromise = seedCategories();
  return seedPromise;
}

async function seedCategories(): Promise<void> {
  const db = await loadDb();
  const rows = await db.select<{ count: number }[]>(`SELECT COUNT(*) AS count FROM categories`);
  if ((rows[0]?.count ?? 0) > 0) return;

  const now = Date.now();
  for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
    const c = DEFAULT_CATEGORIES[i];
    await db.execute(
      `INSERT INTO categories (id, name, color, icon, archived_at, sort_order, created_at)
       VALUES ($1, $2, $3, $4, NULL, $5, $6)`,
      [crypto.randomUUID(), c.name, c.color, c.icon, i, now + i * DAY_MS],
    );
  }
}

/**
 * Removes duplicate rows of the built-in seed names (e.g. from an old racing
 * seed), keeping the oldest. User-created same-name categories are untouched.
 */
export async function dedupeSeedCategories(): Promise<void> {
  const db = await loadDb();
  await db.execute(
    `DELETE FROM categories
     WHERE name IN ('Deep Work','Study','Reading','Coding','Writing','Fitness','Creative','Admin')
       AND id NOT IN (
         SELECT id FROM (
           SELECT id, ROW_NUMBER() OVER (PARTITION BY name ORDER BY created_at) AS rn
           FROM categories
           WHERE name IN ('Deep Work','Study','Reading','Coding','Writing','Fitness','Creative','Admin')
         )
         WHERE rn = 1
       )`,
  );
}

export async function listActiveCategories(): Promise<CategoryRow[]> {
  const db = await loadDb();
  return db.select<CategoryRow[]>(
    `SELECT id, name, color, icon, archived_at, sort_order, created_at
     FROM categories WHERE archived_at IS NULL ORDER BY sort_order, created_at`,
  );
}

/** Every category incl. archived — name/color resolution for history labels. */
export async function listAllCategories(): Promise<CategoryRow[]> {
  const db = await loadDb();
  return db.select<CategoryRow[]>(
    `SELECT id, name, color, icon, archived_at, sort_order, created_at
     FROM categories ORDER BY sort_order, created_at`,
  );
}

export interface NewCategory {
  name: string;
  color: string;
  icon: string | null;
}

export async function createCategory(c: NewCategory): Promise<CategoryRow> {
  const db = await loadDb();
  const row: CategoryRow = {
    id: crypto.randomUUID(),
    name: c.name,
    color: c.color,
    icon: c.icon,
    archived_at: null,
    sort_order: 999,
    created_at: Date.now(),
  };
  await db.execute(
    `INSERT INTO categories (id, name, color, icon, archived_at, sort_order, created_at)
     VALUES ($1, $2, $3, $4, NULL, $5, $6)`,
    [row.id, row.name, row.color, row.icon, row.sort_order, row.created_at],
  );
  return row;
}

export async function updateCategory(
  id: string,
  patch: Partial<Pick<CategoryRow, "name" | "color" | "icon">>,
): Promise<void> {
  const db = await loadDb();
  // Column-targeted update: a partial patch must never null out fields the
  // caller didn't provide.
  const sets: string[] = [];
  const params: unknown[] = [];
  const push = (col: string, value: unknown) => {
    sets.push(`${col} = $${params.length + 1}`);
    params.push(value);
  };
  if (patch.name !== undefined) push("name", patch.name);
  if (patch.color !== undefined) push("color", patch.color);
  if (patch.icon !== undefined) push("icon", patch.icon);
  if (sets.length === 0) return;
  params.push(id);
  await db.execute(`UPDATE categories SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
}

export async function archiveCategory(id: string): Promise<void> {
  const db = await loadDb();
  await db.execute(`UPDATE categories SET archived_at = $2 WHERE id = $1`, [id, Date.now()]);
}

export async function restoreCategory(id: string): Promise<void> {
  const db = await loadDb();
  await db.execute(`UPDATE categories SET archived_at = NULL WHERE id = $1`, [id]);
}

/**
 * Delete & reassign in one SQLite transaction (Rust-owned). The two writes
 * must be all-or-nothing: a crash between them would orphan every session in
 * the category (or delete sessions' category while they still reference it).
 */
export async function deleteCategoryAndReassign(
  id: string,
  targetId: string | null,
): Promise<void> {
  await invoke("delete_category_reassign", { categoryId: id, targetId });
}

/** Single-statement reorder (one UPDATE = atomic; no partial order on crash). */
export async function reorderCategories(orderedIds: string[]): Promise<void> {
  if (orderedIds.length === 0) return;
  const db = await loadDb();
  const cases = orderedIds.map((_, i) => `WHEN $${i * 2 + 1} THEN $${i * 2 + 2}`).join(" ");
  const ids = orderedIds.map((_, i) => `$${i * 2 + 1}`).join(", ");
  const params: unknown[] = [];
  orderedIds.forEach((id, i) => params.push(id, i));
  await db.execute(
    `UPDATE categories SET sort_order = CASE id ${cases} END WHERE id IN (${ids})`,
    params,
  );
}

export async function listArchivedCategories(): Promise<CategoryRow[]> {
  const db = await loadDb();
  return db.select<CategoryRow[]>(
    `SELECT id, name, color, icon, archived_at, sort_order, created_at
     FROM categories WHERE archived_at IS NOT NULL ORDER BY archived_at`,
  );
}

export async function countSessionsInCategory(id: string): Promise<number> {
  const db = await loadDb();
  const rows = await db.select<{ count: number }[]>(
    `SELECT COUNT(*) AS count FROM sessions WHERE category_id = $1`,
    [id],
  );
  return rows[0]?.count ?? 0;
}
