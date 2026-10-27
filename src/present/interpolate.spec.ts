import { describe, expect, it } from 'vitest';
import { interpolate } from './interpolate';

const previous = [
  { id: 'ball', x: 0, y: 10, angle: 0 },
  { id: 'domino-1', x: 100, y: 100, angle: 1 },
];
const current = [
  { id: 'ball', x: 10, y: 30, angle: 2 },
  { id: 'domino-1', x: 100, y: 100, angle: 1.5 },
];

describe('interpolate', () => {
  it.each([
    [0, previous],
    [1, current],
  ])('returns the exact state at alpha %i', (alpha, expected) => {
    expect(interpolate(previous, current, alpha)).toEqual(expected);
  });

  it('blends positions and angles linearly between steps', () => {
    expect(interpolate(previous, current, 0.25)).toEqual([
      { id: 'ball', x: 2.5, y: 15, angle: 0.5 },
      { id: 'domino-1', x: 100, y: 100, angle: 1.125 },
    ]);
  });

  it.each([
    [-0.5, previous],
    [1.7, current],
  ])('clamps alpha %d into the step', (alpha, expected) => {
    expect(interpolate(previous, current, alpha)).toEqual(expected);
  });

  it('uses the current state for a body with no previous state', () => {
    const extra = { id: 'block-1', x: 5, y: 5, angle: 0 };
    expect(interpolate(previous, [...current, extra], 0.5)).toContainEqual(extra);
  });
});
