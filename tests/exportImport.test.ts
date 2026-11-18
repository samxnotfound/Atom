import { describe, expect, it, vi, beforeEach } from "vitest";

const execute = vi.fn(async () => undefined);

vi.mock("../src/data/db", () => ({
  loadDb: async () => ({
    select: vi.fn(async (sql: string) => {
      if (sql.includes("FROM categories")) return [CAT];
      if (sql.includes("FROM sessions")) return [SESSION];
      if (sql.includes("FROM settings")) return [{ key: "goalMs", value: "3600000" }];
      return [{ date: "2026-01-01", used_at: 1 }];
    }),
    execute,
  }),
}));

vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: vi.fn() } }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => "C:\\tmp\\out.txt") }));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn(async () => "C:\\tmp\\out.json"),
  open: vi.fn(async () => "C:\\tmp\\in.json"),
}));

import { invoke } from "@tauri-apps/api/core";
import { composeBackup, validateBackup, applyImport, sessionsToCsv } from "../src/data/exportImport";
import type { CategoryRow, SessionRow } from "../src/data/types";

const CAT: CategoryRow = {
  id: "c1",
  name: "Work",
  color: "#2F7BFF",
  icon: null,
  archived_at: null,
  sort_order: 0,
  created_at: 1,
};
const SESSION: SessionRow = {
  id: "s1",
  category_id: "c1",
  title: 'Deep "work"',
  note: "a,b",
  mode: "countdown",
  planned_ms: 3600_000,
  actual_ms: 3500_000,
  started_at: 1,
  ended_at: 2,
  completed: 1,
  source: "timer",
  created_at: 1,
};

beforeEach(() => {
  execute.mockClear();
  vi.mocked(invoke).mockClear();
});

describe("export/import round trip (SPEC §9)", () => {
  it("compose → JSON → validate is lossless", async () => {
    const backup = await composeBackup();
    const raw = JSON.stringify(backup);
    expect(validateBackup(raw)).toEqual(backup);
  });

  it("applyImport delegates the whole import to the Rust transaction", async () => {
    const backup = await composeBackup();
    const raw = JSON.stringify(backup);

    await applyImport(raw, "merge");
    expect(invoke).toHaveBeenCalledWith("apply_import", {
      contents: raw,
      replace: false,
    });

    await applyImport(raw, "replace");
    expect(invoke).toHaveBeenLastCalledWith("apply_import", {
      contents: raw,
      replace: true,
    });
    // Atomicity lives in one Rust-owned SQLite transaction, never in
    // per-statement JS executes (the plugin pool is not transactional).
    expect(execute).not.toHaveBeenCalled();
  });

  it("CSV escapes quotes, commas and newlines", () => {
    const csv = sessionsToCsv([SESSION], () => "Work");
    const lines = csv.split("\n");
    expect(lines[0]).toBe("date,start,end,duration_min,category,title,note,mode,completed");
    expect(lines[1]).toContain('"Deep ""work"""');
    expect(lines[1]).toContain('"a,b"');
  });
});
