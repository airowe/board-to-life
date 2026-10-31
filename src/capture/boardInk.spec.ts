import { describe, expect, it } from 'vitest';
import { flattenAlpha, invertLightness, isLightInkOnDark, normaliseBoard, type Rgba } from './boardInk';

const BLACK: Rgba = [0, 0, 0, 255];
const WHITE: Rgba = [255, 255, 255, 255];
const DIM_BOARD: Rgba = [70, 72, 68, 255];
const DARK_MARKER: Rgba = [20, 22, 30, 255];
const RED_INK: Rgba = [230, 40, 40, 255];
const YELLOW_INK: Rgba = [240, 220, 30, 255];
const CLEAR: Rgba = [0, 0, 0, 0];

// A picture that is mostly background with a minority of ink, as a drawing is.
const INK_SHARE = 0.1;
const PIXEL_COUNT = 200;

const picture = (background: Rgba, ...inks: Rgba[]): Uint8ClampedArray => {
  const inkPixels = Math.round(PIXEL_COUNT * INK_SHARE);
  const pixels = Array.from({ length: PIXEL_COUNT }, (_, index) =>
    index < inkPixels && inks.length > 0 ? (inks[index % inks.length] ?? background) : background,
  );
  return Uint8ClampedArray.from(pixels.flat());
};

// A whiteboard photo with the board half in shadow: two broad tones and a thin line of dark ink.
const SHADOWED_BOARD: Rgba = [100, 100, 100, 255];
const LIT_BOARD: Rgba = [190, 190, 190, 255];
const shadowedBoardPhoto = (): Uint8ClampedArray => {
  const [shadowed, lit] = [Math.round(PIXEL_COUNT * 0.55), Math.round(PIXEL_COUNT * 0.4)];
  const inkCount = PIXEL_COUNT - shadowed - lit;
  const pixels = [
    ...Array<Rgba>(shadowed).fill(SHADOWED_BOARD),
    ...Array<Rgba>(lit).fill(LIT_BOARD),
    ...Array<Rgba>(inkCount).fill(DARK_MARKER),
  ];
  return Uint8ClampedArray.from(pixels.flat());
};

const pixelAt = (data: Uint8ClampedArray, index: number): number[] => Array.from(data.slice(index * 4, index * 4 + 4));

const hueOf = ([r, g, b]: readonly number[]): number => {
  const [red = 0, green = 0, blue = 0] = [r, g, b];
  return Math.round((Math.atan2(Math.sqrt(3) * (green - blue), 2 * red - green - blue) * 180) / Math.PI);
};

describe('isLightInkOnDark', () => {
  it.each([
    ['white ink on a black export', picture(BLACK, WHITE)],
    ['coloured ink on a black export', picture(BLACK, RED_INK, YELLOW_INK)],
  ])('is true for %s', (_case, data) => {
    expect(isLightInkOnDark(data)).toBe(true);
  });

  it.each([
    ['dark marker on a white export', picture(WHITE, DARK_MARKER)],
    ['coloured ink on a white export', picture(WHITE, RED_INK)],
    ['dark marker on a dimly lit whiteboard photo', picture(DIM_BOARD, DARK_MARKER)],
    ['an empty black image', picture(BLACK)],
    ['a whiteboard photo half in shadow', shadowedBoardPhoto()],
  ])('is false for %s', (_case, data) => {
    expect(isLightInkOnDark(data)).toBe(false);
  });
});

describe('invertLightness', () => {
  it.each([
    ['black', BLACK, WHITE],
    ['white', WHITE, BLACK],
    ['mid grey', [128, 128, 128, 255] as Rgba, [127, 127, 127, 255]],
  ])('turns %s into its opposite lightness', (_case, from, to) => {
    expect(pixelAt(invertLightness(Uint8ClampedArray.from(from)), 0)).toEqual(to);
  });

  it.each([
    ['red', RED_INK],
    ['yellow', YELLOW_INK],
  ])('keeps the hue of %s ink and only darkens it', (_case, ink) => {
    const [after] = [pixelAt(invertLightness(Uint8ClampedArray.from(ink)), 0)];
    expect(hueOf(after)).toBe(hueOf(ink));
    expect(Math.max(...after.slice(0, 3)) + Math.min(...after.slice(0, 3))).toBe(510 - Math.max(...ink.slice(0, 3)) - Math.min(...ink.slice(0, 3)));
  });

  it('leaves alpha alone and does not change its input', () => {
    const input = Uint8ClampedArray.from([10, 20, 30, 77]);
    expect(pixelAt(invertLightness(input), 0)).toEqual([225, 235, 245, 77]);
    expect(Array.from(input)).toEqual([10, 20, 30, 77]);
  });
});

describe('flattenAlpha', () => {
  it('puts dark ink on a transparent export onto white', () => {
    const flat = flattenAlpha(picture(CLEAR, DARK_MARKER));
    expect(pixelAt(flat, 0)).toEqual(DARK_MARKER);
    expect(pixelAt(flat, PIXEL_COUNT - 1)).toEqual(WHITE);
  });

  it('puts light ink on a transparent export onto black, so it stays visible', () => {
    const flat = flattenAlpha(picture(CLEAR, WHITE));
    expect(pixelAt(flat, 0)).toEqual(WHITE);
    expect(pixelAt(flat, PIXEL_COUNT - 1)).toEqual(BLACK);
  });

  it('blends half-transparent ink with the backdrop', () => {
    const flat = flattenAlpha(Uint8ClampedArray.from([0, 0, 0, 128, 0, 0, 0, 255]));
    expect(pixelAt(flat, 0)).toEqual([127, 127, 127, 255]);
  });
});

describe('normaliseBoard', () => {
  it('turns a black export with white and coloured ink into dark ink on white, and says so', () => {
    const { data, inverted } = normaliseBoard(picture(BLACK, WHITE, RED_INK));
    expect(inverted).toBe(true);
    expect(pixelAt(data, 0)).toEqual(BLACK);
    expect(hueOf(pixelAt(data, 1))).toBe(hueOf(RED_INK));
    expect(pixelAt(data, PIXEL_COUNT - 1)).toEqual(WHITE);
  });

  it.each([
    ['a white export', picture(WHITE, RED_INK)],
    ['a dim whiteboard photo', picture(DIM_BOARD, DARK_MARKER)],
  ])('leaves %s as it is', (_case, input) => {
    const { data, inverted } = normaliseBoard(input);
    expect(inverted).toBe(false);
    expect(Array.from(data)).toEqual(Array.from(input));
  });

  it('turns white ink on a transparent export into dark ink on white', () => {
    const { data, inverted } = normaliseBoard(picture(CLEAR, WHITE));
    expect(inverted).toBe(true);
    expect(pixelAt(data, 0)).toEqual(BLACK);
    expect(pixelAt(data, PIXEL_COUNT - 1)).toEqual(WHITE);
  });
});
