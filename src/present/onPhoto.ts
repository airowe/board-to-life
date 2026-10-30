import { linkPoints, SPRING_AMPLITUDE } from '../scene/linkPoints';
import { isLink, type Body, type Scene } from '../scene/schema';

// Playing on the photo: each moving item's own strokes are painted over in the board's colour at the place it was
// drawn, and the item is drawn again wherever the physics puts it. Fixed items stay as the teacher drew them.
// Hand-drawn strokes wobble past what the reader reports, so every patch reaches a little further.
export const PATCH_PAD = 12;
// Where a patch overlaps a fixed item, such as a domino's patch over the floor line, the photo is put back
// inside the fixed item's outline. That outline is padded less, so the moving item leaves at most a sliver.
export const KEEP_PAD = 5;

type Point = { x: number; y: number };
export type Box = { x: number; y: number; width: number; height: number };
export type PatchShape =
  | { kind: 'circle'; x: number; y: number; radius: number }
  | { kind: 'rect'; x: number; y: number; width: number; height: number; angle: number }
  | { kind: 'line'; points: Point[]; width: number };
export type Patch = { id: string; shape: PatchShape; bounds: Box };
export type Pixels = { data: Uint8ClampedArray; width: number; height: number };

const MOVING_KINDS: readonly Body['kind'][] = ['ball', 'block', 'domino', 'lever', 'cart'];

const centreOf = (body: Body): Point => (body.kind === 'ramp' ? { x: (body.x1 + body.x2) / 2, y: (body.y1 + body.y2) / 2 } : { x: body.x, y: body.y });

const boxAround = (points: Point[], reach: number): Box => {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const [left, top] = [Math.min(...xs) - reach, Math.min(...ys) - reach];
  return { x: left, y: top, width: Math.max(...xs) + reach - left, height: Math.max(...ys) + reach - top };
};

const rectPatch = (id: string, x: number, y: number, width: number, height: number, angle: number): Patch => {
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  const corners = [-1, 1].flatMap((sx) =>
    [-1, 1].map((sy) => {
      const [dx, dy] = [(sx * width) / 2, (sy * height) / 2];
      return { x: x + dx * cos - dy * sin, y: y + dx * sin + dy * cos };
    }),
  );
  return { id, shape: { kind: 'rect', x, y, width, height, angle }, bounds: boxAround(corners, 0) };
};

const bodyPatch = (body: Body): Patch | null => {
  switch (body.kind) {
    case 'ball': {
      const radius = body.radius + PATCH_PAD;
      return { id: body.id, shape: { kind: 'circle', x: body.x, y: body.y, radius }, bounds: boxAround([body], radius) };
    }
    case 'cart': {
      const top = body.y - body.height / 2 - PATCH_PAD;
      const bottom = body.y + body.height / 2 + body.wheelRadius + PATCH_PAD;
      return rectPatch(body.id, body.x, (top + bottom) / 2, body.width + 2 * PATCH_PAD, bottom - top, 0);
    }
    case 'block':
    case 'domino':
    case 'lever':
      return rectPatch(body.id, body.x, body.y, body.width + 2 * PATCH_PAD, body.height + 2 * PATCH_PAD, body.angle);
    default:
      return null;
  }
};

// A fixed item normally stays as drawn; once a student drags it somewhere else, its old ink is painted out too.
const movedFixedPatch = (body: Body): Patch | null => {
  switch (body.kind) {
    case 'ramp': {
      const points = [{ x: body.x1, y: body.y1 }, { x: body.x2, y: body.y2 }];
      const width = body.thickness + 2 * PATCH_PAD;
      return { id: body.id, shape: { kind: 'line', points, width }, bounds: boxAround(points, width / 2) };
    }
    case 'wall':
      return rectPatch(body.id, body.x, body.y, body.width + 2 * PATCH_PAD, body.height + 2 * PATCH_PAD, 0);
    default:
      return bodyPatch(body);
  }
};

export const erasePatches = (scene: Scene, movedFixed: readonly string[] = []): Patch[] => {
  const bodies = new Map(scene.items.flatMap((item) => (isLink(item) ? [] : [[item.id, item] as const])));
  const at = (id: string): Point | null => {
    const body = bodies.get(id);
    return body ? centreOf(body) : null;
  };
  return scene.items.flatMap((item): Patch[] => {
    if (!isLink(item)) {
      const patch = MOVING_KINDS.includes(item.kind) ? bodyPatch(item) : movedFixed.includes(item.id) ? movedFixedPatch(item) : null;
      return patch ? [patch] : [];
    }
    // A spring is covered as one wide band along its length, which takes in every coil.
    const points = item.kind === 'spring' ? linkPoints({ ...item, kind: 'rope' }, at) : linkPoints(item, at);
    if (points.length === 0) return [];
    const width = 2 * (PATCH_PAD + (item.kind === 'spring' ? SPRING_AMPLITUDE : 0));
    return [{ id: item.id, shape: { kind: 'line', points, width }, bounds: boxAround(points, width / 2) }];
  });
};

const keepShape = (body: Body): PatchShape | null => {
  switch (body.kind) {
    case 'floor':
    case 'wall':
      return { kind: 'rect', x: body.x, y: body.y, width: body.width + 2 * KEEP_PAD, height: body.height + 2 * KEEP_PAD, angle: 0 };
    case 'ramp': {
      const length = Math.hypot(body.x2 - body.x1, body.y2 - body.y1);
      const angle = Math.atan2(body.y2 - body.y1, body.x2 - body.x1);
      const { x, y } = centreOf(body);
      return { kind: 'rect', x, y, width: length + 2 * KEEP_PAD, height: body.thickness + 2 * KEEP_PAD, angle };
    }
    case 'pulley':
      return { kind: 'circle', x: body.x, y: body.y, radius: body.radius + KEEP_PAD };
    default:
      return null;
  }
};

export const keepShapes = (scene: Scene, movedFixed: readonly string[] = []): PatchShape[] =>
  scene.items.flatMap((item) => {
    const shape = isLink(item) || movedFixed.includes(item.id) ? null : keepShape(item);
    return shape ? [shape] : [];
  });

// The board's colour just around an item, so a patch matches the light where it sits. The median of each channel
// is used rather than the mean, so other strokes crossing the ring, such as a ramp under a ball, do not darken it.
export const ringColour = (pixels: Pixels, box: Box, margin: number): string => {
  const clampX = (value: number): number => Math.min(pixels.width, Math.max(0, Math.round(value)));
  const clampY = (value: number): number => Math.min(pixels.height, Math.max(0, Math.round(value)));
  const [left, right] = [clampX(box.x - margin), clampX(box.x + box.width + margin)];
  const [top, bottom] = [clampY(box.y - margin), clampY(box.y + box.height + margin)];
  const inside = (x: number, y: number): boolean => x >= box.x && x < box.x + box.width && y >= box.y && y < box.y + box.height;
  const histograms = [0, 1, 2].map(() => new Uint32Array(256));
  let count = 0;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      if (inside(x, y)) continue;
      const offset = (y * pixels.width + x) * 4;
      for (const [channel, histogram] of histograms.entries()) {
        const value = pixels.data[offset + channel] ?? 0;
        histogram[value] = (histogram[value] ?? 0) + 1;
      }
      count += 1;
    }
  }
  const median = (histogram: Uint32Array): number => {
    let seen = 0;
    for (const [value, times] of histogram.entries()) {
      seen += times;
      if (seen * 2 > count) return value;
    }
    return 0;
  };
  const [r, g, b] = histograms.map(median);
  return `rgb(${r}, ${g}, ${b})`;
};
