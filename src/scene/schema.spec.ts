import { describe, expect, it } from 'vitest';
import { rampBallDominoes } from './fixtures';
import { validateScene } from './schema';

const clone = (): Record<string, unknown> & { items: Record<string, unknown>[] } =>
  structuredClone(rampBallDominoes) as unknown as Record<string, unknown> & { items: Record<string, unknown>[] };

const errorsFor = (input: unknown): string[] => {
  const result = validateScene(input);
  if (result.ok) throw new Error('expected validation to fail');
  return result.errors;
};

describe('validateScene', () => {
  it('accepts the hand-written ramp + ball + dominoes scene', () => {
    const result = validateScene(rampBallDominoes);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.scene.items.map((item) => item.id)).toContain('domino-5');
  });

  it('accepts every body kind in the v1 vocabulary', () => {
    const scene = clone();
    scene.items.push(
      { id: 'block-1', kind: 'block', x: 300, y: 100, width: 40, height: 40, angle: 0, confidence: 0.9 },
      { id: 'lever-1', kind: 'lever', x: 400, y: 200, width: 200, height: 12, angle: 0, confidence: 0.9 },
      { id: 'pivot-1', kind: 'pivot', x: 400, y: 210, confidence: 0.9 },
      { id: 'pulley-1', kind: 'pulley', x: 700, y: 100, radius: 20, confidence: 0.9 },
      { id: 'rope-1', kind: 'rope', from: 'block-1', to: 'lever-1', length: 150, confidence: 0.9 },
    );
    scene.joints = [{ id: 'pin-1', kind: 'pin', a: 'lever-1', b: 'pivot-1', x: 400, y: 200 }];
    expect(validateScene(scene).ok).toBe(true);
  });

  it.each([
    ['a kind outside the vocabulary', { id: 'x', kind: 'spring', x: 1, y: 1, confidence: 0.5 }],
    ['a missing confidence', { id: 'x', kind: 'pivot', x: 1, y: 1 }],
    ['a confidence above 1', { id: 'x', kind: 'pivot', x: 1, y: 1, confidence: 1.2 }],
    ['a non-positive radius', { id: 'x', kind: 'ball', x: 10, y: 10, radius: 0, confidence: 0.5 }],
  ])('rejects an item with %s', (_reason, item) => {
    const scene = clone();
    scene.items.push(item);
    expect(errorsFor(scene).length).toBeGreaterThan(0);
  });

  it('rejects a position outside the drawing', () => {
    const scene = clone();
    scene.items.push({ id: 'far-ball', kind: 'ball', x: 5000, y: 10, radius: 5, confidence: 0.9 });
    expect(errorsFor(scene).join('\n')).toMatch(/far-ball.*outside the drawing/);
  });

  it('rejects duplicate ids', () => {
    const scene = clone();
    scene.items.push({ id: 'ball', kind: 'pivot', x: 1, y: 1, confidence: 0.9 });
    expect(errorsFor(scene).join('\n')).toMatch(/duplicate id "ball"/);
  });

  it.each([
    ['a joint', (s: Record<string, unknown>) => { s.joints = [{ id: 'j', kind: 'pin', a: 'ball', b: 'ghost', x: 1, y: 1 }]; }],
    ['a rope', (s: Record<string, unknown> & { items: Record<string, unknown>[] }) => {
      s.items.push({ id: 'r', kind: 'rope', from: 'ball', to: 'ghost', length: 10, confidence: 0.9 });
    }],
    ['a label', (s: Record<string, unknown>) => {
      s.labels = [{ id: 'l', text: 'x', x: 1, y: 1, attachesTo: 'ghost', confidence: 0.9 }];
    }],
    ['a contact predict point', (s: Record<string, unknown>) => {
      s.predictPoints = [{ id: 'p', trigger: { kind: 'contact', a: 'ball', b: 'ghost' } }];
    }],
  ])('rejects %s that references a missing item', (_where, mutate) => {
    const scene = clone();
    mutate(scene);
    expect(errorsFor(scene).join('\n')).toMatch(/"ghost"/);
  });

  it('keeps unknown marks flagged rather than dropping them', () => {
    const result = validateScene(rampBallDominoes);
    if (!result.ok) throw new Error(result.errors.join('\n'));
    expect(result.scene.unknownMarks).toEqual(rampBallDominoes.unknownMarks);
  });

  it('rejects an unsupported schema version', () => {
    const scene = clone();
    scene.version = 2;
    expect(errorsFor(scene).length).toBeGreaterThan(0);
  });
});
