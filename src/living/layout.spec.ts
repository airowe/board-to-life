import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { speciesAt, webOf } from '../ecosystem/fixtures';
import { WEB_SAMPLES } from '../ecosystem/samples';
import type { Web } from '../ecosystem/schema';
import { parseLibrary, type Habitat } from '../library/manifest';
import {
  DEFAULT_HABITAT,
  FLOOR_ANIMAL_HEIGHT,
  FLOOR_Y,
  MAX_SPREAD_SPACINGS,
  MAX_WIDTH_PER_HEIGHT,
  PRODUCER_HEIGHT,
  ROOTED_MAX_SPREAD_SHARE,
  SPACING_PER_WIDTH,
  SMALL_HEIGHT,
  STAGE,
  SURFACE_HEIGHT,
  SURFACE_Y_BY_HABITAT,
  TALL_PLANT_HEIGHT,
  WATER_Y_BY_HABITAT,
  habitatFor,
  isRooted,
  layoutPlace,
  poseFileFor,
  rowOf,
  type Group,
} from './layout';

// Measured on bg-pond.webp: the water's surface band runs from 0.505 to 0.555 of the height.
const POND_WATER_BAND = [0.5, 0.56] as const;
const KELP_SURFACE_Y = 0.12;

const library = parseLibrary(JSON.parse(readFileSync('public/library/manifest.json', 'utf8')));

const sampleWeb = (id: string): Web => {
  const sample = WEB_SAMPLES.find((entry) => entry.id === id);
  if (!sample) throw new Error(`no sample "${id}"`);
  return sample.web;
};

const groupOf = (groups: Group[], speciesId: string): Group => {
  const group = groups.find((entry) => entry.speciesId === speciesId);
  if (!group) throw new Error(`no group for "${speciesId}"`);
  return group;
};

const unknownWeb = (): Web =>
  webOf(
    [speciesAt('zorblat', 'producer', 300, 800), speciesAt('jellyfish', 'consumer', 600, 400), speciesAt('quuxling', 'consumer', 100, 200)],
    [],
  );

describe('habitatFor', () => {
  it.each<[string, Habitat]>([
    ['ocean', 'kelp-forest'],
    ['grassland', 'grassland'],
    ['pond', 'pond'],
    ['forest', 'woodland'],
  ])('gives the %s sample the %s habitat', (id, habitat) => {
    expect(habitatFor(sampleWeb(id), library)).toBe(habitat);
  });

  it('a web of unknown species gets the default habitat', () => {
    expect(habitatFor(unknownWeb(), library)).toBe(DEFAULT_HABITAT);
  });

  it('a tied vote gets the default habitat', () => {
    const tied = webOf([speciesAt('kelp', 'producer', 100, 800), speciesAt('wolf', 'consumer', 400, 400)], []);
    expect(habitatFor(tied, library)).toBe(DEFAULT_HABITAT);
  });
});

