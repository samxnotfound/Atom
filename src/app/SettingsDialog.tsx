import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useState } from "react";
import { useSettingsDialog } from "./settingsStore";
import { CategoriesSection } from "../features/settings/CategoriesSection";
import { GoalsSection } from "../features/settings/GoalsSection";
import { StandbySection } from "../features/settings/StandbySection";
import { TimerSection } from "../features/settings/TimerSection";
import { AppearanceSection } from "../features/settings/AppearanceSection";
import { SystemSection } from "../features/settings/SystemSection";
import { DataSection } from "../features/settings/DataSection";

const SECTIONS = ["Categories", "Goals", "Timer", "Appearance", "Standby", "System", "Data"] as const;
type Section = (typeof SECTIONS)[number];

export function SettingsDialog() {
  const open = useSettingsDialog((s) => s.open);
  const hide = useSettingsDialog((s) => s.hide);
  const [section, setSection] = useState<Section>("Categories");

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && hide()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[#0E1726]/25 backdrop-blur-[2px]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 flex h-[560px] w-[760px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[24px]"
          style={{
            background: "rgba(255,255,255,0.9)",
            backdropFilter: "blur(44px) saturate(1.5)",
            WebkitBackdropFilter: "blur(44px) saturate(1.5)",
            border: "1px solid rgba(255,255,255,0.7)",
            boxShadow: "0 24px 64px rgba(15,40,90,0.22)",
          }}
        >
          <Dialog.Title className="sr-only">Settings</Dialog.Title>
          <Dialog.Description className="sr-only">App settings</Dialog.Description>

          <aside className="w-48 shrink-0 border-r border-[var(--surface-border)] bg-white/40 p-4">
            <h2 className="px-2 pb-3 text-[15px] font-semibold tracking-tight">Settings</h2>
            <nav className="flex flex-col gap-0.5">
              {SECTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSection(s)}
                  aria-current={section === s ? "true" : undefined}
                  className={`rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                    section === s
                      ? "bg-white/80 font-medium text-[var(--text)] shadow-sm"
                      : "text-[var(--text-muted)] hover:bg-white/50"
                  }`}
                >
                  {s}
                </button>
              ))}
            </nav>
          </aside>

          <div className="relative flex flex-1 flex-col overflow-hidden p-6">
            <Dialog.Close asChild>
              <button
                aria-label="Close settings"
                className="absolute right-4 top-4 grid size-8 place-items-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-black/5"
              >
                <X size={15} />
              </button>
            </Dialog.Close>

            <h3 className="text-[17px] font-semibold tracking-tight">{section}</h3>
            <div className="mt-4 min-h-0 flex-1">
              {section === "Categories" ? (
                <CategoriesSection />
              ) : section === "Goals" ? (
                <GoalsSection />
              ) : section === "Standby" ? (
                <StandbySection />
              ) : section === "Timer" ? (
                <TimerSection />
              ) : section === "Appearance" ? (
                <AppearanceSection />
              ) : section === "System" ? (
                <SystemSection />
              ) : (
                <DataSection />
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
