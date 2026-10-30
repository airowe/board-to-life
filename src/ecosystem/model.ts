import type { Eats, Role, Web, WebEvent } from './schema';
import { trophicLevels } from './trophic';

export const MODEL_STEPS = 600;
export const EVENT_STEP = 150;
export const STEPS_PER_SECOND_SHOWN = 60;

export type Rates = { growth: number; capacity: number; attack: number; handling: number; efficiency: number; death: number };

export type Run = {
  steps: number;
  event: WebEvent | null;
  eventStep: number;
  removed: ReadonlySet<string>;
  start?: Record<string, number>;
};

export type Series = { ids: string[]; values: Record<string, number[]> };

const DT = 0.05;
const WARM_UP_STEPS = 8000;
const DROUGHT_GROWTH_FACTOR = 0.5;
const MAX_EATEN_PER_STEP = 0.5;
const MAX_CROWDING = 10;
const OVERSHOOT_FLOOR = -1;
const DECOMPOSER_NOMINAL_START = 1;
export const EXTINCT_FLOOR = 1e-6;

export const PRODUCER_RATES: Rates = { growth: 2, capacity: 1000, attack: 0, handling: 0, efficiency: 0, death: 0.05 };
export const DECOMPOSER_RATES: Rates = { growth: 0, capacity: 0, attack: 0, handling: 0, efficiency: 0.5, death: 0.2 };
export const CONSUMER_RATES_BY_LEVEL: readonly Rates[] = [
  { growth: 0, capacity: 3000, attack: 0.002, handling: 0.05, efficiency: 0.9, death: 0.27 },
  { growth: 0, capacity: 22, attack: 0.0035, handling: 0.05, efficiency: 0.9, death: 0.3 },
  { growth: 0, capacity: 50, attack: 0.0085, handling: 0.05, efficiency: 0.6, death: 0.35 },
];
const FIRST_CONSUMER_LEVEL = 2;

const defaultRates = (role: Role, level: number): Rates => {
  if (role === 'producer') return PRODUCER_RATES;
  if (role === 'decomposer') return DECOMPOSER_RATES;
  const index = Math.min(Math.max(level - FIRST_CONSUMER_LEVEL, 0), CONSUMER_RATES_BY_LEVEL.length - 1);
  return CONSUMER_RATES_BY_LEVEL[index] as Rates;
};

export const ratesFor = (web: Web, overrides: Record<string, Partial<Rates>> = {}): Map<string, Rates> => {
  const levels = trophicLevels(web);
  return new Map(web.species.map((entry) => [entry.id, { ...defaultRates(entry.role, levels.get(entry.id) ?? FIRST_CONSUMER_LEVEL), ...overrides[entry.id] }]));
};

type Model = {
  roles: Role[];
  rates: Rates[];
  preyOf: number[][];
};

const at = <T>(items: readonly T[], index: number): T => items[index] as T;

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

export const feedsAlong = (web: Web, arrow: Eats): boolean => {
  const roleOf = (id: string) => web.species.find((entry) => entry.id === id)?.role;
  const prey = roleOf(arrow.from);
  return arrow.from !== arrow.to && roleOf(arrow.to) === 'consumer' && prey !== undefined && prey !== 'decomposer';
};

const buildModel = (web: Web, overrides?: Record<string, Partial<Rates>>): Model => {
  const index = new Map(web.species.map((entry, position) => [entry.id, position]));
  const ratesById = ratesFor(web, overrides);
  const roles = web.species.map((entry) => entry.role);
  const preyOf: number[][] = web.species.map(() => []);
  for (const arrow of web.eats.filter((each) => feedsAlong(web, each))) {
    at(preyOf, index.get(arrow.to) as number).push(index.get(arrow.from) as number);
  }
  return { roles, rates: web.species.map((entry) => ratesById.get(entry.id) as Rates), preyOf };
};

const eatenBy = (model: Model, populations: number[]): number[][] => {
  const eaten = populations.map(() => populations.map(() => 0));
  model.preyOf.forEach((preyIndexes, predator) => {
    const { attack, handling } = at(model.rates, predator);
    const available = sum(preyIndexes.map((prey) => at(populations, prey)));
    const perPredator = (DT * attack * at(populations, predator)) / (1 + attack * handling * available);
    for (const prey of preyIndexes) at(eaten, predator)[prey] = perPredator * at(populations, prey);
  });
  return eaten;
};

