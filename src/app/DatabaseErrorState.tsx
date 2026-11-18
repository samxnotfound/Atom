import { Database } from "lucide-react";

export function DatabaseErrorState() {
  return (
    <div
      className="grid h-full place-items-center px-8"
      style={{ background: "var(--bg)" }}
    >
      <div className="glass flex max-w-sm flex-col items-center gap-3 rounded-[24px] p-8 text-center">
        <span className="circle grid size-14 place-items-center bg-[var(--danger)]/10 text-[var(--danger)]">
          <Database size={24} />
        </span>
        <h1 className="text-base font-semibold">Atom couldn't open its database</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Close the app and try again. If it keeps failing, the data folder may be locked by
          another process.
        </p>
        <button
          onClick={() => location.reload()}
          className="mt-1 rounded-2xl px-5 py-2.5 text-sm font-semibold text-white transition-transform hover:scale-[1.02] active:scale-[0.97]"
          style={{ background: "var(--primary-grad)", boxShadow: "var(--glow)" }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
