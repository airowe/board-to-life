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
  HOME_JITTER,
  LEAVE_SECONDS,
  MAX_PER_GROUP,
  STAGGER_FRACTION,
  VIGOUR_MAX,
  VIGOUR_MIN,
  createCrowdTracker,
  crowdTargets,
  type CrowdTracker,
  type IndividualPose,
} from './crowd';
import { parseLibrary } from '../library/manifest';
import type { Zone } from '../library/manifest';
import { STAGE, SURFACE_Y_BY_HABITAT, isRooted, layoutPlace, type Group } from './layout';

const SETTLED = { fox: 100, grass: 1000 };
// Long enough into an idle drift cycle (5-8 s) for a drifter to have moved well away from where it started.
const DRIFT_SAMPLE_SECONDS = 1.5;
const ROLES: Record<string, Role> = { fox: 'consumer', grass: 'producer' };

const seriesOf = (fox: number, grass: number): Series => ({ ids: ['fox', 'grass'], values: { fox: [fox], grass: [grass] } });

const removing = (id: string): WebEdits => ({ ...emptyEdits(), removed: new Set([id]) });

describe('crowdTargets', () => {
  it.each<[string, number, number, number, number]>([
    ['settled value gives the base count', 100, 1000, BASE_ANIMALS, BASE_PRODUCERS],
    ['double gives double, capped at 12', 200, 2000, 2 * BASE_ANIMALS, MAX_PER_GROUP],
    ['triple an animal is capped at 12', 300, 1000, MAX_PER_GROUP, BASE_PRODUCERS],
    ['a value below 1% of settled gives 0', 0.99, 9.9, 0, 0],
    ['a value at exactly 1% of settled still shows one, as outcomes.ts counts it', 1, 10, 1, 1],
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

const FLOOR: Group = { speciesId: 'fox', role: 'consumer', zone: 'floor', centreX: 400, spread: 120, baseY: 880, depth: 12, size: 150, spacing: 50 };
const SURFACE: Group = { speciesId: 'otter', role: 'consumer', zone: 'surface', centreX: 1000, spread: 100, baseY: 123, depth: 0, size: 130, spacing: 50 };
const WATER: Group = { speciesId: 'fish', role: 'consumer', zone: 'water', centreX: 1300, spread: 100, baseY: 560, depth: 60, size: 110, spacing: 40 };
const PRODUCER: Group = { speciesId: 'grass', role: 'producer', zone: 'floor', centreX: 800, spread: 150, baseY: 880, depth: 12, size: 300, spacing: 90 };
const DECOMPOSER: Group = { speciesId: 'fungi', role: 'decomposer', zone: 'floor', centreX: 1150, spread: 60, baseY: 880, depth: 12, size: 150, spacing: 40 };
const GROUPS = [FLOOR, SURFACE, WATER, PRODUCER, DECOMPOSER];
// Latest a staggered newcomer can still be travelling, and latest a staggered leaver can still be showing.
const ENTERED_BY = ENTER_SECONDS * (1 + STAGGER_FRACTION);
const LEFT_BY = LEAVE_SECONDS * (1 + STAGGER_FRACTION);
// Every slot has left its delay and is past half way.
const MID_ENTRY = ENTER_SECONDS * (STAGGER_FRACTION + 0.5);
const MID_LEAVE = LEAVE_SECONDS * (STAGGER_FRACTION + 0.5);
const SETTLED_IN = ENTERED_BY + 0.5;
const IDLE_TIMES = [SETTLED_IN, SETTLED_IN + 0.7, SETTLED_IN + 2.3, SETTLED_IN + 5.1];
const FRAME = 1 / 60;

const trackerWith = (targets: Record<string, number>, settle = false): CrowdTracker => {
  const tracker = createCrowdTracker();
  tracker.update(targets, 0, { settle });
  return tracker;
};

const posesAt = (targets: Record<string, number>, seconds: number, reducedMotion = false): Map<string, IndividualPose[]> =>
  trackerWith(targets).poses(GROUPS, seconds, reducedMotion);

const first = (poses: Map<string, IndividualPose[]>, id: string): IndividualPose => {
  const pose = poses.get(id)?.[0];
  if (!pose) throw new Error(`no pose for ${id}`);
  return pose;
};

const frames = (from: number, to: number): number[] => Array.from({ length: Math.ceil((to - from) / FRAME) }, (_, index) => from + index * FRAME);

const isOffStage = (pose: IndividualPose, group: Group): boolean => pose.x + group.size / 2 <= 0 || pose.x - group.size / 2 >= STAGE.width || pose.y + group.size / 2 <= 0;

describe('isRooted', () => {
  it.each<[Role, Zone, boolean]>([
    ['producer', 'floor', true],
    ['decomposer', 'floor', true],
    ['consumer', 'floor', false],
    ['producer', 'water', false],
    ['producer', 'surface', false],
    ['consumer', 'water', false],
  ])('a %s in the %s zone is rooted: %s', (role, zone, rooted) => {
    expect(isRooted(role, zone)).toBe(rooted);
  });
});

describe('createCrowdTracker: drifting plants', () => {
  // Plankton: a producer that lives in open water.
  const DRIFTING: Group = { ...WATER, speciesId: 'plankton', role: 'producer', spread: 400, spacing: 84 };
  const posesOf = (seconds: number, reducedMotion: boolean): IndividualPose[] => {
    const tracker = createCrowdTracker();
    tracker.update({ plankton: BASE_PRODUCERS }, 0, { settle: true });
    return tracker.poses([DRIFTING], seconds, reducedMotion).get('plankton') ?? [];
  };

  it('spread like a row of swimmers, a spacing apart, rather than clumped', () => {
    const xs = posesOf(0, true).map((pose) => pose.x).sort((a, b) => a - b);
    expect(xs).toHaveLength(BASE_PRODUCERS);
    xs.slice(1).forEach((x, index) => expect(x - (xs[index] as number)).toBeGreaterThanOrEqual(DRIFTING.spacing * (1 - 2 * HOME_JITTER)));
  });

  it('drift through the water instead of swaying on a stem', () => {
    const [before] = posesOf(0, false);
    const [after] = posesOf(DRIFT_SAMPLE_SECONDS, false);
    expect(after?.x).not.toBeCloseTo(before?.x ?? 0, 0);
    expect(after?.rotation).toBe(0);
  });
});

describe('createCrowdTracker: homes', () => {
  // Room for nine members a spacing apart (four either side of the centre), after the 30 px idle wander.
  const ROOMY: Group = { ...FLOOR, speciesId: 'rabbit', spread: 400, spacing: 84 };
  const homesOf = (group: Group, count: number): number[] => {
    const tracker = createCrowdTracker();
    tracker.update({ [group.speciesId]: count }, 0, { settle: true });
    return (tracker.poses([group], 0, true).get(group.speciesId) ?? []).map((pose) => pose.x).sort((a, b) => a - b);
  };
  const gapsOf = (xs: number[]): number[] => xs.slice(1).map((x, index) => x - (xs[index] as number));

  it.each([BASE_ANIMALS, 9])('a settled crowd of %i stands at least a spacing apart while it has room', (count) => {
    const homes = homesOf(ROOMY, count);
    expect(homes).toHaveLength(count);
    for (const gap of gapsOf(homes)) expect(gap).toBeGreaterThanOrEqual(ROOMY.spacing * (1 - 2 * HOME_JITTER));
  });

  it('keeps every home inside the spread once the crowd runs out of room', () => {
    const homes = homesOf(ROOMY, MAX_PER_GROUP);
    expect(homes).toHaveLength(MAX_PER_GROUP);
    for (const x of homes) expect(Math.abs(x - ROOMY.centreX)).toBeLessThanOrEqual(ROOMY.spread);
    for (const gap of gapsOf(homes)) expect(gap).toBeGreaterThan(0);
  });

  // Plants have no idle wander, so their reach is their whole spread.
  const NARROW: Group = { ...PRODUCER, spread: 40, spacing: 90 };
  const BUSY: Group = { ...PRODUCER, spread: 135, spacing: 90 };

  it('spreads a crowd evenly across a reach narrower than one spacing instead of stacking it', () => {
    const count = 6;
    const homes = homesOf(NARROW, count);
    expect(homes).toHaveLength(count);
    expect(Math.min(...gapsOf(homes))).toBeGreaterThanOrEqual(NARROW.spread / 10);
    expect((homes.at(-1) as number) - (homes[0] as number)).toBeGreaterThanOrEqual(1.5 * NARROW.spread);
    for (const x of homes) expect(Math.abs(x - NARROW.centreX)).toBeLessThanOrEqual(NARROW.spread);
  });

  it('keeps a full crowd distinct once the lattice and its gaps are used up', () => {
    const homes = homesOf(BUSY, MAX_PER_GROUP);
    expect(Math.min(...gapsOf(homes))).toBeGreaterThanOrEqual(BUSY.spacing / 20);
    for (const x of homes) expect(Math.abs(x - BUSY.centreX)).toBeLessThanOrEqual(BUSY.spread);
  });

  it('a small crowd gathers about the centre rather than at the edges', () => {
    const homes = homesOf(ROOMY, 3);
    for (const x of homes) expect(Math.abs(x - ROOMY.centreX)).toBeLessThanOrEqual(ROOMY.spacing * (1 + HOME_JITTER));
  });
});

describe('createCrowdTracker: entering and leaving', () => {
  it('a new slot starts off-stage and reaches its spot after ENTER_SECONDS', () => {
    const start = first(posesAt({ fox: 1 }, 0), 'fox');
    expect(isOffStage(start, FLOOR)).toBe(true);
    expect(start.moving).toBe(true);

    const travelling = first(posesAt({ fox: 1 }, MID_ENTRY), 'fox');
    expect(travelling.moving).toBe(true);
    expect(travelling.facing).toBe(start.x < 0 ? 1 : -1);

    const arrived = first(posesAt({ fox: 1 }, ENTERED_BY), 'fox');
    expect(arrived).toMatchObject({ moving: false, alpha: 1 });
    expect(Math.abs(arrived.x - FLOOR.centreX)).toBeLessThanOrEqual(FLOOR.spread);
  });

  it('enters over ENTER_SECONDS with easing, slow at the start and the end', () => {
    const times = frames(0, ENTERED_BY + FRAME);
    const alphas = times.map((seconds) => first(posesAt({ fox: 1 }, seconds, true), 'fox').alpha);
    const starts = times[alphas.lastIndexOf(0)] as number;
    const ends = times[alphas.indexOf(1)] as number;
    expect(ends - starts).toBeCloseTo(ENTER_SECONDS, 1);
    const alphaAt = (fraction: number) => first(posesAt({ fox: 1 }, starts + ENTER_SECONDS * fraction, true), 'fox').alpha;
    expect(alphaAt(0.1)).toBeLessThan(0.1);
    expect(alphaAt(0.5)).toBeCloseTo(0.5, 1);
    expect(alphaAt(0.9)).toBeGreaterThan(0.9);
  });

  it('two newcomers of one group are not at the same place early in an entry', () => {
    for (const seconds of [0, ENTER_SECONDS * 0.25, ENTER_SECONDS * 0.5]) {
      const [one, two, three] = posesAt({ fox: 3 }, seconds).get('fox') ?? [];
      const xs = [one?.x, two?.x, three?.x] as number[];
      expect(new Set(xs.map((x) => Math.round(x))).size).toBe(3);
    }
  });

  it('newcomers set off at different moments', () => {
    const departures = [0, 1, 2, 3].map((slot) => {
      const times = frames(0, ENTERED_BY);
      const startX = (posesAt({ fox: 4 }, 0).get('fox') ?? [])[slot]?.x;
      return times.find((seconds) => (posesAt({ fox: 4 }, seconds).get('fox') ?? [])[slot]?.x !== startX);
    });
    expect(new Set(departures).size).toBeGreaterThan(1);
  });

  it('a surface slot drops in from above the stage', () => {
    const start = first(posesAt({ otter: 1 }, 0), 'otter');
    expect(start.y).toBeLessThan(0);
    expect(first(posesAt({ otter: 1 }, ENTERED_BY), 'otter').y).toBeGreaterThan(0);
  });

  it('a settled start gives home poses at t=0', () => {
    const tracker = trackerWith({ fox: 3, grass: 2 }, true);
    const poses = tracker.poses(GROUPS, 0, false);
    expect(poses.get('fox')).toHaveLength(3);
    for (const pose of [...(poses.get('fox') ?? []), ...(poses.get('grass') ?? [])]) {
      expect(pose).toMatchObject({ moving: false, alpha: 1 });
    }
    for (const pose of poses.get('fox') ?? []) expect(Math.abs(pose.x - FLOOR.centreX)).toBeLessThanOrEqual(FLOOR.spread);
  });

  it('after a settled start, later increases still enter', () => {
    const tracker = trackerWith({ fox: 3 }, true);
    tracker.update({ fox: 5 }, 1);
    const [, , , fourth, fifth] = tracker.poses(GROUPS, 1, false).get('fox') ?? [];
    for (const pose of [fourth, fifth]) expect(pose && isOffStage(pose, FLOOR) && pose.moving).toBe(true);
  });

  it('a leaving animal walks off toward the nearer edge, then is gone', () => {
    const tracker = trackerWith({ fox: 1 }, true);
    const home = first(tracker.poses(GROUPS, 0, false), 'fox');
    tracker.update({ fox: 0 }, 0);
    const leaving = first(tracker.poses(GROUPS, MID_LEAVE, false), 'fox');
    expect(leaving).toMatchObject({ moving: true, alpha: 1, facing: -1 });
    expect(leaving.x).toBeLessThan(home.x);
    expect(tracker.poses(GROUPS, LEFT_BY, false).get('fox')).toEqual([]);
  });

  it.each([[PRODUCER], [DECOMPOSER]])('a leaving $role shrinks to 15% and fades in place', (group) => {
    const tracker = trackerWith({ [group.speciesId]: 1 }, true);
    const full = first(tracker.poses(GROUPS, 0, false), group.speciesId);
    tracker.update({ [group.speciesId]: 0 }, 0);
    const fading = first(tracker.poses(GROUPS, MID_LEAVE, false), group.speciesId);
    expect(fading).toMatchObject({ x: full.x, moving: false });
    expect(fading.scale).toBeLessThan(full.scale);
    expect(fading.alpha).toBeGreaterThan(0);
    expect(fading.alpha).toBeLessThan(1);
    const showing = frames(0, LEFT_BY + FRAME)
      .map((seconds) => tracker.poses(GROUPS, seconds, false).get(group.speciesId)?.[0])
      .filter((pose): pose is IndividualPose => pose !== undefined);
    expect((showing.at(-1) as IndividualPose).scale / full.scale).toBeCloseTo(0.15, 1);
    expect(tracker.poses(GROUPS, LEFT_BY, false).get(group.speciesId)).toEqual([]);
  });

  it('a slot that turns back mid-journey carries on from where it is', () => {
    const tracker = trackerWith({ fox: 1 });
    const before = first(tracker.poses(GROUPS, MID_ENTRY, false), 'fox');
    tracker.update({ fox: 0 }, MID_ENTRY);
    const after = first(tracker.poses(GROUPS, MID_ENTRY, false), 'fox');
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.facing).toBe(-before.facing);
  });

  it('keeps one pose per showing slot, in slot order', () => {
    const poses = posesAt({ fox: 3, grass: 2 }, SETTLED_IN);
    expect(poses.get('fox')).toHaveLength(3);
    expect(poses.get('grass')).toHaveLength(2);
    expect(poses.get('otter')).toEqual([]);
  });

  it('facing does not change in the frame after arrival', () => {
    const groups = [FLOOR, WATER];
    const tracker = trackerWith({ fox: MAX_PER_GROUP, fish: MAX_PER_GROUP });
    let arrivals = 0;
    let previous = tracker.poses(groups, 0, false);
    for (const seconds of frames(FRAME, ENTERED_BY + FRAME)) {
      const now = tracker.poses(groups, seconds, false);
      for (const group of groups) {
        (now.get(group.speciesId) ?? []).forEach((pose, slot) => {
          const before = previous.get(group.speciesId)?.[slot] as IndividualPose;
          if (before.moving && !pose.moving) {
            arrivals += 1;
            expect(pose.facing).toBe(before.facing);
          }
        });
      }
      previous = now;
    }
    expect(arrivals).toBe(2 * MAX_PER_GROUP);
  });
});

describe('createCrowdTracker: reduced motion', () => {
  it.each([[FLOOR], [SURFACE], [WATER], [PRODUCER]])('gives zero idle offset ($zone $role)', (group) => {
    const poses = IDLE_TIMES.map((seconds) => first(posesAt({ [group.speciesId]: 1 }, seconds, true), group.speciesId));
    for (const pose of poses) expect(pose).toEqual({ ...(poses[0] as IndividualPose) });
    expect(poses[0]?.rotation).toBe(0);
  });

  it('enters as a fade in place', () => {
    const half = first(posesAt({ fox: 1 }, MID_ENTRY, true), 'fox');
    const arrived = first(posesAt({ fox: 1 }, ENTERED_BY, true), 'fox');
    expect(half.alpha).toBeGreaterThan(0);
    expect(half.alpha).toBeLessThan(1);
    expect(half).toEqual({ ...arrived, alpha: half.alpha });
  });

  it('leaves as a fade in place', () => {
    const tracker = trackerWith({ fox: 1 }, true);
    const home = first(tracker.poses(GROUPS, 0, true), 'fox');
    tracker.update({ fox: 0 }, 0);
    const fading = first(tracker.poses(GROUPS, MID_LEAVE, true), 'fox');
    expect(fading.alpha).toBeGreaterThan(0);
    expect(fading.alpha).toBeLessThan(1);
    expect(fading).toEqual({ ...home, alpha: fading.alpha });
    expect(tracker.poses(GROUPS, LEFT_BY, true).get('fox')).toEqual([]);
  });
});

describe('createCrowdTracker: idling', () => {
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
    const tracker = trackerWith({ fox: 1 });
    for (let seconds = SETTLED_IN; seconds < SETTLED_IN + 10; seconds += 1) {
      const now = first(tracker.poses(GROUPS, seconds, false), 'fox');
      const next = first(tracker.poses(GROUPS, seconds + 0.05, false), 'fox');
      if (Math.abs(next.x - now.x) > 0.1) expect(now.facing).toBe(Math.sign(next.x - now.x));
    }
  });

  it('two slots of one group are not in phase', () => {
    for (const seconds of IDLE_TIMES) {
      const [one, two] = posesAt({ otter: 2 }, seconds).get('otter') ?? [];
      expect(one?.y).not.toBeCloseTo(two?.y ?? 0, 3);
    }
  });

  it('another group keeps idling when one species goes to 0', () => {
    const tracker = trackerWith({ fox: 2, otter: 2 }, true);
    tracker.update({ fox: 0, otter: 2 }, 1);
    const ys = IDLE_TIMES.map((seconds) => first(tracker.poses(GROUPS, seconds, false), 'otter').y);
    expect(new Set(ys).size).toBe(IDLE_TIMES.length);
    expect(tracker.poses(GROUPS, SETTLED_IN, false).get('otter')).toHaveLength(2);
    expect(tracker.poses(GROUPS, SETTLED_IN, false).get('fox')).toEqual([]);
  });

  it('poses are deterministic for the same seeds and time', () => {
    const targets = { fox: 5, otter: 3, fish: 4, grass: 6 };
    for (const seconds of [0, MID_ENTRY, ...IDLE_TIMES]) {
      expect(posesAt(targets, seconds)).toEqual(posesAt(targets, seconds));
    }
  });
});

describe('createCrowdTracker: clock going backwards', () => {
  it('treats it as a reset: slots carry on from where they were and still arrive', () => {
    const tracker = createCrowdTracker();
    tracker.update({ fox: 1 }, 100);
    const before = first(tracker.poses(GROUPS, 100 + MID_ENTRY, false), 'fox');
    const rewound = first(tracker.poses(GROUPS, 0, false), 'fox');
    expect(Math.abs(rewound.x - before.x)).toBeLessThan(FLOOR.size);
    expect(rewound.moving).toBe(true);
    const later = first(tracker.poses(GROUPS, ENTER_SECONDS, false), 'fox');
    expect(later.moving).toBe(false);
  });

  it('updates after a rewind take effect from the new clock', () => {
    const tracker = trackerWith({ fox: 1 }, true);
    tracker.poses(GROUPS, 50, false);
    tracker.update({ fox: 0 }, 1);
    expect(tracker.poses(GROUPS, 1 + LEFT_BY, false).get('fox')).toEqual([]);
  });
});

describe('createCrowdTracker: producer vigour', () => {
  const grassAt = (vigour: number): IndividualPose => {
    const tracker = createCrowdTracker();
    tracker.update({ grass: 1 }, 0, { settle: true, vigour: { grass: vigour } });
    return first(tracker.poses(GROUPS, 0, false), 'grass');
  };

  it('a producer at half vigour is drawn smaller and a little fainter than at full', () => {
    const full = grassAt(1);
    const half = grassAt(0.5);
    expect(half.scale / full.scale).toBeCloseTo(0.5, 6);
    expect(half.alpha).toBeLessThan(full.alpha);
    expect(half.alpha).toBeGreaterThan(0.5);
  });

  it.each<[number, number]>([
    [0.01, VIGOUR_MIN],
    [3, VIGOUR_MAX],
  ])('clamps vigour %f to %f', (vigour, clamped) => {
    expect(grassAt(vigour).scale / grassAt(1).scale).toBeCloseTo(clamped, 6);
  });

  it('a change of vigour eases rather than snapping', () => {
    const tracker = createCrowdTracker();
    tracker.update({ grass: 1 }, 0, { settle: true, vigour: { grass: 1 } });
    const before = first(tracker.poses(GROUPS, 5, false), 'grass').scale;
    tracker.update({ grass: 1 }, 5, { vigour: { grass: 0.5 } });
    const scales = frames(5, 15).map((seconds) => first(tracker.poses(GROUPS, seconds, false), 'grass').scale);
    expect(scales[0]).toBeCloseTo(before, 6);
    expect(Math.abs((scales[1] as number) - before)).toBeLessThan(before * 0.01);
    expect(scales.at(-1)).toBeCloseTo(before * 0.5, 6);
    scales.slice(1).forEach((scale, index) => expect(scale).toBeLessThanOrEqual(scales[index] as number));
    const steps = scales.slice(1).map((scale, index) => (scales[index] as number) - scale);
    expect(Math.max(...steps)).toBeLessThan(before * 0.02);
  });

  it('does not change animals', () => {
    const tracker = createCrowdTracker();
    tracker.update({ fox: 1 }, 0, { settle: true, vigour: { fox: 0.5 } });
    expect(first(tracker.poses(GROUPS, 0, false), 'fox')).toEqual(first(trackerWith({ fox: 1 }, true).poses(GROUPS, 0, false), 'fox'));
  });
});

describe('createCrowdTracker: in the pond', () => {
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
