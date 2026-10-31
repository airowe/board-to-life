import { describe, expect, it } from 'vitest';
import { SUBJECTS } from '../subjects';
import { checkDescription, DESCRIPTION_LIMIT } from './description';
import { DESCRIPTION_EXAMPLES } from './examples';

const MIN_EXAMPLES = 3;
const PHYSICS_EXAMPLE_COUNT = 4;
const ECOSYSTEM_ANCHOR = 'grass, rabbits, foxes and hawks';
const GEOMETRY_EXAMPLES = [
  'Triangle ABC with a 50° angle at A and a 60° angle at B.',
  'Two parallel lines cut by a transversal, with one angle of 65° marked.',
  'Triangle ABC reflected over a vertical line MN.',
];

describe('DESCRIPTION_EXAMPLES', () => {
  it('keeps the four physics examples', () => {
    expect(DESCRIPTION_EXAMPLES.physics).toHaveLength(PHYSICS_EXAMPLE_COUNT);
  });

  it.each(SUBJECTS.map((subject) => [subject]))('%s offers at least three examples', (subject) => {
    expect(DESCRIPTION_EXAMPLES[subject].length).toBeGreaterThanOrEqual(MIN_EXAMPLES);
  });

  it('includes the grassland food web for ecosystem', () => {
    expect(DESCRIPTION_EXAMPLES.ecosystem.some((example) => example.includes(ECOSYSTEM_ANCHOR))).toBe(true);
  });

  it('offers the three geometry figures', () => {
    expect(DESCRIPTION_EXAMPLES.geometry).toEqual(GEOMETRY_EXAMPLES);
  });

  it.each(SUBJECTS.flatMap((subject) => DESCRIPTION_EXAMPLES[subject].map((example) => [subject, example])))(
    '%s example "%s" is accepted as a description',
    (_subject, example) => {
      expect(example.length).toBeLessThanOrEqual(DESCRIPTION_LIMIT);
      expect(checkDescription(example)).toEqual({ ok: true, text: example });
    },
  );
});
