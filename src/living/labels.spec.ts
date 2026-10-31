import { describe, expect, it } from 'vitest';
import { speciesAt, webOf } from '../ecosystem/fixtures';
import { EVENT_STEP, MODEL_STEPS, simulate, type Series } from '../ecosystem/model';
import { WEB_SAMPLES } from '../ecosystem/samples';
import type { Web, WebEvent } from '../ecosystem/schema';
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

  it('urchins get "Urchins multiply." after it', () => {
    const since = firstStepWith('urchin');
    expect(since).toBeGreaterThan(EVENT_STEP);
    expect(labelFor(kelpLabelsAt(MODEL_STEPS), 'urchin')).toEqual({ speciesId: 'urchin', text: 'Urchins multiply.', since });
  });

  it('kelp gets "Kelp thin out."', () => {
    const since = firstStepWith('kelp');
    expect(labelFor(kelpLabelsAt(MODEL_STEPS), 'kelp')).toEqual({ speciesId: 'kelp', text: 'Kelp thin out.', since });
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
    expect(labels.map((label) => label.text)).toEqual(['Ducks multiply.', 'Water fleas decline.', 'Algae multiply.']);
  });

  it('a died-out label replaces that species\' decline label', () => {
    const web = webOf([speciesAt('grass', 'producer', 100, 800), speciesAt('fox', 'consumer', 400, 400)], []);
    const fox = [...Array<number>(EVENT_STEP + 1).fill(100), 80, 50, 5, 1, 0.5];
    const grass = Array<number>(fox.length).fill(1000);
    const series: Series = { ids: ['grass', 'fox'], values: { grass, fox } };
    const declineStep = EVENT_STEP + 1;
    const deadStep = EVENT_STEP + 4;
    expect(labelsAt(web, DROUGHT, series, deadStep - 1)).toContainEqual({ speciesId: 'fox', text: 'Foxes decline.', since: declineStep });
    const labels = labelsAt(web, DROUGHT, series, deadStep);
    expect(labels.filter((label) => label.speciesId === 'fox')).toEqual([{ speciesId: 'fox', text: 'Foxes die out.', since: deadStep }]);
  });

  it('drought label has no species', () => {
    expect(labelsAt(KELP, DROUGHT, run(KELP, DROUGHT), EVENT_STEP)).toEqual([{ speciesId: null, text: 'A drought hits.', since: EVENT_STEP }]);
  });

  it.each<[string, string]>([
    ['sea otter', 'Sea otters multiply.'],
    ['rabbits', 'Rabbits multiply.'],
    ['butterfly', 'Butterflies multiply.'],
    ['fox', 'Foxes multiply.'],
    ['grass', 'Grass multiply.'],
    ['deer', 'Deer multiply.'],
  ])('names a rising "%s" as "%s"', (name, text) => {
    const web = webOf([{ ...speciesAt('grass', 'producer', 100, 800), name }], []);
    const series: Series = { ids: ['grass'], values: { grass: [...Array<number>(EVENT_STEP + 1).fill(100), 200] } };
    expect(labelFor(labelsAt(web, DROUGHT, series, EVENT_STEP + 1), 'grass')?.text).toBe(text);
  });
});
