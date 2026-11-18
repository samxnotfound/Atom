import { create } from "zustand";
import { getSetting, setSetting } from "../data/settingsRepo";

export interface Prefs {
  chime: boolean;
  chimeVolume: number; // 0..1
  notify: boolean;
  confirmClose: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  chime: true,
  chimeVolume: 0.6,
  notify: true,
  confirmClose: true,
};

const KEY = "prefs";

interface PrefsStore {
  prefs: Prefs;
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<Prefs>) => void;
}

export const usePrefs = create<PrefsStore>((set, get) => ({
  prefs: DEFAULT_PREFS,
  loaded: false,
  load: async () => {
    const saved = await getSetting<Partial<Prefs>>(KEY, {});
    set({ prefs: { ...DEFAULT_PREFS, ...saved }, loaded: true });
  },
  update: (patch) => {
    const prefs = { ...get().prefs, ...patch };
    set({ prefs });
    void setSetting(KEY, prefs);
  },
}));
