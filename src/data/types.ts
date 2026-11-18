import type { SessionMode } from "../domain/timer";

export interface CategoryRow {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  archived_at: number | null;
  sort_order: number;
  created_at: number;
}

export interface SessionRow {
  id: string;
  category_id: string | null;
  title: string | null;
  note: string | null;
  mode: SessionMode;
  planned_ms: number | null;
  actual_ms: number;
  started_at: number;
  ended_at: number;
  completed: number;
  source: string;
  created_at: number;
}

export interface NewSession {
  id: string;
  category_id: string | null;
  title: string | null;
  note: string | null;
  mode: SessionMode;
  planned_ms: number | null;
  actual_ms: number;
  started_at: number;
  ended_at: number;
  completed: boolean;
  source: "timer" | "manual";
}

export interface ActiveSessionRow {
  id: string;
  category_id: string | null;
  title: string | null;
  mode: SessionMode;
  planned_ms: number | null;
  started_at: number;
  paused_total_ms: number;
  paused_at: number | null;
  last_heartbeat: number;
  segment_index: number;
  phase: "focus" | "break";
  break_kind: "short" | "long" | null;
}

/** Minimal projection for analytics aggregation (SPEC §5.5). */
export interface SessionSlice {
  id: string;
  category_id: string | null;
  started_at: number;
  ended_at: number;
  actual_ms: number;
  planned_ms: number | null;
  completed: number;
}

export interface StandbyImageRow {
  id: string;
  file_name: string;
  source: "bundled" | "user";
  luminance: number | null;
  added_at: number;
}
