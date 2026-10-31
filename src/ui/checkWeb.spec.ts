import { describe, expect, it } from 'vitest';
import { eatsArrow, grasslandWeb, speciesAt } from '../ecosystem/fixtures';
import { CHOICE_FOR, directionsForEvent, eventOf, templateQuestion } from '../ecosystem/questions';
import { suggestedEvent } from '../ecosystem/trophic';
import { arrowRowText, BACKWARD_NOTE, eventOptions, modelAnswerLine, speciesRowText, unfedWarnings } from './checkWeb';

const RABBIT_COUNT = 40;

describe('eventOptions', () => {
  const web = grasslandWeb();
  const options = eventOptions(web);

  it('lists a removal for every species once, plus drought', () => {
    expect(options.map((option) => option.label)).toEqual(['Remove grass', 'Remove rabbit', 'Remove fox', 'Remove hawk', 'Drought']);
    expect(new Set(options.map((option) => option.value)).size).toBe(options.length);
    expect(options.map((option) => option.event)).toEqual([
      { kind: 'remove', species: 'grass' },
      { kind: 'remove', species: 'rabbit' },
      { kind: 'remove', species: 'fox' },
      { kind: 'remove', species: 'hawk' },
      { kind: 'drought' },
    ]);
  });

  it('includes the suggested event among the options', () => {
    expect(options.filter((option) => JSON.stringify(option.event) === JSON.stringify(suggestedEvent(web)))).toHaveLength(1);
  });
});

describe('row text', () => {
  const grass = speciesAt('grass', 'producer', 100, 800);
  const rabbit = { ...speciesAt('rabbit', 'consumer', 400, 600), count: RABBIT_COUNT };
  const fox = speciesAt('fox', 'consumer', 700, 400);
  const web = { ...grasslandWeb(), species: [grass, rabbit, fox] };

  it('shows name, role and the written count', () => {
    expect(speciesRowText(rabbit)).toBe('rabbit · consumer · 40 written');
  });

  it('omits the count when none was written', () => {
    expect(speciesRowText(grass)).toBe('grass · producer');
  });

  it('names the eaten species first in an arrow row', () => {
    expect(arrowRowText(web, eatsArrow('a2', 'rabbit', 'fox'))).toBe('rabbit → fox');
  });

  it('words the backward note as a question to the teacher', () => {
    expect(BACKWARD_NOTE).toBe('This arrow may point from the eater to the eaten. Flip it?');
  });
});

describe('unfedWarnings', () => {
  it('warns once for every consumer with nothing to eat, by name', () => {
    const web = { ...grasslandWeb(), species: [...grasslandWeb().species, { ...speciesAt('deer', 'consumer', 900, 900), name: 'Deer' }] };
    expect(unfedWarnings(web)).toEqual(['Deer has nothing to eat in this web, so the model has none.']);
  });

  it('says nothing when every consumer has food', () => {
    expect(unfedWarnings(grasslandWeb())).toEqual([]);
  });
});

describe('modelAnswerLine', () => {
  it('gives the answer the class will see for the observed species', () => {
    const web = grasslandWeb();
    const event = eventOf(web);
    const directions = directionsForEvent(web, event);
    const question = templateQuestion(web, event, 'rabbit', directions);
    const expected = directions['rabbit'];
    if (expected === undefined) throw new Error('no direction for rabbit');
    expect(modelAnswerLine(question, directions)).toBe(`Model answer: ${CHOICE_FOR[expected]}`);
  });
});
