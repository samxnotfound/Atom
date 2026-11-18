import { loadDb } from "./db";
import type { SessionRow } from "./types";
import { composeBackup } from "./exportImport";
import { getSetting, setSetting } from "./settingsRepo";
import { ensureSeedCategories, reseedDefaultCategories } from "./categoriesRepo";
import { invoke } from "@tauri-apps/api/core";
import { addMinutes, format, startOfDay, subDays } from "date-fns";

/* --------------------------- demo data (SPEC 0.4) --------------------------- */

/** Fills ~10 weeks of plausible sessions across the seeded categories. */
export async function loadDemoData(): Promise<number> {
  const db = await loadDb();
  await ensureSeedCategories();
  const categories = await db.select<{ id: string }[]>(`SELECT id FROM categories`);
  const catIds = categories.map((c) => c.id);
  if (catIds.length === 0) return 0;

  const titles = [
    "Deep work block",
    "Reading chapter",
    "LeetCode practice",
    "Essay draft",
    "Workout",
    "Sketching",
    "Inbox & planning",
    "Course lecture",
  ];
  const weights = [0.18, 0.12, 0.14, 0.1, 0.08, 0.08, 0.1, 0.2];

  let count = 0;
  const today = startOfDay(Date.now());
  let seed = 20260101;
  const rand = () => {
    // Deterministic LCG so demo data looks the same twice.
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  for (let dayOffset = 90; dayOffset >= 0; dayOffset--) {
    const day = subDays(today, dayOffset);
    const weekday = day.getDay();
    const restDay = rand() < (weekday === 0 || weekday === 6 ? 0.45 : 0.12);
    if (restDay) continue;

    const sessionsToday = 1 + Math.floor(rand() * 3);
    let cursor = 8 * 60 + Math.floor(rand() * 60); // 8–9 AM
    for (let i = 0; i < sessionsToday; i++) {
      const minutes = 15 + Math.floor(rand() * 110);
      const start = addMinutes(day, cursor);
      const actualMs = minutes * 60_000;
      const plannedMs = rand() < 0.6 ? Math.round(minutes / 5) * 5 * 60_000 : actualMs;
      const category = pickWeighted(catIds, weights, rand);
      const row: SessionRow = {
        id: crypto.randomUUID(),
        category_id: category,
        title: rand() < 0.75 ? titles[Math.floor(rand() * titles.length)]! : null,
        note: null,
        mode: rand() < 0.3 ? "pomodoro" : rand() < 0.75 ? "countdown" : "stopwatch",
        planned_ms: plannedMs,
        actual_ms: actualMs,
        started_at: start.getTime(),
        ended_at: start.getTime() + actualMs + Math.floor(rand() * 8) * 60_000,
        completed: plannedMs !== null && actualMs >= plannedMs ? 1 : 0,
        source: rand() < 0.85 ? "timer" : "manual",
        created_at: start.getTime(),
      };
      await db.execute(
        `INSERT INTO sessions
          (id, category_id, title, note, mode, planned_ms, actual_ms,
           started_at, ended_at, completed, source, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [row.id, row.category_id, row.title, row.note, row.mode, row.planned_ms,
          row.actual_ms, row.started_at, row.ended_at, row.completed, row.source, row.created_at],
      );
      count++;
      cursor += minutes + 15 + Math.floor(rand() * 90);
      if (cursor > 22 * 60) break;
    }
  }
  return count;
}

function pickWeighted<T>(items: T[], weights: number[], rand: () => number): T {
  const roll = rand() * weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let i = 0; i < items.length; i++) {
    // Custom categories beyond the built-in eight still get demo sessions.
    acc += weights[i % weights.length] ?? 0;
    if (roll <= acc) return items[i]!;
  }
  return items[items.length - 1]!;
}

/* ------------------------------ delete all ------------------------------ */

/** Wipes every table in one transaction, then re-seeds the defaults (SPEC 5.7). */
export async function deleteAllData(): Promise<void> {
  await invoke("clear_all_data");
  // The first-run seed promise is already resolved by now, so calling
  // ensureSeedCategories() here would leave the user with zero categories.
  await reseedDefaultCategories();
}

/* ------------------------------ daily backup ------------------------------ */

/** Rolling JSON snapshot once per day; keeps the newest 14 (SPEC 3). */
export async function runDailyBackup(): Promise<void> {
  // Local calendar date, not UTC — a UTC "next day" near midnight would
  // skip a whole local day's backup (or double it).
  const todayKey = format(Date.now(), "yyyy-MM-dd");
  const last = await getSetting<string | null>("backup.lastDate", null);
  if (last === todayKey) return;
  const backup = await composeBackup();
  await invoke("write_backup", { contents: JSON.stringify(backup) });
  await setSetting("backup.lastDate", todayKey);
}
