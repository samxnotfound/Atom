import { create } from "zustand";

interface SettingsDialogState {
  open: boolean;
  show: () => void;
  hide: () => void;
}

export const useSettingsDialog = create<SettingsDialogState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));
