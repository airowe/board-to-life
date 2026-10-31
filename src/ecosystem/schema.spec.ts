import { describe, expect, it } from 'vitest';
import { eatsArrow, grasslandWeb, speciesAt, webOf } from './fixtures';
import { ROLES, validateWeb } from './schema';

const errorsFor = (input: unknown): string[] => {
  const result = validateWeb(input);
  if (result.ok) throw new Error('expected validation to fail');
  return result.errors;
};

describe('validateWeb', () => {
  it('accepts the grassland web and returns it unchanged', () => {
    const web = grasslandWeb();
    const result = validateWeb(web);
    expect(result).toEqual({ ok: true, web });
  });

  it('knows the three roles', () => {
    expect(ROLES).toEqual(['producer', 'consumer', 'decomposer']);
  });

  it('accepts counts, a drought event, labels and unknown marks', () => {
    const web = { ...grasslandWeb(), event: { kind: 'drought' as const } };
    web.species = web.species.map((entry) => (entry.id === 'rabbit' ? { ...entry, count: 0 } : entry));
    web.labels = [{ id: 'l1', text: 'rabbits', x: 400, y: 560, confidence: 0.8 }];
    web.unknownMarks = [{ id: 'u1', note: 'smudge', x: 10, y: 10, width: 20, height: 20, confidence: 0.3 }];
    expect(validateWeb(web).ok).toBe(true);
  });

  it('rejects a duplicate id and names it', () => {
    const web = grasslandWeb();
    web.species.push(speciesAt('rabbit', 'consumer', 1, 1));
    expect(errorsFor(web)).toEqual(['duplicate id "rabbit"']);
  });

  it('rejects a duplicate id shared by a species and an arrow', () => {
    const web = grasslandWeb();
    web.eats.push(eatsArrow('fox', 'grass', 'hawk'));
    expect(errorsFor(web)).toEqual(['duplicate id "fox"']);
  });

  it.each([
    ['from', 'a1', 'ghost', 'rabbit'],
    ['to', 'a1', 'grass', 'ghost'],
  ])('rejects an arrow whose %s is a missing species', (_end, arrowId, from, to) => {
    const web = grasslandWeb();
    web.eats[0] = eatsArrow(arrowId, from, to);
    expect(errorsFor(web)).toEqual([`arrow "${arrowId}" references missing species "ghost"`]);
  });

  it('rejects an event that removes a missing species', () => {
    const web = { ...grasslandWeb(), event: { kind: 'remove' as const, species: 'wolf' } };
    expect(errorsFor(web)).toEqual(['event removes missing species "wolf"']);
  });

  it('accepts an event that removes a real species', () => {
    const web = { ...grasslandWeb(), event: { kind: 'remove' as const, species: 'fox' } };
    expect(validateWeb(web).ok).toBe(true);
  });

  it('rejects a web with no producer', () => {
    const web = webOf([speciesAt('rabbit', 'consumer', 1, 1)], []);
    expect(errorsFor(web)).toEqual(['The web needs at least one producer, such as a plant.']);
  });

  it('rejects a negative count and names the species', () => {
    const web = grasslandWeb();
    web.species = web.species.map((entry) => (entry.id === 'rabbit' ? { ...entry, count: -1 } : entry));
    const errors = errorsFor(web);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('species rabbit count');
  });

  it.each([
    ['an unknown role', { role: 'predator' }, 'species grass role'],
    ['a confidence above 1', { confidence: 1.5 }, 'species grass confidence'],
    ['a non-positive width', { width: 0 }, 'species grass width'],
  ])('rejects %s with the path to the field', (_name, patch, path) => {
    const web = grasslandWeb();
    web.species[0] = { ...web.species[0], ...patch } as never;
    expect(errorsFor(web)[0]).toContain(path);
  });

  it('names an arrow by its id when a field is invalid', () => {
    const web = grasslandWeb();
    web.eats = web.eats.map((arrow) => (arrow.id === 'a2' ? { ...arrow, confidence: 2 } : arrow));
    expect(errorsFor(web)[0]).toContain('eats a2 confidence');
  });

  it('rejects a version other than 1', () => {
    expect(errorsFor({ ...grasslandWeb(), version: 2 })[0]).toContain('version');
  });

  it('rejects an arrow listed twice with different ids and names the pair', () => {
    const web = grasslandWeb();
    web.eats.push(eatsArrow('a4', 'grass', 'rabbit'));
    expect(errorsFor(web)).toEqual(['arrow "a4" repeats arrow "a1" from "grass" to "rabbit"']);
  });

  it('allows the same two species to eat each other in opposite directions', () => {
    const web = grasslandWeb();
    web.eats.push(eatsArrow('a4', 'rabbit', 'grass'));
    expect(validateWeb(web).ok).toBe(true);
  });

  describe('size caps', () => {
    const MAX_SPECIES = 24;
    const MAX_ARROWS = 100;
    const crowd = (count: number) =>
      webOf(
        Array.from({ length: count }, (_, index) => speciesAt(`s${index}`, index === 0 ? 'producer' : 'consumer', index * 10, 0)),
        [],
      );

    it('accepts exactly the maximum number of species', () => {
      expect(validateWeb(crowd(MAX_SPECIES)).ok).toBe(true);
    });

    it('rejects one more species than the maximum and names the collection', () => {
      expect(errorsFor(crowd(MAX_SPECIES + 1))).toEqual([`species: at most ${MAX_SPECIES} species are allowed`]);
    });

    it('rejects more arrows than the maximum and names the collection', () => {
      const web = crowd(MAX_SPECIES);
      const arrows = Array.from({ length: MAX_ARROWS + 1 }, (_, index) => eatsArrow(`e${index}`, 's0', 's1'));
      expect(errorsFor({ ...web, eats: arrows })).toEqual([`eats: at most ${MAX_ARROWS} arrows are allowed`]);
    });
  });
});
