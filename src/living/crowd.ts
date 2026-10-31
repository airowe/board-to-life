import type { WebEdits } from '../ecosystem/edits';
import { EVENT_STEP, type Series } from '../ecosystem/model';
import { isGoneAt } from '../ecosystem/outcomes';
import type { Role } from '../ecosystem/schema';
import { STAGE, isRooted, type Group } from './layout';

export const BASE_ANIMALS = 4;
export const BASE_PRODUCERS = 6;
export const MAX_PER_GROUP = 12;
export const ENTER_SECONDS = 2.4;
export const LEAVE_SECONDS = 2.4;

// Each slot waits up to this share of the enter or leave time before it sets off, so a crowd never moves as one.
export const STAGGER_FRACTION = 0.4;
// A producer's height follows its vigour (value / settled), clamped to this range.
export const VIGOUR_MIN = 0.35;
export const VIGOUR_MAX = 1.15;
const VIGOUR_SECONDS = 1.5;
const VIGOUR_MIN_ALPHA = 0.75;
const LEAVE_SCALE = 0.15;
// Newcomers start between one and two of their sizes beyond the edge, and up to this far off their line.
const OFFSTAGE_SCATTER = 1;
const ENTRY_DEPTH_PX = 24;
const SURFACE_SCATTER_PX = 60;
const BOB_PX = 6;
const DRIFT_PX = 20;
const DRIFT_Y_PX = 6;
const WANDER_PX = 30;
const SWAY_RADIANS = (3 * Math.PI) / 180;
// Seconds per idle cycle, as [shortest, longest]; each slot picks its own so no two move in step.
const BOB_PERIOD = [2.6, 4] as const;
const DRIFT_PERIOD = [5, 8] as const;
const WANDER_PERIOD = [6, 10] as const;
const SWAY_PERIOD = [3, 5] as const;
const SCALE_VARIETY = 0.1;
// Each home is nudged up to this share of its gap to the next spot either way, so a crowd is not a drill line.
export const HOME_JITTER = 0.12;
const TAU = 2 * Math.PI;

export const crowdTargets = (
  series: Series,
  step: number,
  settled: Record<string, number>,
  roles: Record<string, Role>,
  edits: WebEdits,
): Record<string, number> =>
  Object.fromEntries(
    series.ids.map((id) => {
      const values = series.values[id] ?? [];
      const value = values[Math.min(step, values.length - 1)] ?? 0;
      const steady = settled[id] ?? 0;
      const base = roles[id] === 'producer' ? BASE_PRODUCERS : BASE_ANIMALS;
      if (edits.removed.has(id) || isGoneAt(value, values, step, steady, EVENT_STEP)) return [id, 0];
      const count = steady > 0 ? Math.round((base * value) / steady) : base;
      return [id, Math.min(Math.max(count, 1), MAX_PER_GROUP)];
    }),
  );

export type Individual = { speciesId: string; slot: number; seed: number };
// `facing` 1 heads toward +x; `rotation` is in radians. A species' poses are listed by slot.
export type IndividualPose = { x: number; y: number; scale: number; alpha: number; facing: 1 | -1; moving: boolean; rotation: number };
// `settle` puts every slot straight into its final state (use it for the first update of a scene);
// `vigour` is each producer's value / settled, which its height eases toward.
export type UpdateOptions = { settle?: boolean; vigour?: Record<string, number> };
// `seconds` is wall-clock time. If it goes backwards the tracker treats it as a reset: everything carries on from where it was.
export type CrowdTracker = {
  update: (targets: Record<string, number>, seconds: number, options?: UpdateOptions) => void;
  poses: (groups: Group[], seconds: number, reducedMotion: boolean) => Map<string, IndividualPose[]>;
};

// Progress runs from 0 (away) to 1 (in its spot), moving toward `showing` at a steady rate from `from`,
// starting `delay` seconds after `since`. `turned` shifts the idle cycle half a turn, chosen on arrival
// so a walker keeps facing the way it came in; null until first worked out.
type Slot = { showing: boolean; from: number; since: number; delay: number; turned: boolean | null };
type Vigour = { from: number; to: number; since: number };

