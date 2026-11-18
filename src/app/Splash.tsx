import { Atom } from "lucide-react";

export function Splash() {
  return (
    <div className="grid h-full place-items-center" style={{ background: "var(--bg)" }}>
      <div className="flex flex-col items-center gap-3">
        <span
          className="grid size-14 animate-pulse place-items-center rounded-2xl text-white"
          style={{ background: "var(--primary-grad)", boxShadow: "var(--glow)" }}
        >
          <Atom size={26} />
        </span>
        <p className="text-sm font-medium text-[var(--text-muted)]">Opening Atom…</p>
      </div>
    </div>
  );
}
