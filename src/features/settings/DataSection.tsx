import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import {
  FileJson, FileSpreadsheet, FolderOpen, Import, Sparkles, Trash2,
} from "lucide-react";
import { exportCsv, exportJson, pickBackup, applyImport, snapshotBeforeImport, type ImportPreview } from "../../data/exportImport";
import { loadDemoData, deleteAllData } from "../../data/dataLifecycle";
import { getHistorySessions } from "../../data/sessionsRepo";
import { listActiveCategories, listArchivedCategories } from "../../data/categoriesRepo";
import { TypedConfirmDialog } from "../../ui/TypedConfirmDialog";

/** Settings → Data (SPEC §5.7): export, import, backups, demo, delete. */
export function DataSection() {
  const queryClient = useQueryClient();
  const [backupName, setBackupName] = useState<string | null>(null);
  const [pending, setPending] = useState<{ raw: string; preview: ImportPreview } | null>(null);
  const [typedOpen, setTypedOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    void invoke<string | null>("latest_backup").then(setBackupName).catch(() => setBackupName(null));
  }, []);

  const { data: categories = [] } = useQuery({
    queryKey: ["exportCategories"],
    queryFn: async () => {
      const [active, archived] = await Promise.all([listActiveCategories(), listArchivedCategories()]);
      return [...active, ...archived];
    },
  });

  const nameFor = (id: string | null) =>
    categories.find((c) => c.id === id)?.name ?? "Uncategorized";

  const exportAllCsv = async () => {
    setStatus(null);
    try {
      const rows = await getHistorySessions({ limit: 1_000_000 });
      const ok = await exportCsv(rows, nameFor);
      setStatus(ok ? "CSV exported" : "Export cancelled");
    } catch (e) {
      console.error("CSV export failed", e);
      setStatus("CSV export failed");
    }
  };

  const doImport = async (mode: "merge" | "replace") => {
    if (!pending) return;
    try {
      // Replace destroys the current data set: snapshot it first so the
      // rolling backup always holds a restorable copy (SPEC 3).
      if (mode === "replace") await snapshotBeforeImport();
      await applyImport(pending.raw, mode);
      setPending(null);
      queryClient.clear();
      setStatus(mode === "merge" ? "Imported (merged)" : "Imported (replaced)");
    } catch (e) {
      console.error("Import failed", e);
      setStatus(e instanceof Error ? e.message : "Import failed");
    }
  };

  const demo = async () => {
    try {
      const n = await loadDemoData();
      queryClient.clear();
      setStatus(`${n} demo sessions added`);
    } catch (e) {
      console.error("Demo data failed", e);
      setStatus("Demo data failed");
    }
  };

  const wipe = async () => {
    try {
      await deleteAllData();
      setTypedOpen(false);
      queryClient.clear();
      setStatus("All data deleted");
    } catch (e) {
      console.error("Delete all failed", e);
      setStatus("Delete all failed");
    }
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto pr-1">
      <Field label="Export">
        <div className="flex flex-wrap gap-2">
          <DataButton icon={FileSpreadsheet} onClick={() => void exportAllCsv()}>
            CSV (all sessions)
          </DataButton>
          <DataButton
            icon={FileJson}
            onClick={async () => {
              setStatus((await exportJson()) ? "JSON backup exported" : "Export cancelled");
            }}
          >
            JSON backup
          </DataButton>
          <p className="w-full text-[12px] text-[var(--text-muted)]">
            PDF export lives in Reports → Download.
          </p>
        </div>
      </Field>

      <Field label="Import" hint="Full JSON backup. Merge keeps existing data; Replace wipes first.">
        <div className="flex flex-wrap gap-2">
          <DataButton
            icon={Import}
            onClick={async () => {
              try {
                const picked = await pickBackup();
                if (picked) setPending(picked);
              } catch (e) {
                setStatus(e instanceof Error ? e.message : "Invalid backup file");
              }
            }}
          >
            Choose backup…
          </DataButton>
        </div>
      </Field>

      <Field label="Backups" hint="Rolling daily snapshot, newest 14 kept in the data folder.">
        <div className="flex flex-wrap items-center gap-2">
          <DataButton
            icon={FolderOpen}
            onClick={async () => {
              const path = await invoke<string>("db_path");
              await openPath(path).catch(() => undefined);
            }}
          >
            Open data folder
          </DataButton>
          <span className="text-[12px] text-[var(--text-muted)]">
            {backupName ? `Last backup: ${backupName}` : "No backup yet — runs once daily."}
          </span>
        </div>
      </Field>

      <Field label="Demo data" hint="~10 weeks of plausible sessions. Additive to what exists.">
        <DataButton icon={Sparkles} onClick={() => void demo()}>
          Load demo data
        </DataButton>
      </Field>

      <Field label="Delete all data" hint="Wipes sessions, categories, settings and streaks.">
        <DataButton icon={Trash2} danger onClick={() => setTypedOpen(true)}>
          Delete all data…
        </DataButton>
      </Field>

      {status && (
        <p className="rounded-xl bg-white/60 px-3 py-2 text-[12px] font-medium text-[var(--text-muted)]">
          {status}
        </p>
      )}

      {pending && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-[#0E1726]/25 backdrop-blur-[2px]">
        <div
          role="dialog"
          aria-modal="true"
          className="glass w-[380px] rounded-[24px] p-6"
        >
            <p className="text-[15px] font-semibold tracking-tight">Import this backup?</p>
            <p className="mt-1.5 text-sm text-[var(--text-muted)]">
              {pending.preview.sessions.toLocaleString()} sessions,{" "}
              {pending.preview.categories.toLocaleString()} categories
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                onClick={() => setPending(null)}
                className="rounded-2xl bg-white/70 px-4 py-2 text-sm font-medium shadow-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => void doImport("merge")}
                className="rounded-2xl bg-white/70 px-4 py-2 text-sm font-medium shadow-sm"
              >
                Merge
              </button>
              <button
                onClick={() => void doImport("replace")}
                className="rounded-2xl bg-[var(--danger)] px-4 py-2 text-sm font-semibold text-white shadow-sm"
              >
                Replace everything
              </button>
            </div>
          </div>
        </div>
      )}

      <TypedConfirmDialog
        open={typedOpen}
        title="Delete all data?"
        body="Every session, category, setting and streak will be permanently destroyed. This cannot be undone."
        keyword="DELETE"
        confirmLabel="Delete everything"
        danger
        onConfirm={() => void wipe()}
        onCancel={() => setTypedOpen(false)}
      />
    </div>
  );
}

function DataButton({
  icon: Icon,
  onClick,
  children,
  danger = false,
}: {
  icon: typeof FileJson;
  onClick: () => void | Promise<void>;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      onClick={() => void onClick()}
      className={`flex items-center gap-2 rounded-xl bg-white/80 px-3.5 py-2 text-[13px] font-semibold shadow-sm transition hover:bg-white ${
        danger ? "text-[var(--danger)]" : ""
      }`}
    >
      <Icon size={15} />
      {children}
    </button>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white/45 p-3.5">
      <p className="text-[13px] font-semibold">{label}</p>
      {hint && <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">{hint}</p>}
      <div className="mt-2.5">{children}</div>
    </div>
  );
}
