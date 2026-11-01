import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseFallback, parseLibrary } from './manifest';
import { liveCandidates, pictureSource, type LiveState } from './source';

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
const library = parseLibrary(readJson('public/library/manifest.json'));
const fallback = parseFallback(readJson('public/library/fallback/manifest.json'));

const LIVE_CAP = 4;
const UNKNOWN_NAMES = ['narwhal', 'axolotl', 'quokka', 'pangolin', 'okapi', 'tapir'];

const liveIs = (state: ReturnType<LiveState>): LiveState => () => state;

describe('pictureSource', () => {
  it('library wins over a ready live picture', () => {
    expect(pictureSource('fox', library, fallback, liveIs('ready'))).toEqual({ kind: 'library', subject: 'fox' });
  });

  it('ready live beats emoji', () => {
    expect(pictureSource('Zebra', library, fallback, liveIs('ready'))).toEqual({ kind: 'live', key: 'zebra' });
  });

  it('pending live shows the emoji', () => {
    expect(pictureSource('zebra', library, fallback, liveIs('pending'))).toEqual({ kind: 'emoji', file: 'zebra.webp' });
  });

  it('failed live with no emoji is a drawing', () => {
    expect(pictureSource('narwhal', library, fallback, liveIs('failed'))).toEqual({ kind: 'drawing' });
  });

  it('no live picture and no emoji is a drawing', () => {
    expect(pictureSource('narwhal', library, fallback, liveIs('none'))).toEqual({ kind: 'drawing' });
  });
});

describe('liveCandidates', () => {
  it('caps at 4 and skips library names', () => {
    const names = ['narwhal', 'Sea Otters', 'axolotl', 'quokka', 'fox', 'pangolin', 'okapi', 'tapir'];
    expect(liveCandidates(names, library, LIVE_CAP)).toEqual(UNKNOWN_NAMES.slice(0, LIVE_CAP));
  });

  it('normalises names', () => {
    expect(liveCandidates(['The Axolotls'], library, LIVE_CAP)).toEqual(['axolotl']);
  });

  it('de-duplicates "jellyfish" and "Jellyfish"', () => {
    expect(liveCandidates(['jellyfish', 'Jellyfish'], library, LIVE_CAP)).toEqual(['jellyfish']);
  });
});
