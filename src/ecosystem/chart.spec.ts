import { describe, expect, it } from 'vitest';
import { RING_MAX, RING_MIN, chartPaths, feedingDots, eventLabel, fitWebToScreen, percentOfStart, percentScale, ringRadius, shortenedArrow, spreadLabels } from './chart';
import { viewOf } from '../present/view';
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
    expect(dots.map((dot) => [dot.fromId, dot.toId, dot.from, dot.to])).toEqual([
      ['grass', 'rabbit', centre('grass'), centre('rabbit')],
      ['rabbit', 'fox', centre('rabbit'), centre('fox')],
      ['rabbit', 'hawk', centre('rabbit'), centre('hawk')],
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

  it('names the species even when two of them share a centre', () => {
    const stacked = webOf([speciesAt('grass', 'producer', 100, 100), speciesAt('rabbit', 'consumer', 100, 100)], [eatsArrow('a1', 'grass', 'rabbit')]);
    expect(feedingDots(stacked, 0).map((dot) => [dot.fromId, dot.toId])).toEqual([['grass', 'rabbit']]);
  });
});

describe('fitWebToScreen', () => {
  const box = { width: 80, height: 40, confidence: 0.9 };
  const speciesAt = (id: string, x: number, y: number) => ({ id, name: id, role: 'consumer' as const, x, y, ...box });
  const webOf = (...species: ReturnType<typeof speciesAt>[]) => ({ drawing: { width: 1200, height: 800 }, species }) as unknown as Parameters<typeof fitWebToScreen>[1];
  const SCREEN = { width: 1000, height: 600 };
  const largest = box.width / 2 + RING_MAX;

  it('keeps the largest ring of a species near the top edge on the screen', () => {
    const view = fitWebToScreen(SCREEN, webOf(speciesAt('hawk', 600, 40)));
    expect(view.offsetY + (40 - largest) * view.scale).toBeGreaterThanOrEqual(0);
  });

  it('keeps the largest ring of a species near the bottom edge on the screen', () => {
    const view = fitWebToScreen(SCREEN, webOf(speciesAt('grass', 600, 780)));
    expect(view.offsetY + (780 + largest) * view.scale).toBeLessThanOrEqual(SCREEN.height);
  });

  it('matches the plain fit when every ring already fits', () => {
    expect(fitWebToScreen(SCREEN, webOf(speciesAt('rabbit', 600, 400)))).toEqual(viewOf(SCREEN, { width: 1200, height: 800 }));
  });
});

describe('shortenedArrow', () => {
  const [from, to] = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
  const RADIUS = 20;

  it('runs from the edge of one disc to the edge of the other', () => {
    expect(shortenedArrow(from, to, RADIUS, RADIUS)).toEqual({ from: { x: 20, y: 0 }, to: { x: 80, y: 0 } });
  });

  it('honours each disc size along any direction', () => {
    const arrow = shortenedArrow({ x: 0, y: 0 }, { x: 30, y: 40 }, 5, 10);
    if (!arrow) throw new Error('expected an arrow');
    expect(arrow.from.x).toBeCloseTo(3);
    expect(arrow.from.y).toBeCloseTo(4);
    expect(arrow.to.x).toBeCloseTo(24);
    expect(arrow.to.y).toBeCloseTo(32);
  });

  it('is nothing when the discs touch', () => {
    expect(shortenedArrow(from, to, 60, 60)).toBeNull();
  });
});

describe('percentOfStart', () => {
  it('starts every species at 100 however different their numbers are', () => {
    const shown = percentOfStart({ ids: ['kelp', 'otter'], values: { kelp: [800, 400], otter: [4, 6] } });
    expect(shown.values).toEqual({ kelp: [100, 50], otter: [100, 150] });
  });

  it('shows a species taken away at the event falling to nothing', () => {
    expect(percentOfStart({ ids: ['otter'], values: { otter: [4, 4, 0, 0] } }).values.otter).toEqual([100, 100, 0, 0]);
  });

  it('keeps a species with nothing at the start at 0 rather than dividing by it', () => {
    expect(percentOfStart({ ids: ['gone'], values: { gone: [0, 0] } }).values.gone).toEqual([0, 0]);
  });
});

describe('percentScale', () => {
  it.each([
    [100, 150, [0, 50, 100, 150]],
    [130, 150, [0, 50, 100, 150]],
    [151, 200, [0, 50, 100, 150, 200]],
    [290, 300, [0, 100, 200, 300]],
    [1320, 1500, [0, 500, 1000, 1500]],
  ])('for a highest value of %s tops out at %s', (highest, max, ticks) => {
    expect(percentScale(highest)).toEqual({ max, ticks });
  });
});

describe('spreadLabels', () => {
  const GAP = 20;

  it('leaves labels alone when they already clear each other', () => {
    expect(spreadLabels([10, 50, 90], GAP, 0, 100)).toEqual([10, 50, 90]);
  });

  it('spreads labels that would sit on top of each other, keeping them in order', () => {
    const [a, b, c] = spreadLabels([50, 50, 50], GAP, 0, 200) as [number, number, number];
    expect(b - a).toBeGreaterThanOrEqual(GAP);
    expect(c - b).toBeGreaterThanOrEqual(GAP);
  });

  it('answers in the order it was given', () => {
    const [low, high] = spreadLabels([90, 10], GAP, 0, 100) as [number, number];
    expect(low).toBeGreaterThan(high);
  });

  it('keeps labels inside the chart', () => {
    const placed = spreadLabels([99, 100, 100], GAP, 0, 100);
    expect(Math.max(...placed)).toBeLessThanOrEqual(100);
    expect(Math.min(...placed)).toBeGreaterThanOrEqual(0);
  });
});

describe('eventLabel', () => {
  const species = [{ id: 'otter', name: 'sea otter' }];

  it.each([
    [{ kind: 'remove', species: 'otter' } as const, 'sea otter removed'],
    [{ kind: 'drought' } as const, 'Drought'],
  ])('names %j', (event, label) => {
    expect(eventLabel({ species, event } as unknown as Parameters<typeof eventLabel>[0])).toBe(label);
  });

  it('is empty with no event', () => {
    expect(eventLabel({ species, event: null } as unknown as Parameters<typeof eventLabel>[0])).toBe('');
  });
});