const hashString = (text: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193);
  return hash >>> 0;
};

const individualOf = (speciesId: string, slot: number): Individual => ({ speciesId, slot, seed: hashString(`${speciesId}#${slot}`) });

// A repeatable number in [0, 1) for each (seed, channel) pair.
const seeded = (seed: number, channel: number): number => {
  let hash = (seed ^ Math.imul(channel + 1, 0x9e3779b9)) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return ((hash ^ (hash >>> 16)) >>> 0) / 2 ** 32;
};

const CHANNEL = { phase: 0, period: 1, depth: 2, scale: 3, facing: 4, phaseY: 5, delay: 6, edge: 7, entryDepth: 8, jitter: 9 } as const;

const clamp01 = (value: number): number => Math.min(Math.max(value, 0), 1);
const smoothstep = (value: number): number => value * value * (3 - 2 * value);
const lerp = (from: number, to: number, amount: number): number => from + (to - from) * amount;
const signOf = (value: number): 1 | -1 => (value < 0 ? -1 : 1);
const between = (seed: number, channel: number): number => 2 * seeded(seed, channel) - 1;


const durationOf = (showing: boolean): number => (showing ? ENTER_SECONDS : LEAVE_SECONDS);

const progressOf = (slot: Slot, seconds: number): number => {
  const travelled = Math.max(0, seconds - slot.since - slot.delay) / durationOf(slot.showing);
  return clamp01(slot.showing ? slot.from + travelled : slot.from - travelled);
};

const arrivalOf = (slot: Slot): number => slot.since + slot.delay + (1 - slot.from) * ENTER_SECONDS;

const vigourAt = (vigour: Vigour | undefined, seconds: number): number => {
  if (!vigour) return 1;
  return lerp(vigour.from, vigour.to, smoothstep(clamp01((seconds - vigour.since) / VIGOUR_SECONDS)));
};

type Wave = { value: number; velocity: number };

const wave = (who: Individual, period: readonly [number, number], seconds: number, turned: boolean, channel: number = CHANNEL.phase): Wave => {
  const length = lerp(period[0], period[1], seeded(who.seed, CHANNEL.period));
  const angle = (TAU * seconds) / length + TAU * seeded(who.seed, channel) + (turned ? Math.PI : 0);
  return { value: Math.sin(angle), velocity: Math.cos(angle) };
};

const isWalker = (group: Group): boolean => !isRooted(group.role, group.zone) && group.zone !== 'surface';

const walkPeriod = (group: Group): readonly [number, number] => (group.zone === 'floor' ? WANDER_PERIOD : DRIFT_PERIOD);

const restingFacing = (who: Individual): 1 | -1 => (seeded(who.seed, CHANNEL.facing) < 0.5 ? -1 : 1);

type Idle = { dx: number; dy: number; rotation: number; facing: 1 | -1 };

const idleOf = (group: Group, who: Individual, seconds: number, turned: boolean): Idle => {
  const still: Idle = { dx: 0, dy: 0, rotation: 0, facing: restingFacing(who) };
  if (isRooted(group.role, group.zone)) return { ...still, rotation: SWAY_RADIANS * wave(who, SWAY_PERIOD, seconds, turned).value };
  if (group.zone === 'surface') return { ...still, dy: BOB_PX * wave(who, BOB_PERIOD, seconds, turned).value };
  const { value, velocity } = wave(who, walkPeriod(group), seconds, turned);
  if (group.zone === 'floor') return { ...still, dx: WANDER_PX * value, facing: signOf(velocity) };
  const bob = wave(who, DRIFT_PERIOD, seconds, turned, CHANNEL.phaseY).value;
  return { ...still, dx: DRIFT_PX * value, dy: DRIFT_Y_PX * bob, facing: signOf(velocity) };
};

const idleReach = (group: Group): number => {
  if (!isWalker(group)) return 0;
  return group.zone === 'floor' ? WANDER_PX : DRIFT_PX;
};

const sideOf = (index: number): 1 | -1 => (index % 2 === 0 ? 1 : -1);

