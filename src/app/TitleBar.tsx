import { Minus, Settings, Square, X, Copy } from "lucide-react";
import { useWindowControls } from "./useWindowControls";
import { useSettingsDialog } from "./settingsStore";
import { useTimer } from "../features/focus/timerStore";

const controlBase =
  "inline-flex h-full w-12 items-center justify-center text-[var(--text-muted)] transition-colors hover:bg-black/5 active:opacity-80";

export function TitleBar() {
  const { maximized, minimize, toggleMaximize, close, destroy } = useWindowControls();
  const showSettings = useSettingsDialog((s) => s.show);
  const closeWindow = () => {
    const status = useTimer.getState().status;
    if (status === "running" || status === "paused") close();
    else destroy();
  };

  return (
    <header
      data-tauri-drag-region
      className="relative z-20 flex h-11 shrink-0 select-none items-center pl-4"
    >
      <div data-tauri-drag-region className="flex items-center gap-2">
        <img
          src="/logo.png"
          alt=""
          draggable={false}
          className="size-6 rounded-[7px] shadow-[var(--glow)]"
        />
        <span data-tauri-drag-region className="text-[13px] font-semibold tracking-tight">
          Atom
        </span>
      </div>

      <div className="ml-auto flex h-full items-center">
        <button
          onClick={showSettings}
          aria-label="Settings"
          className="mr-1 inline-flex size-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-black/5 hover:text-[var(--text)]"
        >
          <Settings size={16} />
        </button>
        <button onClick={minimize} aria-label="Minimize" className={controlBase}>
          <Minus size={15} />
        </button>
        <button
          onClick={toggleMaximize}
          aria-label={maximized ? "Restore" : "Maximize"}
          className={controlBase}
        >
          {maximized ? <Copy size={13} /> : <Square size={12} />}
        </button>
        <button
          onClick={closeWindow}
          aria-label="Close"
          className={`${controlBase} hover:!bg-[#e81123] hover:!text-white`}
        >
          <X size={16} />
        </button>
      </div>
    </header>
  );
}
