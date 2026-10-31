import type { FallbackEntry, Library, Zone } from './manifest';

const WATER_WORDS = [
  'fish', 'whale', 'dolphin', 'shark', 'eel', 'jelly', 'octopus', 'squid', 'crab', 'lobster', 'shrimp', 'krill',
  'otter', 'seal', 'turtle', 'urchin', 'starfish', 'coral', 'kelp', 'plankton', 'ray', 'seahorse', 'frog', 'newt',
  'tadpole', 'salmon', 'trout', 'clam', 'oyster', 'snail', 'walrus', 'manatee', 'orca', 'narwhal', 'flea',
];
const SKY_WORDS = [
  'bird', 'eagle', 'hawk', 'owl', 'bat', 'bee', 'butterfly', 'moth', 'dragonfly', 'fly', 'wasp', 'hummingbird',
  'falcon', 'crow', 'sparrow', 'gull', 'parrot', 'cloud', 'sun', 'moon', 'star', 'kite', 'mosquito', 'swan', 'duck', 'goose',
];
const IGNORED_WORDS = new Set(['the', 'a', 'an']);
const PUNCTUATION = /[^\p{L}\p{N}\s]+/gu;
const WHITESPACE = /\s+/;
const MIN_STEM_LENGTH = 3;

const singularise = (word: string): string => {
  if (word.length <= MIN_STEM_LENGTH) return word;
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (/(ss|us|is)$/.test(word)) return word;
  if (/(x|z|ch|sh|ss)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s')) return word.slice(0, -1);
  return word;
};

export const normaliseName = (name: string): string => {
  const words = name
    .toLowerCase()
    .replace(/-/g, ' ')
    .replace(PUNCTUATION, ' ')
    .split(WHITESPACE)
    .filter((word) => word !== '' && !IGNORED_WORDS.has(word));
  const last = words.length - 1;
  return words.map((word, index) => (index === last ? singularise(word) : word)).join(' ');
};

export const findLibrarySubject = (library: Library, name: string): string | null => {
  const wanted = normaliseName(name);
  if (wanted === '') return null;
  const match = library.entries.find(
    (entry) => normaliseName(entry.subject) === wanted || entry.aliases.some((alias) => normaliseName(alias) === wanted),
  );
  return match?.subject ?? null;
};

export const findFallback = (fallback: FallbackEntry[], name: string): FallbackEntry | null => {
  const wanted = normaliseName(name);
  if (wanted === '') return null;
  return fallback.find((entry) => normaliseName(entry.name) === wanted) ?? null;
};

const hasWord = (name: string, words: string[]): boolean => {
  const tokens = normaliseName(name).split(WHITESPACE);
  return tokens.some((token) => words.some((word) => token === word || (word.length > MIN_STEM_LENGTH && token.includes(word))));
};

export const guessZone = (name: string): Zone => {
  if (hasWord(name, WATER_WORDS)) return 'water';
  if (hasWord(name, SKY_WORDS)) return 'sky';
  return 'floor';
};

const POSE_FALLBACKS = { rest: ['rest', 'move', 'still'], move: ['move', 'rest', 'still'] } as const;

export const libraryFile = (library: Library, subject: string, pose: 'rest' | 'move'): string | null => {
  const poses = [pose, ...POSE_FALLBACKS[pose].filter((candidate) => candidate !== pose)];
  for (const candidate of poses) {
    const entry = library.entries.find((item) => item.subject === subject && item.pose === candidate);
    if (entry) return entry.file;
  }
  return null;
};