// Slot 0 stands at the centre; later slots alternate right and left, one unit further out each pair, filling the reach.
// The unit is the group's spacing, or the whole reach when that is narrower than one spacing. Once those spots are taken,
// later slots halve the gaps between them, then quarter them, and so on, so a crowd that has run out of room overlaps
// evenly rather than stacking. Returns the offset from the centre and the gap size at that level, for the jitter.
const latticeSpot = (slot: number, spacing: number, reach: number): { offset: number; gap: number } => {
  const fits = spacing > 0 ? Math.floor(reach / spacing) : 0;
  const unit = fits > 0 ? spacing : reach;
  const steps = unit > 0 ? Math.max(fits, 1) : 0;
  if (steps === 0) return { offset: 0, gap: 0 };
  if (slot < 2 * steps + 1) return { offset: slot === 0 ? 0 : sideOf(slot - 1) * Math.ceil(slot / 2) * unit, gap: unit };
  let index = slot - (2 * steps + 1);
  let level = 1;
  while (index >= steps * 2 ** level) {
    index -= steps * 2 ** level;
    level += 1;
  }
  const gap = unit / 2 ** level;
  return { offset: sideOf(index) * (2 * Math.floor(index / 2) + 1) * gap, gap };
};

const homeOf = (group: Group, who: Individual) => {
  const reach = Math.max(group.spread - idleReach(group), 0);
  const spot = latticeSpot(who.slot, group.spacing, reach);
  const offset = spot.offset + between(who.seed, CHANNEL.jitter) * HOME_JITTER * spot.gap;
  return {
    x: group.centreX + Math.min(Math.max(offset, -reach), reach),
    y: group.baseY + between(who.seed, CHANNEL.depth) * group.depth,
    scale: 1 + between(who.seed, CHANNEL.scale) * SCALE_VARIETY,
  };
};

const edgeOf = (group: Group, who: Individual, homeX: number): number => {
  const beyond = group.size * (1 + OFFSTAGE_SCATTER * seeded(who.seed, CHANNEL.edge));
  return homeX < STAGE.width / 2 ? -beyond : STAGE.width + beyond;
};

// Shift the idle cycle half a turn when that makes the walker arrive still facing the way it came in.
const turnedFor = (group: Group, who: Individual, slot: Slot): boolean => {
  if (!isWalker(group) || slot.from >= 1) return false;
  const homeX = homeOf(group, who).x;
  const heading = signOf(homeX - edgeOf(group, who, homeX));
  return signOf(wave(who, walkPeriod(group), arrivalOf(slot), false).velocity) !== heading;
};

const vigourLook = (group: Group, vigour: number) => {
  if (group.role !== 'producer') return { scale: 1, alpha: 1 };
  const height = Math.min(Math.max(vigour, VIGOUR_MIN), VIGOUR_MAX);
  return { scale: height, alpha: lerp(VIGOUR_MIN_ALPHA, 1, clamp01((height - VIGOUR_MIN) / (1 - VIGOUR_MIN))) };
};

const poseOf = (group: Group, who: Individual, slot: Slot, seconds: number, reducedMotion: boolean, vigour: number): IndividualPose => {
  const home = homeOf(group, who);
  const look = vigourLook(group, vigour);
  const eased = smoothstep(progressOf(slot, seconds));
  if (reducedMotion) {
    return { x: home.x, y: home.y, scale: home.scale * look.scale, alpha: eased * look.alpha, facing: restingFacing(who), moving: false, rotation: 0 };
  }
  const idle = idleOf(group, who, seconds, slot.turned === true);
  const spot = { x: home.x + idle.dx, y: home.y + idle.dy };
  const settled = { ...spot, scale: home.scale * look.scale, alpha: look.alpha, facing: idle.facing, moving: false, rotation: idle.rotation };
  if (eased >= 1) return settled;
  // Plants grow in and shrink away where they are, wherever they live; only animals travel.
  if (group.role !== 'consumer') return { ...settled, scale: settled.scale * lerp(LEAVE_SCALE, 1, eased), alpha: look.alpha * eased };
  const away = 1 - eased;
  if (group.zone === 'surface') {
    const dropX = between(who.seed, CHANNEL.edge) * SURFACE_SCATTER_PX;
    const startY = -group.size * (1 + OFFSTAGE_SCATTER * seeded(who.seed, CHANNEL.entryDepth));
    return { ...settled, x: spot.x + dropX * away, y: lerp(startY, spot.y, eased), moving: true };
  }
  const edgeX = edgeOf(group, who, home.x);
  const heading = slot.showing ? signOf(home.x - edgeX) : signOf(edgeX - home.x);
  const y = spot.y + between(who.seed, CHANNEL.entryDepth) * ENTRY_DEPTH_PX * away;
  return { ...settled, x: lerp(edgeX, spot.x, eased), y, facing: heading, moving: true };
};

