import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseFallback, parseLibrary } from './manifest';
import { findFallback, findLibrarySubject, guessZone, libraryFile, normaliseName } from './match';
import type { Zone } from './manifest';

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
