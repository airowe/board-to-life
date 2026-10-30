import { describe, expect, it } from 'vitest';
import { eatsArrow, speciesAt, webOf } from './fixtures';
import { EVENT_STEP, MODEL_STEPS, STEPS_PER_SECOND_SHOWN, ratesFor, simulate, startingPopulations, type Run } from './model';
import { CHANGE_THRESHOLD, EXTINCT_FRACTION } from './outcomes';
import { backwardArrows } from './trophic';
import type { Series } from './model';
import type { Web } from './schema';

const HUGE_COUNT = 100_000;
const WRITTEN_COUNT = 40;
const SNAKE_START = 20;
const RUN_SECONDS = 10;
const EVENT_SECOND = 2.5;
const ZERO = 0;

const grass = speciesAt('grass', 'producer', 0, 0);
const rabbit = speciesAt('rabbit', 'consumer', 0, 0);
const fox = speciesAt('fox', 'consumer', 0, 0);
const hawk = speciesAt('hawk', 'consumer', 0, 0);
const fungus = speciesAt('fungus', 'decomposer', 0, 0);

const grassland = (): Web =>
  webOf([grass, rabbit, fox, hawk], [eatsArrow('a1', 'grass', 'rabbit'), eatsArrow('a2', 'rabbit', 'fox'), eatsArrow('a3', 'rabbit', 'hawk')]);

const grasslandWithFungus = (): Web =>
  webOf([grass, rabbit, fox, hawk, fungus], [eatsArrow('a1', 'grass', 'rabbit'), eatsArrow('a2', 'rabbit', 'fox'), eatsArrow('a3', 'rabbit', 'hawk')]);

const cycleWeb = (): Web => webOf([grass, rabbit, fox], [eatsArrow('a1', 'rabbit', 'fox'), eatsArrow('a2', 'fox', 'rabbit')]);

const isolatedConsumerWeb = (): Web => webOf([grass, rabbit], []);

const mouse = speciesAt('mouse', 'consumer', 0, 0);
const snake = speciesAt('snake', 'consumer', 0, 0);
const snakeEatenByHawk = eatsArrow('a3', 'snake', 'hawk');
const meadow = (eats: Web['eats']): Web => webOf([grass, mouse, snake, hawk], [eatsArrow('a1', 'grass', 'mouse'), eatsArrow('a2', 'mouse', 'hawk'), ...eats]);

const everyone = (web: Web, value: number): Record<string, number> => Object.fromEntries(web.species.map((entry) => [entry.id, value]));

const quietRun = (overrides: Partial<Run> = {}): Run => ({
  steps: MODEL_STEPS,
  event: null,
  eventStep: EVENT_STEP,
  removed: new Set<string>(),
  ...overrides,
});

const valuesOf = (series: Series, id: string): number[] => {
  const values = series.values[id];
  if (values === undefined) throw new Error(`no series for ${id}`);
  return values;
};

const valueAt = (series: Series, id: string, step: number): number => {
  const value = valuesOf(series, id)[step];
  if (value === undefined) throw new Error(`no step ${step} for ${id}`);
  return value;
};

const populationOf = (populations: Record<string, number>, id: string): number => {
  const value = populations[id];
  if (value === undefined) throw new Error(`no population for ${id}`);
  return value;
};

const withCounts = (web: Web, count: number): Web => ({ ...web, species: web.species.map((entry) => ({ ...entry, count })) });

describe('model timing', () => {
  it('shows a 10 s run with the event at 2.5 s', () => {
    expect(MODEL_STEPS).toBe(RUN_SECONDS * STEPS_PER_SECOND_SHOWN);
    expect(EVENT_STEP).toBe(EVENT_SECOND * STEPS_PER_SECOND_SHOWN);
  });
});

