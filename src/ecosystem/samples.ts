import type { Direction } from './outcomes';
import type { Eats, Species, Web } from './schema';

// Sample food webs a teacher can try without a whiteboard. Each one's outcome is pinned in samples.spec.ts.
export type WebSample = {
  id: string;
  title: string;
  web: Web;
  expect: { event: Record<string, Direction>; topPredator: Record<string, Direction> };
};

const DRAWING = { width: 1200, height: 800 };
const BOX = { width: 160, height: 70 };
const CONFIDENCE = 0.95;

const species = (id: string, role: Species['role'], x: number, y: number, name = id): Species => ({
  id,
  name,
  role,
  x,
  y,
  ...BOX,
  confidence: CONFIDENCE,
});

const eats = (id: string, from: string, to: string): Eats => ({ id, from, to, confidence: CONFIDENCE });

const web = (members: Species[], arrows: Eats[], event: Web['event'], unknownMarks: Web['unknownMarks'] = []): Web => ({
  version: 1,
  drawing: DRAWING,
  species: members,
  eats: arrows,
  labels: [],
  unknownMarks,
  event,
});

const grasslandArrows = (): Eats[] => [eats('e1', 'grass', 'rabbit'), eats('e2', 'rabbit', 'fox'), eats('e3', 'rabbit', 'hawk')];

const grasslandExpect: WebSample['expect'] = {
  event: { grass: 'fell', rabbit: 'rose', hawk: 'rose', fox: 'died out' },
  topPredator: { grass: 'fell', rabbit: 'rose', hawk: 'died out', fox: 'rose' },
};

const grassland: WebSample = {
  id: 'grassland',
  title: 'Grassland',
  web: web(
    [
      species('grass', 'producer', 520, 680),
      species('rabbit', 'consumer', 520, 400),
      species('hawk', 'consumer', 240, 110),
      species('fox', 'consumer', 800, 110),
    ],
    grasslandArrows(),
    { kind: 'remove', species: 'fox' },
  ),
  expect: grasslandExpect,
};

const oceanDirections: Record<string, Direction> = { kelp: 'fell', urchin: 'rose', otter: 'died out' };

const ocean: WebSample = {
  id: 'ocean',
  title: 'Kelp forest',
  web: web(
    [
      species('kelp', 'producer', 520, 680),
      species('urchin', 'consumer', 520, 400),
      species('otter', 'consumer', 520, 110, 'sea otter'),
    ],
    [eats('e1', 'kelp', 'urchin'), eats('e2', 'urchin', 'otter')],
    { kind: 'remove', species: 'otter' },
  ),
  expect: { event: oceanDirections, topPredator: oceanDirections },
};

const pondDirections: Record<string, Direction> = { algae: 'rose', flea: 'fell', minnow: 'rose', duck: 'rose', heron: 'died out' };

const pond: WebSample = {
  id: 'pond',
  title: 'Pond',
  web: web(
    [
      species('algae', 'producer', 520, 700),
      species('flea', 'consumer', 220, 500, 'water flea'),
      species('minnow', 'consumer', 220, 280),
      species('duck', 'consumer', 820, 330),
      species('heron', 'consumer', 520, 70),
    ],
    [
      eats('e1', 'algae', 'flea'),
      eats('e2', 'flea', 'minnow'),
      eats('e3', 'algae', 'duck'),
      eats('e4', 'flea', 'duck'),
      eats('e5', 'minnow', 'heron'),
      eats('e6', 'duck', 'heron'),
    ],
    { kind: 'remove', species: 'heron' },
  ),
  expect: { event: pondDirections, topPredator: pondDirections },
};

const forest: WebSample = {
  id: 'forest',
  title: 'Woodland',
  web: web(
    [
      species('oak', 'producer', 420, 690),
      species('caterpillar', 'consumer', 160, 420),
      species('deer', 'consumer', 680, 420),
      species('wolf', 'consumer', 680, 110),
      species('songbird', 'consumer', 160, 110),
      species('fungi', 'decomposer', 980, 690),
    ],
    [eats('e1', 'oak', 'caterpillar'), eats('e2', 'oak', 'deer'), eats('e3', 'caterpillar', 'songbird'), eats('e4', 'deer', 'wolf')],
    { kind: 'remove', species: 'songbird' },
  ),
  expect: {
    event: { oak: 'fell', caterpillar: 'rose', deer: 'fell', wolf: 'fell', songbird: 'died out', fungi: 'fell' },
    topPredator: { oak: 'fell', caterpillar: 'fell', deer: 'rose', wolf: 'died out', songbird: 'fell', fungi: 'fell' },
  },
};

const grasslandMessy: WebSample = {
  id: 'grassland-messy',
  title: 'Grassland, messy',
  web: web(
    [
      species('grass', 'producer', 500, 690),
      species('rabbit', 'consumer', 560, 390, 'rabit'),
      species('hawk', 'consumer', 210, 130),
      species('fox', 'consumer', 830, 90),
    ],
    grasslandArrows(),
    { kind: 'remove', species: 'fox' },
    [{ id: 'm1', x: 300, y: 450, width: 200, height: 160, note: 'Crossed-out arrow', confidence: CONFIDENCE }],
  ),
  expect: grasslandExpect,
};

export const WEB_SAMPLES: readonly WebSample[] = [grassland, ocean, pond, forest, grasslandMessy];

export const webSampleUrl = (id: string): string => `/samples/web-${id}.png`;
