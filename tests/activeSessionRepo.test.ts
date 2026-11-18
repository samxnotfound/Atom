import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn(async (_sql: string, _params?: unknown[]) => undefined);
const select = vi.fn(async (_sql: string, _params?: unknown[]) => [] as unknown[]);

vi.mock("../src/data/db", () => ({
  loadDb: async () => ({ execute, select }),
}));

vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: vi.fn() } }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => undefined) }));

import { invoke } from "@tauri-apps/api/core";
import { clearActive, loadActive, upsertActive } from "../src/data/activeSessionRepo";
import type { ActiveSessionRow } from "../src/data/types";

const ROW: ActiveSessionRow = {
  id: "s1",
  category_id: "c1",
  title: "Deep work",
  mode: "countdown",
  planned_ms: 1_500_000,
  started_at: 1,
  paused_total_ms: 0,
  paused_at: null,
  last_heartbeat: 2,
  segment_index: 0,
  phase: "focus",
  break_kind: null,
};

beforeEach(() => {
  execute.mockClear();
  select.mockClear();
  vi.mocked(invoke).mockClear();
});

describe("active session persistence", () => {
  it("writes the singleton row through the Rust transaction", async () => {
    await upsertActive(ROW);
    expect(invoke).toHaveBeenCalledWith("save_active_session", { session: ROW });
    // Per-statement JS writes would allow two active rows to coexist.
    expect(execute).not.toHaveBeenCalled();
  });

  it("recovers the most recently heartbeating row from legacy duplicates", async () => {
    await loadActive();
    const sql = String(select.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("ORDER BY last_heartbeat DESC");
    expect(sql).toContain("LIMIT 1");
  });

  it("clears only the finished segment, never a newer session", async () => {
    await clearActive("finished-id");
    const [sql, params] = execute.mock.calls[0] ?? [];
    expect(String(sql)).toContain("WHERE id = $1");
    expect(params).toEqual(["finished-id"]);
  });
});
