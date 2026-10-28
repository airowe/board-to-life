import { describe, expect, it } from 'vitest';
import { rampBallDominoes } from '../scene/fixtures';
import { validateScene, type Scene } from '../scene/schema';
import { STEPS_PER_SECOND, createSimulation, runUntil } from './simulation';

const SETTLE_SECONDS = 8;
const settleSteps = SETTLE_SECONDS * STEPS_PER_SECOND;

const parse = (input: unknown): Scene => {
  const result = validateScene(input);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.scene;
};

const scene = parse(rampBallDominoes);

const withoutItem = (id: string): Scene => ({ ...scene, items: scene.items.filter((item) => item.id !== id) });

const settle = (input: Scene) => {
  const sim = createSimulation(input);
  for (let i = 0; i < settleSteps; i += 1) sim.step();
  return sim;
};

describe('createSimulation', () => {
  it('produces identical body states for two runs of the same approved scene', () => {
    expect(settle(scene).snapshot()).toEqual(settle(scene).snapshot());
  });

  it('is unaffected by a simulation created in between', () => {
    const first = settle(scene).snapshot();
    settle(withoutItem('domino-3'));
    expect(settle(scene).snapshot()).toEqual(first);
  });

  it('pauses a time predict point on the exact step', () => {
    const seconds = 0.75;
    const sim = createSimulation(scene);
    expect(runUntil(sim, { kind: 'time', seconds }, settleSteps)).toBe(seconds * STEPS_PER_SECOND);
    expect(sim.stepIndex).toBe(seconds * STEPS_PER_SECOND);
  });

  it('pauses a contact predict point on the same step every run', () => {
    const trigger = { kind: 'contact', a: 'ball', b: 'domino-1' } as const;
    const first = runUntil(createSimulation(scene), trigger, settleSteps);
    expect(first).not.toBeNull();
    expect(runUntil(createSimulation(scene), trigger, settleSteps)).toBe(first);
  });

  it('returns null when a trigger never fires', () => {
    const trigger = { kind: 'contact', a: 'ball', b: 'wall' } as const;
    expect(runUntil(createSimulation(withoutItem('domino-1')), { kind: 'contact', a: 'domino-2', b: 'wall' }, 10)).toBeNull();
    expect(runUntil(createSimulation(scene), trigger, 1)).toBeNull();
  });

  it.each([
    [1, 'the full row', scene, true],
    [2, 'the full row', scene, true],
    [4, 'the full row', scene, true],
    [1, 'the row with a gap', withoutItem('domino-3'), false],
    [2, 'the row with a gap', withoutItem('domino-3'), false],
    [4, 'the row with a gap', withoutItem('domino-3'), false],
  ])('with %i substeps per step, %s gives the same outcome', (substeps, _row, input, lastFalls) => {
    const sim = createSimulation(input, { substeps });
    for (let i = 0; i < settleSteps; i += 1) sim.step();
    expect(sim.observe({ kind: 'fallen', item: 'domino-5' })).toBe(lastFalls);
  });

  it('knocks over the last domino in the test drawing', () => {
    const sim = settle(scene);
    for (const n of [1, 2, 3, 4, 5]) expect(sim.observe({ kind: 'fallen', item: `domino-${n}` })).toBe(true);
  });

  it('leaves the last domino standing when a gap breaks the chain (negative control)', () => {
    const sim = settle(withoutItem('domino-3'));
    expect(sim.observe({ kind: 'fallen', item: 'domino-2' })).toBe(true);
    expect(sim.observe({ kind: 'fallen', item: 'domino-5' })).toBe(false);
  });

  it.each([2600, 2900, 3200, 3500])('stops a fast ball at %i units/s instead of letting it pass through a thin wall', (speed) => {
    const fastBall = parse({
      ...rampBallDominoes,
      items: [
        { id: 'ball', kind: 'ball', x: 100, y: 400, radius: 8, velocity: { x: speed, y: 0 }, confidence: 1 },
        { id: 'wall', kind: 'wall', x: 600, y: 400, width: 6, height: 700, confidence: 1 },
      ],
      labels: [],
      unknownMarks: [],
      predictPoints: [],
    });
    const sim = createSimulation(fastBall);
    for (let i = 0; i < STEPS_PER_SECOND; i += 1) sim.step();
    const ball = sim.snapshot().find((body) => body.id === 'ball');
    expect(ball?.x).toBeLessThan(600);
  });

  it('records the state before the latest step for smooth rendering', () => {
    const sim = createSimulation(scene);
    expect(sim.previousSnapshot()).toEqual(sim.snapshot());
    sim.step();
    const before = sim.snapshot();
    sim.step();
    expect(sim.previousSnapshot()).toEqual(before);
    expect(sim.snapshot()).not.toEqual(before);
  });

  it('keeps static bodies where they were drawn', () => {
    const before = createSimulation(scene).snapshot().filter((body) => ['floor', 'ramp', 'wall'].includes(body.id));
    const after = settle(scene).snapshot().filter((body) => ['floor', 'ramp', 'wall'].includes(body.id));
    expect(after).toEqual(before);
  });
});

