import { describe, expect, it } from "vitest";
import {
  INITIAL_BAG,
  pickNextImage,
  type ImageBagState,
} from "../src/domain/imageBag";

const IMAGES = ["a.jpg", "b.jpg", "c.jpg", "d.jpg"];

/** Drive the bag for n picks. */
function drive(state: ImageBagState, images: string[], n: number, pinned: string | null = null) {
  const picks: (string | null)[] = [];
  let s = state;
  for (let i = 0; i < n; i++) {
    const r = pickNextImage(s, images, "shuffle", pinned);
    s = r.state;
    picks.push(r.image);
  }
  return { picks, state: s };
}

describe("imageBag shuffle", () => {
  it("shows every image once before reshuffling", () => {
    const { picks } = drive(INITIAL_BAG, IMAGES, IMAGES.length);
    expect(new Set(picks).size).toBe(IMAGES.length);
    expect(picks.sort()).toEqual([...IMAGES].sort());
  });

  it("never repeats back-to-back across reshuffles (long run)", () => {
    const { picks } = drive(INITIAL_BAG, IMAGES, 200);
    for (let i = 1; i < picks.length; i++) {
      expect(picks[i]).not.toBe(picks[i - 1]);
    }
    // still cycles through every image each cycle
    for (let c = 0; c < 200 / IMAGES.length; c++) {
      const cycle = picks.slice(c * IMAGES.length, (c + 1) * IMAGES.length);
      expect(new Set(cycle).size).toBe(IMAGES.length);
    }
  });

  it("single image: always the same, no crash", () => {
    const { picks } = drive(INITIAL_BAG, ["only.jpg"], 5);
    expect(picks.every((p) => p === "only.jpg")).toBe(true);
  });

  it("zero images: null and resets state", () => {
    const r = pickNextImage(INITIAL_BAG, [], "shuffle", null);
    expect(r.image).toBeNull();
    expect(r.state).toEqual(INITIAL_BAG);
  });

  it("handles removed images mid-cycle", () => {
    const first = pickNextImage(INITIAL_BAG, IMAGES, "shuffle", null);
    // remove the image that was just picked
    const remaining = IMAGES.filter((i) => i !== first.image);
    const second = pickNextImage(first.state, remaining, "shuffle", null);
    expect(second.image).not.toBeNull();
    expect(remaining).toContain(second.image);
  });

  it("handles added images mid-cycle (eventually served)", () => {
    const { state } = drive(INITIAL_BAG, IMAGES, 2);
    const grown = [...IMAGES, "e.jpg"];
    // exhaust the rest
    const { picks } = drive(state, grown, grown.length);
    expect(picks).toContain("e.jpg");
  });
});

describe("imageBag in-order", () => {
  it("walks sorted order and wraps", () => {
    let s = INITIAL_BAG;
    const picks: (string | null)[] = [];
    for (let i = 0; i < 6; i++) {
      const r = pickNextImage(s, IMAGES, "in-order", null);
      s = r.state;
      picks.push(r.image);
    }
    expect(picks).toEqual(["a.jpg", "b.jpg", "c.jpg", "d.jpg", "a.jpg", "b.jpg"]);
  });
});

describe("imageBag pinned", () => {
  it("always returns the pinned image", () => {
    for (let i = 0; i < 3; i++) {
      const r = pickNextImage(INITIAL_BAG, IMAGES, "pinned", "b.jpg");
      expect(r.image).toBe("b.jpg");
    }
  });

  it("pinned missing → shuffle fallback", () => {
    const r = pickNextImage(INITIAL_BAG, IMAGES, "pinned", "nope.jpg");
    expect(r.image).not.toBeNull();
  });
});
