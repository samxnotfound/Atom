import { loadDb } from "./db";

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const db = await loadDb();
  const rows = await db.select<{ value: string }[]>(
    `SELECT value FROM settings WHERE key = $1`,
    [key],
  );
  const raw = rows[0]?.value;
  if (raw === undefined) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const db = await loadDb();
  await db.execute(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = $2`,
    [key, JSON.stringify(value)],
  );
}

/** Goal/day-boundary settings shared by Focus, Reports and Streaks. */
export interface AppSettings {
  dayStartMinutes: number;
  weekStartsOn: 0 | 1;
  goalMs: number;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  dayStartMinutes: 240, // 4:00 AM
  weekStartsOn: 0,
  goalMs: 3_600_000, // 1 hour streak line
};

export async function getAppSettings(): Promise<AppSettings> {
  return {
    dayStartMinutes: await getSetting<number>("goals.dayStartMinutes", DEFAULT_APP_SETTINGS.dayStartMinutes),
    weekStartsOn: await getSetting<0 | 1>("goals.weekStart", DEFAULT_APP_SETTINGS.weekStartsOn),
    goalMs: await getSetting<number>("goals.streakThresholdMs", DEFAULT_APP_SETTINGS.goalMs),
  };
}
