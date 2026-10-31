import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { emptyEdits } from '../ecosystem/edits';
import { speciesAt, webOf } from '../ecosystem/fixtures';
import { EVENT_STEP, MODEL_STEPS, simulate, type Series } from '../ecosystem/model';
import { WEB_SAMPLES } from '../ecosystem/samples';
import type { Web, WebEvent } from '../ecosystem/schema';
import { isGone, referenceLevel } from '../ecosystem/outcomes';
import { crowdTargets } from './crowd';
import { MAX_LABELS, labelsAt, type PinnedLabel } from './labels';

const sampleWeb = (id: string): Web => {
  const sample = WEB_SAMPLES.find((entry) => entry.id === id);
  if (!sample) throw new Error(`no sample "${id}"`);
  return sample.web;
};

const run = (web: Web, event: WebEvent): Series =>
  simulate(web, { steps: MODEL_STEPS, event, eventStep: EVENT_STEP, removed: new Set() });

const KELP = sampleWeb('ocean');
const KELP_EVENT = KELP.event as WebEvent;
const KELP_SERIES = run(KELP, KELP_EVENT);
const DROUGHT: WebEvent = { kind: 'drought' };

const kelpLabelsAt = (step: number): PinnedLabel[] => labelsAt(KELP, KELP_EVENT, KELP_SERIES, step);
const labelFor = (labels: PinnedLabel[], speciesId: string): PinnedLabel | undefined => labels.find((label) => label.speciesId === speciesId);

const firstStepWith = (speciesId: string): number => {
  for (let step = EVENT_STEP; step <= MODEL_STEPS; step += 1) if (labelFor(kelpLabelsAt(step), speciesId)) return step;
  throw new Error(`${speciesId} never gets a label`);
};