describe('links', () => {
  const ANCHOR = { x: 600, y: 100 };
  const REST = 150;
  const hanging = (kind: 'rope' | 'spring'): Scene =>
    parse({
      version: 1,
      drawing: { width: 1200, height: 800 },
      items: [
        { id: 'hook', kind: 'pulley', ...ANCHOR, radius: 10, confidence: 1 },
        { id: 'weight', kind: 'ball', x: ANCHOR.x, y: ANCHOR.y + REST, radius: 20, confidence: 1 },
        { id: 'link', kind, from: 'hook', to: 'weight', length: REST, confidence: 1 },
      ],
      joints: [],
      labels: [],
      unknownMarks: [],
      predictPoints: [],
    });

  const drops = (kind: 'rope' | 'spring', seconds: number): number[] => {
    const sim = createSimulation(hanging(kind));
    return Array.from({ length: seconds * STEPS_PER_SECOND }, () => {
      sim.step();
      return (sim.snapshot().find((body) => body.id === 'weight')?.y ?? 0) - ANCHOR.y;
    });
  };

  it('keeps a rope the length it was drawn', () => {
    expect(Math.max(...drops('rope', 2))).toBeLessThan(REST * 1.05);
  });

  it('lets a spring stretch under a weight', () => {
    expect(Math.max(...drops('spring', 2))).toBeGreaterThan(REST * 1.3);
  });

  it('makes a stretched spring pull back, so the weight bounces', () => {
    const distances = drops('spring', 3);
    const lowest = distances.indexOf(Math.max(...distances));
    expect(Math.min(...distances.slice(lowest))).toBeLessThan(Math.max(...distances) - REST * 0.2);
  });
});

describe('a rope over a pulley', () => {
  const WHEEL = { x: 600, y: 120 };
  const RADIUS = 20;
  const HANG = 250;
  const atwood = (leftSize: number, rightSize: number, masses: { left?: number; right?: number } = {}): Scene =>
    parse({
      version: 1,
      drawing: { width: 1200, height: 800 },
      items: [
        { id: 'wheel', kind: 'pulley', ...WHEEL, radius: RADIUS, confidence: 1 },
        { id: 'left', kind: 'block', x: WHEEL.x - RADIUS, y: WHEEL.y + HANG, width: leftSize, height: leftSize, mass: masses.left, confidence: 1 },
        { id: 'right', kind: 'block', x: WHEEL.x + RADIUS, y: WHEEL.y + HANG, width: rightSize, height: rightSize, mass: masses.right, confidence: 1 },
        { id: 'rope', kind: 'rope', from: 'left', to: 'right', over: 'wheel', length: 2 * Math.hypot(RADIUS, HANG), confidence: 1 },
      ],
      joints: [],
      labels: [],
      unknownMarks: [],
      predictPoints: [],
    });

  const after = (scene: Scene, seconds: number) => {
    const sim = createSimulation(scene);
    for (let i = 0; i < seconds * STEPS_PER_SECOND; i += 1) sim.step();
    const at = (id: string) => sim.snapshot().find((body) => body.id === id) ?? { x: 0, y: 0 };
    return { left: at('left'), right: at('right') };
  };
  const ropeUsed = (positions: { left: { x: number; y: number }; right: { x: number; y: number } }): number =>
    Math.hypot(positions.left.x - WHEEL.x, positions.left.y - WHEEL.y) + Math.hypot(positions.right.x - WHEEL.x, positions.right.y - WHEEL.y);

  it('lets the heavier side go down and pulls the lighter side up', () => {
    const { left, right } = after(atwood(80, 50), 1);
    expect(left.y).toBeGreaterThan(WHEEL.y + HANG + 40);
    expect(right.y).toBeLessThan(WHEEL.y + HANG - 40);
  });

  it('keeps equal weights balanced', () => {
    const { left, right } = after(atwood(60, 60), 1);
    expect(Math.abs(left.y - (WHEEL.y + HANG))).toBeLessThan(5);
    expect(Math.abs(right.y - (WHEEL.y + HANG))).toBeLessThan(5);
  });

  it('uses written masses over size: the heavier small block pulls up the light big one', () => {
    const { left, right } = after(atwood(80, 50, { left: 1, right: 5 }), 1);
    expect(right.y).toBeGreaterThan(WHEEL.y + HANG + 40);
    expect(left.y).toBeLessThan(WHEEL.y + HANG - 40);
  });

  it('never lets the rope stretch', () => {
    expect(ropeUsed(after(atwood(80, 50), 1))).toBeLessThan(2 * Math.hypot(RADIUS, HANG) * 1.02);
  });
});

