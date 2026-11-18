import { loadDb } from "./db";
import type { CategoryRow, SessionRow } from "./types";
import { save as saveDialog, open as openDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { format } from "date-fns";

export const BACKUP_SCHEMA_VERSION = 1;

export interface BackupFile {
  schemaVersion: number;
  exportedAt: number;
  categories: CategoryRow[];
  sessions: SessionRow[];
  settings: Record<string, string>;
  freezes: { date: string; used_at: number }[];
}

/* ------------------------------ compose ------------------------------ */

export async function composeBackup(): Promise<BackupFile> {
  const db = await loadDb();
  const [categories, sessions, settingsRows, freezes] = await Promise.all([
    db.select<CategoryRow[]>(
      `SELECT id, name, color, icon, archived_at, sort_order, created_at FROM categories`,
    ),
    db.select<SessionRow[]>(
      `SELECT id, category_id, title, note, mode, planned_ms, actual_ms,
              started_at, ended_at, completed, source, created_at FROM sessions`,
    ),
    db.select<{ key: string; value: string }[]>(`SELECT key, value FROM settings`),
    db.select<{ date: string; used_at: number }[]>(
      `SELECT date, used_at FROM streak_freezes`,
    ),
  ]);
  const settings: Record<string, string> = {};
  for (const { key, value } of settingsRows) settings[key] = value;
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: Date.now(),
    categories,
    sessions,
    settings,
    freezes,
  };
}

/* ------------------------------ export ------------------------------ */

/**
 * CSV cell: quote when needed and neutralize spreadsheet formula injection
 * (=, +, -, @, tab at cell start) — a note like "=SUM(A1)" must stay text.
 */
function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function sessionsToCsv(
  sessions: SessionRow[],
  categoryName: (id: string | null) => string,
): string {
  const header = "date,start,end,duration_min,category,title,note,mode,completed";
  const lines = sessions.map((s) => {
    // ISO-style local timestamps: unambiguous, locale-independent (§5.8).
    const date = format(new Date(s.started_at), "yyyy-MM-dd");
    const start = format(new Date(s.started_at), "HH:mm");
    const end = format(new Date(s.ended_at), "HH:mm");
    return [
      csvCell(date),
      csvCell(start),
      csvCell(end),
      Math.round(s.actual_ms / 60_000),
      csvCell(categoryName(s.category_id)),
      csvCell(s.title),
      csvCell(s.note),
      csvCell(s.mode),
      s.completed ? "yes" : "no",
    ].join(",");
  });
  return [header, ...lines].join("\n");
}

async function saveAs(defaultName: string, extensions: string[]): Promise<string | null> {
  return saveDialog({ defaultPath: defaultName, filters: [{ name: extensions[0], extensions }] });
}

/** CSV export; pass filtered sessions, or everything (SPEC 5.8). */
export async function exportCsv(
  sessions: SessionRow[],
  categoryName: (id: string | null) => string,
): Promise<boolean> {
  const path = await saveAs("atom-sessions.csv", ["csv"]);
  if (!path) return false;
  // UTF-8 BOM so Excel reads the UTF-8 text correctly.
  await invoke("write_text_file", {
    path,
    contents: "\uFEFF" + sessionsToCsv(sessions, categoryName),
  });
  return true;
}

export async function exportJson(): Promise<boolean> {
  const backup = await composeBackup();
  const path = await saveAs("atom-backup.json", ["json"]);
  if (!path) return false;
  await invoke("write_text_file", { path, contents: JSON.stringify(backup, null, 2) });
  return true;
}

/* ------------------------------ import ------------------------------ */

export interface ImportPreview {
  sessions: number;
  categories: number;
  freezes: number;
}

export function validateBackup(raw: string): BackupFile {
  const parsed = JSON.parse(raw) as Partial<BackupFile>;
  if (parsed.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new Error(`Unsupported schema version: ${String(parsed.schemaVersion)}`);
  }
  if (!Array.isArray(parsed.sessions) || !Array.isArray(parsed.categories)) {
    throw new Error("Not an Atom backup file");
  }
  return {
    schemaVersion: parsed.schemaVersion,
    exportedAt: parsed.exportedAt ?? 0,
    categories: parsed.categories,
    sessions: parsed.sessions,
    settings: parsed.settings ?? {},
    freezes: parsed.freezes ?? [],
  };
}