describe('labelsAt', () => {
  it.each([[0], [EVENT_STEP - 1]])('no labels before the event (step %i)', (step) => {
    expect(kelpLabelsAt(step)).toEqual([]);
  });

  it('the removal label appears at EVENT_STEP', () => {
    expect(kelpLabelsAt(EVENT_STEP)).toEqual([{ speciesId: 'otter', text: 'The sea otters are removed.', since: EVENT_STEP }]);
  });

  it('urchins get "Urchins multiplying." after it', () => {
    const since = firstStepWith('urchin');
    expect(since).toBeGreaterThan(EVENT_STEP);
    expect(labelFor(kelpLabelsAt(MODEL_STEPS), 'urchin')).toEqual({ speciesId: 'urchin', text: 'Urchins multiplying.', since });
  });

  it('kelp gets "Kelp thinning out."', () => {
    const since = firstStepWith('kelp');
    expect(labelFor(kelpLabelsAt(MODEL_STEPS), 'kelp')).toEqual({ speciesId: 'kelp', text: 'Kelp thinning out.', since });
  });

  it('labels a change from the first step it passes the threshold', () => {
    const urchin = KELP_SERIES.values.urchin as number[];
    const reference = urchin[EVENT_STEP] as number;
    const since = firstStepWith('urchin');
    expect(urchin[since]).toBeGreaterThan(reference * 1.1);
    expect(urchin[since - 1]).toBeLessThanOrEqual(reference * 1.1);
  });

  it('lists labels oldest first', () => {
    const sinces = kelpLabelsAt(MODEL_STEPS).map((label) => label.since);
    expect(sinces).toEqual([...sinces].sort((a, b) => a - b));
  });

  it.each(WEB_SAMPLES.flatMap((sample) => [[sample.id, sample.web.event as WebEvent] as const, [sample.id, DROUGHT] as const]))(
    'never more than 3 (%s, %o)',
    (id, event) => {
      const web = sampleWeb(id);
      const series = run(web, event);
      for (let step = 0; step <= MODEL_STEPS; step += 1) expect(labelsAt(web, event, series, step).length).toBeLessThanOrEqual(MAX_LABELS);
    },
  );

  it('keeps the newest labels when there are more than 3', () => {
    const pond = sampleWeb('pond');
    const pondEvent = pond.event as WebEvent;
    const labels = labelsAt(pond, pondEvent, run(pond, pondEvent), MODEL_STEPS);
    expect(labels.map((label) => label.text)).toEqual(['Ducks multiplying.', 'Water fleas declining.', 'Algae multiplying.']);
  });

  it('a died-out label replaces that species\' decline label', () => {
    const web = webOf([speciesAt('grass', 'producer', 100, 800), speciesAt('fox', 'consumer', 400, 400)], []);
    const fox = [...Array<number>(EVENT_STEP + 1).fill(100), 80, 50, 5, 0.9, 0.5];
    const grass = Array<number>(fox.length).fill(1000);
    const series: Series = { ids: ['grass', 'fox'], values: { grass, fox } };
    const declineStep = EVENT_STEP + 1;
    const deadStep = EVENT_STEP + 4;
    expect(labelsAt(web, DROUGHT, series, deadStep - 1)).toContainEqual({ speciesId: 'fox', text: 'Foxes declining.', since: declineStep });
    const labels = labelsAt(web, DROUGHT, series, deadStep);
    expect(labels.filter((label) => label.speciesId === 'fox')).toEqual([{ speciesId: 'fox', text: 'Foxes dying out.', since: deadStep }]);
  });

  it('drought label has no species', () => {
    expect(labelsAt(KELP, DROUGHT, run(KELP, DROUGHT), EVENT_STEP)).toEqual([{ speciesId: null, text: 'A drought hits.', since: EVENT_STEP }]);
  });

  const PLURALS: [string, string][] = [
    ['kelp', 'Kelp'],
    ['sea urchin', 'Sea urchins'],
    ['sea otter', 'Sea otters'],
    ['phytoplankton', 'Phytoplankton'],
    ['krill', 'Krill'],
    ['small fish', 'Small fish'],
    ['seal', 'Seals'],
    ['shark', 'Sharks'],
    ['crab', 'Crabs'],
    ['sea star', 'Sea stars'],
    ['grass', 'Grass'],
    ['wildflower', 'Wildflowers'],
    ['rabbit', 'Rabbits'],
    ['fox', 'Foxes'],
    ['hawk', 'Hawks'],
    ['mouse', 'Mice'],
    ['snake', 'Snakes'],
    ['grasshopper', 'Grasshoppers'],
    ['oak tree', 'Oak trees'],
    ['acorn', 'Acorns'],
    ['caterpillar', 'Caterpillars'],
    ['songbird', 'Songbirds'],
    ['deer', 'Deer'],
    ['wolf', 'Wolves'],
    ['owl', 'Owls'],
    ['squirrel', 'Squirrels'],
    ['bear', 'Bears'],
    ['fungi', 'Fungi'],
    ['algae', 'Algae'],
    ['water flea', 'Water fleas'],
    ['tadpole', 'Tadpoles'],
    ['frog', 'Frogs'],
    ['dragonfly larva', 'Dragonfly larvae'],
    ['dragonfly', 'Dragonflies'],
    ['duck', 'Ducks'],
    ['heron', 'Herons'],
    ['cattails', 'Cattails'],
    ['snail', 'Snails'],
  ];
  const OTHER_PLURALS: [string, string][] = [
    ['rabbits', 'Rabbits'],
    ['butterfly', 'Butterflies'],
    ['goose', 'Geese'],
    ['leaf', 'Leaves'],
    ['louse', 'Lice'],
    ['ox', 'Oxen'],
    ['calf', 'Calves'],
    ['fungus', 'Fungi'],
    ['moose', 'Moose'],
    ['sheep', 'Sheep'],
    ['mice', 'Mice'],
    ['wolves', 'Wolves'],
    ['geese', 'Geese'],
    ['larvae', 'Larvae'],
    ['field mouse', 'Field mice'],
    ['Red Fox', 'Red foxes'],
  ];
  const NOT_A_SPECIES = new Set(['sun']);

  it('the plural table covers every organism in the library', () => {
    const library = JSON.parse(readFileSync('public/library/manifest.json', 'utf8')) as { entries: { subject: string; group: string }[] };
    const organisms = new Set(library.entries.filter((entry) => entry.group === 'organism').map((entry) => entry.subject.replace(/-/g, ' ')));
    const covered = new Set(PLURALS.map(([name]) => name));
    expect([...organisms].filter((name) => !covered.has(name) && !NOT_A_SPECIES.has(name))).toEqual([]);
  });

  it.each([...PLURALS, ...OTHER_PLURALS])('names a rising "%s" as "%s multiplying."', (name, plural) => {
    const web = webOf([{ ...speciesAt('grass', 'producer', 100, 800), name }], []);
    const series: Series = { ids: ['grass'], values: { grass: [...Array<number>(EVENT_STEP + 1).fill(100), 200] } };
    expect(labelFor(labelsAt(web, DROUGHT, series, EVENT_STEP + 1), 'grass')?.text).toBe(`${plural} multiplying.`);
  });

  it('the removal label uses the irregular plural', () => {
    const web = webOf([speciesAt('grass', 'producer', 100, 800), { ...speciesAt('wolf', 'consumer', 400, 400), name: 'grey wolf' }], []);
    const series: Series = { ids: ['grass', 'wolf'], values: { grass: [1000], wolf: [10] } };
    expect(labelsAt(web, { kind: 'remove', species: 'wolf' }, series, EVENT_STEP)[0]?.text).toBe('The grey wolves are removed.');
  });
});

