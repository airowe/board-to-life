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

  it('knocks over the last domino in the test drawing', () => {
    const sim = settle(scene);
    for (const n of [1, 2, 3, 4, 5]) expect(sim.observe({ kind: 'fallen', item: `domino-${n}` })).toBe(true);
  });

  it('leaves the last domino standing when a gap breaks the chain (negative control)', () => {
    const sim = settle(withoutItem('domino-3'));
    expect(sim.observe({ kind: 'fallen', item: 'domino-2' })).toBe(true);
    expect(sim.observe({ kind: 'fallen', item: 'domino-5' })).toBe(false);
  });

  it('keeps static bodies where they were drawn', () => {
    const before = createSimulation(scene).snapshot().filter((body) => ['floor', 'ramp', 'wall'].includes(body.id));
    const after = settle(scene).snapshot().filter((body) => ['floor', 'ramp', 'wall'].includes(body.id));
    expect(after).toEqual(before);
  });
});
