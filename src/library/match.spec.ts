import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseFallback, parseLibrary } from './manifest';
import { findFallback, findLibrarySubject, guessZone, libraryFile, normaliseName } from './match';
import type { Library, LibraryEntry, Zone } from './manifest';

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
const library = parseLibrary(readJson('public/library/manifest.json'));
const fallback = parseFallback(readJson('public/library/fallback/manifest.json'));

describe('normaliseName', () => {
  it.each([
    ['  The Sea Otters ', 'sea otter'],
    ['Bunnies', 'bunny'],
    ['Water-fleas!', 'water flea'],
    ['foxes', 'fox'],
    ['moss', 'moss'],
  ])('turns %j into %j', (input, expected) => {
    expect(normaliseName(input)).toBe(expected);
  });
});

describe('findLibrarySubject', () => {
  it.each([
    ['Sea Otters', 'sea-otter'],
    ['otter', 'sea-otter'],
    ['the otters', 'sea-otter'],
    ['rabit', 'rabbit'],
    ['Water fleas', 'water-flea'],
    ['bunnies', 'rabbit'],
    ['narwhal', null],
  ])('maps %j to %j', (name, subject) => {
    expect(findLibrarySubject(library, name)).toBe(subject);
  });

  it.each([['box'], ['ocean'], ['domino'], ['plank'], ['pond']])('never matches the prop or background %j as a species', (name) => {
    expect(findLibrarySubject(library, name)).toBeNull();
  });

  it.each([
    ['Red fox', 'fox'],
    ['Great white shark', 'shark'],
    ['Grey wolf', 'wolf'],
    ['tree frog', 'frog'],
    ['giant dragonfly larva', 'dragonfly-larva'],
    ['sea star', 'sea-star'],
    ['water flea', 'water-flea'],
    ['purple sea urchins', 'sea-urchin'],
  ])('falls back to the head noun: %j is %j', (name, subject) => {
    expect(findLibrarySubject(library, name)).toBe(subject);
  });

  it.each([['star'], ['sea lion'], ['killer whale'], ['shooting star']])('does not stretch a head noun into a wrong match: %j', (name) => {
    expect(findLibrarySubject(library, name)).toBeNull();
  });
});

const entryFor = (subject: string): LibraryEntry => ({
  id: subject, subject, pose: 'still', group: 'organism', aliases: [], habitat: null, zone: 'floor',
  file: `${subject}.webp`, width: 1, height: 1,
});
const libraryOf = (...subjects: string[]): Library => ({ entries: subjects.map(entryFor) });

describe('findLibrarySubject with irregular plurals', () => {
  it.each([
    ['grass', 'grass'], ['species', 'species'], ['bass', 'bass'], ['asparagus', 'asparagus'],
    ['magpies', 'magpie'], ['magpie', 'magpie'], ['walruses', 'walrus'], ['platypuses', 'platypus'],
    ['kiwis', 'kiwi'], ['emus', 'emu'], ['gnus', 'gnu'], ['mosquitoes', 'mosquito'], ['wolves', 'wolf'],
    ['knives', 'knife'], ['bunnies', 'bunny'],
  ])('matches %j to the library subject %j', (name, subject) => {
    expect(findLibrarySubject(libraryOf(subject), name)).toBe(subject);
  });

  it('does not match different words that merely share a prefix', () => {
    expect(findLibrarySubject(libraryOf('sea-otter'), 'sea')).toBeNull();
    expect(findLibrarySubject(libraryOf('wolf'), 'wolverine')).toBeNull();
  });
});

describe('findFallback', () => {
  it.each([
    ['narwhal', null],
    ['Owl', { name: 'owl', file: 'owl.webp' }],
    ['spouting whale', { name: 'spouting whale', file: 'spouting-whale.webp' }],
  ])('maps %j to %j', (name, entry) => {
    expect(findFallback(fallback, name)).toEqual(entry);
  });
});

describe('guessZone', () => {
  it.each<[string, Zone]>([
    ['jellyfish', 'water'],
    ['eel', 'water'],
    ['whale', 'water'],
    ['eagle', 'sky'],
    ['bat', 'sky'],
    ['bee', 'sky'],
    ['badger', 'floor'],
    ['beetle', 'floor'],
    ['combat', 'floor'],
    ['crown', 'floor'],
    ['crowd', 'floor'],
    ['mother', 'floor'],
    ['mustard', 'floor'],
    ['clamp', 'floor'],
    ['newton', 'floor'],
    ['stingray', 'water'],
    ['firefly', 'sky'],
    ['sea star', 'water'],
    ['catfish', 'water'],
    ['crows', 'sky'],
  ])('puts %j in the %s zone', (name, zone) => {
    expect(guessZone(name)).toBe(zone);
  });
});

describe('libraryFile', () => {
  it.each([
    ['kelp', 'move', 'kelp.webp'],
    ['fox', 'move', 'fox-move.webp'],
    ['fox', 'rest', 'fox-rest.webp'],
    ['unknown-thing', 'rest', null],
  ] as const)('gives %s in pose %s the file %j', (subject, pose, file) => {
    expect(libraryFile(library, subject, pose)).toBe(file);
  });
});
