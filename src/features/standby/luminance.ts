/**
 * Standby legibility helpers (SPEC 5.2):
 * - average luminance of the image's central region (32×32 downscale), 0..1
 * - auto text-color choice (white vs deep navy) targeting ≥ 4.5:1 contrast
 */

const DEEP_NAVY = { r: 14, g: 23, b: 38 }; // --text #0E1726
const WHITE = { r: 255, g: 255, b: 255 };

export function relativeLuminance(r: number, g: number, b: number): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Average 0..1 luminance of the central region, computed on a 32×32 canvas. */
export async function computeLuminance(url: string): Promise<number | null> {
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    // Central 50% of the image.
    const sx = img.naturalWidth * 0.25;
    const sy = img.naturalHeight * 0.25;
    const sw = img.naturalWidth * 0.5;
    const sh = img.naturalHeight * 0.5;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 32, 32);
    const data = ctx.getImageData(0, 0, 32, 32).data;
    let sum = 0;
    const px = 32 * 32;
    for (let i = 0; i < px; i++) {
      const o = i * 4;
      sum += relativeLuminance(data[o]!, data[o + 1]!, data[o + 2]!);
    }
    return sum / px;
  } catch {
    return null;
  }
}

/**
 * WCAG contrast ratio between a candidate text color and the effective
 * background (photo luminance darkened by the scrim).
 */
export function contrastRatio(textL: number, bgL: number): number {
  const lighter = Math.max(textL, bgL);
  const darker = Math.min(textL, bgL);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Photo luminance after the scrim darkens it. scrimOpacity is the final
 * black overlay strength over the photo (0..1).
 */
export function scrimmedBackgroundLuminance(photoL: number, scrimOpacity: number): number {
  // Luminance compositing approximation: bg' = bg * (1 - alpha) + 0 * alpha
  return photoL * (1 - scrimOpacity);
}

/** "white" | "navy": first candidate reaching ≥ 4.5:1 against the scrimmed bg. */
export function pickClockColor(
  photoLuminance: number,
  scrimOpacity = 0.25,
): "white" | "navy" {
  const bgL = scrimmedBackgroundLuminance(photoLuminance, scrimOpacity);
  const whiteL = relativeLuminance(WHITE.r, WHITE.g, WHITE.b);
  const navyL = relativeLuminance(DEEP_NAVY.r, DEEP_NAVY.g, DEEP_NAVY.b);
  if (contrastRatio(whiteL, bgL) >= 4.5) return "white";
  if (contrastRatio(navyL, bgL) >= 4.5) return "navy";
  // Neither reaches 4.5 — pick the better of the two.
  return contrastRatio(whiteL, bgL) >= contrastRatio(navyL, bgL) ? "white" : "navy";
}
