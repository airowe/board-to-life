import { describe, expect, it } from 'vitest';
import { WEB_SAMPLES, type WebSample } from '../ecosystem/samples';
import type { Species, Web } from '../ecosystem/schema';
import { flipArrow } from '../ecosystem/trophic';
import { WEB_DESCRIPTION_CASES, editDistance, matchSpecies, nextCallEstimate, scoreWeb } from './webs';

const sampleById = (id: string): WebSample => {
  const sample = WEB_SAMPLES.find((entry) => entry.id === id);
  if (sample === undefined) throw new Error(`no sample ${id}`);
  return sample;
};

const grassland = (): WebSample => sampleById('grassland');

const renamed = (web: Web, from: string, to: string): Web => ({
  ...web,
  species: web.species.map((entry) => (entry.id === from ? { ...entry, name: to } : entry)),
});

const without = (web: Web, speciesId: string): Web => ({
  ...web,
  species: web.species.filter((entry) => entry.id !== speciesId),
  eats: web.eats.filter((arrow) => arrow.from !== speciesId && arrow.to !== speciesId),
});

const withNewIds = (web: Web): Web => {
  const rename = (id: string): string => `read-${id}`;
  return {
    ...web,
    species: web.species.map((entry) => ({ ...entry, id: rename(entry.id) })),
    eats: web.eats.map((arrow) => ({ ...arrow, id: rename(arrow.id), from: rename(arrow.from), to: rename(arrow.to) })),
    event: web.event?.kind === 'remove' ? { kind: 'remove', species: rename(web.event.species) } : web.event,
  };
};

describe('editDistance', () => {
  it.each([
    ['rabbit', 'rabbit', 0],
    ['rabit', 'rabbit', 1],
    ['fox', 'foxes', 2],
    ['hawk', 'wolf', 4],
    ['', 'ab', 2],
  ])('%s to %s is %i', (a, b, distance) => {
    expect(editDistance(a, b)).toBe(distance);
  });
});

describe('scoreWeb', () => {
  it.each(WEB_SAMPLES.map((sample) => [sample.id, sample] as const))('plays the %s sample as described when read perfectly', (_, sample) => {
    expect(scoreWeb(sample, sample.web)).toEqual({ played: true, mismatches: [] });
  });

  it('plays a read whose ids differ from the sample, because species match by name', () => {
    const sample = grassland();
    expect(scoreWeb(sample, withNewIds(sample.web))).toEqual({ played: true, mismatches: [] });
  });

  it('plays a read with fox to rabbit reversed, flipped as the teacher would', () => {
    const sample = grassland();
    const reversed = flipArrow(sample.web, 'e2');
    expect(scoreWeb(sample, reversed)).toEqual({ played: true, mismatches: [] });
  });

  it('matches misspelt and differently cased names within edit distance 2', () => {
    const sample = grassland();
    const read = renamed(renamed(sample.web, 'rabbit', ' Rabit '), 'fox', 'FOXES');
    expect(scoreWeb(sample, read)).toEqual({ played: true, mismatches: [] });
  });

  it('does not play a read missing the hawk, and names the hawk', () => {
    const sample = grassland();
    const result = scoreWeb(sample, without(sample.web, 'hawk'));
    expect(result.played).toBe(false);
    expect(result.mismatches.filter((line) => line.startsWith('hawk'))).toHaveLength(1);
  });

  it('does not play a read that misses the species the event removes, and names it', () => {
    const sample = grassland();
    const result = scoreWeb(sample, without(sample.web, 'fox'));
    expect(result.played).toBe(false);
    expect(result.mismatches.some((line) => line.startsWith('fox'))).toBe(true);
  });

  it('names a species by what was expected and what the read web did', () => {
    const sample = grassland();
    const swapped: Web = {
      ...sample.web,
      eats: sample.web.eats.filter((arrow) => arrow.id !== 'e3'),
    };
    const result = scoreWeb(sample, swapped);
    expect(result.played).toBe(false);
    expect(result.mismatches).toContain('hawk: expected rose, got steady');
  });

  it('uses each read species once, so two sample species cannot share one read species', () => {
    const sample = grassland();
    const read = renamed(sample.web, 'hawk', 'foxs');
    const result = scoreWeb(sample, read);
    expect(result.played).toBe(false);
    expect(result.mismatches.length).toBeGreaterThan(0);
  });

  it('gives each read species to the nearest sample name, once', () => {
    const [fox, hawk] = [sampleById('grassland').web.species.find((entry) => entry.id === 'fox'), sampleById('grassland').web.species.find((entry) => entry.id === 'hawk')];
    if (!fox || !hawk) throw new Error('grassland lacks fox or hawk');
    const exact: Species = { ...fox, id: 'r1', name: 'fox' };
    const close: Species = { ...fox, id: 'r2', name: 'foxes' };
    expect(matchSpecies([fox], [close, exact])).toEqual(new Map([['fox', 'r1']]));
    expect(matchSpecies([fox, { ...fox, id: 'fox2', name: 'foxs' }], [exact])).toEqual(new Map([['fox', 'r1']]));
    expect(matchSpecies([hawk], [exact])).toEqual(new Map());
  });
});

describe('WEB_DESCRIPTION_CASES', () => {
  it('has one description per sample, in sample order', () => {
    expect(WEB_DESCRIPTION_CASES.map((entry) => entry.sampleId)).toEqual(WEB_SAMPLES.map((sample) => sample.id));
  });

  it('names every species of its sample in the description, within edit distance 2 of some word', () => {
    for (const entry of WEB_DESCRIPTION_CASES) {
      const sample = sampleById(entry.sampleId);
      const text = entry.text.toLowerCase();
      for (const member of sample.web.species) {
        const stem = member.name.toLowerCase();
        const words = text.split(/[^a-z ]+/).flatMap((chunk) => chunk.split(/\s+/));
        const phrases = words.flatMap((word, index) => [word, `${word} ${words[index + 1] ?? ''}`.trim()]);
        expect(phrases.some((phrase) => editDistance(phrase, stem) <= 2), `${entry.sampleId}: ${member.name}`).toBe(true);
      }
    }
  });
});

describe('nextCallEstimate', () => {
  const FALLBACK = 0.05;
  const CHEAP = 0.01;
  const DEAR = 0.4;

  it('uses the fallback before any call', () => {
    expect(nextCallEstimate([], FALLBACK)).toBe(FALLBACK);
  });

  it('uses the dearest call so far, not the average', () => {
    expect(nextCallEstimate([CHEAP, DEAR, CHEAP], FALLBACK)).toBe(DEAR);
  });
});
