import { useState } from "react";
import {
  CATEGORY_ICON_CHOICES,
  iconForCategory,
} from "../../ui/categoryIcons";

export const CATEGORY_PALETTE = [
  "#2F7BFF",
  "#6366F1",
  "#A855F7",
  "#EC4899",
  "#F59E0B",
  "#22C55E",
  "#14B8A6",
  "#EF4444",
  "#64748B",
] as const;

export interface CategoryFormValues {
  name: string;
  color: string;
  icon: string | null;
}

interface CategoryFormProps {
  initial?: Partial<CategoryFormValues>;
  /** Names already in use (excluding the one being edited). */
  takenNames?: string[];
  submitLabel: string;
  onSubmit: (values: CategoryFormValues) => void;
  onCancel: () => void;
}

export function CategoryForm({
  initial,
  takenNames = [],
  submitLabel,
  onSubmit,
  onCancel,
}: CategoryFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? CATEGORY_PALETTE[0]);
  const [customColor, setCustomColor] = useState(
    initial?.color && !(CATEGORY_PALETTE as readonly string[]).includes(initial.color)
      ? initial.color
      : "",
  );
  const [icon, setIcon] = useState<string | null>(initial?.icon ?? CATEGORY_ICON_CHOICES[0]);

  const trimmed = name.trim();
  const nameTaken =
    trimmed !== "" &&
    takenNames.some((n) => n.trim().toLowerCase() === trimmed.toLowerCase());
  const valid = trimmed !== "" && !nameTaken;
  const activeColor = customColor || color;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit({ name: trimmed, color: activeColor, icon });
      }}
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Category name"
        maxLength={40}
        className="w-full rounded-xl border border-[var(--surface-border)] bg-white/70 px-3 py-2 text-[13px] outline-none focus:border-[var(--primary-400)]"
      />
      {nameTaken && <p className="mt-1 text-xs text-[var(--danger)]">Already exists</p>}

      <p className="mt-3 text-[12px] font-medium text-[var(--text-muted)]">Color</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {CATEGORY_PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => {
              setColor(c);
              setCustomColor("");
            }}
            aria-label={`Color ${c}`}
            aria-pressed={activeColor === c}
            className={`circle size-5 transition-transform ${
              activeColor === c
                ? "scale-110 ring-2 ring-[var(--text)]/40 ring-offset-1 ring-offset-white/60"
                : "hover:scale-105"
            }`}
            style={{ background: c }}
          />
        ))}
        <label className="relative ml-1 size-5 cursor-pointer" title="Custom color">
          <span
            className={`circle block size-full ${
              customColor ? "ring-2 ring-[var(--text)]/40 ring-offset-1 ring-offset-white/60" : ""
            }`}
            style={{
              background:
                "conic-gradient(#EF4444, #F59E0B, #22C55E, #14B8A6, #2F7BFF, #A855F7, #EC4899, #EF4444)",
            }}
          />
          <input
            type="color"
            value={customColor || activeColor}
            onChange={(e) => setCustomColor(e.target.value)}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </label>
      </div>

      <p className="mt-3 text-[12px] font-medium text-[var(--text-muted)]">Icon</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {CATEGORY_ICON_CHOICES.map((choice) => {
          const Icon = iconForCategory(choice);
          return (
            <button
              key={choice}
              type="button"
              onClick={() => setIcon(choice)}
              aria-label={`Icon ${choice}`}
              aria-pressed={icon === choice}
              className={`grid size-7 place-items-center rounded-lg transition-colors ${
                icon === choice ? "bg-white/90 shadow-sm" : "hover:bg-white/60"
              }`}
            >
              <Icon size={14} style={{ color: activeColor }} />
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl px-3 py-1.5 text-[13px] font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!valid}
          className="rounded-xl bg-[image:var(--primary-grad)] px-3 py-1.5 text-[13px] font-semibold text-white shadow-[var(--glow)] disabled:opacity-40"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
