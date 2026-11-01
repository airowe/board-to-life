import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HABITATS, parseFallback, parseLibrary } from './manifest';

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
const LIBRARY_PATH = 'public/library/manifest.json';
const FALLBACK_PATH = 'public/library/fallback/manifest.json';
const LIBRARY_SIZE = 84;
const FALLBACK_SIZE = 156;

const library = () => parseLibrary(readJson(LIBRARY_PATH));
const organisms = () => library().entries.filter((entry) => entry.group === 'organism');

describe('parseLibrary', () => {
  it('accepts the committed manifest, with a zone on every organism', () => {
    const { entries } = library();
    expect(entries).toHaveLength(LIBRARY_SIZE);
    expect(organisms().filter((entry) => entry.zone === null)).toEqual([]);
  });

  it('gives every organism except the sun a habitat', () => {
    const withoutHabitat = organisms().filter((entry) => entry.habitat === null);
    expect(withoutHabitat.map((entry) => entry.id)).toEqual(['sun']);
  });

  it('gives each habitat exactly one background', () => {
    const { entries } = library();
    const counts = HABITATS.map((habitat) => entries.filter((entry) => entry.group === 'background' && entry.habitat === habitat).length);
    expect(counts).toEqual(HABITATS.map(() => 1));
  });

  it('leaves props without a habitat or zone', () => {
    const props = library().entries.filter((entry) => entry.group === 'prop');
    expect(props.length).toBeGreaterThan(0);
    expect(props.every((entry) => entry.habitat === null && entry.zone === null)).toBe(true);
  });

  it('rejects an entry without a file', () => {
    const [first] = library().entries;
    const noFile = Object.fromEntries(Object.entries(first ?? {}).filter(([key]) => key !== 'file'));
    expect(() => parseLibrary({ entries: [noFile] })).toThrow();
  });
});

describe('parseFallback', () => {
  it('accepts the committed fallback manifest', () => {
    const fallback = parseFallback(readJson(FALLBACK_PATH));
    expect(fallback).toHaveLength(FALLBACK_SIZE);
    expect(fallback.every((entry) => entry.file.endsWith('.webp'))).toBe(true);
  });
});
