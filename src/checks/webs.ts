import { EVENT_STEP, MODEL_STEPS, simulate, type Run } from '../ecosystem/model';
import { directionsAfter } from '../ecosystem/outcomes';
import type { WebSample } from '../ecosystem/samples';
import type { Species, Web, WebEvent } from '../ecosystem/schema';
import { backwardArrows, flipArrow } from '../ecosystem/trophic';

export type WebScore = { played: boolean; mismatches: string[] };

export type WebDescriptionCase = { sampleId: string; text: string };

const MAX_NAME_DISTANCE = 2;

export const WEB_DESCRIPTION_CASES: readonly WebDescriptionCase[] = [
  { sampleId: 'grassland', text: 'grass, rabbits, foxes and hawks' },
  { sampleId: 'ocean', text: 'kelp, urchins and sea otters' },
  { sampleId: 'pond', text: 'algae, water fleas, minnows, ducks and herons' },
  { sampleId: 'forest', text: 'oak, caterpillars, deer, a wolf, songbirds and fungi' },
  { sampleId: 'grassland-messy', text: 'grass, rabits, foxes and hawks' },
];

export const editDistance = (a: string, b: string): number => {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= b.length; column += 1) {
      const substitution = (previous[column - 1] ?? 0) + (a[row - 1] === b[column - 1] ? 0 : 1);
      current.push(Math.min(substitution, (previous[column] ?? 0) + 1, (current[column - 1] ?? 0) + 1));
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
};

const normalised = (name: string): string => name.trim().toLowerCase();

type Pairing = { sampleId: string; readId: string; distance: number };

// Nearest names pair first, and each read species is used once.
export const matchSpecies = (sampleSpecies: readonly Species[], readSpecies: readonly Species[]): Map<string, string> => {
  const pairings: Pairing[] = sampleSpecies.flatMap((wanted) =>
    readSpecies.flatMap((found) => {
      const distance = editDistance(normalised(wanted.name), normalised(found.name));
      return distance <= MAX_NAME_DISTANCE ? [{ sampleId: wanted.id, readId: found.id, distance }] : [];
    }),
  );
  const matches = new Map<string, string>();
  const used = new Set<string>();
  for (const pairing of [...pairings].sort((a, b) => a.distance - b.distance)) {
    if (matches.has(pairing.sampleId) || used.has(pairing.readId)) continue;
    matches.set(pairing.sampleId, pairing.readId);
    used.add(pairing.readId);
  }
  return matches;
};

export const nextCallEstimate = (costs: readonly number[], fallback: number): number =>
  costs.length === 0 ? fallback : Math.max(...costs);

const asTeacherWouldRead = (web: Web): Web => backwardArrows(web).reduce(flipArrow, web);

const eventInReadWeb = (event: WebEvent | null, matches: Map<string, string>): WebEvent | null | undefined => {
  if (event?.kind !== 'remove') return event;
  const readId = matches.get(event.species);
  return readId === undefined ? undefined : { kind: 'remove', species: readId };
};

export const scoreWeb = (sample: WebSample, read: Web): WebScore => {
  const matches = matchSpecies(sample.web.species, read.species);
  const unmatched = sample.web.species.filter((member) => !matches.has(member.id));
  const mismatches = unmatched.map((member) => `${member.name}: not found in the read web`);
  const event = eventInReadWeb(sample.web.event, matches);
  if (event === undefined) return { played: false, mismatches };
  const run: Run = { steps: MODEL_STEPS, event, eventStep: EVENT_STEP, removed: new Set<string>() };
  const directions = directionsAfter(simulate(asTeacherWouldRead(read), run), EVENT_STEP);
  for (const member of sample.web.species) {
    const readId = matches.get(member.id);
    const expected = sample.expect.event[member.id];
    if (readId === undefined || expected === undefined) continue;
    const got = directions[readId];
    if (got !== expected) mismatches.push(`${member.name}: expected ${expected}, got ${got}`);
  }
  return { played: mismatches.length === 0, mismatches };
};
