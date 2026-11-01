import { describe, expect, it } from 'vitest';
import { objectPrompt, PICTURE_STYLE } from './style';

// A variable specifier: the script is plain JavaScript with no type declarations.
const SUBJECTS_MODULE = '../../scripts/library-subjects.mjs';

describe('picture style', () => {
  it('PICTURE_STYLE equals STYLE from scripts/library-subjects.mjs', async () => {
    const { STYLE } = (await import(/* @vite-ignore */ SUBJECTS_MODULE)) as { STYLE: string };
    expect(PICTURE_STYLE).toBe(STYLE);
  });

  it('draws the subject from the side, facing right, on pure white, in the house style', () => {
    const prompt = objectPrompt('jellyfish');
    expect(prompt.startsWith('A single jellyfish, seen from the side, facing right, isolated on a plain pure white background')).toBe(true);
    expect(prompt.endsWith(PICTURE_STYLE)).toBe(true);
  });
});
