import { describe, expect, it } from 'vitest';
import type { BodySnapshot } from '../physics/simulation';
import type { Scene, SceneItem } from '../scene/schema';
import { FLOOR_Y, STAGE } from './layout';
import {
  FLOOR_TOLERANCE_PX,
  FULCRUM_SIZE,
  PLANK_THICKNESS_FACTOR,
  backgroundFloor,
  backgroundPlacement,
  boardFloorY,
  initialSkin,
  needsFloorBand,
  nextSkin,
  physicsSubject,
  BRICK_COURSE_HEIGHT,
  BRICK_COURSES_IN_PICTURE,
  brickTileSize,
  CONTACT_SHADOW_REACH,
  contactShadow,
  figureBox,
  FIGURE_WIDTH_FACTOR,
  LEG_INSET,
  MOUNT,
  mountFrame,
  pictureFit,
  pictureRect,
  rampSupports,
  shelfSupports,
  spriteBox,
  springCoil,
  wheelTurn,
  type PhysicsSkin,
  type PictureFit,
  type SpriteBox,
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
  const LONE: [SceneItem, string | null][] = [
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
  ];
  it.each(LONE.map(([item, subject]) => [item.kind, item, subject] as const))('draws a lone %s as %s', (_, item, subject) => {
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

  it('lays a plank along a lever, thickened like a ramp', () => {
    const lever: SceneItem = { id: 'lever', kind: 'lever', x: 600, y: 572, width: 680, height: 16, angle: 0, confidence: CONFIDENCE };
    expect(spriteBox(lever, { id: 'lever', x: 600, y: 572, angle: 0.1 })).toEqual({ cx: 600, cy: 572, width: 680, height: 16 * PLANK_THICKNESS_FACTOR, angle: 0.1 });
  });

  it('gives a cart only its body, since the wheels are drawn on their own and turn', () => {
    const cart: SceneItem = { id: 'cart', kind: 'cart', x: 0, y: 0, width: 140, height: 60, wheelRadius: 20, angle: 0, confidence: CONFIDENCE };
    expect(spriteBox(cart, { id: 'cart', x: 200, y: 300, angle: Math.PI / 2 })).toEqual({ cx: 200, cy: 300, width: 140, height: 60, angle: Math.PI / 2 });
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

  it.each(cases)('on a %s canvas reports how far the background floor misses a board floor at %s', (_, canvas, share) => {
    const target = canvas.height * share;
    const placement = backgroundPlacement(canvas, background, target);
    near(placement.floorError, placement.offsetY + background.floorY * placement.scale - target);
  });

  it('reports the worked 3:2 miss: the cover is exact, so the table line stays at the shared fraction', () => {
    const canvas = { width: 1536, height: 1024 };
    const boardFloor = (740 / 800) * canvas.height;
    near(backgroundPlacement(canvas, background, boardFloor).floorError, (FLOOR_Y - 740 / 800) * canvas.height);
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

describe('pictureFit', () => {
  it.each<[string, PictureFit]>([
    ['plank', { mode: 'stretch', anchor: 'centre' }],
    ['weight', { mode: 'contain', anchor: 'top' }],
    ['pendulum-bob', { mode: 'contain', anchor: 'centre' }],
    ['fulcrum', { mode: 'contain', anchor: 'top' }],
    ['cart', { mode: 'stretch', anchor: 'centre' }],
    ['peg-figure', { mode: 'contain', anchor: 'bottom' }],
    ['pulley', { mode: 'contain', anchor: 'centre' }],
    ['steel-ball', { mode: 'contain', anchor: 'centre' }],
    ['wooden-block', { mode: 'stretch', anchor: 'centre' }],
    ['domino', { mode: 'stretch', anchor: 'centre' }],
  ])('fits %s as %j', (subject, fit) => {
    expect(pictureFit(subject)).toEqual(fit);
  });
});

describe('pictureRect', () => {
  const square: SpriteBox = { cx: 500, cy: 400, width: 60, height: 60, angle: 0.4 };
  const WEIGHT_PICTURE = { width: 324, height: 512 };
  const PULLEY_PICTURE = { width: 394, height: 512 };
  const PLANK_PICTURE = { width: 512, height: 119 };

  it('stretches a plank over its whole box', () => {
    const plank: SpriteBox = { cx: 0, cy: 0, width: 570, height: 24, angle: 0.77 };
    expect(pictureRect(plank, PLANK_PICTURE, pictureFit('plank'))).toEqual({ x: -285, y: -12, width: 570, height: 24 });
  });

  it('fills a thin domino box exactly with the wider domino picture, so it shows the whole body that tips', () => {
    const domino: SceneItem = { id: 'domino', kind: 'domino', x: 300, y: 685, width: 20, height: 110, angle: 0, confidence: CONFIDENCE };
    const box = spriteBox(domino, { id: 'domino', x: 300, y: 685, angle: 0.3 });
    if (!box) throw new Error('expected a box for the domino');
    expect(pictureRect(box, { width: 217, height: 512 }, pictureFit('domino'))).toEqual({ x: -10, y: -55, width: 20, height: 110 });
  });

  it('keeps a tall weight its own shape, hung from the top centre of a square box', () => {
    const rect = pictureRect(square, WEIGHT_PICTURE, pictureFit('weight'));
    near(rect.height, 60);
    near(rect.width, (60 * WEIGHT_PICTURE.width) / WEIGHT_PICTURE.height);
    near(rect.x, -rect.width / 2);
    near(rect.y, -30);
  });

  it('keeps a pulley its own shape, centred in its box', () => {
    const rect = pictureRect({ ...square, width: 28, height: 28 }, PULLEY_PICTURE, pictureFit('pulley'));
    near(rect.width / rect.height, PULLEY_PICTURE.width / PULLEY_PICTURE.height);
    near(rect.height, 28);
    near(rect.x + rect.width / 2, 0);
    near(rect.y + rect.height / 2, 0);
  });

  it('sits a wide picture on the bottom of a tall box', () => {
    const rect = pictureRect({ ...square, width: 140, height: 80 }, { width: 512, height: 141 }, pictureFit('peg-figure'));
    near(rect.width, 140);
    near(rect.height, (140 * 141) / 512);
    near(rect.y + rect.height, 40);
  });

  it.each([
    ['wide', { width: 512, height: 100 }],
    ['tall', { width: 100, height: 512 }],
    ['square', { width: 256, height: 256 }],
  ])('never lets a %s contained picture spill out of its box', (_, picture) => {
    for (const anchor of ['top', 'centre', 'bottom'] as const) {
      const rect = pictureRect({ ...square, width: 80, height: 50 }, picture, { mode: 'contain', anchor });
      expect(rect.x).toBeGreaterThanOrEqual(-40 - 1e-9);
      expect(rect.y).toBeGreaterThanOrEqual(-25 - 1e-9);
      expect(rect.x + rect.width).toBeLessThanOrEqual(40 + 1e-9);
      expect(rect.y + rect.height).toBeLessThanOrEqual(25 + 1e-9);
      near(rect.width / rect.height, picture.width / picture.height);
    }
  });
});

describe('brickTileSize', () => {
  const BRICK_PICTURE = { width: 512, height: 477 };

  it('scales the brick picture so one course is the brick course height, keeping its shape', () => {
    const tile = brickTileSize(BRICK_PICTURE);
    near(tile.height, BRICK_COURSE_HEIGHT * BRICK_COURSES_IN_PICTURE);
    near(tile.width / tile.height, BRICK_PICTURE.width / BRICK_PICTURE.height);
  });

  it('does not depend on the wall it fills', () => {
    expect(brickTileSize(BRICK_PICTURE)).toEqual(brickTileSize(BRICK_PICTURE));
  });
});

describe('needsFloorBand', () => {
  const placementMissingBy = (floorError: number) => ({ scale: 1, offsetX: 0, offsetY: 0, floorError });

  it.each([
    ['lands on the board floor', 0, false],
    ['is just within the tolerance above', -FLOOR_TOLERANCE_PX, false],
    ['is just within the tolerance below', FLOOR_TOLERANCE_PX, false],
    ['sits above the board floor, as on a 3:2 screen', -66, true],
    ['sits below the board floor', FLOOR_TOLERANCE_PX + 1, true],
  ])('when the table line %s (%s px) draws a band: %s', (_, error, band) => {
    expect(needsFloorBand(placementMissingBy(error))).toBe(band);
  });
});

describe('a passenger on a cart', () => {
  const cart = (angle: number): SceneItem => ({ id: 'cart', kind: 'cart', x: 300, y: 500, width: 150, height: 36, wheelRadius: 18, angle, confidence: CONFIDENCE });
  const domino = (x: number, y: number): SceneItem => ({ id: 'rider', kind: 'domino', x, y, width: 20, height: 120, angle: 0, confidence: CONFIDENCE });
  const CART_TOP_TO_RIDER_CENTRE = 18 + 60;
  const TILT = Math.PI / 6;

  it('draws a domino standing on a level cart as a figure', () => {
    expect(subjectIn([cart(0), domino(310, 500 - CART_TOP_TO_RIDER_CENTRE)], 'rider')).toBe('peg-figure');
  });

  it('draws a domino standing on a tilted cart as a figure', () => {
    const [x, y] = [300 + CART_TOP_TO_RIDER_CENTRE * Math.sin(TILT), 500 - CART_TOP_TO_RIDER_CENTRE * Math.cos(TILT)];
    expect(subjectIn([cart(TILT), domino(x, y)], 'rider')).toBe('peg-figure');
  });

  it.each([
    ['beyond the end of the cart', 500, 500 - CART_TOP_TO_RIDER_CENTRE],
    ['on the table below the cart', 310, 700],
    ['well above the cart', 310, 200],
  ])('keeps a domino %s as a domino', (_where, x, y) => {
    expect(subjectIn([cart(0), domino(x, y)], 'rider')).toBe('domino');
  });

  it('keeps every domino as a domino when there is no cart', () => {
    expect(subjectIn([domino(310, 400)], 'rider')).toBe('domino');
  });

  it('widens the figure box about its centre, since a domino is thinner than a person', () => {
    const box = { cx: 100, cy: 200, width: 20, height: 120, angle: 0.3 };
    expect(figureBox(box)).toEqual({ ...box, width: 20 * FIGURE_WIDTH_FACTOR });
  });
});

describe('rampSupports', () => {
  const THICKNESS = 16;
  const rampOf = (x1: number, y1: number, x2: number, y2: number) =>
    ({ id: 'ramp', kind: 'ramp', x1, y1, x2, y2, thickness: THICKNESS, confidence: CONFIDENCE }) as const;

  it('stands a ramp resting on the floor on one leg under its high end', () => {
    const legs = rampSupports(rampOf(100, 340, 500, 738), FLOOR_TOP);
    expect(legs).toHaveLength(1);
    const [leg] = legs as [SpriteBox];
    const [x, y] = [100 + LEG_INSET * 400, 340 + LEG_INSET * 398];
    near(leg.cx, x);
    near(leg.cy, (y + FLOOR_TOP) / 2);
    near(leg.width, FLOOR_TOP - y);
    expect(leg.height).toBe(THICKNESS * PLANK_THICKNESS_FACTOR);
    expect(leg.angle).toBe(Math.PI / 2);
  });

  it('stands a raised shelf on two legs', () => {
    expect(rampSupports(rampOf(100, 300, 500, 300), FLOOR_TOP)).toHaveLength(2);
  });

  it('gives no legs to a ramp lying on the floor', () => {
    expect(rampSupports(rampOf(100, 735, 500, 738), FLOOR_TOP)).toEqual([]);
  });

  it('does not depend on which end was drawn first', () => {
    const [one] = rampSupports(rampOf(100, 340, 500, 738), FLOOR_TOP);
    const [other] = rampSupports(rampOf(500, 738, 100, 340), FLOOR_TOP);
    expect(other).toEqual(one);
  });
});

describe('contactShadow', () => {
  const standing = { cx: 300, cy: FLOOR_TOP - 55, width: 20, height: 110, angle: 0 };

  it('is darkest and tightest for something on the table', () => {
    const shadow = contactShadow(standing, FLOOR_TOP);
    if (!shadow) throw new Error('expected a shadow');
    expect(shadow.cx).toBe(300);
    expect(shadow.cy).toBe(FLOOR_TOP);
    near(shadow.rx, 10);
    expect(shadow.alpha).toBeGreaterThan(0.2);
  });

  it('fades and spreads as the thing rises', () => {
    const near_ = contactShadow(standing, FLOOR_TOP);
    const high = contactShadow({ ...standing, cy: standing.cy - CONTACT_SHADOW_REACH / 2 }, FLOOR_TOP);
    if (!near_ || !high) throw new Error('expected shadows');
    expect(high.alpha).toBeLessThan(near_.alpha);
    expect(high.rx).toBeGreaterThan(near_.rx);
  });

  it('is gone beyond its reach', () => {
    expect(contactShadow({ ...standing, cy: standing.cy - CONTACT_SHADOW_REACH - 1 }, FLOOR_TOP)).toBeNull();
  });

  it('widens when a thing topples, as its shadow lies along its length', () => {
    const fallen = contactShadow({ ...standing, cy: FLOOR_TOP - 10, angle: Math.PI / 2 }, FLOOR_TOP);
    if (!fallen) throw new Error('expected a shadow');
    near(fallen.rx, 55);
  });
});

describe('wheelTurn', () => {
  const cart: SceneItem = { id: 'cart', kind: 'cart', x: 200, y: 500, width: 150, height: 36, wheelRadius: 20, angle: 0, confidence: CONFIDENCE };
  const at = (x: number): BodySnapshot => ({ id: 'cart', x, y: 500, angle: 0 });

  it.each([
    ['still at the start', 200, 0],
    ['rolled forward one radius', 220, 1],
    ['rolled back one radius', 180, -1],
  ])('is %s', (_name, x, turn) => {
    if (cart.kind !== 'cart') throw new Error('expected a cart');
    near(wheelTurn(cart, at(x)), turn);
  });
});

describe('what holds things up', () => {
  const FLOOR = FLOOR_TOP;
  const pivot: SceneItem = { id: 'pivot', kind: 'pivot', x: 600, y: 200, confidence: CONFIDENCE };
  const hanging = ball('bob', 600, 500);
  const tie: SceneItem = { id: 'tie', kind: 'rope', from: 'pivot', to: 'bob', length: 300, confidence: CONFIDENCE };
  const wheel = pulley('wheel', 600, 200);

  it('draws no fulcrum for a pivot something hangs from', () => {
    expect(subjectIn([pivot, hanging, tie], 'pivot')).toBe(MOUNT);
  });

  it('keeps the fulcrum under a pivot nothing hangs from', () => {
    expect(subjectIn([pivot, hanging], 'pivot')).toBe('fulcrum');
  });

  it('hangs a pendulum from a beam on two posts reaching the table', () => {
    if (pivot.kind !== 'pivot') throw new Error('expected a pivot');
    const [beam, left, right] = mountFrame(pivot, sceneOf([pivot, hanging, tie]), FLOOR) as [SpriteBox, SpriteBox, SpriteBox];
    expect(beam.angle).toBe(0);
    near(beam.cy + beam.height / 2, 200);
    for (const post of [left, right]) {
      expect(post.angle).toBe(Math.PI / 2);
      near(post.cy + post.width / 2, FLOOR);
      near(post.cy - post.width / 2, 200);
    }
    expect(left.cx).toBeLessThan(600);
    expect(right.cx).toBeGreaterThan(600);
  });

  it('hangs a pulley from a beam above its wheel', () => {
    if (wheel.kind !== 'pulley') throw new Error('expected a pulley');
    const [beam] = mountFrame(wheel, sceneOf([wheel]), FLOOR) as [SpriteBox];
    near(beam.cy + beam.height / 2, 200 - 14);
  });

  it('keeps the frame on the drawing', () => {
    const edge: SceneItem = { id: 'wheel', kind: 'pulley', x: 40, y: 200, radius: 14, confidence: CONFIDENCE };
    if (edge.kind !== 'pulley') throw new Error('expected a pulley');
    const [beam] = mountFrame(edge, sceneOf([edge]), FLOOR) as [SpriteBox];
    expect(beam.cx - beam.width / 2).toBeGreaterThanOrEqual(0);
  });

  it('needs no frame for a fulcrum on the table', () => {
    if (pivot.kind !== 'pivot') throw new Error('expected a pivot');
    expect(mountFrame(pivot, sceneOf([pivot]), FLOOR)).toEqual([]);
  });

  it.each([
    ['a raised shelf', 500, 300, 400, 20, 2],
    ['a shelf resting on the table', 500, FLOOR - 10, 400, 20, 0],
    ['a tall wall', 900, 400, 40, 300, 0],
  ])('gives %s the right legs', (_name, x, y, width, height, legs) => {
    const wall = { id: 'wall', kind: 'wall', x, y, width, height, confidence: CONFIDENCE } as const;
    expect(shelfSupports(wall, FLOOR)).toHaveLength(legs);
  });
});

describe('springCoil', () => {
  const [from, to] = [{ x: 100, y: 100 }, { x: 100, y: 400 }];

  it('starts and ends on the two things the spring joins', () => {
    const coil = springCoil(from, to);
    expect(coil[0]).toEqual(from);
    expect(coil.at(-1)).toEqual(to);
  });

  it('loops either side of the line between them', () => {
    const across = springCoil(from, to).map((point) => point.x - from.x);
    expect(Math.min(...across)).toBeLessThan(-5);
    expect(Math.max(...across)).toBeGreaterThan(5);
  });

  it('stretches with the spring and keeps its coil count', () => {
    expect(springCoil(from, { x: 100, y: 700 })).toHaveLength(springCoil(from, to).length);
  });
});
