import { describe, expect, it } from 'vitest';
import { changedFixedItems, gripPoint, moveGrip, pickGrip, rampHandles, type Grip } from './edit';
import { rampBallDominoes } from './fixtures';
import { validateScene, type Body, type Scene } from './schema';
import { outlineOf, penetration } from './shapes';

const REACH = 30;
const NEAR = 1;

const sceneFrom = (input: unknown): Scene => {
  const result = validateScene(input);
  if (!result.ok) throw new Error(result.errors.join('; '));
  return result.scene;
};

const sample = (): Scene => sceneFrom(rampBallDominoes);

const empty = { version: 1, drawing: { width: 1200, height: 800 }, joints: [], labels: [], unknownMarks: [], predictPoints: [] };
const pendulum = (): Scene =>
  sceneFrom({
    ...empty,
    items: [
      { id: 'pulley', kind: 'pulley', x: 330, y: 280, radius: 14, confidence: 0.9 },
      { id: 'ball', kind: 'ball', x: 700, y: 280, radius: 30, confidence: 0.9 },
      { id: 'rope', kind: 'rope', from: 'pulley', to: 'ball', length: 370, confidence: 0.9 },
    ],
  });
const seesaw = (): Scene =>
  sceneFrom({
    ...empty,
    items: [
      { id: 'pivot', kind: 'pivot', x: 600, y: 600, confidence: 0.9 },
      { id: 'lever', kind: 'lever', x: 600, y: 592, width: 600, height: 16, angle: 0, confidence: 0.9 },
    ],
    joints: [{ id: 'pin', kind: 'pin', a: 'lever', b: 'pivot', x: 600, y: 592 }],
  });

const body = (scene: Scene, id: string): Body => {
  const found = scene.items.find((item) => item.id === id);
  if (!found || found.kind === 'rope' || found.kind === 'spring') throw new Error(`no body ${id}`);
  return found;
};

const moved = (scene: Scene, grip: Grip, to: { x: number; y: number }): Scene => {
  const result = moveGrip(scene, grip, to);
  if (!result.ok) throw new Error(result.reason);
  return result.scene;
};

describe('pickGrip', () => {
  it.each([
    { name: 'the top of a domino', point: { x: 784, y: 640 }, grip: { id: 'domino-3', part: 'body' } },
    { name: 'just beside a domino', point: { x: 784 + 9 + REACH / 2, y: 700 }, grip: { id: 'domino-3', part: 'body' } },
    { name: 'the ball', point: { x: 104, y: 330 }, grip: { id: 'ball', part: 'body' } },
    { name: 'the top end of the ramp', point: { x: 60, y: 330 }, grip: { id: 'ramp', part: 'start' } },
    { name: 'the bottom end of the ramp', point: { x: 465, y: 720 }, grip: { id: 'ramp', part: 'end' } },
    { name: 'the wall', point: { x: 1150, y: 500 }, grip: { id: 'wall', part: 'body' } },
  ])('grabs $name', ({ point, grip }) => {
    expect(pickGrip(sample(), point, REACH)).toEqual(grip);
  });

  it.each([
    { name: 'empty board', point: { x: 600, y: 200 } },
    { name: 'the floor, which stays put', point: { x: 300, y: 780 } },
    { name: 'the middle of the ramp, which only moves by its ends', point: { x: 265, y: 529 } },
  ])('grabs nothing on $name', ({ point }) => {
    expect(pickGrip(sample(), point, REACH)).toBeNull();
  });
});

describe('gripPoint', () => {
  it.each([
    { grip: { id: 'ball', part: 'body' }, point: { x: 104, y: 330 } },
    { grip: { id: 'ramp', part: 'start' }, point: { x: 60, y: 330 } },
    { grip: { id: 'ramp', part: 'end' }, point: { x: 470, y: 728 } },
    { grip: { id: 'nothing', part: 'body' }, point: null },
  ] as const)('finds where $grip.id $grip.part is held', ({ grip, point }) => {
    expect(gripPoint(sample(), grip)).toEqual(point);
  });
});

describe('rampHandles', () => {
  it('offers both ends of every ramp', () => {
    expect(rampHandles(sample())).toEqual([
      { grip: { id: 'ramp', part: 'start' }, x: 60, y: 330 },
      { grip: { id: 'ramp', part: 'end' }, x: 470, y: 728 },
    ]);
  });
});

