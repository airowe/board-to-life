import { describe, expect, it } from 'vitest';
import { validateScene, type Scene } from '../scene/schema';
import { erasePatches, KEEP_PAD, keepShapes, PATCH_PAD, ringColour, type Pixels } from './onPhoto';

const sceneFrom = (items: unknown[], joints: unknown[] = []): Scene => {
  const result = validateScene({
    version: 1,
    drawing: { width: 1200, height: 800 },
    items,
    joints,
    labels: [],
    unknownMarks: [],
    predictPoints: [],
  });
  if (!result.ok) throw new Error(result.errors.join('; '));
  return result.scene;
};

const floor = { id: 'floor', kind: 'floor', x: 600, y: 770, width: 1200, height: 60, confidence: 0.9 };
const ball = { id: 'ball', kind: 'ball', x: 100, y: 200, radius: 30, confidence: 0.9 };
const domino = { id: 'domino-1', kind: 'domino', x: 500, y: 685, width: 18, height: 110, angle: 0, confidence: 0.9 };
const pulley = { id: 'pulley', kind: 'pulley', x: 600, y: 200, radius: 14, confidence: 0.9 };
const ramp = { id: 'ramp', kind: 'ramp', x1: 50, y1: 250, x2: 400, y2: 700, thickness: 12, confidence: 0.9 };

describe('erasePatches', () => {
  it('covers only the items that move, not fixed ones the photo keeps', () => {
    const patches = erasePatches(sceneFrom([floor, ramp, pulley, ball, domino]));
    expect(patches.map((patch) => patch.id)).toEqual(['ball', 'domino-1']);
  });

  it('covers a ball with a padded circle at its drawn place', () => {
    const [patch] = erasePatches(sceneFrom([ball]));
    expect(patch?.shape).toEqual({ kind: 'circle', x: 100, y: 200, radius: 30 + PATCH_PAD });
    expect(patch?.bounds).toEqual({ x: 100 - 30 - PATCH_PAD, y: 200 - 30 - PATCH_PAD, width: 2 * (30 + PATCH_PAD), height: 2 * (30 + PATCH_PAD) });
  });

  it('covers an upright domino with a padded rectangle', () => {
    const [patch] = erasePatches(sceneFrom([domino]));
    expect(patch?.shape).toEqual({ kind: 'rect', x: 500, y: 685, width: 18 + 2 * PATCH_PAD, height: 110 + 2 * PATCH_PAD, angle: 0 });
  });

  it('bounds a tilted block by its rotated corners', () => {
    const tilted = { id: 'block', kind: 'block', x: 300, y: 300, width: 100, height: 100, angle: Math.PI / 4, confidence: 0.9 };
    const [patch] = erasePatches(sceneFrom([tilted]));
    const halfDiagonal = Math.SQRT2 * (50 + PATCH_PAD);
    expect(patch?.bounds.x).toBeCloseTo(300 - halfDiagonal);
    expect(patch?.bounds.width).toBeCloseTo(2 * halfDiagonal);
  });

  it('covers a cart down to the bottom of its wheels', () => {
    const cart = { id: 'cart', kind: 'cart', x: 200, y: 690, width: 140, height: 60, wheelRadius: 20, angle: 0, confidence: 0.9 };
    const [patch] = erasePatches(sceneFrom([cart]));
    const bottom = (patch?.bounds.y ?? 0) + (patch?.bounds.height ?? 0);
    expect(bottom).toBeCloseTo(690 + 60 / 2 + 20 + PATCH_PAD);
  });

  it('covers a rope along its drawn path with a wide stroke', () => {
    const rope = { id: 'rope', kind: 'rope', from: 'pulley', to: 'ball', length: 500, confidence: 0.9 };
    const patches = erasePatches(sceneFrom([pulley, ball, rope]));
    const ropePatch = patches.find((patch) => patch.id === 'rope');
    expect(ropePatch?.shape).toMatchObject({ kind: 'line', points: [{ x: 600, y: 200 }, { x: 100, y: 200 }] });
  });
});

describe('keepShapes', () => {
  it('keeps the fixed items, slightly padded, and none of the moving ones', () => {
    const shapes = keepShapes(sceneFrom([floor, ball, domino, pulley]));
    expect(shapes).toEqual([
      { kind: 'rect', x: 600, y: 770, width: 1200 + 2 * KEEP_PAD, height: 60 + 2 * KEEP_PAD, angle: 0 },
      { kind: 'circle', x: 600, y: 200, radius: 14 + KEEP_PAD },
    ]);
  });

  it('keeps a ramp as a band along its length', () => {
    const [shape] = keepShapes(sceneFrom([ramp]));
    const length = Math.hypot(400 - 50, 700 - 250);
    expect(shape).toMatchObject({ kind: 'rect', x: 225, y: 475, height: 12 + 2 * KEEP_PAD });
    expect(shape?.kind === 'rect' && shape.width).toBeCloseTo(length + 2 * KEEP_PAD);
    expect(shape?.kind === 'rect' && shape.angle).toBeCloseTo(Math.atan2(450, 350));
  });

  it('pads less than a patch, so a moving item leaves only a sliver behind', () => {
    expect(KEEP_PAD).toBeLessThan(PATCH_PAD);
  });
});

const pixelsOf = (width: number, height: number, colourAt: (x: number, y: number) => [number, number, number]): Pixels => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data.set([...colourAt(x, y), 255], (y * width + x) * 4);
    }
  }
  return { data, width, height };
};

describe('ringColour', () => {
  const INK: [number, number, number] = [20, 30, 60];
  const BOARD: [number, number, number] = [230, 228, 220];
  const box = { x: 40, y: 40, width: 20, height: 20 };
  const inBox = (x: number, y: number): boolean => x >= 40 && x < 60 && y >= 40 && y < 60;

  it('averages the board around a box and ignores the ink inside it', () => {
    const pixels = pixelsOf(100, 100, (x, y) => (inBox(x, y) ? INK : BOARD));
    expect(ringColour(pixels, box, 6)).toBe('rgb(230, 228, 220)');
  });

  it('ignores other ink that crosses the ring, such as a ramp under a ball', () => {
    const pixels = pixelsOf(100, 100, (x, y) => (inBox(x, y) || x === 36 || x === 37 ? INK : BOARD));
    expect(ringColour(pixels, box, 6)).toBe('rgb(230, 228, 220)');
  });

  it('follows the light on the side of the ring with more board', () => {
    const pixels = pixelsOf(100, 100, (x) => (x < 45 ? [200, 200, 200] : [240, 240, 240]));
    expect(ringColour(pixels, box, 6)).toBe('rgb(240, 240, 240)');
  });

  it('keeps to the image when the box sits on its edge', () => {
    const pixels = pixelsOf(30, 30, () => BOARD);
    expect(ringColour(pixels, { x: -5, y: -5, width: 10, height: 10 }, 6)).toBe('rgb(230, 228, 220)');
  });
});
