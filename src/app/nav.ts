import { create } from "zustand";

export const PAGES = ["focus", "history", "reports"] as const;
export type Page = (typeof PAGES)[number];

interface NavState {
  active: Page;
  setActive: (page: Page) => void;
}

export const useNav = create<NavState>((set) => ({
  active: "focus",
  setActive: (page) => set({ active: page }),
}));