describe('moveGrip', () => {
  it('slides a domino out of the row and leaves the rest alone', () => {
    const before = sample();
    const after = moved(before, { id: 'domino-3', part: 'body' }, { x: 1000, y: 685 });
    expect(body(after, 'domino-3')).toMatchObject({ x: 1000, y: 685 });
    expect(after.items.filter((item) => item.id !== 'domino-3')).toEqual(before.items.filter((item) => item.id !== 'domino-3'));
    expect(validateScene(after).ok).toBe(true);
  });

  it('does not change the scene it was given', () => {
    const before = sample();
    const copy = structuredClone(before);
    moveGrip(before, { id: 'domino-3', part: 'body' }, { x: 1000, y: 685 });
    expect(before).toEqual(copy);
  });

  it('lifts a piece pushed into the floor back up to stand on it', () => {
    const after = moved(sample(), { id: 'domino-3', part: 'body' }, { x: 1000, y: 705 });
    const domino = body(after, 'domino-3');
    expect(domino.kind === 'domino' && Math.abs(domino.y - 685)).toBeLessThanOrEqual(NEAR);
    expect(penetration(outlineOf(domino) ?? [], outlineOf(body(after, 'floor')) ?? [])).toBeLessThan(NEAR * 3);
  });

  it('refuses to drop a domino on top of another one', () => {
    const result = moveGrip(sample(), { id: 'domino-3', part: 'body' }, { x: 856, y: 685 });
    expect(result).toEqual({ ok: false, reason: 'That spot is taken by domino-4.' });
  });

  it('raises the ball and carries its written label with it', () => {
    const after = moved(sample(), { id: 'ball', part: 'body' }, { x: 104, y: 230 });
    expect(body(after, 'ball')).toMatchObject({ x: 104, y: 230 });
    expect(after.labels.find((label) => label.id === 'label-push')).toMatchObject({ x: 150, y: 150 });
  });

  it('moves one end of a ramp to change its slope', () => {
    const after = moved(sample(), { id: 'ramp', part: 'end' }, { x: 470, y: 600 });
    expect(body(after, 'ramp')).toMatchObject({ x1: 60, y1: 330, x2: 470, y2: 600 });
  });

  it('lifts the ball resting on a ramp when the ramp tilts into it', () => {
    const before = sample();
    const after = moved(before, { id: 'ramp', part: 'end' }, { x: 470, y: 600 });
    const depth = (scene: Scene) => penetration(outlineOf(body(scene, 'ball')) ?? [], outlineOf(body(scene, 'ramp')) ?? []);
    expect(body(after, 'ball')).toMatchObject({ x: 104 });
    expect(depth(after)).toBeLessThanOrEqual(depth(before) + NEAR);
  });

  it('refuses a ramp end that would cut through a domino', () => {
    const result = moveGrip(sample(), { id: 'ramp', part: 'end' }, { x: 700, y: 700 });
    expect(result).toEqual({ ok: false, reason: 'That spot is taken by domino-1.' });
  });

  it('refuses to raise a ramp end through the ball resting on it', () => {
    const result = moveGrip(sample(), { id: 'ramp', part: 'start' }, { x: 60, y: 250 });
    expect(result).toEqual({ ok: false, reason: 'That spot is taken by ball.' });
  });

  it('keeps a dragged piece inside the drawing', () => {
    const after = moved(sample(), { id: 'ball', part: 'body' }, { x: -80, y: 200 });
    expect(body(after, 'ball')).toMatchObject({ x: 0, y: 200 });
  });

  it('stops a roped ball where the rope runs out', () => {
    const after = moved(pendulum(), { id: 'ball', part: 'body' }, { x: 900, y: 280 });
    const ball = body(after, 'ball');
    expect(ball.kind === 'ball' && Math.hypot(ball.x - 330, ball.y - 280)).toBeCloseTo(370);
  });

  it('swings a roped ball round on its rope', () => {
    const after = moved(pendulum(), { id: 'ball', part: 'body' }, { x: 330, y: 700 });
    expect(body(after, 'ball')).toMatchObject({ x: 330 });
    const ball = body(after, 'ball');
    expect(ball.kind === 'ball' && ball.y).toBeCloseTo(280 + 370);
  });

  it('refuses to move a piece pinned to a pivot', () => {
    const result = moveGrip(seesaw(), { id: 'lever', part: 'body' }, { x: 500, y: 400 });
    expect(result).toEqual({ ok: false, reason: 'lever is pinned in place.' });
  });

  it.each([
    { name: 'the floor', grip: { id: 'floor', part: 'body' } },
    { name: 'a missing item', grip: { id: 'nothing', part: 'body' } },
    { name: 'the body of a ramp', grip: { id: 'ramp', part: 'body' } },
  ] as const)('refuses to move $name', ({ grip }) => {
    expect(moveGrip(sample(), grip, { x: 600, y: 400 }).ok).toBe(false);
  });
});

describe('changedFixedItems', () => {
  it('names a ramp whose end moved', () => {
    const before = sample();
    expect(changedFixedItems(before, moved(before, { id: 'ramp', part: 'start' }, { x: 60, y: 400 }))).toEqual(['ramp']);
  });

  it('names nothing when only pieces that move anyway were dragged', () => {
    const before = sample();
    expect(changedFixedItems(before, moved(before, { id: 'domino-3', part: 'body' }, { x: 1000, y: 685 }))).toEqual([]);
  });
});
