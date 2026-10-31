import { EVENT_STEP, type Series } from '../ecosystem/model';
import { CHANGE_THRESHOLD, directionsAfter, isGone, referenceLevel, type Direction } from '../ecosystem/outcomes';
import type { Species, Web, WebEvent } from '../ecosystem/schema';

export const MAX_LABELS = 3;
export const LABEL_FADE_STEPS = 60;

export type PinnedLabel = { speciesId: string | null; text: string; since: number }; // since = step it appeared

// Names that read the same for one or many, so "Kelp thinning out." rather than "Kelps thinning out.".
const SAME_PLURAL = new Set([
  'kelp', 'grass', 'algae', 'plankton', 'phytoplankton', 'zooplankton', 'krill', 'seaweed', 'fungi', 'fish', 'deer',
  'sheep', 'moose', 'bison', 'salmon', 'trout', 'moss', 'clover', 'wheat', 'corn', 'larvae', 'mice', 'geese', 'lice',
  'oxen', 'children', 'people', 'cacti',
]);
const IRREGULAR_PLURAL: Record<string, string> = {
  mouse: 'mice', louse: 'lice', goose: 'geese', ox: 'oxen', larva: 'larvae', fungus: 'fungi', cactus: 'cacti',
  child: 'children', person: 'people', wolf: 'wolves', calf: 'calves', leaf: 'leaves', loaf: 'loaves', half: 'halves',
  elf: 'elves', shelf: 'shelves', thief: 'thieves', wife: 'wives', knife: 'knives', life: 'lives',
};

const pluralWord = (word: string): string => {
  if (SAME_PLURAL.has(word)) return word;
  const irregular = IRREGULAR_PLURAL[word];
  if (irregular !== undefined) return irregular;
  if (word.endsWith('s') && !/(ss|us|is)$/.test(word)) return word;
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/.test(word)) return `${word}es`;
  return `${word}s`;
};

const pluralName = (name: string): string => {
  const words = name.trim().toLowerCase().split(/\s+/);
  const last = words.length - 1;
  return words.map((word, index) => (index === last ? pluralWord(word) : word)).join(' ');
};

const capitalised = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

const eventLabel = (web: Web, event: WebEvent): PinnedLabel => {
  if (event.kind === 'drought') return { speciesId: null, text: 'A drought hits.', since: EVENT_STEP };
  const name = web.species.find((entry) => entry.id === event.species)?.name ?? event.species;
  return { speciesId: event.species, text: `The ${pluralName(name)} are removed.`, since: EVENT_STEP };
};

// The way the species ends up, as the reveal reports it (directionsAfter), dated from the first step it crosses the
// threshold that way; no label for a species that ends steady. While the species is gone it is "dying out" instead,
// dated from when it went.
const changeLabel = (species: Species, values: number[], step: number, direction: Direction | undefined): PinnedLabel | null => {
  const reference = referenceLevel(values, EVENT_STEP);
  if (reference <= 0) return null;
  const name = capitalised(pluralName(species.name));
  const rises = direction === 'rose';
  const falls = direction === 'fell' || direction === 'died out';
  const text = rises ? `${name} multiplying.` : species.role === 'producer' ? `${name} thinning out.` : `${name} declining.`;
  let change: PinnedLabel | null = null;
  let goneSince: number | null = null;
  for (let at = EVENT_STEP + 1; at <= Math.min(step, values.length - 1); at += 1) {
    const value = values[at] ?? 0;
    goneSince = isGone(value, reference) ? (goneSince ?? at) : null;
    if (change !== null) continue;
    const crossed = (rises && value > reference * (1 + CHANGE_THRESHOLD)) || (falls && value < reference * (1 - CHANGE_THRESHOLD));
    if (crossed) change = { speciesId: species.id, text, since: at };
  }
  return goneSince === null ? change : { speciesId: species.id, text: `${name} dying out.`, since: goneSince };
};

// Every species' change label at `step`, before the newest few are picked; the removed species gets none.
export const changeLabelsAt = (web: Web, event: WebEvent, series: Series, step: number): PinnedLabel[] => {
  if (step < EVENT_STEP) return [];
  const removed = event.kind === 'remove' ? event.species : null;
  const directions = directionsAfter(series, EVENT_STEP);
  return web.species
    .filter((species) => species.id !== removed)
    .map((species) => changeLabel(species, series.values[species.id] ?? [], step, directions[species.id]))
    .filter((label): label is PinnedLabel => label !== null);
};

export const labelsAt = (web: Web, event: WebEvent, series: Series, step: number): PinnedLabel[] => {
  if (step < EVENT_STEP) return [];
  const newestLast = [eventLabel(web, event), ...changeLabelsAt(web, event, series, step)].sort((a, b) => a.since - b.since);
  return newestLast.slice(-MAX_LABELS);
};
