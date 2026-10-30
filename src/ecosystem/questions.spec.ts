import { describe, expect, it } from 'vitest';
import { eatsArrow, grasslandWeb, speciesAt, webOf } from './fixtures';
import { CHOICE_FOR, WEB_CHOICES, changingSpecies, checkWebGrounding, describeEvent, directionsForEvent, templateQuestion, twoLinksFrom, unfedSpecies, type WebQuestion } from './questions';
import type { Direction } from './outcomes';
import type { WebEvent } from './schema';

const FOX_REMOVED: WebEvent = { kind: 'remove', species: 'fox' };
const DROUGHT: WebEvent = { kind: 'drought' };

const question = (overrides: Partial<WebQuestion> = {}): WebQuestion => ({
  id: 'q-1',
  prompt: 'Remove the fox. What happens to the grass?',
  choices: [...WEB_CHOICES],
  observe: { kind: 'direction', species: 'grass' },
  explanation: 'In the model, the grass fell after the fox was removed.',
  cites: ['grass', 'fox'],
  ...overrides,
});

const grassland = () => ({ ...grasslandWeb(), event: FOX_REMOVED });

const withUnfedDeer = () => {
  const web = grasslandWeb();
  return { ...web, species: [...web.species, speciesAt('deer', 'consumer', 900, 900)], event: DROUGHT };
};

describe('a consumer with nothing to eat', () => {
  it('is listed as unfed, and only it', () => {
    expect(unfedSpecies(withUnfedDeer())).toEqual(['deer']);
    expect(unfedSpecies(grassland())).toEqual([]);
  });

  it('stays about the same rather than dying out', () => {
    expect(directionsForEvent(withUnfedDeer(), DROUGHT)['deer']).toBe('steady');
  });

  it('is never a species that changes', () => {
    const changing = changingSpecies(withUnfedDeer(), DROUGHT);
    expect(changing).not.toContain('deer');
    expect(changing.length).toBeGreaterThan(0);
  });

  it('cannot be the species a question observes', () => {
    const asked = question({ prompt: 'A drought hits. What happens to the deer?', observe: { kind: 'direction', species: 'deer' }, cites: ['deer'] });
    expect(checkWebGrounding([asked], withUnfedDeer())).toEqual({ ok: false, errors: ['q-1 observes "deer", which has nothing to eat in this web'] });
  });
});

describe('WEB_CHOICES and CHOICE_FOR', () => {
  it('offers the four answers in a fixed order', () => {
    expect(WEB_CHOICES).toEqual(['Rises', 'Falls', 'Stays about the same', 'Dies out']);
  });

  it.each([
    ['rose', 'Rises'],
    ['fell', 'Falls'],
    ['steady', 'Stays about the same'],
    ['died out', 'Dies out'],
  ] as [Direction, string][])('maps %s to "%s", one of the choices', (direction, choice) => {
    expect(CHOICE_FOR[direction]).toBe(choice);
    expect(WEB_CHOICES).toContain(choice);
  });
});

describe('describeEvent', () => {
  it.each([
    [FOX_REMOVED, 'Remove the fox.'],
    [{ kind: 'remove', species: 'rabbit' }, 'Remove the rabbit.'],
    [DROUGHT, 'A drought hits.'],
  ] as [WebEvent, string][])('says %j as "%s"', (event, text) => {
    expect(describeEvent(grasslandWeb(), event)).toBe(text);
  });

  it.each(['wolf', 'deer', 'algae', 'grass'])('needs no plural, so it reads right for %s', (name) => {
    const web = webOf([speciesAt('s1', 'producer', 0, 0), { ...speciesAt('s2', 'consumer', 0, 0), name }], [eatsArrow('a1', 's1', 's2')]);
    expect(describeEvent(web, { kind: 'remove', species: 's2' })).toBe(`Remove the ${name}.`);
  });

  it('uses the lowercased species name, never its id', () => {
    const web = webOf([speciesAt('s1', 'producer', 0, 0), { ...speciesAt('s2', 'consumer', 0, 0), name: 'Owl' }], [eatsArrow('a1', 's1', 's2')]);
    expect(describeEvent(web, { kind: 'remove', species: 's2' })).toBe('Remove the owl.');
  });
});

