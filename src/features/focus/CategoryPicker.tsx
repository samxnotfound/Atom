import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Plus } from "lucide-react";
import {
  createCategory,
  listActiveCategories,
} from "../../data/categoriesRepo";
import { iconForCategory } from "../../ui/categoryIcons";
import { CategoryForm } from "../categories/CategoryForm";

interface CategoryPickerProps {
  value: string | null;
  onChange: (id: string | null) => void;
}

export function CategoryPicker({ value, onChange }: CategoryPickerProps) {
  const queryClient = useQueryClient();
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: listActiveCategories,
  });
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const create = useMutation({
    mutationFn: createCategory,
    onSuccess: (row) => {
      void queryClient.invalidateQueries({ queryKey: ["categories"] });
      onChange(row.id);
      setOpen(false);
      setCreating(false);
    },
  });

  const selected = categories.find((c) => c.id === value) ?? null;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        className={`glass inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium transition-transform hover:scale-[1.02] active:scale-[0.98] ${
          selected ? "" : "text-[var(--text-muted)]"
        }`}
      >
        {selected ? (
          <>
            <span
              className="circle size-2.5"
              style={{ background: selected.color }}
            />
            {selected.name}
          </>
        ) : (
          "Category"
        )}
        <ChevronDown size={14} className="text-[var(--text-faint)]" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={8}
          className="glass z-50 w-64 rounded-[16px] p-1.5"
        >
          {creating ? (
            <CategoryForm
              takenNames={categories.map((c) => c.name)}
              submitLabel="Create"
              onCancel={() => setCreating(false)}
              onSubmit={(values) => create.mutate(values)}
            />
          ) : (
            <>
              {categories.map((c) => {
                const Icon = iconForCategory(c.icon);
                const active = c.id === value;
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      onChange(c.id);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] transition-colors ${
                      active ? "bg-white/80 font-medium" : "hover:bg-white/60"
                    }`}
                  >
                    <Icon size={15} style={{ color: c.color }} />
                    <span className="flex-1">{c.name}</span>
                    {active && <Check size={14} className="text-[var(--primary-500)]" />}
                  </button>
                );
              })}
              <button
                onClick={() => setCreating(true)}
                className="mt-0.5 flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] text-[var(--primary-500)] transition-colors hover:bg-white/60"
              >
                <Plus size={15} />
                New category
              </button>
            </>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
