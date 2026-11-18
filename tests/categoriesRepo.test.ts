import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn(async (_sql: string, _params?: unknown[]) => undefined);
const select = vi.fn(async (_sql: string, _params?: unknown[]) => [] as unknown[]);

vi.mock("../src/data/db", () => ({
  loadDb: async () => ({ execute, select }),
}));

vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: vi.fn() } }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => undefined) }));

import { invoke } from "@tauri-apps/api/core";
import { deleteCategoryAndReassign } from "../src/data/categoriesRepo";

beforeEach(() => {
  execute.mockClear();
  vi.mocked(invoke).mockClear();
});

describe("delete & reassign", () => {
  it("is one Rust-owned transaction, never two JS statements", async () => {
    await deleteCategoryAndReassign("cat-1", "cat-2");
    expect(invoke).toHaveBeenCalledWith("delete_category_reassign", {
      categoryId: "cat-1",
      targetId: "cat-2",
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("maps Uncategorized to a null target", async () => {
    await deleteCategoryAndReassign("cat-1", null);
    expect(invoke).toHaveBeenCalledWith("delete_category_reassign", {
      categoryId: "cat-1",
      targetId: null,
    });
  });
});
