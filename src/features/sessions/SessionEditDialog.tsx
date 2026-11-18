import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Trash2, X } from "lucide-react";
import {
  deleteSession,
  insertSession,
  updateSession,
} from "../../data/sessionsRepo";
import type { SessionRow } from "../../data/types";
import { CategoryPicker } from "../focus/CategoryPicker";
import { formatDuration, parseDuration } from "../../domain/durationParser";
import { formatElapsed } from "../../domain/timer";
import { TypedConfirmDialog } from "../../ui/TypedConfirmDialog";

interface SessionEditDialogProps {
  /** null → create a manual entry; row → edit it. */
  session: SessionRow | null;
  /** For creation: optional prefill of the start time (UTC ms). */
  presetStart?: number;
  onClose: () => void;
}

const pad = (n: number) => String(n).padStart(2, "0");

function toLocalInputValues(ms: number) {
  const d = new Date(ms);
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function fromLocalInputs(date: string, time: string): number | null {
  const ms = new Date(`${date}T${time}:00`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function SessionEditDialog({ session, presetStart, onClose }: SessionEditDialogProps) {
  const creating = session === null;
  const initial = useMemo(() => {
    const start = session ? session.started_at : (presetStart ?? Date.now());
    return {
      ...toLocalInputValues(start),
      durationText: formatDuration(session?.actual_ms ?? 30 * 60_000),
      title: session?.title ?? "",
      note: session?.note ?? "",
      categoryId: session?.category_id ?? null,
    };
  }, [session, presetStart]);

  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [durationText, setDurationText] = useState(initial.durationText);
  const [title, setTitle] = useState(initial.title);
  const [note, setNote] = useState(initial.note);
  const [categoryId, setCategoryId] = useState<string | null>(initial.categoryId);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset fields whenever a different session opens.
  useEffect(() => {
    setDate(initial.date);
    setTime(initial.time);
    setDurationText(initial.durationText);
    setTitle(initial.title);
    setNote(initial.note);
    setCategoryId(initial.categoryId);
    setConfirmingDelete(false);
    setSaving(false);
    setError(null);
  }, [initial]);

  const parsed = parseDuration(durationText);
  const startedAt = fromLocalInputs(date, time);
  const inFuture =
    startedAt !== null && parsed.ok && startedAt + parsed.ms > Date.now() + 60_000;
  const valid = parsed.ok && startedAt !== null && !inFuture;

  const save = () => {
    if (!valid || startedAt === null || saving) return;
    setSaving(true);
    setError(null);
    const duration = parsed.ok ? parsed.ms : 0;
    const endedAt = startedAt + duration;
    const values = {
      title: title.trim() || null,
      note: note.trim() || null,
      category_id: categoryId,
      started_at: startedAt,
      ended_at: endedAt,
      actual_ms: duration,
    };
    const done = creating
      ? insertSession({
          id: crypto.randomUUID(),
          ...values,
          mode: "countdown",
          planned_ms: duration,
          completed: true,
          source: "manual",
        })
      : updateSession(session!.id, values);
    void done.then(onClose).catch((e) => {
      console.error("Saving session failed", e);
      setSaving(false);
      setError("Couldn't save this session. Please try again.");
    });
  };

  return (
    <>
      <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-[#0E1726]/25 backdrop-blur-[2px]" />
          <Dialog.Content className="glass fixed left-1/2 top-1/2 z-50 w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-[24px] p-6">
            <Dialog.Title className="text-[15px] font-semibold tracking-tight">
              {creating ? "Add session" : "Edit session"}
            </Dialog.Title>
            <Dialog.Description className="sr-only">
              {creating ? "Add a manual session" : "Edit the session"}
            </Dialog.Description>
            <Dialog.Close asChild>
              <button
                aria-label="Close"
                onClick={onClose}
                className="absolute right-4 top-4 grid size-7 place-items-center rounded-lg text-[var(--text-muted)] hover:bg-black/5"
              >
                <X size={14} />
              </button>
            </Dialog.Close>

            <div className="mt-4 flex flex-col gap-3">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What did you work on?"
                maxLength={120}
                className="w-full rounded-[16px] border border-[var(--surface-border)] bg-white/70 px-3.5 py-2 text-sm outline-none focus:border-[var(--primary-400)]"
              />
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  aria-label="Date"
                  className="tnum flex-1 rounded-xl border border-[var(--surface-border)] bg-white/70 px-2.5 py-2 text-[13px] outline-none focus:border-[var(--primary-400)]"
                />
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  aria-label="Start time"
                  className="tnum flex-1 rounded-xl border border-[var(--surface-border)] bg-white/70 px-2.5 py-2 text-[13px] outline-none focus:border-[var(--primary-400)]"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={durationText}
                  onChange={(e) => setDurationText(e.target.value)}
                  aria-label="Duration"
                  inputMode="decimal"
                  placeholder="45m"
                  className="tnum flex-1 rounded-xl border border-[var(--surface-border)] bg-white/70 px-2.5 py-2 text-[13px] outline-none focus:border-[var(--primary-400)] placeholder:text-[var(--text-faint)]"
                />
                <span className="text-[12px] text-[var(--text-muted)]">
                  {parsed.ok
                    ? formatElapsed(parsed.ms)
                    : "1 min – 12 h"}
                </span>
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note (optional)"
                rows={2}
                maxLength={500}
                className="resize-none rounded-[16px] border border-[var(--surface-border)] bg-white/70 px-3.5 py-2 text-[13px] outline-none focus:border-[var(--primary-400)]"
              />
              <CategoryPicker value={categoryId} onChange={setCategoryId} />
              {inFuture && (
                <p className="text-xs text-[var(--danger)]">Sessions can't end in the future.</p>
              )}
              {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
            </div>

            <div className="mt-5 flex items-center justify-between">
              {!creating ? (
                <button
                  onClick={() => setConfirmingDelete(true)}
                  aria-label="Delete session"
                  className="grid size-9 place-items-center rounded-xl text-[var(--danger)] transition-colors hover:bg-[var(--danger)]/10"
                >
                  <Trash2 size={16} />
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="rounded-2xl px-4 py-2 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={!valid || saving}
                  className="rounded-2xl bg-[image:var(--primary-grad)] px-4 py-2 text-sm font-semibold text-white shadow-[var(--glow)] disabled:opacity-40"
                >
                  {saving ? "Saving…" : creating ? "Add" : "Save"}
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <TypedConfirmDialog
        open={confirmingDelete}
        title="Delete this session permanently?"
        body={`${formatElapsed(session?.actual_ms ?? 0)} of tracked focus will be removed for good.`}
        keyword="DELETE"
        confirmLabel="Delete forever"
        danger
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() => {
          if (!session) return;
          void deleteSession(session.id)
            .then(onClose)
            .catch((e) => {
              console.error("Deleting session failed", e);
              setConfirmingDelete(false);
              setError("Couldn't delete this session. Please try again.");
            });
        }}
      />
    </>
  );
}
