import { create } from "zustand";
import { INITIAL_BAG, type ImageBagState, type RotationMode } from "../../domain/imageBag";
import { getSetting, setSetting } from "../../data/settingsRepo";

export interface StandbySettings {
  rotation: RotationMode;
  pinnedId: string | null;
  clockWeight: "thin" | "bold";
  /** 0.6..1.6 size multiplier for the clock. */
  clockScale: number;
  /** Dim overlay strength 0..50 (%). */
  dim: number;
  /** Persisted shuffle-bag state (SPEC: survives restarts). */
  bag: ImageBagState;
}

export const DEFAULT_STANDBY_SETTINGS: StandbySettings = {
  rotation: "shuffle",
  pinnedId: null,
  clockWeight: "thin",
  clockScale: 1,
  dim: 25,
  bag: INITIAL_BAG,
};

interface StandbyStore {
  open: boolean;
  settings: StandbySettings;
  loaded: boolean;
  openStandby: () => void;
  exitStandby: () => void;
  load: () => Promise<void>;
  update: (patch: Partial<StandbySettings>) => void;
  setBag: (bag: ImageBagState) => void;
}

const KEY = "standby";

export const useStandby = create<StandbyStore>((set, get) => ({
  open: false,
  settings: DEFAULT_STANDBY_SETTINGS,
  loaded: false,

  // Wait for persisted rotation/bag settings on the first entry; otherwise the
  // default bag would be written over the real one and an image could repeat.
  openStandby: async () => {
    if (!get().loaded) await get().load();
    set({ open: true });
  },
  exitStandby: () => set({ open: false }),

  load: async () => {
    const saved = await getSetting<Partial<StandbySettings>>(KEY, {});
    set({ settings: { ...DEFAULT_STANDBY_SETTINGS, ...saved }, loaded: true });
  },

  update: (patch) => {
    const next = { ...get().settings, ...patch };
    set({ settings: next });
    void setSetting(KEY, next);
  },

  setBag: (bag) => {
    const next = { ...get().settings, bag };
    set({ settings: next });
    void setSetting(KEY, next);
  },
}));
