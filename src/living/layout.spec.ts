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
  PRODUCER_HEIGHT,
  SMALL_HEIGHT,
  STAGE,
  SURFACE_HEIGHT,
  SURFACE_Y_BY_HABITAT,
  WATER_Y_BY_HABITAT,
  habitatFor,
  layoutPlace,
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

  it("groups keep the board's left-to-right order", () => {
    const web = sampleWeb('forest');
    const { groups } = layoutPlace(web, library);
    const byBoard = [...web.species].sort((a, b) => a.x - b.x).map((entry) => entry.id);
    expect(groups.map((group) => group.speciesId)).toEqual(byBoard);
    const centres = groups.map((group) => group.centreX);
    expect(centres).toEqual([...centres].sort((a, b) => a - b));
  });

  it.each(WEB_SAMPLES.map((sample) => [sample.id]))("no two groups' spreads overlap in the %s sample", (id) => {
    const { groups } = layoutPlace(sampleWeb(id), library);
    groups.slice(1).forEach((group, index) => {
      const before = groups[index] as Group;
      expect(group.centreX - group.spread).toBeGreaterThanOrEqual(before.centreX + before.spread);
    });
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

  it.each([['duck'], ['algae']])('pond surface group %s sits at the pond waterline', (speciesId) => {
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
      expect(group.baseY).toBe(WATER_Y_BY_HABITAT[habitat] * STAGE.height);
      expect(group.baseY - group.depth - group.size / 2).toBeGreaterThan(SURFACE_Y_BY_HABITAT[habitat] * STAGE.height);
      expect(group.baseY + group.depth + group.size / 2).toBeLessThan(FLOOR_Y * STAGE.height);
    }
  });

  it('gives floor and water crowds some depth, and surface crowds none', () => {
    const { groups } = layoutPlace(sampleWeb('pond'), library);
    expect(groupOf(groups, 'heron').depth).toBeGreaterThan(0);
    expect(groupOf(groups, 'minnow').depth).toBeGreaterThan(0);
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
    ['pond', 'algae', PRODUCER_HEIGHT],
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
