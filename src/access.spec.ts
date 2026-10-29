import { describe, expect, it } from 'vitest';
import { ACCESS_HEADER, accessHeaders, rememberAccessCode } from './access';

const KEY = 'board-to-life:access-code';

const memoryStorage = (initial: Record<string, string> = {}): Pick<Storage, 'getItem' | 'setItem'> => {
  const values = new Map(Object.entries(initial));
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => void values.set(key, value) };
};

describe('rememberAccessCode', () => {
  it('takes the code from the link and keeps it', () => {
    const storage = memoryStorage();
    expect(rememberAccessCode('?code=abc123', storage)).toBe('abc123');
    expect(storage.getItem(KEY)).toBe('abc123');
  });

  it('uses the kept code when the link has none', () => {
    expect(rememberAccessCode('', memoryStorage({ [KEY]: 'kept' }))).toBe('kept');
  });

  it('prefers a new code in the link over the kept one', () => {
    expect(rememberAccessCode('?code=new', memoryStorage({ [KEY]: 'old' }))).toBe('new');
  });

  it('has no code when neither the link nor storage has one', () => {
    expect(rememberAccessCode('?other=1', memoryStorage())).toBeNull();
  });

  it('still reads the link when storage is unavailable', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(rememberAccessCode('?code=abc', broken)).toBe('abc');
    expect(rememberAccessCode('', broken)).toBeNull();
  });
});

describe('accessHeaders', () => {
  it('sends the code when there is one', () => {
    expect(accessHeaders('abc')).toEqual({ [ACCESS_HEADER]: 'abc' });
  });

  it('sends nothing without a code', () => {
    expect(accessHeaders(null)).toEqual({});
  });
});