describe('labels and crowds agree on who is gone', () => {
  // Edited up to 4x its settled value, the fox is at 400 when the event comes, then crashes and recovers.
  const SETTLED_FOX = 100;
  const AT_EVENT = 400;
  const fox = [...Array<number>(EVENT_STEP).fill(AT_EVENT - 10), AT_EVENT, 300, 100, 20, 3, 2, 3, 10, 40];
  const series: Series = { ids: ['grass', 'fox'], values: { grass: Array<number>(fox.length).fill(1000), fox } };
  const web = webOf([speciesAt('grass', 'producer', 100, 800), speciesAt('fox', 'consumer', 400, 400)], []);
  const roles = { grass: 'producer', fox: 'consumer' } as const;
  const steps = Array.from({ length: fox.length - EVENT_STEP }, (_, index) => EVENT_STEP + index);
  const diesOut = (step: number) => labelFor(labelsAt(web, DROUGHT, series, step), 'fox')?.text === 'Foxes dying out.';
  const crowdAt = (step: number) => crowdTargets(series, step, { grass: 1000, fox: SETTLED_FOX }, roles, emptyEdits()).fox;

  it('says "die out" exactly while the outcome rule calls the fox gone', () => {
    const reference = referenceLevel(fox, EVENT_STEP);
    expect(steps.map(diesOut)).toEqual(steps.map((step) => step > EVENT_STEP && isGone(fox[step] as number, reference)));
    expect(steps.filter(diesOut)).toEqual([EVENT_STEP + 4, EVENT_STEP + 5, EVENT_STEP + 6]);
  });

  it('never says "die out" while the crowd still shows a fox', () => {
    for (const step of steps.filter(diesOut)) expect(crowdAt(step)).toBe(0);
  });

  it('dates the die-out label from when the fox went', () => {
    expect(labelFor(labelsAt(web, DROUGHT, series, EVENT_STEP + 6), 'fox')?.since).toBe(EVENT_STEP + 4);
  });

  it('goes back to the decline label once the fox recovers', () => {
    expect(labelFor(labelsAt(web, DROUGHT, series, EVENT_STEP + 8), 'fox')).toEqual({ speciesId: 'fox', text: 'Foxes declining.', since: EVENT_STEP + 1 });
    expect(crowdAt(EVENT_STEP + 8)).toBeGreaterThan(0);
  });
});
