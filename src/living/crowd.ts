import type { WebEdits } from '../ecosystem/edits';
import type { Series } from '../ecosystem/model';
import { EXTINCT_FRACTION } from '../ecosystem/outcomes';
import type { Role } from '../ecosystem/schema';
import { STAGE, type Group } from './layout';

export const BASE_ANIMALS = 4;
export const BASE_PRODUCERS = 6;
export const MAX_PER_GROUP = 12;
export const ENTER_SECONDS = 2.4;
export const LEAVE_SECONDS = 2.4;

const LEAVE_SCALE = 0.15;
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
const GOLDEN_FRACTION = 0.618034;
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
      if (edits.removed.has(id) || value <= 0 || value <= steady * EXTINCT_FRACTION) return [id, 0];
      const count = steady > 0 ? Math.round((base * value) / steady) : base;
      return [id, Math.min(Math.max(count, 1), MAX_PER_GROUP)];
    }),
  );

export type Individual = { speciesId: string; slot: number; seed: number };
// `facing` 1 heads toward +x; `rotation` is in radians. A species' poses are listed by slot.
export type IndividualPose = { x: number; y: number; scale: number; alpha: number; facing: 1 | -1; moving: boolean; rotation: number };
export type CrowdTracker = {
  update: (targets: Record<string, number>, seconds: number) => void;
  poses: (groups: Group[], seconds: number, reducedMotion: boolean) => Map<string, IndividualPose[]>;
};

// Progress runs from 0 (away) to 1 (in its spot), moving toward `showing` at a steady rate from `from` at `since`.
type Slot = { showing: boolean; from: number; since: number };

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

const CHANNEL = { phase: 0, period: 1, depth: 2, scale: 3, facing: 4, phaseY: 5 } as const;

const clamp01 = (value: number): number => Math.min(Math.max(value, 0), 1);
const smoothstep = (value: number): number => value * value * (3 - 2 * value);
const lerp = (from: number, to: number, amount: number): number => from + (to - from) * amount;
const signOf = (value: number): 1 | -1 => (value < 0 ? -1 : 1);

const progressOf = (slot: Slot, seconds: number): number =>
  clamp01(slot.showing ? slot.from + (seconds - slot.since) / ENTER_SECONDS : slot.from - (seconds - slot.since) / LEAVE_SECONDS);

const isRooted = (group: Group): boolean => group.role !== 'consumer';

type Idle = { dx: number; dy: number; rotation: number; facing: 1 | -1 };

const wave = (who: Individual, period: readonly [number, number], seconds: number, channel: number = CHANNEL.phase) => {
  const length = lerp(period[0], period[1], seeded(who.seed, CHANNEL.period));
  const angle = (TAU * seconds) / length + TAU * seeded(who.seed, channel);
  return { value: Math.sin(angle), velocity: Math.cos(angle) };
};

const restingFacing = (who: Individual): 1 | -1 => (seeded(who.seed, CHANNEL.facing) < 0.5 ? -1 : 1);

const idleOf = (group: Group, who: Individual, seconds: number): Idle => {
  const still: Idle = { dx: 0, dy: 0, rotation: 0, facing: restingFacing(who) };
  if (isRooted(group)) return { ...still, rotation: SWAY_RADIANS * wave(who, SWAY_PERIOD, seconds).value };
  if (group.zone === 'surface') return { ...still, dy: BOB_PX * wave(who, BOB_PERIOD, seconds).value };
  if (group.zone === 'floor') {
    const { value, velocity } = wave(who, WANDER_PERIOD, seconds);
    return { ...still, dx: WANDER_PX * value, facing: signOf(velocity) };
  }
  const { value, velocity } = wave(who, DRIFT_PERIOD, seconds);
  return { ...still, dx: DRIFT_PX * value, dy: DRIFT_Y_PX * wave(who, DRIFT_PERIOD, seconds, CHANNEL.phaseY).value, facing: signOf(velocity) };
};

const idleReach = (group: Group): number => {
  if (isRooted(group) || group.zone === 'surface') return 0;
  return group.zone === 'floor' ? WANDER_PX : DRIFT_PX;
};

const homeOf = (group: Group, who: Individual) => {
  const spot = (0.5 + who.slot * GOLDEN_FRACTION) % 1;
  const reach = Math.max(group.spread - idleReach(group), 0);
  return {
    x: group.centreX + (2 * spot - 1) * reach,
    y: group.baseY + (2 * seeded(who.seed, CHANNEL.depth) - 1) * group.depth,
    scale: 1 + (2 * seeded(who.seed, CHANNEL.scale) - 1) * SCALE_VARIETY,
  };
};

const poseOf = (group: Group, who: Individual, slot: Slot, seconds: number, reducedMotion: boolean): IndividualPose => {
  const home = homeOf(group, who);
  const eased = smoothstep(progressOf(slot, seconds));
  if (reducedMotion) {
    return { x: home.x, y: home.y, scale: home.scale, alpha: eased, facing: restingFacing(who), moving: false, rotation: 0 };
  }
  const idle = idleOf(group, who, seconds);
  const spot = { x: home.x + idle.dx, y: home.y + idle.dy };
  const settled = { ...spot, scale: home.scale, alpha: 1, facing: idle.facing, moving: false, rotation: idle.rotation };
  if (eased >= 1) return settled;
  if (isRooted(group)) return { ...settled, scale: home.scale * lerp(LEAVE_SCALE, 1, eased), alpha: eased };
  if (group.zone === 'surface') return { ...settled, y: lerp(-group.size, spot.y, eased), moving: true };
  const edgeX = home.x < STAGE.width / 2 ? -group.size : STAGE.width + group.size;
  const heading = slot.showing ? signOf(home.x - edgeX) : signOf(edgeX - home.x);
  return { ...settled, x: lerp(edgeX, spot.x, eased), facing: heading, moving: true };
};

const hiddenSlot = (): Slot => ({ showing: false, from: 0, since: 0 });

export const createCrowdTracker = (): CrowdTracker => {
  const slotsBySpecies = new Map<string, Slot[]>();

  const update = (targets: Record<string, number>, seconds: number): void => {
    for (const id of new Set([...Object.keys(targets), ...slotsBySpecies.keys()])) {
      const slots = slotsBySpecies.get(id) ?? Array.from({ length: MAX_PER_GROUP }, hiddenSlot);
      const count = Math.min(Math.max(targets[id] ?? 0, 0), MAX_PER_GROUP);
      slotsBySpecies.set(
        id,
        slots.map((slot, index) => {
          const showing = index < count;
          return showing === slot.showing ? slot : { showing, from: progressOf(slot, seconds), since: seconds };
        }),
      );
    }
  };

  const poses = (groups: Group[], seconds: number, reducedMotion: boolean): Map<string, IndividualPose[]> =>
    new Map(
      groups.map((group) => {
        const slots = slotsBySpecies.get(group.speciesId) ?? [];
        const shown = slots
          .map((slot, index) => ({ slot, who: individualOf(group.speciesId, index) }))
          .filter(({ slot }) => slot.showing || progressOf(slot, seconds) > 0);
        return [group.speciesId, shown.map(({ slot, who }) => poseOf(group, who, slot, seconds, reducedMotion))];
      }),
    );

  return { update, poses };
};