describe('layoutPlace', () => {
  it('reports the voted habitat', () => {
    expect(layoutPlace(sampleWeb('ocean'), library).habitat).toBe('kelp-forest');
  });

  const rows = (groups: Group[]): Group[][] => [...new Set(groups.map(rowOf))].map((row) => groups.filter((group) => rowOf(group) === row));

  it("groups keep the board's left-to-right order, and so does each row", () => {
    const web = sampleWeb('forest');
    const { groups } = layoutPlace(web, library);
    const byBoard = [...web.species].sort((a, b) => a.x - b.x).map((entry) => entry.id);
    expect(groups.map((group) => group.speciesId)).toEqual(byBoard);
    for (const row of rows(groups)) {
      const centres = row.map((group) => group.centreX);
      expect(centres).toEqual([...centres].sort((a, b) => a - b));
    }
  });

  it.each(WEB_SAMPLES.map((sample) => [sample.id]))("no two groups' spreads overlap within a row in the %s sample", (id) => {
    for (const row of rows(layoutPlace(sampleWeb(id), library).groups)) {
      row.slice(1).forEach((group, index) => {
        const before = row[index] as Group;
        expect(group.centreX - group.spread).toBeGreaterThanOrEqual(before.centreX + before.spread);
      });
    }
  });

  it('lays out sky, floor animals and rooted producers as separate rows across the whole stage', () => {
    const { groups } = layoutPlace(sampleWeb('grassland'), library);
    expect(new Set(groups.map(rowOf)).size).toBe(3);
    const hawk = groupOf(groups, 'hawk');
    expect(hawk.spread).toBe(MAX_SPREAD_SPACINGS.sky * hawk.spacing);
  });

  it('keeps every rooted crowd in the samples within its share of the stage', () => {
    const rooted = WEB_SAMPLES.flatMap((sample) => layoutPlace(sample.web, library).groups.filter((group) => isRooted(group.role, group.zone)));
    expect(rooted.length).toBeGreaterThan(0);
    for (const group of rooted) expect(2 * group.spread).toBeLessThanOrEqual(ROOTED_MAX_SPREAD_SHARE * STAGE.width);
  });

  it.each<[string, number]>([
    ['left', 100],
    ['middle', 500],
    ['right', 900],
  ])('a lone plant drawn on the %s of the board clusters there', (_, boardX) => {
    const web = webOf([speciesAt('grass', 'producer', boardX, 800), speciesAt('rabbit', 'consumer', 300, 400)], []);
    const grass = groupOf(layoutPlace(web, library).groups, 'grass');
    const wanted = 48 + (boardX / web.drawing.width) * (STAGE.width - 2 * 48);
    const lowest = grass.spread + 48;
    const highest = STAGE.width - 48 - grass.spread;
    expect(grass.centreX).toBeCloseTo(Math.min(Math.max(wanted, lowest), highest), 6);
  });

  it('keeps plants drawn side by side apart and in board order', () => {
    const web = webOf([speciesAt('grass', 'producer', 480, 800), speciesAt('oak', 'producer', 520, 800)], []);
    const [grass, oak] = layoutPlace(web, library).groups;
    if (!grass || !oak) throw new Error('missing groups');
    expect(oak.centreX - oak.spread).toBeGreaterThanOrEqual(grass.centreX + grass.spread);
  });

  it('lets a producer that lives in the water drift in the swimmers\' row instead of clustering like a rooted plant', () => {
    const web = webOf(
      [speciesAt('phytoplankton', 'producer', 900, 800), speciesAt('jellyfish', 'consumer', 300, 500), speciesAt('kelp', 'producer', 600, 900)],
      [],
    );
    const { groups } = layoutPlace(web, library);
    const plankton = groupOf(groups, 'phytoplankton');
    expect(plankton).toMatchObject({ zone: 'water', size: SMALL_HEIGHT });
    expect(rowOf(plankton)).toBe(rowOf(groupOf(groups, 'jellyfish')));
    expect(rowOf(plankton)).not.toBe(rowOf(groupOf(groups, 'kelp')));
    expect(plankton.spread).toBe(MAX_SPREAD_SPACINGS.water * plankton.spacing);
  });

  it.each<[string, string]>([
    ['grassland', 'fox'],
    ['grassland', 'rabbit'],
    ['grassland', 'grass'],
  ])('spaces the %s sample %s at a share of its resting picture width', (id, speciesId) => {
    const group = groupOf(layoutPlace(sampleWeb(id), library).groups, speciesId);
    const entry = library.entries.find((item) => item.subject === speciesId && item.pose !== 'move');
    if (!entry) throw new Error(`no picture for ${speciesId}`);
    const width = group.size * Math.min(entry.width / entry.height, MAX_WIDTH_PER_HEIGHT);
    expect(group.spacing).toBeCloseTo(width * SPACING_PER_WIDTH, 6);
  });

  it('spaces the sky by the flying picture, not the perched one', () => {
    const hawk = groupOf(layoutPlace(sampleWeb('grassland'), library).groups, 'hawk');
    const flying = library.entries.find((item) => item.subject === 'hawk' && item.pose === 'move');
    if (!flying) throw new Error('no flying hawk');
    expect(hawk.spacing).toBeCloseTo(hawk.size * Math.min(flying.width / flying.height, MAX_WIDTH_PER_HEIGHT) * SPACING_PER_WIDTH, 6);
  });

  it('gives an unknown subject a square picture to space by', () => {
    const quux = groupOf(layoutPlace(unknownWeb(), library).groups, 'quuxling');
    expect(quux.spacing).toBeCloseTo(quux.size * SPACING_PER_WIDTH, 6);
  });

  it.each(WEB_SAMPLES.map((sample) => [sample.id]))('keeps every spread on the stage in the %s sample', (id) => {
    for (const group of layoutPlace(sampleWeb(id), library).groups) {
      expect(group.spread).toBeGreaterThan(0);
      expect(group.centreX - group.spread).toBeGreaterThanOrEqual(0);
      expect(group.centreX + group.spread).toBeLessThanOrEqual(STAGE.width);
    }
  });

  it('floor groups sit on FLOOR_Y', () => {
    const { groups } = layoutPlace(sampleWeb('grassland'), library);
    expect(groupOf(groups, 'rabbit')).toMatchObject({ zone: 'floor', baseY: FLOOR_Y * STAGE.height });
    expect(groupOf(groups, 'grass')).toMatchObject({ zone: 'floor', baseY: FLOOR_Y * STAGE.height });
  });

  it('sky groups sit above the middle', () => {
    const hawk = groupOf(layoutPlace(sampleWeb('grassland'), library).groups, 'hawk');
    expect(hawk.zone).toBe('sky');
    expect(hawk.baseY).toBeLessThan(STAGE.height / 2);
  });

  it('surface groups sit at SURFACE_Y for their habitat (kelp forest 0.12)', () => {
    const otter = groupOf(layoutPlace(sampleWeb('ocean'), library).groups, 'otter');
    expect(SURFACE_Y_BY_HABITAT['kelp-forest']).toBe(KELP_SURFACE_Y);
    expect(otter).toMatchObject({ zone: 'surface', baseY: KELP_SURFACE_Y * STAGE.height });
  });

  it.each([['duck'], ['algae'], ['heron']])('pond surface group %s sits at the pond waterline', (speciesId) => {
    const group = groupOf(layoutPlace(sampleWeb('pond'), library).groups, speciesId);
    expect(group).toMatchObject({ zone: 'surface', baseY: SURFACE_Y_BY_HABITAT.pond * STAGE.height });
    expect(group.baseY).toBeGreaterThanOrEqual(POND_WATER_BAND[0] * STAGE.height);
    expect(group.baseY).toBeLessThanOrEqual(POND_WATER_BAND[1] * STAGE.height);
  });

  const kelpWithSwimmers = (): Web =>
    webOf([speciesAt('kelp', 'producer', 100, 800), speciesAt('krill', 'consumer', 300, 500), speciesAt('shark', 'consumer', 600, 200)], []);

  it.each<[string, () => Web, Habitat]>([
    ['pond sample', () => sampleWeb('pond'), 'pond'],
    ['kelp forest with swimmers', kelpWithSwimmers, 'kelp-forest'],
  ])('water groups in the %s sit between its surface and floor', (_, makeWeb, habitat) => {
    const layout = layoutPlace(makeWeb(), library);
    expect(layout.habitat).toBe(habitat);
    const water = layout.groups.filter((group) => group.zone === 'water');
    expect(water.length).toBeGreaterThan(0);
    for (const group of water) {
      expect(group.baseY - group.depth - group.size / 2).toBeGreaterThan(SURFACE_Y_BY_HABITAT[habitat] * STAGE.height);
      expect(group.baseY + group.depth + group.size / 2).toBeLessThan(FLOOR_Y * STAGE.height);
    }
  });

  it('keeps a lone water group on the habitat\'s water line', () => {
    const web = webOf([speciesAt('kelp', 'producer', 100, 800), speciesAt('shark', 'consumer', 600, 200)], []);
    expect(groupOf(layoutPlace(web, library).groups, 'shark').baseY).toBe(WATER_Y_BY_HABITAT['kelp-forest'] * STAGE.height);
  });

  it.each<[string, () => Web]>([
    ['kelp forest with swimmers', kelpWithSwimmers],
    ['pond sample', () => sampleWeb('pond')],
    [
      'plankton, jellyfish and sea turtles',
      () =>
        webOf(
          [
            speciesAt('phytoplankton', 'producer', 200, 800),
            speciesAt('jellyfish', 'consumer', 500, 500),
            speciesAt('turtle', 'consumer', 800, 200),
            speciesAt('kelp', 'producer', 100, 900),
          ],
          [],
        ),
    ],
  ])('gives each water group in the %s its own depth lane, higher on the board nearer the surface', (_, makeWeb) => {
    const web = makeWeb();
    const water = layoutPlace(web, library).groups.filter((group) => group.zone === 'water');
    expect(water.length).toBeGreaterThan(1);
    const boardY = new Map(web.species.map((entry) => [entry.id, entry.y]));
    const lanes = [...water].sort((a, b) => (boardY.get(a.speciesId) ?? 0) - (boardY.get(b.speciesId) ?? 0));
    lanes.slice(1).forEach((group, index) => {
      const above = lanes[index] as Group;
      expect(group.baseY - above.baseY).toBeGreaterThanOrEqual(Math.max(group.size, above.size));
      expect(group.baseY - group.depth).toBeGreaterThanOrEqual(above.baseY + above.depth);
    });
  });

  it('gives floor and water crowds some depth, and surface crowds none', () => {
    const { groups } = layoutPlace(sampleWeb('pond'), library);
    expect(groupOf(groups, 'minnow').depth).toBeGreaterThan(0);
    expect(groupOf(groups, 'heron').depth).toBe(0);
    expect(groupOf(groups, 'duck').depth).toBe(0);
  });

  it('land habitats stand surface floaters on the floor', () => {
    const web = webOf([speciesAt('grass', 'producer', 100, 800), speciesAt('rabbit', 'consumer', 300, 400), speciesAt('duck', 'consumer', 600, 400)], []);
    const layout = layoutPlace(web, library);
    expect(layout.habitat).toBe('grassland');
    expect(groupOf(layout.groups, 'duck')).toMatchObject({ zone: 'surface', baseY: FLOOR_Y * STAGE.height });
  });

  it('an unknown "jellyfish" is placed in water', () => {
    expect(groupOf(layoutPlace(unknownWeb(), library).groups, 'jellyfish').zone).toBe('water');
  });

  it.each<[string, string, number]>([
    ['grassland', 'grass', PRODUCER_HEIGHT],
    ['grassland', 'fox', FLOOR_ANIMAL_HEIGHT],
    ['grassland', 'hawk', SMALL_HEIGHT],
    ['pond', 'minnow', SMALL_HEIGHT],
    ['ocean', 'otter', SURFACE_HEIGHT],
    ['pond', 'algae', SURFACE_HEIGHT],
  ])('sizes the %s sample %s at %i px', (id, speciesId, size) => {
    expect(groupOf(layoutPlace(sampleWeb(id), library).groups, speciesId).size).toBe(size);
  });

  it('carries each species role onto its group', () => {
    const { groups } = layoutPlace(sampleWeb('forest'), library);
    expect(groupOf(groups, 'oak').role).toBe('producer');
    expect(groupOf(groups, 'fungi').role).toBe('decomposer');
  });

  it('all-unknown web lays out without throwing', () => {
    const layout = layoutPlace(unknownWeb(), library);
    expect(layout.habitat).toBe(DEFAULT_HABITAT);
    expect(layout.groups.map((group) => [group.speciesId, group.zone])).toEqual([
      ['quuxling', 'floor'],
      ['zorblat', 'floor'],
      ['jellyfish', 'water'],
    ]);
  });

  it('lays out an empty web as an empty scene', () => {
    expect(layoutPlace(webOf([], []), library)).toEqual({ habitat: DEFAULT_HABITAT, groups: [] });
  });
});

