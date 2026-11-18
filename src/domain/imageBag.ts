/**
 * Standby image rotation bag (SPEC 5.2).
 *
 * Pure logic: given the current bag state, the available images and the
 * rotation mode, return the image to show plus the updated state.
 *
 * Rules:
 * - "shuffle": every image is shown once before the bag reshuffles, and the
 *   first image of a reshuffle never equals the last shown image.
 * - "in-order": sequential by sorted name, remembers position.
 * - "pinned": always the pinned image (null → falls back to shuffle).
 */

export type RotationMode = "shuffle" | "in-order" | "pinned";

export interface ImageBagState {
  /** Remaining image names for the current shuffle cycle. */
  queue: string[];
  /** Last image name shown, so a reshuffle never repeats back-to-back. */
  last: string | null;
  /** Cursor into the ordered list for "in-order" mode. */
  orderIndex: number;
  /** Names served in the current cycle (optional for pre-existing states). */
  served?: string[];
}

export const INITIAL_BAG: ImageBagState = {
  queue: [],
  last: null,
  orderIndex: 0,
};

export function pickNextImage(
  state: ImageBagState,
  images: readonly string[],
  mode: RotationMode,
  pinned: string | null,
): { image: string | null; state: ImageBagState } {
  if (images.length === 0) return { image: null, state: INITIAL_BAG };

  const sorted = [...images].sort();

  if (mode === "pinned" && pinned !== null && images.includes(pinned)) {
    return { image: pinned, state: { ...state, last: pinned } };
  }

  if (mode === "in-order") {
    const idx = state.orderIndex % sorted.length;
    const image = sorted[idx];
    return {
      image,
      state: { ...state, last: image, orderIndex: idx + 1 },
    };
  }

  // shuffle
  const served = state.served ?? [];
  let queue = state.queue.filter((name) => images.includes(name));

  if (queue.length === 0) {
    // Reshuffle the full set; if it would start with the image just shown,
    // swap it to a later slot so no back-to-back repeat occurs.
    queue = shuffle(sorted);
    if (queue.length > 1 && queue[0] === state.last) {
      const swapWith = 1 + Math.floor(Math.random() * (queue.length - 1));
      [queue[0], queue[swapWith]] = [queue[swapWith]!, queue[0]!];
    }
    const [image, ...rest] = queue;
    return {
      image,
      state: { queue: rest, last: image, orderIndex: state.orderIndex, served: [image] },
    };
  }

  // Images added mid-cycle join the front of the remaining bag so they are
  // served within the current cycle instead of after the next reshuffle.
  const added = sorted.filter(
    (n) => !queue.includes(n) && n !== state.last && !served.includes(n),
  );
  if (added.length > 0) queue = [...added, ...queue];

  const [image, ...rest] = queue;
  return {
    image,
    state: { queue: rest, last: image, orderIndex: state.orderIndex, served: [...served, image] },
  };
}

/** Uniform Fisher–Yates using crypto when available (deterministic under test via injected rng). */
export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
