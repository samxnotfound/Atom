import { create } from "zustand";
import { setSetting } from "../../data/settingsRepo";
import type { RangeKey } from "../../domain/analytics";

export type ChartType = "bar" | "pie";

interface ReportsState {
  range: RangeKey;
  /** Anchor timestamp for the current period; null = live "now". */
  anchorMs: number | null;
  customStart: number | null;
  customEnd: number | null;
  categoryIds: string[];
  chartType: ChartType;
  stacked: boolean;
  setRange: (range: RangeKey) => void;
  setAnchor: (anchor: number | null) => void;
  setCustom: (start: number, end: number) => void;
  toggleCategory: (id: string) => void;
  clearCategories: () => void;
  setChartType: (type: ChartType) => void;
  setStacked: (stacked: boolean) => void;
  hydrateChartType: (type: ChartType) => void;
}

export const useReports = create<ReportsState>((set) => ({
  range: "week",
  anchorMs: null,
  customStart: null,
  customEnd: null,
  categoryIds: [],
  chartType: "bar",
  stacked: false,

  setRange: (range) => set({ range, anchorMs: null }),
  setAnchor: (anchor) => set({ anchorMs: anchor }),
  setCustom: (start, end) => set({ customStart: start, customEnd: end }),
  toggleCategory: (id) =>
    set((s) => ({
      categoryIds: s.categoryIds.includes(id)
        ? s.categoryIds.filter((c) => c !== id)
        : [...s.categoryIds, id],
    })),
  clearCategories: () => set({ categoryIds: [] }),
  setChartType: (chartType) => {
    set({ chartType });
    void setSetting("reports.chartType", chartType);
  },
  setStacked: (stacked) => set({ stacked }),
  hydrateChartType: (chartType) => set({ chartType }),
}));
