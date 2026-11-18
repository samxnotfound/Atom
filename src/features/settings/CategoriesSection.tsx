import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Reorder, useDragControls } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GripVertical, Pencil, Plus, Snowflake, Trash2, X } from "lucide-react";
import {
  archiveCategory,
  countSessionsInCategory,
  createCategory,
  deleteCategoryAndReassign,
  listActiveCategories,
  listArchivedCategories,
  reorderCategories,
  restoreCategory,
  updateCategory,
} from "../../data/categoriesRepo";
import type { CategoryRow } from "../../data/types";
import { iconForCategory } from "../../ui/categoryIcons";
import { CategoryForm } from "../categories/CategoryForm";
import { useTimer } from "../focus/timerStore";

export function CategoriesSection() {
  const queryClient = useQueryClient();
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: listActiveCategories,
  });
  const { data: archived = [] } = useQuery({
    queryKey: ["categoriesArchived"],
    queryFn: listArchivedCategories,
  });
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["categories"] });
    void queryClient.invalidateQueries({ queryKey: ["categoriesArchived"] });
  };

  const reorder = useMutation({
    mutationFn: (ids: string[]) => reorderCategories(ids),
    onSettled: invalidate,
  });

  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<CategoryRow | null>(null);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-[var(--text-muted)]">
          Drag to reorder — the order is used in the picker.
        </p>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[image:var(--primary-grad)] px-3 py-1.5 text-[13px] font-semibold text-white shadow-[var(--glow)]"
        >
          <Plus size={14} /> New category
        </button>
      </div>

      <div className="mt-3 flex-1 overflow-y-auto pr-1">
        <Reorder.Group axis="y" values={categories} onReorder={(next) => reorder.mutate(next.map((c) => c.id))} className="flex flex-col gap-1.5">
          {categories.map((c) => (
            <Row
              key={c.id}
              category={c}
              onEdit={() => setEditing(c)}
              onDelete={() => setDeleting(c)}
              onArchive={() => {
                void archiveCategory(c.id).then(invalidate);
              }}
            />
          ))}
        </Reorder.Group>

        {archived.length > 0 && (
          <>
            <p className="mt-5 mb-1.5 px-1 text-[12px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
              Archived
            </p>
            <div className="flex flex-col gap-1.5">
              {archived.map((c) => (
                <ArchivedRow
                  key={c.id}
                  category={c}
                  onRestore={() => {
                    void restoreCategory(c.id).then(invalidate);
                  }}
                  onDelete={() => setDeleting(c)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <EditDialog
        category={editing}
        others={categories.filter((c) => c.id !== editing?.id).map((c) => c.name)}
        onClose={() => setEditing(null)}
      />
      <CreateDialog open={creating} taken={categories.map((c) => c.name)} onClose={() => setCreating(false)} />
      <DeleteDialog category={deleting} onClose={() => setDeleting(null)} onDone={invalidate} />
    </div>
  );
}

function Row({
  category,
  onEdit,
  onDelete,
  onArchive,
}: {
  category: CategoryRow;
  onEdit: () => void;
  onDelete: () => void;
  onArchive: () => void;
}) {
  const controls = useDragControls();
  const Icon = iconForCategory(category.icon);
  const runningCategoryId = useTimer((s) => s.categoryId);
  const inUse = runningCategoryId === category.id;

  return (
    <Reorder.Item
      value={category}
      dragListener={false}
      dragControls={controls}
      className="flex items-center gap-3 rounded-2xl bg-white/60 px-3 py-2.5 shadow-sm"
      whileDrag={{ scale: 1.02, boxShadow: "0 8px 24px rgba(30,80,160,0.18)" }}
    >
      <button
        onPointerDown={(e) => controls.start(e)}
        aria-label={`Reorder ${category.name}`}
        className="grid size-6 cursor-grab place-items-center text-[var(--text-faint)] hover:text-[var(--text-muted)] active:cursor-grabbing"
      >
        <GripVertical size={15} />
      </button>
      <span
        className="grid size-8 shrink-0 place-items-center rounded-xl"
        style={{ background: `${category.color}1F`, color: category.color }}
      >
        <Icon size={15} />
      </span>
      <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{category.name}</span>
      {inUse && (
        <span className="rounded-full bg-[var(--primary-500)]/10 px-2 py-0.5 text-[11px] font-semibold text-[var(--primary-600)]">
          in use
        </span>
      )}
      <button onClick={onEdit} aria-label={`Edit ${category.name}`} className="grid size-7 place-items-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-white/80 hover:text-[var(--text)]">
        <Pencil size={14} />
      </button>
      <button
        onClick={onArchive}
        disabled={inUse}
        aria-label={`Archive ${category.name}`}
        title={inUse ? "In use by the running session" : "Archive — hidden, history preserved"}
        className="grid size-7 place-items-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-white/80 hover:text-[var(--text)] disabled:opacity-30"
      >
        <Snowflake size={14} />
      </button>
      <button
        onClick={onDelete}
        disabled={inUse}
        aria-label={`Delete ${category.name}`}
        title={inUse ? "In use by the running session" : "Delete"}
        className="grid size-7 place-items-center rounded-lg text-[var(--danger)] transition-colors hover:bg-[var(--danger)]/10 disabled:opacity-30"
      >
        <Trash2 size={14} />
      </button>
    </Reorder.Item>
  );
}

function ArchivedRow({
  category,
  onRestore,
  onDelete,
}: {
  category: CategoryRow;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const Icon = iconForCategory(category.icon);
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white/35 px-3 py-2.5">
      <span className="w-6" />
      <span
        className="grid size-8 shrink-0 place-items-center rounded-xl opacity-60"
        style={{ background: `${category.color}1F`, color: category.color }}
      >
        <Icon size={15} />
      </span>
      <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-[var(--text-muted)]">
        {category.name}
      </span>
      <button onClick={onRestore} className="rounded-xl px-2.5 py-1 text-[12px] font-semibold text-[var(--primary-600)] transition-colors hover:bg-white/70">
        Restore
      </button>
      <button
        onClick={onDelete}
        aria-label={`Delete ${category.name}`}
        className="grid size-7 place-items-center rounded-lg text-[var(--danger)] transition-colors hover:bg-[var(--danger)]/10"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function EditDialog({
  category,
  others,
  onClose,
}: {
  category: CategoryRow | null;
  others: string[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  return (
    <Dialog.Root open={category !== null} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[#0E1726]/25 backdrop-blur-[2px]" />
        <Dialog.Content className="glass fixed left-1/2 top-1/2 z-50 w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-[24px] p-5">
          <Dialog.Title className="text-[15px] font-semibold tracking-tight">Edit category</Dialog.Title>
          <Dialog.Description className="sr-only">Rename, recolor or change the icon</Dialog.Description>
          <Dialog.Close asChild>
            <button aria-label="Close" onClick={onClose} className="absolute right-4 top-4 grid size-7 place-items-center rounded-lg text-[var(--text-muted)] hover:bg-black/5">
              <X size={14} />
            </button>
          </Dialog.Close>
          {category && (
            <div className="mt-4">
              <CategoryForm
                initial={{ name: category.name, color: category.color, icon: category.icon }}
                takenNames={others}
                submitLabel="Save"
                onCancel={onClose}
                onSubmit={(values) => {
                  void updateCategory(category.id, values).then(() => {
                    void queryClient.invalidateQueries({ queryKey: ["categories"] });
                    onClose();
                  });
                }}
              />
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function CreateDialog({
  open,
  taken,
  onClose,
}: {
  open: boolean;
  taken: string[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[#0E1726]/25 backdrop-blur-[2px]" />
        <Dialog.Content className="glass fixed left-1/2 top-1/2 z-50 w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-[24px] p-5">
          <Dialog.Title className="text-[15px] font-semibold tracking-tight">New category</Dialog.Title>
          <Dialog.Description className="sr-only">Create a category</Dialog.Description>
          <Dialog.Close asChild>
            <button aria-label="Close" onClick={onClose} className="absolute right-4 top-4 grid size-7 place-items-center rounded-lg text-[var(--text-muted)] hover:bg-black/5">
              <X size={14} />
            </button>
          </Dialog.Close>
          <div className="mt-4">
            <CategoryForm
              takenNames={taken}
              submitLabel="Create"
              onCancel={onClose}
              onSubmit={(values) => {
                void createCategory(values).then(() => {
                  void queryClient.invalidateQueries({ queryKey: ["categories"] });
                  onClose();
                });
              }}
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Delete dialog per SPEC §3.2: Archive (default) or Delete & reassign.
 * Session data is never silently destroyed.
 */
function DeleteDialog({
  category,
  onClose,
  onDone,
}: {
  category: CategoryRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: listActiveCategories,
    enabled: category !== null,
  });
  const [target, setTarget] = useState<string>("__uncategorized");
  const [count, setCount] = useState<number | null>(null);
  const categoryId = category?.id ?? null;

  useEffect(() => {
    setCount(null);
    setTarget("__uncategorized");
    if (categoryId === null) return;
    let cancelled = false;
    void countSessionsInCategory(categoryId).then((n) => {
      if (!cancelled) setCount(n);
    });
    return () => {
      cancelled = true;
    };
  }, [categoryId]);

  const others = categories.filter((c) => c.id !== category?.id);

  const doDeleteAndReassign = async () => {
    if (!category) return;
    await deleteCategoryAndReassign(
      category.id,
      target === "__uncategorized" ? null : target,
    );
    onDone();
    onClose();
  };

  const doArchive = async () => {
    if (!category) return;
    await archiveCategory(category.id);
    onDone();
    onClose();
  };

  return (
    <Dialog.Root open={category !== null} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[#0E1726]/25 backdrop-blur-[2px]" />
        <Dialog.Content className="glass fixed left-1/2 top-1/2 z-50 w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-[24px] p-6">
          <Dialog.Title className="text-[15px] font-semibold tracking-tight">
            Delete “{category?.name}”?
          </Dialog.Title>
          <Dialog.Description className="mt-1.5 text-sm text-[var(--text-muted)]">
            {count === 0
              ? "This category has no sessions — it can be removed safely."
              : count !== null
                ? `${category?.name} holds ${count} session${count === 1 ? "" : "s"}. Nothing is lost — pick where they go.`
                : ""}
          </Dialog.Description>

          <div className="mt-5 flex flex-col gap-2.5">
            <button
              onClick={doArchive}
              className="rounded-2xl bg-[image:var(--primary-grad)] px-4 py-2.5 text-sm font-semibold text-white shadow-[var(--glow)]"
            >
              Archive (recommended)
            </button>
            <div className="rounded-2xl bg-white/50 p-3">
              <p className="text-[13px] font-semibold">Delete & reassign sessions</p>
              <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                Removes the category after moving its sessions to:
              </p>
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="mt-2 w-full rounded-xl border border-[var(--surface-border)] bg-white/80 px-3 py-2 text-[13px] outline-none focus:border-[var(--primary-400)]"
              >
                <option value="__uncategorized">Uncategorized</option>
                {others.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                onClick={doDeleteAndReassign}
                className="mt-3 w-full rounded-xl bg-[var(--danger)] px-4 py-2 text-[13px] font-semibold text-white"
              >
                Delete & reassign
              </button>
            </div>
            <button
              onClick={onClose}
              className="rounded-2xl px-4 py-2 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              Cancel
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