const hiddenSlot = (): Slot => ({ showing: false, from: 0, since: 0, delay: 0, turned: false });

const changedSlot = (slot: Slot, showing: boolean, seconds: number, who: Individual, settle: boolean): Slot => {
  if (settle) return { showing, from: showing ? 1 : 0, since: seconds, delay: 0, turned: false };
  const from = progressOf(slot, seconds);
  const atRest = from === 0 || from === 1;
  const delay = atRest ? seeded(who.seed, CHANNEL.delay) * STAGGER_FRACTION * durationOf(showing) : 0;
  return { showing, from, since: seconds, delay, turned: showing && from === 0 ? null : slot.turned };
};

export const createCrowdTracker = (): CrowdTracker => {
  const slotsBySpecies = new Map<string, Slot[]>();
  const vigourBySpecies = new Map<string, Vigour>();
  let latest = -Infinity;

  const rewindIfNeeded = (seconds: number): void => {
    if (seconds < latest) {
      for (const [id, slots] of slotsBySpecies) {
        slotsBySpecies.set(id, slots.map((slot) => ({ ...slot, from: progressOf(slot, latest), since: seconds, delay: 0 })));
      }
      for (const [id, vigour] of vigourBySpecies) vigourBySpecies.set(id, { ...vigour, from: vigourAt(vigour, latest), since: seconds });
      latest = seconds;
    }
    latest = Math.max(latest, seconds);
  };

  const update = (targets: Record<string, number>, seconds: number, options: UpdateOptions = {}): void => {
    rewindIfNeeded(seconds);
    const settle = options.settle === true;
    for (const id of new Set([...Object.keys(targets), ...slotsBySpecies.keys()])) {
      const slots = slotsBySpecies.get(id) ?? Array.from({ length: MAX_PER_GROUP }, hiddenSlot);
      const count = Math.min(Math.max(targets[id] ?? 0, 0), MAX_PER_GROUP);
      slotsBySpecies.set(
        id,
        slots.map((slot, index) => {
          const showing = index < count;
          return showing === slot.showing && !settle ? slot : changedSlot(slot, showing, seconds, individualOf(id, index), settle);
        }),
      );
    }
    for (const [id, value] of Object.entries(options.vigour ?? {})) {
      const now = settle ? value : vigourAt(vigourBySpecies.get(id), seconds);
      vigourBySpecies.set(id, { from: now, to: value, since: seconds });
    }
  };

  const poses = (groups: Group[], seconds: number, reducedMotion: boolean): Map<string, IndividualPose[]> => {
    rewindIfNeeded(seconds);
    return new Map(
      groups.map((group) => {
        const slots = slotsBySpecies.get(group.speciesId) ?? [];
        const vigour = vigourAt(vigourBySpecies.get(group.speciesId), seconds);
        const shown = slots.flatMap((slot, index) => {
          if (!slot.showing && progressOf(slot, seconds) <= 0) return [];
          const who = individualOf(group.speciesId, index);
          if (slot.turned === null) slot.turned = turnedFor(group, who, slot);
          return [poseOf(group, who, slot, seconds, reducedMotion, vigour)];
        });
        return [group.speciesId, shown];
      }),
    );
  };

  return { update, poses };
};
