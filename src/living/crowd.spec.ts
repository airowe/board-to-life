import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { emptyEdits, type WebEdits } from '../ecosystem/edits';
import { EVENT_STEP, simulate, startingPopulations, type Series } from '../ecosystem/model';
import { WEB_SAMPLES } from '../ecosystem/samples';
import type { Role } from '../ecosystem/schema';
import {
  BASE_ANIMALS,
  BASE_PRODUCERS,
  ENTER_SECONDS,
  LEAVE_SECONDS,
  MAX_PER_GROUP,
  createCrowdTracker,
  crowdTargets,
  type IndividualPose,
} from './crowd';
import { parseLibrary } from '../library/manifest';
import { STAGE, SURFACE_Y_BY_HABITAT, layoutPlace, type Group } from './layout';

const SETTLED = { fox: 100, grass: 1000 };
const ROLES: Record<string, Role> = { fox: 'consumer', grass: 'producer' };

const seriesOf = (fox: number, grass: number): Series => ({ ids: ['fox', 'grass'], values: { fox: [fox], grass: [grass] } });

const removing = (id: string): WebEdits => ({ ...emptyEdits(), removed: new Set([id]) });

describe('crowdTargets', () => {
  it.each<[string, number, number, number, number]>([
    ['settled value gives the base count', 100, 1000, BASE_ANIMALS, BASE_PRODUCERS],
    ['double gives double, capped at 12', 200, 2000, 2 * BASE_ANIMALS, MAX_PER_GROUP],
    ['triple an animal is capped at 12', 300, 1000, MAX_PER_GROUP, BASE_PRODUCERS],
    ['a value at 1% of settled gives 0', 1, 10, 0, 0],
    ['a small positive value gives at least 1', 5, 20, 1, 1],
    ['a value of 0 gives 0', 0, 0, 0, 0],
  ])('%s', (_, fox, grass, foxCount, grassCount) => {
    expect(crowdTargets(seriesOf(fox, grass), 0, SETTLED, ROLES, emptyEdits())).toEqual({ fox: foxCount, grass: grassCount });
  });

  it('a removed species gives 0', () => {
    expect(crowdTargets(seriesOf(100, 1000), 0, SETTLED, ROLES, removing('fox'))).toEqual({ fox: 0, grass: BASE_PRODUCERS });
  });

  it('reads the value at the given step, holding the last value past the end', () => {
    const series: Series = { ids: ['fox'], values: { fox: [100, 200] } };
    const targetsAt = (step: number) => crowdTargets(series, step, SETTLED, ROLES, emptyEdits()).fox;
    expect([targetsAt(0), targetsAt(1), targetsAt(5)]).toEqual([BASE_ANIMALS, 2 * BASE_ANIMALS, 2 * BASE_ANIMALS]);
  });

  it('a start edited to 0 gives 0', () => {
    const { web } = WEB_SAMPLES[0] as (typeof WEB_SAMPLES)[number];
    const settled = startingPopulations(web);
    const edits: WebEdits = { ...emptyEdits(), start: { rabbit: 0 } };
    const series = simulate(web, { steps: EVENT_STEP, event: null, eventStep: EVENT_STEP, removed: edits.removed, start: edits.start }, settled);
    const roles = Object.fromEntries(web.species.map((entry) => [entry.id, entry.role]));
    const targets = crowdTargets(series, EVENT_STEP / 2, settled, roles, edits);
    expect(targets.rabbit).toBe(0);
    expect(targets.grass).toBeGreaterThan(0);
  });
});

const FLOOR: Group = { speciesId: 'fox', role: 'consumer', zone: 'floor', centreX: 400, spread: 120, baseY: 880, depth: 12, size: 150 };
const SURFACE: Group = { speciesId: 'otter', role: 'consumer', zone: 'surface', centreX: 1000, spread: 100, baseY: 123, depth: 0, size: 130 };
const WATER: Group = { speciesId: 'fish', role: 'consumer', zone: 'water', centreX: 1300, spread: 100, baseY: 560, depth: 60, size: 110 };
const PRODUCER: Group = { speciesId: 'grass', role: 'producer', zone: 'floor', centreX: 800, spread: 150, baseY: 880, depth: 12, size: 300 };
const GROUPS = [FLOOR, SURFACE, WATER, PRODUCER];
const SETTLED_IN = ENTER_SECONDS + 0.5;
const IDLE_TIMES = [SETTLED_IN, SETTLED_IN + 0.7, SETTLED_IN + 2.3, SETTLED_IN + 5.1];
const HALF = 0.5;

