import * as Dialog from "@radix-ui/react-dialog";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  danger = false,
}: ConfirmDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[#0E1726]/25 backdrop-blur-[2px]" />
        <Dialog.Content className="glass fixed left-1/2 top-1/2 z-50 w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-[24px] p-6">
          <Dialog.Title className="text-[15px] font-semibold tracking-tight">{title}</Dialog.Title>
          {body && (
            <Dialog.Description className="mt-1.5 text-sm text-[var(--text-muted)]">
              {body}
            </Dialog.Description>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={onCancel}
              className="rounded-2xl bg-white/70 px-4 py-2 text-sm font-medium shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.97]"
            >
              {cancelLabel}
            </button>
            <button
              autoFocus
              onClick={onConfirm}
              className={`rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.97] ${
                danger ? "bg-[var(--danger)]" : ""
              }`}
              style={danger ? undefined : { background: "var(--primary-grad)", boxShadow: "var(--glow)" }}
            >
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
