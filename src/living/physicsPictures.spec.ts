import { describe, expect, it } from 'vitest';
import type { BodySnapshot } from '../physics/simulation';
import type { Scene, SceneItem } from '../scene/schema';
import { FLOOR_Y, STAGE } from './layout';
import {
  FULCRUM_SIZE,
  PLANK_THICKNESS_FACTOR,
  backgroundFloor,
  backgroundPlacement,
  boardFloorY,
  initialSkin,
  nextSkin,
  physicsSubject,
  spriteBox,
  type PhysicsSkin,
} from './physicsPictures';

const DRAWING = { width: 1200, height: 800 };
const CONFIDENCE = 0.9;
const FLOOR_TOP = 740;
const PIXEL = 1;

const sceneOf = (items: SceneItem[]): Scene => ({
  version: 1,
  drawing: DRAWING,
  items,
  joints: [],
  labels: [],
  unknownMarks: [],
  predictPoints: [],
});

const floor: SceneItem = { id: 'floor', kind: 'floor', x: 600, y: FLOOR_TOP + 30, width: 1200, height: 60, confidence: CONFIDENCE };
const ball = (id: string, x: number, y: number): SceneItem => ({ id, kind: 'ball', x, y, radius: 30, confidence: CONFIDENCE });
const block = (id: string, x: number, y: number): SceneItem => ({ id, kind: 'block', x, y, width: 60, height: 60, angle: 0, confidence: CONFIDENCE });
const pulley = (id: string, x: number, y: number): SceneItem => ({ id, kind: 'pulley', x, y, radius: 14, confidence: CONFIDENCE });
const rope = (from: string, to: string, over?: string): SceneItem => ({
  id: `rope-${from}-${to}`,
  kind: 'rope',
  from,
  to,
  ...(over ? { over } : {}),
  length: 300,
  confidence: CONFIDENCE,
});
const spring = (from: string, to: string): SceneItem => ({ id: `spring-${from}-${to}`, kind: 'spring', from, to, length: 200, confidence: CONFIDENCE });
const ramp: SceneItem = { id: 'ramp', kind: 'ramp', x1: 60, y1: 330, x2: 470, y2: 728, thickness: 16, confidence: CONFIDENCE };

const subjectIn = (items: SceneItem[], id: string): string | null => {
  const item = items.find((each) => each.id === id);
  if (!item) throw new Error(`no item "${id}"`);
  return physicsSubject(item, sceneOf(items));
};

describe('physicsSubject', () => {
  it.each<[SceneItem, string | null]>([
    [ball('ball', 300, 700), 'steel-ball'],
    [block('block', 300, 700), 'wooden-block'],
    [{ id: 'domino', kind: 'domino', x: 300, y: 685, width: 20, height: 110, angle: 0, confidence: CONFIDENCE }, 'domino'],
    [ramp, 'plank'],
    [{ id: 'lever', kind: 'lever', x: 600, y: 572, width: 680, height: 16, angle: 0, confidence: CONFIDENCE }, 'plank'],
    [{ id: 'wall', kind: 'wall', x: 350, y: 560, width: 500, height: 320, confidence: CONFIDENCE }, 'brick-wall'],
    [{ id: 'cart', kind: 'cart', x: 160, y: 690, width: 140, height: 60, wheelRadius: 20, angle: 0, confidence: CONFIDENCE }, 'cart'],
    [pulley('pulley', 330, 280), 'pulley'],
    [{ id: 'pivot', kind: 'pivot', x: 600, y: 580, confidence: CONFIDENCE }, 'fulcrum'],
    [floor, null],
    [rope('a', 'b'), null],
    [spring('a', 'b'), null],
  ])('draws a lone %s as %s', (item, subject) => {
    expect(physicsSubject(item, sceneOf([item, ball('a', 100, 100), ball('b', 200, 100)]))).toBe(subject);
  });

  it('draws a ball hanging from a rope with nothing under it as a pendulum bob', () => {
    expect(subjectIn([pulley('top', 600, 200), ball('ball', 600, 500), rope('top', 'ball')], 'ball')).toBe('pendulum-bob');
  });

  it('draws a block on a spring below its anchor as a weight', () => {
    expect(subjectIn([pulley('top', 600, 200), block('block', 600, 450), spring('top', 'block')], 'block')).toBe('weight');
  });

  it('draws a ball resting on a ramp as a steel ball', () => {
    expect(subjectIn([floor, ramp, ball('ball', 120, 300)], 'ball')).toBe('steel-ball');
  });

  it('counts a bob let go level with its anchor as hanging, as in the pendulum samples', () => {
    expect(subjectIn([pulley('top', 330, 280), ball('ball', 700, 280), rope('top', 'ball')], 'ball')).toBe('pendulum-bob');
  });

  it('draws a ball tied to something lower as a steel ball', () => {
    expect(subjectIn([floor, block('anchor', 300, 700), ball('ball', 600, 400), rope('ball', 'anchor')], 'ball')).toBe('steel-ball');
  });

  it('judges a rope over a pulley by the pulley, so the table block stays wooden and the hanging one is a weight', () => {
    const items = [floor, block('table-block', 250, 370), pulley('wheel', 620, 380), block('hanging', 1000, 380), rope('table-block', 'hanging', 'wheel')];
    expect([subjectIn(items, 'table-block'), subjectIn(items, 'hanging')]).toEqual(['wooden-block', 'weight']);
  });
});

