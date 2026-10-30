import { describe, expect, it } from 'vitest';
import { checkDescription, DESCRIPTION_LIMIT } from './description';

const EMPTY = 'Type a description of the setup first.';
const TOO_LONG = 'Keep the description under 600 characters.';

describe('checkDescription', () => {
  it('limits a description to 600 characters', () => {
    expect(DESCRIPTION_LIMIT).toBe(600);
  });

  it.each([
    ['empty text', '', EMPTY],
    ['blank text', '   ', EMPTY],
    ['text over the limit', 'x'.repeat(601), TOO_LONG],
    ['a number', 42, EMPTY],
    ['null', null, EMPTY],
  ])('refuses %s', (_case, text, error) => {
    expect(checkDescription(text)).toEqual({ ok: false, error });
  });

  it('trims the text it accepts', () => {
    expect(checkDescription('  a ball  ')).toEqual({ ok: true, text: 'a ball' });
  });

  it('accepts text of exactly the limit', () => {
    const text = 'x'.repeat(DESCRIPTION_LIMIT);
    expect(checkDescription(text)).toEqual({ ok: true, text });
  });
});