/** Opens the file dialog, reads and validates; returns raw + counts. */
export async function pickBackup(): Promise<{
  raw: string;
  preview: ImportPreview;
} | null> {
  const picked = await openDialog({
    multiple: false,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!picked || Array.isArray(picked)) return null;
  const raw = await invoke<string>("read_text_file", { path: picked });
  const backup = validateBackup(raw);
  return {
    raw,
    preview: {
      sessions: backup.sessions.length,
      categories: backup.categories.length,
      freezes: backup.freezes.length,
    },
  };
}

/**
 * Rolling-file snapshot taken before a destructive import (SPEC 3 data
 * safety): Replace mode always leaves a restorable copy on disk first.
 */
export async function snapshotBeforeImport(): Promise<void> {
  const backup = await composeBackup();
  await invoke("write_backup", { contents: JSON.stringify(backup) });
}

/**
 * Applies the backup through the Rust command — one SQLite transaction owns
 * every statement, so an interrupted import can never half-wipe the DB.
 * (BEGIN/COMMIT from the JS pool is not atomic: the pool may hand each
 * statement to a different connection.)
 */
export async function applyImport(
  raw: string,
  mode: "merge" | "replace",
): Promise<void> {
  validateBackup(raw);
  await invoke("apply_import", { contents: raw, replace: mode === "replace" });
}

/* ------------------------------ PDF ------------------------------ */

export interface PdfKpi {
  label: string;
  value: string;
}

export interface PdfBucket {
  label: string;
  ms: number;
}

export interface PdfCategoryRow {
  name: string;
  color: string;
  ms: number;
  count: number;
}

/**
 * Reports-view PDF (SPEC 5.8): KPIs, bucket bar chart, category table.
 * Bars are drawn directly from the analytics buckets — no screenshot dep.
 */
export async function exportReportPdf(options: {
  rangeLabel: string;
  kpis: PdfKpi[];
  buckets: PdfBucket[];
  categories: PdfCategoryRow[];
}): Promise<boolean> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  let y = 64;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Atom — Focus report", 48, y);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  y += 20;
  doc.setTextColor(90, 107, 132);
  doc.text(options.rangeLabel, 48, y);
  doc.setTextColor(14, 23, 38);

  // KPI block
  y += 34;
  const kpiW = 118;
  options.kpis.forEach((kpi, i) => {
    const x = 48 + (i % 5) * kpiW;
    const row = Math.floor(i / 5);
    const ky = y + row * 44;
    doc.setFontSize(8);
    doc.setTextColor(90, 107, 132);
    doc.text(kpi.label.toUpperCase(), x, ky);
    doc.setFontSize(12);
    doc.setTextColor(14, 23, 38);
    doc.text(kpi.value, x, ky + 15);
  });
  y += Math.ceil(options.kpis.length / 5) * 44 + 18;

  // Bar chart from buckets
  const chartLeft = 48;
  const chartWidth = 495;
  const chartHeight = 150;
  const max = Math.max(1, ...options.buckets.map((b) => b.ms));
  const bw = chartWidth / Math.max(1, options.buckets.length);
  const barW = Math.min(34, bw * 0.62);

  doc.setDrawColor(224, 234, 246);
  doc.setFillColor(238, 246, 255);
  for (let i = 0; i < options.buckets.length; i++) {
    const b = options.buckets[i]!;
    const h = (b.ms / max) * (chartHeight - 8);
    const x = chartLeft + i * bw + (bw - barW) / 2;
    doc.rect(chartLeft, y, chartWidth, chartHeight, "S"); // frame
    if (h > 1) {
      doc.setFillColor(47, 123, 255);
      doc.roundedRect(x, y + chartHeight - 8 - h, barW, h, 4, 3, "F");
    }
    doc.setFontSize(7);
    doc.setTextColor(120, 135, 155);
    if (options.buckets.length <= 16 || i % Math.ceil(options.buckets.length / 12) === 0) {
      doc.text(b.label, chartLeft + i * bw + bw / 2, y + chartHeight + 12, { align: "center" });
    }
  }
  y += chartHeight + 34;

  // Category table
  doc.setFontSize(12);
  doc.setTextColor(14, 23, 38);
  doc.text("Categories", 48, y);
  y += 18;
  doc.setFontSize(9);
  const cols = [
    { label: "Category", x: 60 },
    { label: "Time", x: 320 },
    { label: "Sessions", x: 420 },
    { label: "Share", x: 500 },
  ];
  doc.setTextColor(120, 135, 155);
  cols.forEach((c) => doc.text(c.label.toUpperCase(), c.x, y));
  y += 14;
  const totalMs = options.categories.reduce((a, c) => a + c.ms, 0) || 1;
  options.categories.forEach((c) => {
    doc.setFillColor(c.color);
    doc.circle(52, y - 3, 3, "F");
    doc.setTextColor(14, 23, 38);
    doc.text(c.name.slice(0, 28), cols[0]!.x + 14, y);
    doc.text(formatHm(c.ms), cols[1]!.x, y);
    doc.text(String(c.count), cols[2]!.x, y);
    doc.text(`${Math.round((c.ms / totalMs) * 100)}%`, cols[3]!.x, y);
    y += 16;
  });

  const path = await saveAs("atom-report.pdf", ["pdf"]);
  if (!path) return false;
  const b64 = doc.output("datauristring").split(",")[1] ?? "";
  await invoke("write_bytes_file", { path, base64: b64 });
  return true;
}

function formatHm(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.round((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
