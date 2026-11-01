import { describe, expect, it } from 'vitest';
import { loadSubject, saveSubject, SUBJECT_STORAGE_KEY } from './subjectChoice';

const memoryStorage = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
};
const throwingStorage = {
  getItem: (): string | null => {
    throw new Error('blocked');
  },
  setItem: (): void => {
    throw new Error('blocked');
  },
};

describe('subject choice', () => {
  it('stores under board-to-life.subject', () => {
    expect(SUBJECT_STORAGE_KEY).toBe('board-to-life.subject');
  });

  it.each([
    ['ecosystem', 'ecosystem'],
    ['physics', 'physics'],
    ['geometry', 'geometry'],
    ['chemistry', 'ecosystem'],
    ['', 'ecosystem'],
  ])('loads stored %j as %s', (stored, expected) => {
    expect(loadSubject(memoryStorage({ [SUBJECT_STORAGE_KEY]: stored }))).toBe(expected);
  });

  it('opens new visitors on the ecosystem subject', () => {
    expect(loadSubject(memoryStorage())).toBe('ecosystem');
  });

  it('opens on the ecosystem subject when storage throws', () => {
    expect(loadSubject(throwingStorage)).toBe('ecosystem');
  });

  it('round-trips a saved subject', () => {
    const storage = memoryStorage();
    saveSubject(storage, 'ecosystem');
    expect(loadSubject(storage)).toBe('ecosystem');
  });

  it('ignores a storage that refuses writes', () => {
    expect(() => saveSubject(throwingStorage, 'ecosystem')).not.toThrow();
  });
});