const posesAt = (targets: Record<string, number>, seconds: number, reducedMotion = false): Map<string, IndividualPose[]> => {
  const tracker = createCrowdTracker();
  tracker.update(targets, 0);
  return tracker.poses(GROUPS, seconds, reducedMotion);
};

const first = (poses: Map<string, IndividualPose[]>, id: string): IndividualPose => {
  const pose = poses.get(id)?.[0];
  if (!pose) throw new Error(`no pose for ${id}`);
  return pose;
};

describe('createCrowdTracker', () => {
  it('a new slot starts off-stage and reaches its spot after ENTER_SECONDS', () => {
    const start = first(posesAt({ fox: 1 }, 0), 'fox');
    expect(start.x + FLOOR.size / 2 <= 0 || start.x - FLOOR.size / 2 >= STAGE.width).toBe(true);
    expect(start.moving).toBe(true);

    const travelling = first(posesAt({ fox: 1 }, ENTER_SECONDS * HALF), 'fox');
    expect(travelling.moving).toBe(true);
    expect(travelling.facing).toBe(start.x < 0 ? 1 : -1);

    const arrived = first(posesAt({ fox: 1 }, ENTER_SECONDS), 'fox');
    expect(arrived).toMatchObject({ moving: false, alpha: 1, y: expect.any(Number) });
    expect(Math.abs(arrived.x - FLOOR.centreX)).toBeLessThanOrEqual(FLOOR.spread);
  });

  it('enters with easing, slow at the start and the end', () => {
    const xAt = (fraction: number) => first(posesAt({ fox: 1 }, ENTER_SECONDS * fraction), 'fox').x;
    const total = Math.abs(xAt(1) - xAt(0));
    const early = Math.abs(xAt(0.1) - xAt(0));
    const middle = Math.abs(xAt(0.55) - xAt(0.45));
    expect(early).toBeLessThan(total * 0.1);
    expect(middle).toBeGreaterThan(total * 0.1);
  });

  it('a surface slot drops in from above the stage', () => {
    const start = first(posesAt({ otter: 1 }, 0), 'otter');
    expect(start.y).toBeLessThan(0);
    expect(first(posesAt({ otter: 1 }, ENTER_SECONDS), 'otter').y).toBeGreaterThan(0);
  });

  it('a leaving animal walks off toward the nearer edge, then is gone', () => {
    const tracker = createCrowdTracker();
    tracker.update({ fox: 1 }, 0);
    const home = first(tracker.poses(GROUPS, SETTLED_IN, false), 'fox');
    tracker.update({ fox: 0 }, SETTLED_IN);
    const leaving = first(tracker.poses(GROUPS, SETTLED_IN + LEAVE_SECONDS * HALF, false), 'fox');
    expect(leaving.moving).toBe(true);
    expect(leaving.alpha).toBe(1);
    expect(leaving.x).toBeLessThan(home.x);
    expect(leaving.facing).toBe(-1);
    expect(tracker.poses(GROUPS, SETTLED_IN + LEAVE_SECONDS, false).get('fox')).toEqual([]);
  });

  it('a leaving producer shrinks and fades', () => {
    const tracker = createCrowdTracker();
    tracker.update({ grass: 1 }, 0);
    const full = first(tracker.poses(GROUPS, SETTLED_IN, false), 'grass');
    tracker.update({ grass: 0 }, SETTLED_IN);
    const fading = first(tracker.poses(GROUPS, SETTLED_IN + LEAVE_SECONDS * HALF, false), 'grass');
    expect(fading.x).toBe(full.x);
    expect(fading.scale).toBeLessThan(full.scale);
    expect(fading.alpha).toBeGreaterThan(0);
    expect(fading.alpha).toBeLessThan(1);
    const nearlyGone = first(tracker.poses(GROUPS, SETTLED_IN + LEAVE_SECONDS * 0.999, false), 'grass');
    expect(nearlyGone.scale / full.scale).toBeCloseTo(0.15, 2);
    expect(tracker.poses(GROUPS, SETTLED_IN + LEAVE_SECONDS, false).get('grass')).toEqual([]);
  });

  it('a slot that turns back mid-journey carries on from where it is', () => {
    const tracker = createCrowdTracker();
    tracker.update({ fox: 1 }, 0);
    const turnAt = ENTER_SECONDS * HALF;
    const before = first(tracker.poses(GROUPS, turnAt, false), 'fox');
    tracker.update({ fox: 0 }, turnAt);
    const after = first(tracker.poses(GROUPS, turnAt, false), 'fox');
    expect(after.x).toBeCloseTo(before.x, 6);
  });

  it('keeps one pose per showing slot, in slot order', () => {
    const tracker = createCrowdTracker();
    tracker.update({ fox: 3, grass: 2 }, 0);
    const poses = tracker.poses(GROUPS, SETTLED_IN, false);
    expect(poses.get('fox')).toHaveLength(3);
    expect(poses.get('grass')).toHaveLength(2);
    expect(poses.get('otter')).toEqual([]);
  });

  it.each([[FLOOR], [SURFACE], [WATER], [PRODUCER]])('reducedMotion gives zero idle offset ($zone $role)', (group) => {
    const poses = IDLE_TIMES.map((seconds) => first(posesAt({ [group.speciesId]: 1 }, seconds, true), group.speciesId));
    for (const pose of poses) expect(pose).toEqual({ ...(poses[0] as IndividualPose) });
    expect(poses[0]?.rotation).toBe(0);
  });

  it('reducedMotion enters and leaves as a fade in place', () => {
    const half = first(posesAt({ fox: 1 }, ENTER_SECONDS * HALF, true), 'fox');
    const arrived = first(posesAt({ fox: 1 }, ENTER_SECONDS, true), 'fox');
    expect(half).toEqual({ ...arrived, alpha: HALF });
  });

  it.each<[Group, keyof IndividualPose, number]>([
    [SURFACE, 'y', 6],
    [WATER, 'x', 20],
    [FLOOR, 'x', 30],
    [PRODUCER, 'rotation', (3 * Math.PI) / 180],
  ])('idles within its range ($zone, $role: %s within %f)', (group, key, range) => {
    const times = Array.from({ length: 200 }, (_, index) => SETTLED_IN + index * 0.13);
    const values = times.map((seconds) => first(posesAt({ [group.speciesId]: 1 }, seconds), group.speciesId)[key] as number);
    const still = first(posesAt({ [group.speciesId]: 1 }, SETTLED_IN, true), group.speciesId)[key] as number;
    const offsets = values.map((value) => value - still);
    expect(Math.max(...offsets.map(Math.abs))).toBeLessThanOrEqual(range + 1e-9);
    expect(Math.max(...offsets) - Math.min(...offsets)).toBeGreaterThan(range);
  });

  it('a wandering floor animal faces the way it is going', () => {
    const tracker = createCrowdTracker();
    tracker.update({ fox: 1 }, 0);
    const step = 0.05;
    for (let seconds = SETTLED_IN; seconds < SETTLED_IN + 10; seconds += 1) {
      const now = first(tracker.poses(GROUPS, seconds, false), 'fox');
      const next = first(tracker.poses(GROUPS, seconds + step, false), 'fox');
      if (Math.abs(next.x - now.x) > 0.1) expect(now.facing).toBe(Math.sign(next.x - now.x));
    }
  });

  it('two slots of one group are not in phase', () => {
    for (const seconds of IDLE_TIMES) {
      const [one, two] = posesAt({ otter: 2 }, seconds).get('otter') ?? [];
      expect(one?.y).not.toBeCloseTo(two?.y ?? 0, 3);
    }
  });

  it('poses are deterministic for the same seeds and time', () => {
    const targets = { fox: 5, otter: 3, fish: 4, grass: 6 };
    for (const seconds of [0, ENTER_SECONDS * HALF, ...IDLE_TIMES]) {
      expect(posesAt(targets, seconds)).toEqual(posesAt(targets, seconds));
    }
  });

  it('pond swimmers stay below the waterline across many seeds and times', () => {
    const library = parseLibrary(JSON.parse(readFileSync('public/library/manifest.json', 'utf8')));
    const pond = WEB_SAMPLES.find((sample) => sample.id === 'pond')?.web;
    if (!pond) throw new Error('no pond sample');
    const layout = layoutPlace(pond, library);
    const swimmers = layout.groups.filter((group) => group.zone === 'water');
    const waterline = SURFACE_Y_BY_HABITAT.pond * STAGE.height;
    const tracker = createCrowdTracker();
    tracker.update(Object.fromEntries(swimmers.map((group) => [group.speciesId, MAX_PER_GROUP])), 0);
    expect(swimmers.length).toBeGreaterThan(0);
    for (let seconds = SETTLED_IN; seconds < SETTLED_IN + 30; seconds += 0.37) {
      const poses = tracker.poses(swimmers, seconds, false);
      for (const group of swimmers) {
        const members = poses.get(group.speciesId) ?? [];
        expect(members).toHaveLength(MAX_PER_GROUP);
        for (const pose of members) expect(pose.y - group.size / 2).toBeGreaterThan(waterline);
      }
    }
  });
});
