import { describe, expect, it } from 'vitest';
import { parseSubject, SUBJECT_LABELS, SUBJECTS } from './subjects';

describe('parseSubject', () => {
  it.each([
    ['a missing value', undefined, 'physics'],
    ['physics', 'physics', 'physics'],
    ['ecosystem', 'ecosystem', 'ecosystem'],
    ['an unknown subject', 'geometry', null],
    ['a number', 42, null],
  ])('reads %s', (_name, value, expected) => {
    expect(parseSubject(value)).toBe(expected);
  });
});

describe('SUBJECT_LABELS', () => {
  it('labels every subject', () => {
    expect(SUBJECTS.map((subject) => SUBJECT_LABELS[subject])).toEqual(['Physics', 'Ecosystem']);
  });
});