const near = (actual: number, expected: number): void => expect(actual).toBeCloseTo(expected, 6);

describe('spriteBox', () => {
  it('fits a ball to a square twice its radius, turned with its body', () => {
    const body: BodySnapshot = { id: 'ball', x: 410, y: 520, angle: 1.2 };
    expect(spriteBox(ball('ball', 0, 0), body)).toEqual({ cx: 410, cy: 520, width: 60, height: 60, angle: 1.2 });
  });

  it('fits a tipped domino to its own width and height at the body angle', () => {
    const domino: SceneItem = { id: 'domino', kind: 'domino', x: 300, y: 685, width: 20, height: 110, angle: 0, confidence: CONFIDENCE };
    const body: BodySnapshot = { id: 'domino', x: 330, y: 700, angle: Math.PI / 3 };
    expect(spriteBox(domino, body)).toEqual({ cx: 330, cy: 700, width: 20, height: 110, angle: Math.PI / 3 });
  });

  it('lays a plank along a sloped ramp, thickened by the plank factor', () => {
    const box = spriteBox(ramp, undefined);
    if (!box) throw new Error('expected a box for the ramp');
    near(box.cx, 265);
    near(box.cy, 529);
    near(box.width, Math.hypot(410, 398));
    near(box.height, 16 * PLANK_THICKNESS_FACTOR);
    near(box.angle, Math.atan2(398, 410));
  });

  it('stands a fulcrum under its pivot point', () => {
    expect(spriteBox({ id: 'pivot', kind: 'pivot', x: 600, y: 580, confidence: CONFIDENCE }, undefined)).toEqual({
      cx: 600,
      cy: 580 + FULCRUM_SIZE.height / 2,
      width: FULCRUM_SIZE.width,
      height: FULCRUM_SIZE.height,
      angle: 0,
    });
  });

  it('includes the wheels in a cart, dropped along its turned body', () => {
    const cart: SceneItem = { id: 'cart', kind: 'cart', x: 0, y: 0, width: 140, height: 60, wheelRadius: 20, angle: 0, confidence: CONFIDENCE };
    const box = spriteBox(cart, { id: 'cart', x: 200, y: 300, angle: Math.PI / 2 });
    if (!box) throw new Error('expected a box for the cart');
    near(box.cx, 190);
    near(box.cy, 300);
    expect([box.width, box.height]).toEqual([140, 80]);
  });

  it.each<[string, SceneItem]>([
    ['a moving ball', ball('ball', 0, 0)],
    ['a block', block('block', 0, 0)],
  ])('has no box for %s without its body', (_, item) => {
    expect(spriteBox(item, undefined)).toBeNull();
  });

  it.each<[string, SceneItem]>([
    ['a rope', rope('a', 'b')],
    ['a spring', spring('a', 'b')],
  ])('has no box for %s', (_, item) => {
    expect(spriteBox(item, { id: item.id, x: 0, y: 0, angle: 0 })).toBeNull();
  });
});

describe('backgroundFloor', () => {
  it('puts the floor at the shared floor fraction of the background height', () => {
    expect(backgroundFloor(STAGE)).toEqual({ ...STAGE, floorY: FLOOR_Y * STAGE.height });
  });
});

