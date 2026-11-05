import { feedsAlong } from '../ecosystem/model';
import type { Web } from '../ecosystem/schema';
import type { IndividualPose } from '../living/crowd';
import type { Group, PlaceLayout } from '../living/layout';
import { aboveShareOf } from './placeView';

// A predator living above its prey (an otter at the surface, a hawk in the sky) now and then goes down to catch one:
// it travels to a prey animal, eats it, and goes back. The eaten one then grows back in its spot. This shows the
// feeding the model counts; how many of each there are still follows the model.
export type HuntPair = { predator: string; prey: string; offset: number };

// Seconds into each hunt's cycle.
export const HUNT_CYCLE_SECONDS = 8;
const DIVE_SECONDS = 1.8;
const EAT_SECONDS = 0.9;
const RETURN_SECONDS = 1.8;
const REGROW_SECONDS = 1;
const EAT_ENDS = DIVE_SECONDS + EAT_SECONDS;
const RETURN_ENDS = EAT_ENDS + RETURN_SECONDS;
// Only members that have settled into the crowd take part, so a hunt never grabs one still arriving or leaving.
const SETTLED_ALPHA = 0.99;
// Where the predator stops: its middle this share of the prey's height above the prey's middle.
const BITE_ABOVE_SHARE = 0.35;
// And this share of its own height to the side, so it meets the prey face first.
const BITE_SIDE_SHARE = 0.35;
const MAX_TILT = 0.9;
const EAT_WOBBLE = 0.12;
const EAT_WOBBLE_RATE = 12;
const EATEN_SCALE = 0.3;

const hashString = (text: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193);
  return hash >>> 0;
};

const smoothstep = (value: number): number => {
  const t = Math.min(Math.max(value, 0), 1);
  return t * t * (3 - 2 * t);
};

// Every predator-prey arrow where the predator lives above a prey animal in another zone.
export const huntPairs = (web: Web, layout: PlaceLayout): HuntPair[] => {
  const groups = new Map(layout.groups.map((group) => [group.speciesId, group]));
  return web.eats
    .filter((arrow) => feedsAlong(web, arrow))
    .flatMap((arrow) => {
      const predator = groups.get(arrow.to);
      const prey = groups.get(arrow.from);
      if (!predator || !prey || prey.role !== 'consumer' || predator.zone === prey.zone || predator.baseY >= prey.baseY) return [];
      return [{ predator: predator.speciesId, prey: prey.speciesId, offset: (hashString(`${arrow.to}>${arrow.from}`) % 1000) / 1000 }];
    });
};

const middleOf = (group: Group, pose: IndividualPose, habitat: PlaceLayout['habitat']): number =>
  pose.y + group.size * pose.scale * (0.5 - aboveShareOf(group, habitat));

const settledIndexes = (poses: IndividualPose[]): number[] =>
  poses.flatMap((pose, index) => (pose.alpha >= SETTLED_ALPHA && !pose.moving ? [index] : []));

const lerp = (from: number, to: number, amount: number): number => from + (to - from) * amount;

// The poses with this moment's hunts applied; the crowd's own poses are left as they are.
export const withHunts = (
  pairs: HuntPair[],
  layout: PlaceLayout,
  poses: Map<string, IndividualPose[]>,
  seconds: number,
  reducedMotion: boolean,
): Map<string, IndividualPose[]> => {
  if (reducedMotion || pairs.length === 0) return poses;
  const result = new Map([...poses].map(([id, list]) => [id, [...list]]));
  const groups = new Map(layout.groups.map((group) => [group.speciesId, group]));
  for (const pair of pairs) {
    const predatorGroup = groups.get(pair.predator);
    const preyGroup = groups.get(pair.prey);
    const predators = result.get(pair.predator);
    const preys = result.get(pair.prey);
    if (!predatorGroup || !preyGroup || !predators || !preys) continue;
    const elapsed = seconds / HUNT_CYCLE_SECONDS + pair.offset;
    const cycle = Math.floor(elapsed);
    const t = (elapsed - cycle) * HUNT_CYCLE_SECONDS;
    if (t >= RETURN_ENDS + REGROW_SECONDS) continue;
    const hunters = settledIndexes(predators);
    const targets = settledIndexes(preys);
    if (hunters.length === 0 || targets.length === 0) continue;
    const hunterIndex = hunters[cycle % hunters.length] as number;
    const targetIndex = targets[(cycle * 7 + 3) % targets.length] as number;
    const hunter = predators[hunterIndex] as IndividualPose;
    const target = preys[targetIndex] as IndividualPose;

    const heading: 1 | -1 = target.x >= hunter.x ? 1 : -1;
    const hunterTall = predatorGroup.size * hunter.scale;
    const preyTall = preyGroup.size * target.scale;
    const biteMiddle = middleOf(preyGroup, target, layout.habitat) - preyTall * BITE_ABOVE_SHARE;
    const bite = {
      x: target.x - heading * hunterTall * BITE_SIDE_SHARE,
      y: biteMiddle - (middleOf(predatorGroup, hunter, layout.habitat) - hunter.y),
    };
    const tilt = Math.min(Math.atan2(Math.abs(bite.y - hunter.y), Math.abs(bite.x - hunter.x) + 1), MAX_TILT);

    if (t < RETURN_ENDS) {
      const out = t < DIVE_SECONDS;
      const back = t >= EAT_ENDS;
      const along = out ? smoothstep(t / DIVE_SECONDS) : back ? 1 - smoothstep((t - EAT_ENDS) / RETURN_SECONDS) : 1;
      // Heading down it tips nose first; coming back up it tips the other way, and it turns to face home.
      const facing: 1 | -1 = back ? (heading === 1 ? -1 : 1) : heading;
      const travelling = out || back;
      // Tipped most mid-journey and level at either end.
      const lean = Math.sin(Math.PI * Math.min(along, 1 - along));
      const rotation = travelling ? (back ? -tilt : tilt) * facing * lean : EAT_WOBBLE * Math.sin(t * EAT_WOBBLE_RATE);
      predators[hunterIndex] = {
        ...hunter,
        x: lerp(hunter.x, bite.x, along),
        y: lerp(hunter.y, bite.y, along),
        facing,
        // Swimming the whole time: the resting picture (an otter floating on its back) would look wrong on the seabed.
        moving: true,
        rotation,
      };
    }

    const eaten = t < DIVE_SECONDS ? 0 : t < EAT_ENDS ? smoothstep((t - DIVE_SECONDS) / EAT_SECONDS) : t < RETURN_ENDS ? 1 : 1 - smoothstep((t - RETURN_ENDS) / REGROW_SECONDS);
    if (eaten > 0) {
      preys[targetIndex] = { ...target, alpha: target.alpha * (1 - eaten), scale: target.scale * lerp(1, EATEN_SCALE, eaten) };
    }
  }
  return result;
};
