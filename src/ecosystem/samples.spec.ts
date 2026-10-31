import { describe, expect, it } from 'vitest';
import { EVENT_STEP, MODEL_STEPS, simulate, type Run } from './model';
import { directionsAfter, type Direction } from './outcomes';
import { WEB_SAMPLES, webSampleUrl, type WebSample } from './samples';
import { validateWeb, type Web, type WebEvent } from './schema';
import { suggestedEvent } from './trophic';

const runWith = (event: WebEvent | null): Run => ({ steps: MODEL_STEPS, event, eventStep: EVENT_STEP, removed: new Set<string>() });

const directionsFor = (sample: WebSample, web: Web, event: WebEvent | null): Record<string, Direction> =>
  directionsAfter(simulate(web, runWith(event)), EVENT_STEP);

const sampleById = (id: string): WebSample => {
  const sample = WEB_SAMPLES.find((entry) => entry.id === id);
  if (sample === undefined) throw new Error(`no sample ${id}`);
  return sample;
};

const withoutEvent = (web: Web): Web => ({ ...web, event: null });

const eventOf = (web: Web): WebEvent => {
  if (web.event === null) throw new Error('sample has no event');
  return web.event;
};

const cases = WEB_SAMPLES.map((sample) => [sample.id, sample] as const);

const EXPECTED_IDS = ['grassland', 'ocean', 'pond', 'forest', 'grassland-messy'];
const SAMPLE_DRAWING = { width: 1200, height: 800 };

describe('WEB_SAMPLES', () => {
  it('has the five sample webs, each with a distinct id', () => {
    expect(WEB_SAMPLES.map((sample) => sample.id)).toEqual(EXPECTED_IDS);
  });

  it.each(cases)('%s validates', (_, sample) => {
    expect(validateWeb(sample.web)).toEqual({ ok: true, web: sample.web });
  });

  it.each(cases)('%s is drawn on a 1200 x 800 drawing', (_, sample) => {
    expect(sample.web.drawing).toEqual(SAMPLE_DRAWING);
  });

  it.each(cases)('%s holds steady with no event', (_, sample) => {
    const directions = directionsFor(sample, withoutEvent(sample.web), null);
    expect(directions).toEqual(Object.fromEntries(sample.web.species.map((entry) => [entry.id, 'steady'])));
  });

  it.each(cases)('%s plays its event out as expected', (_, sample) => {
    expect(directionsFor(sample, sample.web, eventOf(sample.web))).toEqual(sample.expect.event);
  });

  it.each(cases)('%s plays out removing its top predator as expected', (_, sample) => {
    const web = withoutEvent(sample.web);
    expect(directionsFor(sample, web, suggestedEvent(web))).toEqual(sample.expect.topPredator);
  });
});

describe('top predators', () => {
  it.each([
    ['grassland', 'hawk'],
    ['ocean', 'otter'],
    ['pond', 'heron'],
    ['forest', 'wolf'],
    ['grassland-messy', 'hawk'],
  ])('%s removes %s as its top predator', (id, species) => {
    expect(suggestedEvent(withoutEvent(sampleById(id).web))).toEqual({ kind: 'remove', species });
  });
});

describe('directions ecology does not settle', () => {
  it('pond: algae rises without the heron, because the water fleas lost grazed more algae than the extra ducks eat', () => {
    expect(sampleById('pond').expect.event.algae).toBe('rose');
  });

  it('forest: fungi fall without the songbird, because songbird and wolf deaths almost stop, outweighing the extra caterpillar deaths', () => {
    expect(sampleById('forest').expect.event.fungi).toBe('fell');
  });

  it('forest: fungi fall without the wolf, because wolf and songbird deaths almost stop, outweighing the extra deer deaths', () => {
    expect(sampleById('forest').expect.topPredator.fungi).toBe('fell');
  });
});

describe('grassland-messy', () => {
  it('keeps the id rabbit but the name as written, rabit', () => {
    const rabbit = sampleById('grassland-messy').web.species.find((entry) => entry.id === 'rabbit');
    expect(rabbit?.name).toBe('rabit');
  });

  it('records the crossed-out arrow as one unknown mark', () => {
    expect(sampleById('grassland-messy').web.unknownMarks.map((mark) => mark.note)).toEqual(['Crossed-out arrow']);
  });

  it('has the same arrows as grassland', () => {
    const arrows = (id: string) => sampleById(id).web.eats.map(({ from, to }) => [from, to]);
    expect(arrows('grassland-messy')).toEqual(arrows('grassland'));
  });
});

describe('webSampleUrl', () => {
  it('points at the drawn image for the sample', () => {
    expect(webSampleUrl('pond')).toBe('/samples/web-pond.png');
  });
});
