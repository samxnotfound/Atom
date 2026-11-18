import { motion } from "framer-motion";

interface SegmentedProps<T extends string> {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}

export function Segmented<T extends string>({ options, value, onChange, ariaLabel }: SegmentedProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-0.5 rounded-2xl bg-white/40 p-1 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.6)]"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`relative rounded-xl px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
              active ? "text-[var(--text)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            {active && (
              <motion.span
                layoutId={`segmented-thumb-${ariaLabel ?? "default"}`}
                className="absolute inset-0 rounded-xl bg-white shadow-sm"
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
