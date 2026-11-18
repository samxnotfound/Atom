import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";

interface TypedConfirmDialogProps {
  open: boolean;
  title: string;
  body?: string;
  /** The exact word the user must type to enable the confirm button. */
  keyword: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

/** Confirmation that requires typing a keyword (e.g. "DELETE") — for
 * permanently destroying session data (SPEC §3.2). */
export function TypedConfirmDialog({
  open,
  title,
  body,
  keyword,
  confirmLabel,
  onConfirm,
  onCancel,
  danger = false,
}: TypedConfirmDialogProps) {
  const [text, setText] = useState("");
  const matches = text.trim().toLowerCase() === keyword.toLowerCase();

  // Stale typed text from a previous open must never pre-arm the button.
  useEffect(() => {
    if (open) setText("");
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[#0E1726]/25 backdrop-blur-[2px]" />
        <Dialog.Content className="glass fixed left-1/2 top-1/2 z-50 w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-[24px] p-6">
          <Dialog.Title className="text-[15px] font-semibold tracking-tight">{title}</Dialog.Title>
          {body && (
            <Dialog.Description className="mt-1.5 text-sm text-[var(--text-muted)]">
              {body}
            </Dialog.Description>
          )}
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && matches) onConfirm();
            }}
            placeholder={`Type ${keyword.toUpperCase()} to confirm`}
            aria-label={`Type ${keyword} to confirm`}
            className="tnum mt-4 w-full rounded-xl border border-[var(--surface-border)] bg-white/70 px-3 py-2 text-sm outline-none focus:border-[var(--danger)]"
          />
          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={onCancel}
              className="rounded-2xl bg-white/70 px-4 py-2 text-sm font-medium shadow-sm"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={!matches}
              className={`rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40 ${
                danger ? "bg-[var(--danger)]" : ""
              }`}
              style={danger ? undefined : { background: "var(--primary-grad)" }}
            >
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
