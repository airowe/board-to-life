import { describe, expect, it } from 'vitest';
import { checkDescription, DESCRIPTION_LIMIT } from './description';
import { DESCRIPTION_EXAMPLES } from './examples';

describe('DESCRIPTION_EXAMPLES', () => {
  it('offers exactly four examples', () => {
    expect(DESCRIPTION_EXAMPLES).toHaveLength(4);
  });

  it.each(DESCRIPTION_EXAMPLES.map((example) => [example]))('%s is accepted as a description', (example) => {
    expect(example.length).toBeLessThanOrEqual(DESCRIPTION_LIMIT);
    expect(checkDescription(example)).toEqual({ ok: true, text: example });
  });
});
