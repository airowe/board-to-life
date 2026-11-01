import { describe, expect, it } from 'vitest';
import { SUBJECTS } from '../subjects';
import { SAMPLE_PICKS } from './capture';
import { HEROES } from './hero';

describe('HEROES', () => {
  it.each(SUBJECTS)('pairs a %s sample board with its scene, so "Try this board" runs a real sample', (subject) => {
    const hero = HEROES[subject];
    expect(SAMPLE_PICKS[subject]).toContainEqual({ url: hero.board, title: hero.title });
    expect(hero.scene).toBe(`/hero/${subject}.webp`);
  });
});