describe('simulate', () => {
  it('returns steps + 1 values per species, in the order of the web', () => {
    const series = simulate(grassland(), quietRun());
    expect(series.ids).toEqual(['grass', 'rabbit', 'fox', 'hawk']);
    for (const id of series.ids) expect(valuesOf(series, id)).toHaveLength(MODEL_STEPS + 1);
  });

  it.each(['grass', 'rabbit', 'fox', 'hawk'])('holds %s within the change threshold of its start with no event', (id) => {
    const web = grasslandWithFungus();
    const series = simulate(web, quietRun());
    const start = populationOf(startingPopulations(web), id);
    for (const value of valuesOf(series, id)) {
      expect(Math.abs(value - start)).toBeLessThanOrEqual(start * CHANGE_THRESHOLD);
    }
  });

  it('holds the decomposer steady as well', () => {
    const web = grasslandWithFungus();
    const series = simulate(web, quietRun());
    const start = populationOf(startingPopulations(web), 'fungus');
    expect(start).toBeGreaterThan(ZERO);
    for (const value of valuesOf(series, 'fungus')) {
      expect(Math.abs(value - start)).toBeLessThanOrEqual(start * CHANGE_THRESHOLD);
    }
  });

  it.each([
    ['the cycle web', cycleWeb(), undefined],
    ['starts of 0', grassland(), everyone(grassland(), ZERO)],
    ['starts of 100 000', grassland(), everyone(grassland(), HUGE_COUNT)],
    ['an isolated consumer', isolatedConsumerWeb(), undefined],
  ])('keeps every value finite and not negative for %s', (_name, web, start) => {
    for (const event of [null, { kind: 'drought' as const }, { kind: 'remove' as const, species: 'rabbit' }]) {
      const series = simulate(web, quietRun({ event, ...(start ? { start } : {}) }));
      for (const id of series.ids) {
        for (const value of valuesOf(series, id)) {
          expect(Number.isFinite(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(ZERO);
        }
      }
    }
  });

  it.each(['grass', 'rabbit', 'fox', 'hawk'])('runs %s steady from the warm-up level, not the written count, with no event', (id) => {
    const web = withCounts(grassland(), WRITTEN_COUNT);
    const series = simulate(web, quietRun());
    const start = populationOf(startingPopulations(grassland()), id);
    expect(valueAt(series, id, 0)).toBe(start);
    for (const value of valuesOf(series, id)) expect(Math.abs(value - start)).toBeLessThanOrEqual(start * CHANGE_THRESHOLD);
  });

  it('makes producers fall after a drought on a web with written counts', () => {
    const series = simulate(withCounts(grassland(), WRITTEN_COUNT), quietRun({ event: { kind: 'drought' } }));
    expect(valueAt(series, 'grass', MODEL_STEPS)).toBeLessThan(valueAt(series, 'grass', EVENT_STEP) * (1 - CHANGE_THRESHOLD));
  });

  it('starts from run.start when given, over the steady level', () => {
    const web = withCounts(grassland(), WRITTEN_COUNT);
    const series = simulate(web, quietRun({ start: { fox: 3 } }));
    expect(valueAt(series, 'fox', 0)).toBe(3);
    expect(valueAt(series, 'rabbit', 0)).toBe(populationOf(startingPopulations(grassland()), 'rabbit'));
  });

  it('gives a consumer with no food none from the start, and keeps it at none', () => {
    const series = simulate(isolatedConsumerWeb(), quietRun({ event: { kind: 'drought' } }));
    for (const value of valuesOf(series, 'rabbit')) expect(value).toBe(ZERO);
  });

  it('feeds nobody along an arrow into a producer', () => {
    const intoProducer = webOf([grass, rabbit], [eatsArrow('a1', 'rabbit', 'grass')]);
    const series = simulate(intoProducer, quietRun());
    expect(valueAt(series, 'grass', MODEL_STEPS)).toBeCloseTo(valueAt(series, 'grass', MODEL_STEPS - 1), 6);
    expect(valueAt(series, 'rabbit', 0)).toBe(ZERO);
  });

  it('feeds the eater along a flagged arrow, as drawn', () => {
    const drawn = meadow([snakeEatenByHawk]);
    expect(backwardArrows(drawn)).toEqual([snakeEatenByHawk.id]);
    const run = quietRun({ start: { snake: SNAKE_START } });
    const withSnake = simulate(drawn, run);
    const withoutSnake = simulate(meadow([]), run);
    expect(valueAt(withSnake, 'hawk', EVENT_STEP)).toBeGreaterThan(valueAt(withoutSnake, 'hawk', EVENT_STEP));
    expect(valueAt(withSnake, 'snake', EVENT_STEP)).toBeLessThan(valueAt(withoutSnake, 'snake', EVENT_STEP));
  });
});

describe('removing a species', () => {
  it('gives died out for every consumer when the only producer is removed', () => {
    const series = simulate(grassland(), quietRun({ event: { kind: 'remove', species: 'grass' } }));
    for (const id of ['rabbit', 'fox', 'hawk']) {
      const tail = valuesOf(series, id).slice(-100);
      const mean = tail.reduce((sum, value) => sum + value, 0) / tail.length;
      expect(mean).toBeLessThan(valueAt(series, id, EVENT_STEP) * EXTINCT_FRACTION);
    }
  });

  it('sets the series to 0 from eventStep on and keeps it there', () => {
    const series = simulate(grassland(), quietRun({ event: { kind: 'remove', species: 'fox' } }));
    expect(valueAt(series, 'fox', EVENT_STEP - 1)).toBeGreaterThan(ZERO);
    for (const value of valuesOf(series, 'fox').slice(EVENT_STEP)) expect(value).toBe(ZERO);
  });

  it('sets a species listed in run.removed to 0 from step 0', () => {
    const series = simulate(grassland(), quietRun({ removed: new Set(['hawk']) }));
    for (const value of valuesOf(series, 'hawk')) expect(value).toBe(ZERO);
  });

  it('lets the prey of a removed predator rise', () => {
    const base = simulate(grassland(), quietRun());
    const without = simulate(grassland(), quietRun({ event: { kind: 'remove', species: 'fox' } }));
    expect(valueAt(without, 'rabbit', MODEL_STEPS)).toBeGreaterThan(valueAt(base, 'rabbit', MODEL_STEPS));
  });
});

describe('drought', () => {
  it('ends producers lower than the same run without drought', () => {
    const base = simulate(grassland(), quietRun());
    const dry = simulate(grassland(), quietRun({ event: { kind: 'drought' } }));
    expect(valueAt(dry, 'grass', MODEL_STEPS)).toBeLessThan(valueAt(base, 'grass', MODEL_STEPS));
  });

  it('changes nothing before the event step', () => {
    const base = simulate(grassland(), quietRun());
    const dry = simulate(grassland(), quietRun({ event: { kind: 'drought' } }));
    expect(valuesOf(dry, 'grass').slice(0, EVENT_STEP + 1)).toEqual(valuesOf(base, 'grass').slice(0, EVENT_STEP + 1));
  });
});

describe('ratesFor', () => {
  it('gives every species rates', () => {
    const rates = ratesFor(grasslandWithFungus());
    expect([...rates.keys()].sort()).toEqual(['fox', 'fungus', 'grass', 'hawk', 'rabbit']);
  });

  it('applies overrides on top of the defaults for just that species', () => {
    const plain = ratesFor(grassland());
    const tuned = ratesFor(grassland(), { rabbit: { death: 0.9 } });
    expect(tuned.get('rabbit')).toEqual({ ...plain.get('rabbit'), death: 0.9 });
    expect(tuned.get('fox')).toEqual(plain.get('fox'));
  });

  it('feeds a higher-level consumer by the same rule as a lower one, with different numbers', () => {
    const rates = ratesFor(grassland());
    expect(rates.get('fox')).not.toEqual(rates.get('rabbit'));
  });
});

describe('startingPopulations', () => {
  it('ignores a written count', () => {
    expect(startingPopulations(withCounts(grassland(), WRITTEN_COUNT))).toEqual(startingPopulations(grassland()));
  });

  it('uses the warm-up level for every species', () => {
    const populations = startingPopulations(grassland());
    for (const id of ['grass', 'rabbit', 'fox', 'hawk']) expect(populationOf(populations, id)).toBeGreaterThan(ZERO);
  });

  it('gives exactly 0 to a consumer with nothing to eat', () => {
    expect(populationOf(startingPopulations(isolatedConsumerWeb()), 'rabbit')).toBe(ZERO);
  });
});
