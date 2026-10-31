import type { FallbackEntry, Library, Zone } from './manifest';

const WATER_WORDS = [
  'fish', 'whale', 'dolphin', 'shark', 'eel', 'jelly', 'octopus', 'squid', 'crab', 'lobster', 'shrimp', 'krill',
  'otter', 'seal', 'turtle', 'urchin', 'starfish', 'coral', 'kelp', 'plankton', 'ray', 'stingray', 'seahorse', 'frog',
  'newt', 'tadpole', 'salmon', 'trout', 'clam', 'oyster', 'snail', 'walrus', 'manatee', 'orca', 'narwhal', 'flea',
  'sea', 'lake', 'pond', 'river', 'ocean',
];
const SKY_WORDS = [
  'bird', 'eagle', 'hawk', 'owl', 'bat', 'bee', 'butterfly', 'moth', 'dragonfly', 'fly', 'wasp', 'hummingbird',
  'falcon', 'crow', 'sparrow', 'gull', 'parrot', 'cloud', 'sun', 'moon', 'star', 'kite', 'mosquito', 'swan', 'duck',
  'goose',
];
const WATER_SUFFIXES = ['fish'];
const SKY_SUFFIXES = ['fly', 'bird'];
const MIN_COMPOUND_STEM_LENGTH = 3;
const MIN_STEM_LENGTH = 3;
const IGNORED_WORDS = new Set(['the', 'a', 'an']);
const PUNCTUATION = /[^\p{L}\p{N}\s]+/gu;
const WHITESPACE = /\s+/;
const POSE_FALLBACKS = { rest: ['rest', 'move', 'still'], move: ['move', 'rest', 'still'] } as const;

const words = (name: string): string[] =>
  name
    .toLowerCase()
    .replace(/-/g, ' ')
    .replace(PUNCTUATION, ' ')
    .split(WHITESPACE)
    .filter((word) => word !== '' && !IGNORED_WORDS.has(word));

const singularise = (word: string): string => {
  if (word.length <= MIN_STEM_LENGTH) return word;
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (/(ss|us|is)$/.test(word)) return word;
  if (/(x|z|ch|sh|ss)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s')) return word.slice(0, -1);
  return word;
};

export const normaliseName = (name: string): string => {
  const parts = words(name);
  const last = parts.length - 1;
  return parts.map((word, index) => (index === last ? singularise(word) : word)).join(' ');
};

const singularForms = (word: string): Set<string> => {
  const forms = new Set([word]);
  if (word.endsWith('ies')) {
    forms.add(`${word.slice(0, -3)}y`);
    forms.add(word.slice(0, -1));
  }
  if (word.endsWith('ves')) {
    forms.add(`${word.slice(0, -3)}f`);
    forms.add(`${word.slice(0, -3)}fe`);
  }
  if (word.endsWith('es')) forms.add(word.slice(0, -2));
  if (word.endsWith('s')) forms.add(word.slice(0, -1));
  return forms;
};

const sameName = (a: string, b: string): boolean => {
  const left = words(a);
  const right = words(b);
  if (left.length === 0 || left.length !== right.length) return false;
  const last = left.length - 1;
  if (left.slice(0, last).some((word, index) => word !== right[index])) return false;
  const rightForms = singularForms(right[last] as string);
  return [...singularForms(left[last] as string)].some((form) => rightForms.has(form));
};

export const findLibrarySubject = (library: Library, name: string): string | null => {
  const match = library.entries.find(
    (entry) => sameName(entry.subject, name) || entry.aliases.some((alias) => sameName(alias, name)),
  );
  return match?.subject ?? null;
};

export const findFallback = (fallback: FallbackEntry[], name: string): FallbackEntry | null =>
  fallback.find((entry) => sameName(entry.name, name)) ?? null;

const tokenMatches = (token: string, exact: string[], suffixes: string[]): boolean =>
  [...singularForms(token)].some(
    (form) =>
      exact.includes(form) ||
      suffixes.some((suffix) => form.endsWith(suffix) && form.length - suffix.length >= MIN_COMPOUND_STEM_LENGTH),
  );

export const guessZone = (name: string): Zone => {
  const tokens = words(name);
  if (tokens.some((token) => tokenMatches(token, WATER_WORDS, WATER_SUFFIXES))) return 'water';
  if (tokens.some((token) => tokenMatches(token, SKY_WORDS, SKY_SUFFIXES))) return 'sky';
  return 'floor';
};

export const libraryFile = (library: Library, subject: string, pose: 'rest' | 'move'): string | null => {
  for (const candidate of POSE_FALLBACKS[pose]) {
    const entry = library.entries.find((item) => item.subject === subject && item.pose === candidate);
    if (entry) return entry.file;
  }
  return null;
};
