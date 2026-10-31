// Digital boards often export light or coloured ink on black, or ink on a transparent background. The reader is
// taught on whiteboards, and playback paints dark strokes over the image, so such exports are turned into dark ink
// on a light background before anything else sees them.

export type Rgba = readonly [number, number, number, number];
export type NormalisedBoard = { data: Uint8ClampedArray; inverted: boolean };

const CHANNEL_MAX = 255;
const MID_LIGHTNESS = 128;
// How far from the background's lightness a pixel must be to count as ink rather than noise or shading.
const INK_CONTRAST = 48;
// Ink is a thin tail of the image; a broad lighter area is the lit part of a board, not ink.
const MAX_INK_SHARE = 0.25;

const lightness = (data: Uint8ClampedArray, offset: number): number =>
  0.299 * (data[offset] ?? 0) + 0.587 * (data[offset + 1] ?? 0) + 0.114 * (data[offset + 2] ?? 0);

const medianLightness = (data: Uint8ClampedArray): number => {
  const histogram = new Uint32Array(CHANNEL_MAX + 1);
  const count = data.length / 4;
  for (let offset = 0; offset < data.length; offset += 4) {
    const bucket = Math.round(lightness(data, offset));
    histogram[bucket] = (histogram[bucket] ?? 0) + 1;
  }
  let seen = 0;
  for (const [value, times] of histogram.entries()) {
    seen += times;
    if (seen * 2 >= count) return value;
  }
  return 0;
};

// The background is whatever most of the image is; the ink is what stands out from it. Light ink outnumbering dark
// ink on a dark background is a dark-board export, while a dimly lit or half-shadowed whiteboard photo has either
// darker ink or a broad lighter area that is far too large to be ink.
export const isLightInkOnDark = (data: Uint8ClampedArray): boolean => {
  const background = medianLightness(data);
  if (background >= MID_LIGHTNESS) return false;
  let lighter = 0;
  let darker = 0;
  const pixelCount = data.length / 4;
  for (let offset = 0; offset < data.length; offset += 4) {
    const value = lightness(data, offset);
    if (value > background + INK_CONTRAST) lighter += 1;
    else if (value < background - INK_CONTRAST) darker += 1;
  }
  return lighter > darker && lighter / pixelCount <= MAX_INK_SHARE;
};

// Shifting every channel by the same amount keeps the hue and saturation and mirrors the lightness, so white
// becomes black and red ink stays red, only darker.
export const invertLightness = (data: Uint8ClampedArray): Uint8ClampedArray => {
  const result = new Uint8ClampedArray(data);
  for (let offset = 0; offset < data.length; offset += 4) {
    const [r, g, b] = [data[offset] ?? 0, data[offset + 1] ?? 0, data[offset + 2] ?? 0];
    const shift = CHANNEL_MAX - Math.max(r, g, b) - Math.min(r, g, b);
    result[offset] = r + shift;
    result[offset + 1] = g + shift;
    result[offset + 2] = b + shift;
  }
  return result;
};

// Transparent pixels are laid on white unless the visible ink is mostly light, which would vanish on white.
export const flattenAlpha = (data: Uint8ClampedArray): Uint8ClampedArray => {
  let weighted = 0;
  let opacity = 0;
  for (let offset = 0; offset < data.length; offset += 4) {
    const alpha = data[offset + 3] ?? 0;
    weighted += lightness(data, offset) * alpha;
    opacity += alpha;
  }
  const backdrop = opacity > 0 && weighted / opacity > MID_LIGHTNESS ? 0 : CHANNEL_MAX;
  const result = new Uint8ClampedArray(data.length);
  for (let offset = 0; offset < data.length; offset += 4) {
    const alpha = (data[offset + 3] ?? 0) / CHANNEL_MAX;
    for (let channel = 0; channel < 3; channel += 1) {
      result[offset + channel] = Math.round((data[offset + channel] ?? 0) * alpha + backdrop * (1 - alpha));
    }
    result[offset + 3] = CHANNEL_MAX;
  }
  return result;
};

const hasTransparency = (data: Uint8ClampedArray): boolean => {
  for (let offset = 3; offset < data.length; offset += 4) if ((data[offset] ?? 0) < CHANNEL_MAX) return true;
  return false;
};

export const normaliseBoard = (data: Uint8ClampedArray): NormalisedBoard => {
  const opaque = hasTransparency(data) ? flattenAlpha(data) : data;
  return isLightInkOnDark(opaque) ? { data: invertLightness(opaque), inverted: true } : { data: opaque, inverted: false };
};
