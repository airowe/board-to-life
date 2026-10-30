import { describe, expect, it } from 'vitest';
import { eatsArrow, grasslandWeb, speciesAt, webOf } from './fixtures';
import { backwardArrows, flipArrow, suggestedEvent, trophicLevels } from './trophic';

const PRODUCER_LEVEL = 1;
const PRIMARY_CONSUMER_LEVEL = 2;
const SECONDARY_CONSUMER_LEVEL = 3;
const DECOMPOSER_LEVEL = 0;

const grass = speciesAt('grass', 'producer', 0, 0);
const rabbit = speciesAt('rabbit', 'consumer', 0, 0);
const fox = speciesAt('fox', 'consumer', 0, 0);
const bear = speciesAt('bear', 'consumer', 0, 0);
const fungus = speciesAt('fungus', 'decomposer', 0, 0);

describe('trophicLevels', () => {
  it('numbers producers 1, rabbit 2 and fox 3', () => {
    const levels = trophicLevels(grasslandWeb());
    expect(levels.get('grass')).toBe(PRODUCER_LEVEL);
    expect(levels.get('rabbit')).toBe(PRIMARY_CONSUMER_LEVEL);
    expect(levels.get('fox')).toBe(SECONDARY_CONSUMER_LEVEL);
    expect(levels.get('hawk')).toBe(SECONDARY_CONSUMER_LEVEL);
  });

  it('gives an omnivore the longest path', () => {
    const web = webOf([grass, rabbit, bear], [eatsArrow('a1', 'grass', 'rabbit'), eatsArrow('a2', 'grass', 'bear'), eatsArrow('a3', 'rabbit', 'bear')]);
    expect(trophicLevels(web).get('bear')).toBe(SECONDARY_CONSUMER_LEVEL);
  });

  it('gives a decomposer 0, even with arrows', () => {
    const web = webOf([grass, rabbit, fungus], [eatsArrow('a1', 'grass', 'rabbit'), eatsArrow('a2', 'rabbit', 'fungus')]);
    expect(trophicLevels(web).get('fungus')).toBe(DECOMPOSER_LEVEL);
  });

  it('gives an arrowless producer 1 and an arrowless consumer 2', () => {
    const web = webOf([grass, rabbit], []);
    const levels = trophicLevels(web);
    expect(levels.get('grass')).toBe(PRODUCER_LEVEL);
    expect(levels.get('rabbit')).toBe(PRIMARY_CONSUMER_LEVEL);
  });

  it('ends on a cycle with a finite level for each species', () => {
    const web = webOf([grass, rabbit, fox], [eatsArrow('a1', 'rabbit', 'fox'), eatsArrow('a2', 'fox', 'rabbit')]);
    const levels = trophicLevels(web);
    expect([...levels.keys()].sort()).toEqual(['fox', 'grass', 'rabbit']);
    for (const level of levels.values()) expect(Number.isFinite(level)).toBe(true);
  });

  it('keeps a producer at 1 when an arrow points into it', () => {
    const web = webOf([grass, rabbit], [eatsArrow('a1', 'rabbit', 'grass'), eatsArrow('a2', 'grass', 'rabbit')]);
    const levels = trophicLevels(web);
    expect(levels.get('grass')).toBe(PRODUCER_LEVEL);
    expect(levels.get('rabbit')).toBe(PRIMARY_CONSUMER_LEVEL);
  });

  it('numbers by a flagged arrow as the student drew it', () => {
    const web = webOf([grass, rabbit, fox], [eatsArrow('a1', 'grass', 'rabbit'), eatsArrow('a2', 'fox', 'rabbit')]);
    expect(backwardArrows(web)).toEqual(['a2']);
    expect(trophicLevels(web).get('rabbit')).toBe(SECONDARY_CONSUMER_LEVEL);
  });
});

describe('backwardArrows', () => {
  it('flags an arrow into a producer', () => {
    const web = webOf([grass, rabbit], [eatsArrow('a1', 'rabbit', 'grass')]);
    expect(backwardArrows(web)).toEqual(['a1']);
  });

  it('flags fox to rabbit when grass feeds rabbit and nothing feeds fox', () => {
    const web = webOf([grass, rabbit, fox], [eatsArrow('a1', 'grass', 'rabbit'), eatsArrow('a2', 'fox', 'rabbit')]);
    expect(backwardArrows(web)).toEqual(['a2']);
  });

  it('flags nothing in the grassland web', () => {
    expect(backwardArrows(grasslandWeb())).toEqual([]);
  });

  it('does not flag an omnivore\'s two arrows', () => {
    const web = webOf([grass, rabbit, bear], [eatsArrow('a1', 'grass', 'rabbit'), eatsArrow('a2', 'grass', 'bear'), eatsArrow('a3', 'rabbit', 'bear')]);
    expect(backwardArrows(web)).toEqual([]);
  });

  it('does not flag arrows into a decomposer', () => {
    const web = webOf([grass, rabbit, fungus], [eatsArrow('a1', 'grass', 'rabbit'), eatsArrow('a2', 'rabbit', 'fungus'), eatsArrow('a3', 'grass', 'fungus')]);
    expect(backwardArrows(web)).toEqual([]);
  });

  it('does not count an arrow already flagged as an incoming arrow', () => {
    const web = webOf([grass, rabbit, fox], [eatsArrow('a1', 'fox', 'grass'), eatsArrow('a2', 'rabbit', 'fox')]);
    expect(backwardArrows(web)).toEqual(['a1']);
  });
});

describe('flipArrow', () => {
  it('swaps from and to on only that arrow and leaves the input unchanged', () => {
    const web = grasslandWeb();
    const before = structuredClone(web);
    const flipped = flipArrow(web, 'a2');
    expect(flipped.eats.find((arrow) => arrow.id === 'a2')).toMatchObject({ from: 'fox', to: 'rabbit' });
    expect(flipped.eats.filter((arrow) => arrow.id !== 'a2')).toEqual(before.eats.filter((arrow) => arrow.id !== 'a2'));
    expect(web).toEqual(before);
  });
});

describe('suggestedEvent', () => {
  it('returns the event the web already has', () => {
    const web = { ...grasslandWeb(), event: { kind: 'remove' as const, species: 'rabbit' } };
    expect(suggestedEvent(web)).toEqual({ kind: 'remove', species: 'rabbit' });
  });

  it('removes the consumer with the highest level, the first in order on a tie', () => {
    expect(suggestedEvent(grasslandWeb())).toEqual({ kind: 'remove', species: 'fox' });
  });

  it('suggests a drought when there are only producers', () => {
    expect(suggestedEvent(webOf([grass], []))).toEqual({ kind: 'drought' });
  });
});