describe('poseFileFor', () => {
  it.each<[Parameters<typeof poseFileFor>[0], boolean, 'rest' | 'move']>([
    ['sky', false, 'move'],
    ['sky', true, 'move'],
    ['floor', false, 'rest'],
    ['floor', true, 'move'],
    ['water', false, 'rest'],
    ['surface', false, 'rest'],
  ])('a %s subject that is moving: %s uses its %s picture', (zone, moving, expected) => {
    expect(poseFileFor(zone, moving)).toBe(expected);
  });
});

describe('layoutPlace tall plants', () => {
  const ocean = WEB_SAMPLES.find((entry) => entry.id === 'ocean')?.web as Web;
  const groupOf = (id: string) => layoutPlace(ocean, library).groups.find((group) => group.speciesId === id);

  it('stands kelp well above the urchins at its foot, so its fronds can be tapped on their own', () => {
    const kelp = groupOf('kelp');
    const urchin = groupOf('urchin');
    expect(kelp?.size).toBe(TALL_PLANT_HEIGHT.kelp);
    expect((kelp?.size ?? 0) - (urchin?.size ?? 0)).toBeGreaterThan(urchin?.size ?? 0);
  });

  it('keeps the kelp tops below the otters at the surface', () => {
    const kelp = groupOf('kelp');
    const otter = groupOf('otter');
    if (!kelp || !otter) throw new Error('missing a group');
    expect(kelp.baseY - kelp.size).toBeGreaterThan(otter.baseY + otter.size / 2);
  });

  it('leaves other plants at the usual height', () => {
    const grassland = WEB_SAMPLES.find((entry) => entry.id === 'grassland')?.web as Web;
    expect(layoutPlace(grassland, library).groups.find((group) => group.speciesId === 'grass')?.size).toBe(PRODUCER_HEIGHT);
  });
});