describe('backgroundPlacement', () => {
  const background = backgroundFloor(STAGE);
  const ASPECTS: [string, { width: number; height: number }][] = [
    ['16:9', { width: 1600, height: 900 }],
    ['4:3', { width: 1024, height: 768 }],
    ['1:2', { width: 400, height: 800 }],
    ['3:1', { width: 1800, height: 600 }],
  ];
  const FLOOR_SHARES = [0, 0.2, 0.5, 0.75, 0.86, 0.95, 1];
  const cases = ASPECTS.flatMap(([name, canvas]) => FLOOR_SHARES.map((share) => [name, canvas, share] as const));

  it.each(cases)('covers a %s canvas with no gap for a floor at %s of its height', (_, canvas, share) => {
    const placement = backgroundPlacement(canvas, background, canvas.height * share);
    expect(placement.offsetX).toBeLessThanOrEqual(0);
    expect(placement.offsetY).toBeLessThanOrEqual(0);
    expect(placement.offsetX + background.width * placement.scale).toBeGreaterThanOrEqual(canvas.width - PIXEL / 1000);
    expect(placement.offsetY + background.height * placement.scale).toBeGreaterThanOrEqual(canvas.height - PIXEL / 1000);
  });

  it.each(cases)('on a %s canvas puts the background floor as close as the cover allows to a board floor at %s', (_, canvas, share) => {
    const target = canvas.height * share;
    const placement = backgroundPlacement(canvas, background, target);
    const floorOnCanvas = placement.offsetY + background.floorY * placement.scale;
    const [lowest, highest] = [canvas.height - background.height * placement.scale, 0];
    const wanted = target - background.floorY * placement.scale;
    const reachable = wanted >= lowest && wanted <= highest;
    if (reachable) expect(Math.abs(floorOnCanvas - target)).toBeLessThanOrEqual(PIXEL);
    else expect(placement.offsetY).toBeCloseTo(wanted < lowest ? lowest : highest, 6);
  });

  it('scales a 3:1 canvas by its width, so the floor can travel', () => {
    const canvas = { width: 1800, height: 600 };
    const placement = backgroundPlacement(canvas, background, 500);
    expect(placement.scale).toBeCloseTo(canvas.width / background.width, 6);
    expect(placement.offsetY + background.floorY * placement.scale).toBeCloseTo(500, 6);
  });

  it('centres the spare width on a tall canvas', () => {
    const canvas = { width: 400, height: 800 };
    const placement = backgroundPlacement(canvas, background, 700);
    expect(placement.offsetX).toBeCloseTo((canvas.width - background.width * placement.scale) / 2, 6);
  });
});

describe('boardFloorY', () => {
  it('is the top of the floor item', () => {
    expect(boardFloorY(sceneOf([ball('ball', 300, 200), floor]))).toBe(FLOOR_TOP);
  });

  it('is the lowest body bottom without a floor', () => {
    const rampLowCorner = 728 + 8 * Math.cos(Math.atan2(398, 410));
    expect(boardFloorY(sceneOf([ball('ball', 300, 200), block('block', 500, 610), ramp]))).toBeCloseTo(rampLowCorner, 6);
  });

  it('is the bottom of the drawing when nothing is on it', () => {
    expect(boardFloorY(sceneOf([]))).toBe(DRAWING.height);
  });
});

describe('skins', () => {
  it.each<[boolean, boolean, PhysicsSkin]>([
    [true, true, 'pictures'],
    [true, false, 'pictures'],
    [false, true, 'photo'],
    [false, false, 'clean'],
  ])('opens with the library loaded %s and a photo %s on %s', (libraryLoaded, hasPhoto, skin) => {
    expect(initialSkin(libraryLoaded, hasPhoto)).toBe(skin);
  });

  it('opens on pictures whenever the library loaded', () => {
    expect(initialSkin(true)).toBe('pictures');
  });

  it.each<[PhysicsSkin, boolean, PhysicsSkin]>([
    ['pictures', true, 'photo'],
    ['photo', true, 'clean'],
    ['clean', true, 'pictures'],
    ['pictures', false, 'clean'],
    ['clean', false, 'pictures'],
  ])('moves from %s with a photo %s to %s', (skin, hasPhoto, next) => {
    expect(nextSkin(skin, hasPhoto)).toBe(next);
  });

  it.each<[PhysicsSkin, PhysicsSkin]>([
    ['photo', 'clean'],
    ['clean', 'photo'],
  ])('without pictures toggles from %s to %s, as before', (skin, next) => {
    expect(nextSkin(skin, true, false)).toBe(next);
  });
});
