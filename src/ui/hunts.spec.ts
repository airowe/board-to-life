import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WEB_SAMPLES } from '../ecosystem/samples';
import type { Web } from '../ecosystem/schema';
import { parseLibrary } from '../library/manifest';
import type { IndividualPose } from '../living/crowd';
import { layoutPlace } from '../living/layout';
import { HUNT_CYCLE_SECONDS, huntPairs, withHunts, type HuntPair } from './hunts';

const library = parseLibrary(JSON.parse(readFileSync('public/library/manifest.json', 'utf8')));
const sampleWeb = (id: string): Web => {
  const found = WEB_SAMPLES.find((entry) => entry.id === id);
  if (!found) throw new Error(`missing sample ${id}`);
  return found.web;
};

const ocean = sampleWeb('ocean');
const layout = layoutPlace(ocean, library);
const groupOf = (id: string) => {
  const group = layout.groups.find((entry) => entry.speciesId === id);
  if (!group) throw new Error(`missing group ${id}`);
  return group;
};

const pose = (x: number, y: number, extra: Partial<IndividualPose> = {}): IndividualPose => ({
  x, y, scale: 1, alpha: 1, facing: 1, moving: false, rotation: 0, ...extra,
});

const crowd = (): Map<string, IndividualPose[]> => {
  const otter = groupOf('otter');
  const urchin = groupOf('urchin');
  const kelp = groupOf('kelp');
  return new Map([
    ['otter', [pose(otter.centreX, otter.baseY), pose(otter.centreX + 80, otter.baseY)]],
    ['urchin', [pose(urchin.centreX, urchin.baseY), pose(urchin.centreX + 90, urchin.baseY)]],
    ['kelp', [pose(kelp.centreX, kelp.baseY)]],
  ]);
};

// The moment `into` seconds into a pair's cycle.
const at = (pair: HuntPair, into: number): number => (1 - pair.offset) * HUNT_CYCLE_SECONDS + into;

describe('huntPairs', () => {
  it('has the otters hunt the urchins, and nothing graze the kelp, which grows on the same floor', () => {
    expect(huntPairs(ocean, layout).map(({ predator, prey }) => [predator, prey])).toEqual([['otter', 'urchin']]);
  });

  it('has hawks hunt rabbits but foxes, which live on the same ground, not dive', () => {
    const grassland = sampleWeb('grassland');
    const pairs = huntPairs(grassland, layoutPlace(grassland, library)).map(({ predator, prey }) => `${predator}>${prey}`);
    expect(pairs).toContain('hawk>rabbit');
    expect(pairs.some((pair) => pair.startsWith('fox>'))).toBe(false);
  });
});

describe('withHunts', () => {
  const [pair] = huntPairs(ocean, layout) as [HuntPair];

  const otterMoved = (poses: Map<string, IndividualPose[]>, before: Map<string, IndividualPose[]>): IndividualPose | undefined =>
    poses.get('otter')?.find((entry, index) => entry.y !== before.get('otter')?.[index]?.y);

  it('sends an otter down toward the urchins, swimming', () => {
    const before = crowd();
    const diving = otterMoved(withHunts([pair], layout, before, at(pair, 1), false), before);
    expect(diving).toBeDefined();
    expect(diving?.y).toBeGreaterThan(groupOf('otter').baseY);
    expect(diving?.moving).toBe(true);
  });

  it('eats an urchin, which then grows back', () => {
    const urchinsAt = (into: number) => withHunts([pair], layout, crowd(), at(pair, into), false).get('urchin') ?? [];
    const eating = urchinsAt(2.8);
    expect(Math.min(...eating.map((entry) => entry.alpha))).toBeLessThan(0.05);
    const regrown = urchinsAt(HUNT_CYCLE_SECONDS - 0.1);
    expect(regrown.every((entry) => entry.alpha === 1 && entry.scale === 1)).toBe(true);
  });

  it('brings the otter back to its place', () => {
    const before = crowd();
    expect(otterMoved(withHunts([pair], layout, before, at(pair, HUNT_CYCLE_SECONDS - 0.1), false), before)).toBeUndefined();
  });

  it('does nothing with reduced motion', () => {
    const before = crowd();
    expect(withHunts([pair], layout, before, at(pair, 1), true)).toBe(before);
  });

  it('does nothing when there are no otters or no urchins left', () => {
    for (const gone of ['otter', 'urchin']) {
      const poses = crowd();
      poses.set(gone, []);
      const after = withHunts([pair], layout, poses, at(pair, 2.8), false);
      for (const id of ['otter', 'urchin']) expect(after.get(id)).toEqual(poses.get(id));
    }
  });

  it('leaves animals still arriving or leaving alone', () => {
    const poses = crowd();
    poses.set('urchin', (poses.get('urchin') ?? []).map((entry) => ({ ...entry, moving: true, alpha: 0.5 })));
    const after = withHunts([pair], layout, poses, at(pair, 2.8), false);
    expect(after.get('urchin')).toEqual(poses.get('urchin'));
  });
});
