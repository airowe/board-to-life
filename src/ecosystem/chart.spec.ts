import { describe, expect, it } from 'vitest';
import { RING_MAX, RING_MIN, chartPaths, feedingDots, ringRadius } from './chart';
import { eatsArrow, grasslandWeb, speciesAt, webOf } from './fixtures';
import { MODEL_STEPS, type Series } from './model';
import { backwardArrows } from './trophic';

const BOX = { x: 40, y: 20, width: 500, height: 200 };
const HUGE = 100_000;
const MAX_COUNT = 100_000;

const coordinates = (path: string): { x: number; y: number }[] =>
  [...path.matchAll(/[ML]\s*(-?[\d.]+)[ ,]\s*(-?[\d.]+)/g)].map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));

const series = (values: Record<string, number[]>): Series => ({ ids: Object.keys(values), values });
const ramp = (length: number, top: number): number[] => Array.from({ length }, (_, index) => (index / (length - 1)) * top);

describe('chartPaths', () => {
  it('keeps counts up to 100 000 inside the box', () => {
    const paths = chartPaths(series({ a: ramp(MODEL_STEPS + 1, MAX_COUNT), b: ramp(MODEL_STEPS + 1, 3) }), BOX, MODEL_STEPS);
    for (const path of Object.values(paths)) {
      const points = coordinates(path);
      expect(points.length).toBe(MODEL_STEPS + 1);
      for (const point of points) {
        expect(point.x).toBeGreaterThanOrEqual(BOX.x);
        expect(point.x).toBeLessThanOrEqual(BOX.x + BOX.width);
        expect(point.y).toBeGreaterThanOrEqual(BOX.y);
        expect(point.y).toBeLessThanOrEqual(BOX.y + BOX.height);
      }
    }
  });

  it('scales to the largest value, so the peak touches the top and zero sits on the bottom', () => {
    const [first, ...rest] = coordinates(chartPaths(series({ a: [0, 50, 100] }), BOX, 2).a as string);
    expect(first).toEqual({ x: BOX.x, y: BOX.y + BOX.height });
    expect(rest.at(-1)).toEqual({ x: BOX.x + BOX.width, y: BOX.y });
  });

  it('uses a floor of 1 so tiny populations stay near the bottom instead of filling the box', () => {
    const points = coordinates(chartPaths(series({ a: [0, 0.1] }), BOX, 1).a as string);
    expect(points[1]?.y).toBeCloseTo(BOX.y + BOX.height * 0.9, 1);
  });

  it('draws only up to the revealed step', () => {
    const paths = chartPaths(series({ a: ramp(MODEL_STEPS + 1, 10) }), BOX, 10);
    expect(coordinates(paths.a as string)).toHaveLength(11);
  });

  it('draws an all-zero series as a flat line on the bottom', () => {
    const points = coordinates(chartPaths(series({ a: [0, 0, 0] }), BOX, 2).a as string);
    expect(points.map((point) => point.y)).toEqual([BOX.y + BOX.height, BOX.y + BOX.height, BOX.y + BOX.height]);
  });
});

describe('ringRadius', () => {
  const start = 50;

  it('is the minimum for an empty population and the maximum for a huge one', () => {
    expect(ringRadius(0, start)).toBe(RING_MIN);
    expect(ringRadius(HUGE, start)).toBe(RING_MAX);
  });

  it('grows with the population but slower than the population does', () => {
    const small = ringRadius(start / 4, start);
    const steady = ringRadius(start, start);
    expect(small).toBeGreaterThan(RING_MIN);
    expect(steady).toBeGreaterThan(small);
    expect(steady).toBeLessThan(RING_MAX);
    expect((steady - RING_MIN) / (small - RING_MIN)).toBeLessThan(4);
  });

  it('handles a start of zero without dividing by it', () => {
    expect(ringRadius(0, 0)).toBe(RING_MIN);
    expect(ringRadius(5, 0)).toBe(RING_MAX);
  });
});

describe('feedingDots', () => {
  const web = grasslandWeb();
  const centre = (id: string) => {
    const found = web.species.find((entry) => entry.id === id);
    return { x: found?.x as number, y: found?.y as number };
  };

  it('has one dot per arrow, running from the eaten species to the eater', () => {
    const dots = feedingDots(web, 0);
    expect(dots.map((dot) => [dot.from, dot.to])).toEqual([
      [centre('grass'), centre('rabbit')],
      [centre('rabbit'), centre('fox')],
      [centre('rabbit'), centre('hawk')],
    ]);
  });

  it('keeps t in [0, 1) and moves it as the steps advance', () => {
    const early = feedingDots(web, 0);
    const later = feedingDots(web, 10);
    for (const step of [0, 10, 137, MODEL_STEPS]) for (const dot of feedingDots(web, step)) {
      expect(dot.t).toBeGreaterThanOrEqual(0);
      expect(dot.t).toBeLessThan(1);
    }
    expect(later[0]?.t).not.toBe(early[0]?.t);
  });

  it('spreads the dots so they do not all travel together', () => {
    const ts = feedingDots(web, 0).map((dot) => dot.t);
    expect(new Set(ts).size).toBe(ts.length);
  });

  it.each([
    ['into a producer', eatsArrow('x', 'rabbit', 'grass')],
    ['into a decomposer', eatsArrow('x', 'rabbit', 'fungi')],
    ['out of a decomposer', eatsArrow('x', 'fungi', 'rabbit')],
    ['from a species to itself', eatsArrow('x', 'fox', 'fox')],
  ])('draws no dot on an arrow the model does not feed along: %s', (_, ignored) => {
    const withFungi = webOf([...web.species, speciesAt('fungi', 'decomposer', 900, 800)], [...web.eats, ignored]);
    expect(feedingDots(withFungi, 0)).toHaveLength(web.eats.length);
  });

  it('gives a flagged arrow a dot, as drawn', () => {
    const flagged = webOf(
      [speciesAt('grass', 'producer', 100, 800), speciesAt('mouse', 'consumer', 400, 600), speciesAt('snake', 'consumer', 100, 400), speciesAt('hawk', 'consumer', 400, 100)],
      [eatsArrow('a1', 'grass', 'mouse'), eatsArrow('a2', 'mouse', 'hawk'), eatsArrow('a3', 'snake', 'hawk')],
    );
    expect(backwardArrows(flagged)).toEqual(['a3']);
    expect(feedingDots(flagged, 0).map((dot) => [dot.from, dot.to])).toContainEqual([
      { x: 100, y: 400 },
      { x: 400, y: 100 },
    ]);
    expect(feedingDots(flagged, 0)).toHaveLength(flagged.eats.length);
  });
});
