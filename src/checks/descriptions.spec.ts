import { describe, expect, it } from 'vitest';
import { SAMPLES } from '../samples/scenes';
import type { Scene } from '../scene/schema';
import { DESCRIPTION_CASES, dominoesFall, scoreLayout, type DescriptionCase } from './descriptions';

const MOVED_AWAY = 300;
const LAST_DOMINO = 'domino-7';

const longRide = (): Scene => {
  const sample = SAMPLES.find((candidate) => candidate.id === 'long-ride');
  if (!sample) throw new Error('no long-ride sample');
  return sample.scene;
};

const everyDominoFalls: DescriptionCase = { text: 'Every domino falls.', expect: dominoesFall() };

const withDominoMoved = (scene: Scene, id: string, dx: number): Scene => ({
  ...scene,
  items: scene.items.map((item) => (item.id === id && 'x' in item ? { ...item, x: item.x + dx } : item)),
});

describe('scoreLayout', () => {
  it('reports no problems when every domino falls', () => {
    expect(scoreLayout(longRide(), everyDominoFalls)).toEqual([]);
  });

  it('names the domino that stays standing (negative control)', () => {
    const problems = scoreLayout(withDominoMoved(longRide(), LAST_DOMINO, MOVED_AWAY), everyDominoFalls);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(LAST_DOMINO);
  });

  it('reports a wrong domino count', () => {
    const problems = scoreLayout(longRide(), { text: 'Five dominoes.', expect: dominoesFall(5) });
    expect(problems).toEqual(['expected 5 dominoes, found 7']);
  });
});

describe('DESCRIPTION_CASES', () => {
  it('has the four examples plus the three-dominoes case', () => {
    expect(DESCRIPTION_CASES).toHaveLength(5);
    expect(DESCRIPTION_CASES.at(-1)?.text).toBe('Three dominoes stand in a row with a ball rolling toward them from the left.');
  });
});

const caseFor = (index: number): DescriptionCase => {
  const found = DESCRIPTION_CASES[index];
  if (!found) throw new Error(`no case ${index}`);
  return found;
};

const sceneOf = (items: Scene['items']): Scene => ({ version: 1, drawing: { width: 1200, height: 800 }, items, joints: [], labels: [], unknownMarks: [], predictPoints: [] });

const FLOOR = { id: 'floor', kind: 'floor', x: 600, y: 780, width: 1200, height: 40, confidence: 1 } as const;
const PULLEY = { id: 'pulley', kind: 'pulley', x: 600, y: 160, radius: 60, confidence: 1 } as const;
const blockAt = (id: string, x: number, mass: number) => ({ id, kind: 'block', x, y: 560, width: 96, height: 64, angle: 0, mass, confidence: 1 }) as const;
const ROPE = { id: 'rope', kind: 'rope', from: 'block-1', to: 'block-2', over: 'pulley', length: 812, confidence: 1 } as const;
const HEAVY_MASS = 2;
const LIGHT_MASS = 1;

const pulleyItems = [FLOOR, PULLEY, blockAt('block-1', 528, HEAVY_MASS), blockAt('block-2', 672, LIGHT_MASS)];

describe('pulley expectation', () => {
  const pulley = caseFor(2);

  it('passes when the heavier block sinks and the lighter one rises', () => {
    expect(scoreLayout(sceneOf([...pulleyItems, ROPE]), pulley)).toEqual([]);
  });

  it('fails when the blocks have no rope and both just fall', () => {
    expect(scoreLayout(sceneOf(pulleyItems), pulley)).toEqual(['block-2 (1 kg) did not end higher than it started']);
  });

  it('fails when the blocks weigh the same', () => {
    const equal = [FLOOR, PULLEY, blockAt('block-1', 528, LIGHT_MASS), blockAt('block-2', 672, LIGHT_MASS), ROPE];
    expect(scoreLayout(sceneOf(equal), pulley)).toEqual(['no block was written heavier than the other']);
  });
});

const CART_SPEED = 300;
const cartAt = (x: number, velocityX: number) =>
  ({ id: 'cart', kind: 'cart', x, y: 700, width: 80, height: 30, wheelRadius: 12, angle: 0, velocity: { x: velocityX, y: 0 }, confidence: 1 }) as const;
const wallAt = (x: number) => ({ id: 'wall', kind: 'wall', x, y: 600, width: 24, height: 300, confidence: 1 }) as const;

describe('cart expectation', () => {
  const crash = caseFor(1);

  it('passes when the cart rolls into the wall', () => {
    expect(scoreLayout(sceneOf([FLOOR, wallAt(700), cartAt(300, CART_SPEED)]), crash)).toEqual([]);
  });

  it('fails when there is no wall', () => {
    expect(scoreLayout(sceneOf([FLOOR, cartAt(300, CART_SPEED)]), crash)).toEqual(['no wall in the scene']);
  });

  it('fails when the wall is out of reach', () => {
    expect(scoreLayout(sceneOf([FLOOR, wallAt(1150), cartAt(300, 1)]), crash)).toEqual(['the cart never touched a wall']);
  });
});
