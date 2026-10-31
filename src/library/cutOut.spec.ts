import { describe, expect, it } from 'vitest';
import { cutOutWhite, WHITE_TOLERANCE, type Rgba } from './cutOut';

type Rgb = [number, number, number];
const WHITE: Rgb = [255, 255, 255];
const RED: Rgb = [255, 0, 0];
const OPAQUE = 255;
const CLEAR = 0;
const CHANNELS = 4;

const solid = (width: number, height: number, [r, g, b]: Rgb): Rgba => {
  const data = new Uint8ClampedArray(width * height * CHANNELS);
  for (let i = 0; i < width * height; i += 1) data.set([r, g, b, OPAQUE], i * CHANNELS);
  return { data, width, height };
};

const paint = (image: Rgba, x: number, y: number, [r, g, b]: Rgb): void => {
  image.data.set([r, g, b, OPAQUE], (y * image.width + x) * CHANNELS);
};

const alphaAt = (image: Rgba, x: number, y: number): number => image.data[(y * image.width + x) * CHANNELS + 3] ?? -1;

const opaquePixels = (image: Rgba): [number, number][] => {
  const found: [number, number][] = [];
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) if (alphaAt(image, x, y) === OPAQUE) found.push([x, y]);
  }
  return found;
};

describe('cutOutWhite', () => {
  it('clears a white border', () => {
    const image = solid(6, 6, WHITE);
    for (const [x, y] of [[2, 2], [3, 2], [2, 3], [3, 3]] as const) paint(image, x, y, RED);
    expect(opaquePixels(cutOutWhite(image))).toEqual([[2, 2], [3, 2], [2, 3], [3, 3]]);
  });

  it('keeps white enclosed by the subject', () => {
    const image = solid(5, 5, WHITE);
    for (let y = 1; y <= 3; y += 1) for (let x = 1; x <= 3; x += 1) paint(image, x, y, RED);
    paint(image, 2, 2, WHITE);
    const result = cutOutWhite(image);
    expect(alphaAt(result, 2, 2)).toBe(OPAQUE);
    expect(alphaAt(result, 0, 0)).toBe(CLEAR);
    expect(opaquePixels(result)).toHaveLength(9);
  });

  it.each([
    ['rgb(240, 242, 238)', [240, 242, 238] as Rgb, CLEAR],
    ['rgb(200, 200, 200)', [200, 200, 200] as Rgb, OPAQUE],
    ['the tolerance edge', [255 - WHITE_TOLERANCE, 255, 255] as Rgb, CLEAR],
    ['just past the tolerance', [254 - WHITE_TOLERANCE, 255, 255] as Rgb, OPAQUE],
  ])('treats %s as the right kind of pixel', (_label, rgb, alpha) => {
    const image = solid(3, 1, WHITE);
    paint(image, 0, 0, rgb);
    expect(alphaAt(cutOutWhite(image), 0, 0)).toBe(alpha);
  });

  it('does not modify its input', () => {
    const image = solid(4, 4, WHITE);
    paint(image, 1, 1, RED);
    const before = Uint8ClampedArray.from(image.data);
    const result = cutOutWhite(image);
    expect(image.data).toEqual(before);
    expect(result.data).not.toBe(image.data);
    expect([result.width, result.height]).toEqual([4, 4]);
  });

  it('copes with a large all-white image without recursing', () => {
    const result = cutOutWhite(solid(400, 400, WHITE));
    expect(opaquePixels(result)).toEqual([]);
  });
});
