import { describe, expect, it } from 'vitest';
import { hasAccess } from './access';

const CODE = 'class-demo-42';

describe('hasAccess', () => {
  it.each([
    ['no code is required', undefined, undefined],
    ['no code is required, even when one is sent', '', 'anything'],
  ])('lets a request through when %s', (_case, expected, given) => {
    expect(hasAccess(expected, given)).toBe(true);
  });

  it('lets a request through with the right code', () => {
    expect(hasAccess(CODE, CODE)).toBe(true);
  });

  it.each([
    ['no code', undefined],
    ['an empty code', ''],
    ['a wrong code of the same length', 'class-demo-43'],
    ['a code that only starts the same', 'class-demo'],
  ])('turns away a request with %s', (_case, given) => {
    expect(hasAccess(CODE, given)).toBe(false);
  });
});
