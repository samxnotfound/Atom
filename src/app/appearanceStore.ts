import { create } from "zustand";
import { getSetting, setSetting } from "../data/settingsRepo";
import { invoke } from "@tauri-apps/api/core";

export interface AccentPreset {
  id: string;
  label: string;
  /** primary-300/400/500/600 */
  c: [string, string, string, string];
}

export const ACCENTS: AccentPreset[] = [
  { id: "atom", label: "Atom Blue", c: ["#8CC6FF", "#5AAEFF", "#2F7BFF", "#1F62E0"] },
  { id: "violet", label: "Violet", c: ["#B39DFF", "#8B6CFF", "#6D4AFF", "#5A3BD6"] },
  { id: "emerald", label: "Emerald", c: ["#6EE7B7", "#34D399", "#10B981", "#059669"] },
  { id: "rose", label: "Rose", c: ["#F9A8C9", "#F472B6", "#EC4899", "#DB2777"] },
];

export interface AppearanceSettings {
  accent: string;
  reduceMotion: boolean;
  density: "comfortable" | "compact";
  mica: boolean;
}

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  accent: "atom",
  reduceMotion: false,
  density: "comfortable",
  mica: false,
};

interface AppearanceStore {
  settings: AppearanceSettings;
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<AppearanceSettings>) => void;
}

const KEY = "appearance";

export function applyAppearance(settings: AppearanceSettings): void {
  const root = document.documentElement;
  const accent = ACCENTS.find((a) => a.id === settings.accent) ?? ACCENTS[0]!;
  const [c300, c400, c500, c600] = accent.c;
  root.style.setProperty("--primary-300", c300);
  root.style.setProperty("--primary-400", c400);
  root.style.setProperty("--primary-500", c500);
  root.style.setProperty("--primary-600", c600);
  root.style.setProperty(
    "--primary-grad",
    `linear-gradient(180deg,${c400} 0%,${c500} 100%)`,
  );
  const glowHex = c500.replace("#", "");
  root.style.setProperty(
    "--glow",
    `0 10px 30px rgba(${parseInt(glowHex.slice(0, 2), 16)},${parseInt(glowHex.slice(2, 4), 16)},${parseInt(glowHex.slice(4, 6), 16)},0.45)`,
  );
  root.dataset.density = settings.density;

  // Always attempt the native call; plain-browser dev builds simply reject.
  // (Gating on TAURI_ENV_PLATFORM left the toggle silently inert when the
  // env var was not exposed to Vite.)
  try {
    void invoke("set_mica", { enabled: settings.mica }).catch(() => undefined);
  } catch {
    // Not running inside Tauri.
  }
}

export const useAppearance = create<AppearanceStore>((set, get) => ({
  settings: DEFAULT_APPEARANCE,
  loaded: false,
  load: async () => {
    const saved = await getSetting<Partial<AppearanceSettings>>(KEY, {});
    const settings = { ...DEFAULT_APPEARANCE, ...saved };
    applyAppearance(settings);
    set({ settings, loaded: true });
  },
  update: (patch) => {
    const settings = { ...get().settings, ...patch };
    applyAppearance(settings);
    set({ settings });
    void setSetting(KEY, settings);
  },
}));