describe('a cart', () => {
  const FLOOR_TOP = 740;
  const SPEED = 300;
  const WIDTH = 120;
  const HEIGHT = 50;
  const WHEEL = 18;
  const START_X = 150;
  const pushed = (kind: 'cart' | 'block'): Scene =>
    parse({
      version: 1,
      drawing: { width: 1200, height: 800 },
      items: [
        { id: 'floor', kind: 'floor', x: 600, y: FLOOR_TOP + 30, width: 1200, height: 60, confidence: 1 },
        kind === 'cart'
          ? { id: 'thing', kind, x: START_X, y: FLOOR_TOP - WHEEL - HEIGHT / 2, width: WIDTH, height: HEIGHT, wheelRadius: WHEEL, velocity: { x: SPEED, y: 0 }, confidence: 1 }
          : { id: 'thing', kind, x: START_X, y: FLOOR_TOP - HEIGHT / 2, width: WIDTH, height: HEIGHT, velocity: { x: SPEED, y: 0 }, confidence: 1 },
      ],
      joints: [],
      labels: [],
      unknownMarks: [],
      predictPoints: [],
    });
  const travel = (kind: 'cart' | 'block'): number => {
    const sim = createSimulation(pushed(kind));
    for (let i = 0; i < 2 * STEPS_PER_SECOND; i += 1) sim.step();
    return (sim.snapshot().find((body) => body.id === 'thing')?.x ?? START_X) - START_X;
  };

  it('rolls much further than a block of the same size given the same push', () => {
    expect(travel('cart')).toBeGreaterThan(travel('block') * 3);
  });

  it('stays upright as it rolls along the floor', () => {
    const sim = createSimulation(pushed('cart'));
    for (let i = 0; i < 2 * STEPS_PER_SECOND; i += 1) sim.step();
    expect(sim.observe({ kind: 'fallen', item: 'thing' })).toBe(false);
  });

  it('tips dominoes read a little wide, rather than shoving them along the floor', () => {
    const READ_WIDTH = 22;
    const DOMINO_HEIGHT = 110;
    const CART_HEIGHT = 60;
    const scene = parse({
      version: 1,
      drawing: { width: 1200, height: 800 },
      items: [
        { id: 'floor', kind: 'floor', x: 600, y: FLOOR_TOP + 30, width: 1200, height: 60, confidence: 1 },
        { id: 'cart', kind: 'cart', x: START_X, y: FLOOR_TOP - WHEEL - CART_HEIGHT / 2, width: 140, height: CART_HEIGHT, wheelRadius: WHEEL, velocity: { x: 200, y: 0 }, confidence: 1 },
        ...[700, 770, 840].map((x, i) => ({ id: `domino-${i + 1}`, kind: 'domino', x, y: FLOOR_TOP - DOMINO_HEIGHT / 2, width: READ_WIDTH, height: DOMINO_HEIGHT, confidence: 1 })),
      ],
      joints: [],
      labels: [],
      unknownMarks: [],
      predictPoints: [],
    });
    const sim = createSimulation(scene);
    for (let i = 0; i < 7 * STEPS_PER_SECOND; i += 1) sim.step();
    expect(sim.observe({ kind: 'fallen', item: 'domino-3' })).toBe(true);
  });

  it('counts a wheel touching something as the cart touching it', () => {
    const sim = createSimulation(pushed('cart'));
    sim.step();
    expect(sim.isTriggered({ kind: 'contact', a: 'thing', b: 'floor' })).toBe(true);
  });
});
