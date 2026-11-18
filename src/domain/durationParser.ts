export const MIN_DURATION_MS = 60_000;
export const MAX_DURATION_MS = 12 * 3_600_000;

export type DurationParseResult =
  | { ok: true; ms: number }
  | { ok: false; reason: string };

const BAD_INPUT =
  "Can't read that. Try 25m, 1h30, 1:30, or 2h 15m.";
const OUT_OF_RANGE = "Focus sessions can be 1 minute to 12 hours.";

const CLOCK_RE = /^(\d{1,3}):(\d{1,2})(?::(\d{1,2}))?$/;
const TOKEN_RE = /(\d+(?:\.\d+)?)(h|m)?/g;

/**
 * Flexible input → canonical form: full-width digits/colon → ASCII,
 * decimal comma → dot, "min"/"mins"/"minutes" → "m", whitespace squeezed.
 */
function normalize(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[０-９：]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, "")
    .replace(/,/g, ".")
    .replace(/min(?:s|utes)?$/, "m");
}

/**
 * Parses flexible duration input. Bare numbers are minutes.
 * Accepted: 25, 25m, 90, 90 min, 1h, 1h30, 1h 30m, 1.5h, 1,5h, 1:30,
 * 1:30:00, ２５, 2h 15m.
 */
export function parseDuration(raw: string): DurationParseResult {
  const input = normalize(raw);
  if (!input) return { ok: false, reason: BAD_INPUT };

  const clock = CLOCK_RE.exec(input);
  if (clock) {
    const hours = Number(clock[1]);
    const minutes = Number(clock[2]);
    const seconds = clock[3] !== undefined ? Number(clock[3]) : 0;
    if (minutes > 59 || seconds > 59) return { ok: false, reason: BAD_INPUT };
    return finish(hours * 3_600_000 + minutes * 60_000 + seconds * 1_000);
  }

  TOKEN_RE.lastIndex = 0;
  let hours = 0;
  let minutes = 0;
  let matched = "";
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(input)) !== null) {
    if (m.index !== matched.length) return { ok: false, reason: BAD_INPUT };
    matched += m[0];
    const value = Number(m[1]);
    if (m[2] === "h") hours += value;
    else minutes += value;
  }
  if (!matched || matched.length !== input.length) {
    return { ok: false, reason: BAD_INPUT };
  }
  return finish(hours * 3_600_000 + minutes * 60_000);
}

function finish(ms: number): DurationParseResult {
  const rounded = Math.round(ms);
  if (rounded < MIN_DURATION_MS) return { ok: false, reason: OUT_OF_RANGE };
  if (rounded > MAX_DURATION_MS) return { ok: false, reason: OUT_OF_RANGE };
  return { ok: true, ms: rounded };
}

/** "1h 30m" / "45m" style label, for nudge and preset text. */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/** Nudges by ±5 minutes and clamps to the valid range. */
export function nudgeDuration(ms: number, delta: number): number {
  return Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, ms + delta * 60_000));
}
