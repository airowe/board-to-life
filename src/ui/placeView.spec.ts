import { describe, expect, it } from 'vitest';
import { CROSSFADE_SECONDS, LABEL_FADE_SECONDS, MAX_FADE_STEP_SECONDS, crossfadeBlend, labelAlpha } from './placeView';

describe('crossfadeBlend', () => {
  const SINCE = 10;

  it.each([
    [SINCE, 0],
    [SINCE + CROSSFADE_SECONDS / 2, 0.5],
    [SINCE + CROSSFADE_SECONDS, 1],
    [SINCE + CROSSFADE_SECONDS * 4, 1],
  ])('at %s s is %s of the way to the new picture', (seconds, expected) => {
    expect(crossfadeBlend(seconds, SINCE, false)).toBeCloseTo(expected, 6);
  });

  it('is complete at once under reduced motion', () => {
    expect(crossfadeBlend(SINCE, SINCE, true)).toBe(1);
  });
});

describe('labelAlpha', () => {
  const STEP = MAX_FADE_STEP_SECONDS / 2;

  it('fades a present label in by the time that passed', () => {
    expect(labelAlpha(0, true, STEP, false)).toBeCloseTo(STEP / LABEL_FADE_SECONDS, 6);
  });

  it('fades a dropped label out by the time that passed', () => {
    expect(labelAlpha(1, false, STEP, false)).toBeCloseTo(1 - STEP / LABEL_FADE_SECONDS, 6);
  });

  it('advances at most MAX_FADE_STEP_SECONDS however long the gap', () => {
    expect(labelAlpha(0, true, 60, false)).toBeCloseTo(MAX_FADE_STEP_SECONDS / LABEL_FADE_SECONDS, 6);
  });

  it.each([
    [true, 1],
    [false, 0],
  ])('under reduced motion a label that is present: %s jumps straight to %s', (present, expected) => {
    expect(labelAlpha(0.3, present, 0, true)).toBe(expected);
  });
});