const limitToWhatIsThere = (eaten: number[][], populations: number[]): void => {
  populations.forEach((available, prey) => {
    const demand = sum(eaten.map((row) => at(row, prey)));
    const allowed = available * MAX_EATEN_PER_STEP;
    if (demand <= allowed) return;
    for (const row of eaten) row[prey] = (at(row, prey) * allowed) / demand;
  });
};

const naturalDeaths = (model: Model, populations: number[]): number[] =>
  populations.map((population, species) => {
    const { death, capacity } = at(model.rates, species);
    const crowding = at(model.roles, species) === 'consumer' ? Math.min(1 + population / capacity, MAX_CROWDING) : 1;
    return DT * death * crowding * population;
  });

const growthOf = (rates: Rates, population: number, droughtFactor: number): number =>
  DT * rates.growth * droughtFactor * population * Math.max(1 - population / rates.capacity, OVERSHOOT_FLOOR);

const advance = (model: Model, populations: number[], droughtFactor: number): number[] => {
  const eaten = eatenBy(model, populations);
  limitToWhatIsThere(eaten, populations);
  const deaths = naturalDeaths(model, populations);
  const deathsToRecycle = sum(deaths.filter((_, species) => at(model.roles, species) !== 'decomposer'));
  return populations.map((population, species) => {
    const rates = at(model.rates, species);
    const role = at(model.roles, species);
    const lost = sum(eaten.map((row) => at(row, species)));
    const gained = rates.efficiency * sum(at(eaten, species));
    const died = at(deaths, species);
    if (role === 'producer') return Math.max(0, population + growthOf(rates, population, droughtFactor) - lost - died);
    if (role === 'decomposer') return Math.max(0, population + rates.efficiency * deathsToRecycle - died);
    return Math.max(0, population + gained - lost - died);
  });
};

const nominalStart = (model: Model): number[] =>
  model.rates.map((rates, species) => {
    const role = at(model.roles, species);
    if (role === 'producer') return rates.capacity;
    return role === 'decomposer' ? DECOMPOSER_NOMINAL_START : rates.capacity / 2;
  });

const warmedUp = (model: Model): number[] => {
  let populations = nominalStart(model);
  for (let step = 0; step < WARM_UP_STEPS; step += 1) populations = advance(model, populations, 1);
  return populations;
};

const atLeastFloor = (population: number): number => (population < EXTINCT_FLOOR ? 0 : population);

export const startingPopulations = (web: Web, overrides?: Record<string, Partial<Rates>>): Record<string, number> => {
  const settled = warmedUp(buildModel(web, overrides));
  return Object.fromEntries(web.species.map((entry, species) => [entry.id, atLeastFloor(at(settled, species))]));
};

const isGoneAt = (run: Run, step: number): ((id: string) => boolean) => {
  const removedByEvent = run.event?.kind === 'remove' && step >= run.eventStep ? run.event.species : null;
  return (id) => run.removed.has(id) || id === removedByEvent;
};

export const simulate = (web: Web, run: Run, overrides?: Record<string, Partial<Rates>>): Series => {
  const model = buildModel(web, overrides);
  const ids = web.species.map((entry) => entry.id);
  const begin: Record<string, number> = { ...startingPopulations(web, overrides), ...run.start };
  const history = ids.map((): number[] => []);
  let populations = ids.map((id) => begin[id] ?? 0);
  for (let step = 0; step <= run.steps; step += 1) {
    const gone = isGoneAt(run, step);
    populations = populations.map((population, species) => (gone(at(ids, species)) ? 0 : population));
    populations.forEach((population, species) => at(history, species).push(population));
    const droughtFactor = run.event?.kind === 'drought' && step >= run.eventStep ? DROUGHT_GROWTH_FACTOR : 1;
    populations = advance(model, populations, droughtFactor);
  }
  return { ids, values: Object.fromEntries(ids.map((id, species) => [id, at(history, species)])) };
};
