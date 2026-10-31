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
  SURFACE_Y,
  habitatFor,
  layoutPlace,
  type Group,
} from './layout';

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

  it('surface groups sit at SURFACE_Y', () => {
    const otter = groupOf(layoutPlace(sampleWeb('ocean'), library).groups, 'otter');
    expect(otter).toMatchObject({ zone: 'surface', baseY: SURFACE_Y * STAGE.height });
  });

  it('water groups sit between the surface and the floor', () => {
    const minnow = groupOf(layoutPlace(sampleWeb('pond'), library).groups, 'minnow');
    expect(minnow.zone).toBe('water');
    expect(minnow.baseY).toBeGreaterThan(SURFACE_Y * STAGE.height);
    expect(minnow.baseY).toBeLessThan(FLOOR_Y * STAGE.height);
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
