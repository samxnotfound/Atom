import { loadDb } from "./db";
import type { StandbyImageRow } from "./types";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";

/** Bundled images dropped into /public/standby/ before building (SPEC 5.2). */
const bundledGlob = import.meta.glob<string>("/standby/*.{jpg,jpeg,png,webp,avif}", {
  query: "?url",
  import: "default",
  eager: true,
});

const BUNDLED_URLS = new Map<string, string>(
  Object.entries(bundledGlob).map(([key, url]) => [key.replace("/standby/", ""), url]),
);

export interface ResolvedStandbyImage {
  id: string;
  file_name: string;
  source: "bundled" | "user";
  luminance: number | null;
  /** Loadable URL for <img> and canvas sampling. */
  url: string;
}

let userDirCache: string | null = null;

async function userDir(): Promise<string> {
  if (userDirCache === null) {
    userDirCache = await invoke<string>("standby_user_dir");
  }
  return userDirCache;
}

async function userUrl(fileName: string): Promise<string> {
  return convertFileSrc(`${await userDir()}\\${fileName}`);
}

function toResolved(row: StandbyImageRow, url: string): ResolvedStandbyImage {
  return {
    id: row.id,
    file_name: row.file_name,
    source: row.source,
    luminance: row.luminance,
    url,
  };
}

/**
 * All images available for Standby, with bundled files synced into the DB so
 * luminance/shuffle metadata lives in one place. Bundled rows whose file is no
 * longer in /public/standby are dropped; user rows are managed by add/remove.
 */
export async function listStandbyImages(): Promise<ResolvedStandbyImage[]> {
  const db = await loadDb();
  const rows = await db.select<StandbyImageRow[]>(
    `SELECT id, file_name, source, luminance, added_at FROM standby_images ORDER BY added_at`,
  );

  const bundledUrls = BUNDLED_URLS;

  // Sync bundled files in.
  const missing = [...bundledUrls.keys()].filter(
    (name) => !rows.some((r) => r.source === "bundled" && r.file_name === name),
  );
  if (missing.length > 0) {
    for (const name of missing) {
      await db.execute(
        `INSERT INTO standby_images (id, file_name, source, luminance, added_at)
         VALUES ($1, $2, 'bundled', NULL, $3)`,
        [crypto.randomUUID(), name, Date.now()],
      );
    }
  }

  // Drop bundled rows whose file disappeared; drop user rows whose copy is gone
  // (checked lazily: URL load failure is handled by the overlay instead).
  const staleBundled = rows.filter(
    (r) => r.source === "bundled" && !bundledUrls.has(r.file_name),
  );
  for (const r of staleBundled) {
    await db.execute(`DELETE FROM standby_images WHERE id = $1`, [r.id]);
  }

  const fresh =
    staleBundled.length > 0 || missing.length > 0
      ? await db.select<StandbyImageRow[]>(
          `SELECT id, file_name, source, luminance, added_at FROM standby_images ORDER BY added_at`,
        )
      : rows;

  const resolved: ResolvedStandbyImage[] = [];
  for (const row of fresh) {
    const url =
      row.source === "bundled"
        ? (bundledUrls.get(row.file_name) ?? null)
        : await userUrl(row.file_name).catch(() => null);
    if (url !== null) resolved.push(toResolved(row, url));
  }
  return resolved;
}

/** Copies picked files into %APPDATA%/Atom/standby and registers rows. */
export async function addStandbyImages(paths: string[]): Promise<number> {
  const copied = await invoke<string[]>("standby_add_images", { paths });
  const db = await loadDb();
  for (const name of copied) {
    await db.execute(
      `INSERT INTO standby_images (id, file_name, source, luminance, added_at)
       VALUES ($1, $2, 'user', NULL, $3)`,
      [crypto.randomUUID(), name, Date.now()],
    );
  }
  return copied.length;
}

/** Deletes only the copied file, never the original (SPEC 5.2). */
export async function removeStandbyImage(id: string, fileName: string): Promise<void> {
  await invoke("standby_remove_image", { fileName });
  const db = await loadDb();
  await db.execute(`DELETE FROM standby_images WHERE id = $1`, [id]);
}

export async function setLuminance(id: string, luminance: number): Promise<void> {
  const db = await loadDb();
  await db.execute(`UPDATE standby_images SET luminance = $2 WHERE id = $1`, [id, luminance]);
}
