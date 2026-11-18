import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon: Icon, title, body, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="glass grid size-16 place-items-center rounded-3xl">
        <Icon size={26} className="text-[var(--primary-500)]" strokeWidth={1.8} />
      </div>
      <div>
        <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 max-w-xs text-sm text-[var(--text-muted)]">{body}</p>
      </div>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-1 rounded-2xl px-5 py-2.5 text-sm font-semibold text-white transition-transform hover:scale-[1.02] active:scale-[0.97]"
          style={{ background: "var(--primary-grad)", boxShadow: "var(--glow)" }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