describe('sample species wording', () => {
  const web = webOf(
    [
      { ...speciesAt('g', 'producer', 0, 0), name: 'Algae' },
      { ...speciesAt('d', 'consumer', 0, 0), name: 'Deer' },
      { ...speciesAt('w', 'consumer', 0, 0), name: 'Wolf' },
    ],
    [eatsArrow('a1', 'g', 'd'), eatsArrow('a2', 'd', 'w')],
  );

  it('asks about the deer when the wolf is removed', () => {
    const asked = templateQuestion(web, { kind: 'remove', species: 'w' }, 'd');
    expect(asked.prompt).toBe('Remove the wolf. What happens to the deer?');
    expect(asked.explanation).toMatch(/^In the model, the deer (rose|fell|stayed about the same|died out) after the wolf was removed\.$/);
  });

  it('asks about the algae after a drought', () => {
    const asked = templateQuestion(web, { kind: 'drought' }, 'g');
    expect(asked.prompt).toBe('A drought hits. What happens to the algae?');
    expect(asked.explanation).toMatch(/^In the model, the algae (rose|fell|stayed about the same|died out) after the drought\.$/);
  });
});

describe('twoLinksFrom', () => {
  it('finds the species two arrows away, in either direction', () => {
    expect(twoLinksFrom(grasslandWeb(), 'fox')).toEqual(['grass', 'hawk']);
    expect(twoLinksFrom(grasslandWeb(), 'grass')).toEqual(['fox', 'hawk']);
  });
});

describe('templateQuestion', () => {
  it.each([
    ['rose', 'rabbit rose after'],
    ['fell', 'rabbit fell after'],
    ['steady', 'rabbit stayed about the same after'],
    ['died out', 'rabbit died out after'],
  ] satisfies [Direction, string][])('explains the directions it is given when the outcome is %s', (direction, phrase) => {
    const asked = templateQuestion(grassland(), FOX_REMOVED, 'rabbit', { rabbit: direction });
    expect(asked.explanation).toContain(phrase);
  });

  it('names the event and the observed species and offers the fixed choices', () => {
    const asked = templateQuestion(grassland(), FOX_REMOVED, 'grass');
    expect(asked).toEqual({
      id: 'q-1',
      prompt: 'Remove the fox. What happens to the grass?',
      choices: [...WEB_CHOICES],
      observe: { kind: 'direction', species: 'grass' },
      explanation: 'In the model, the grass fell after the fox was removed.',
      cites: ['grass', 'fox'],
    });
  });

  it('takes its explanation from the run, so it agrees with what plays', () => {
    expect(templateQuestion(grassland(), FOX_REMOVED, 'rabbit').explanation).toBe('In the model, the rabbit rose after the fox was removed.');
    expect(templateQuestion(grasslandWeb(), DROUGHT, 'hawk')).toMatchObject({
      prompt: 'A drought hits. What happens to the hawk?',
      explanation: 'In the model, the hawk fell after the drought.',
      cites: ['hawk'],
    });
  });

  it('is accepted by the grounding check', () => {
    const asked = templateQuestion(grassland(), FOX_REMOVED, 'grass');
    expect(checkWebGrounding([asked], grassland())).toEqual({ ok: true, questions: [asked] });
  });
});

describe('checkWebGrounding', () => {
  it('accepts a question about a species that changes', () => {
    expect(checkWebGrounding([question()], grassland())).toEqual({ ok: true, questions: [question()] });
  });

  it.each([
    ['cites a missing species', question({ cites: ['grass', 'wolf'] }), 'q-1 cites missing species "wolf"'],
    ['observes a missing species', question({ observe: { kind: 'direction', species: 'wolf' } }), 'q-1 observes missing species "wolf"'],
    ['observes the removed species', question({ observe: { kind: 'direction', species: 'fox' } }), 'q-1 observes "fox", which the event removes'],
    ['offers other choices', question({ choices: ['Yes', 'No'] }), 'q-1 must offer the four standard choices'],
  ])('rejects a question that %s', (_case, bad, message) => {
    expect(checkWebGrounding([bad], grassland())).toEqual({ ok: false, errors: [message] });
  });

  it('judges against the suggested event when the web has none', () => {
    const web = grasslandWeb();
    const result = checkWebGrounding([question({ observe: { kind: 'direction', species: 'fox' } })], web);
    expect(result).toEqual({ ok: false, errors: ['q-1 observes "fox", which the event removes'] });
  });

  it('reports a malformed question list', () => {
    const result = checkWebGrounding([{ id: 'q-1' }], grassland());
    expect(result.ok).toBe(false);
  });
});
