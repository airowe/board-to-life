import { describe, expect, it } from 'vitest';
import { MAX_LONG_EDGE, fitWithin } from './downscale';

describe('fitWithin', () => {
  it.each([
    ['a landscape phone photo', 4032, 3024, { width: 1600, height: 1200 }],
    ['a portrait phone photo', 3024, 4032, { width: 1200, height: 1600 }],
    ['a square photo', 3000, 3000, { width: 1600, height: 1600 }],
    ['an odd ratio that needs rounding', 4000, 2251, { width: 1600, height: 900 }],
  ])('scales %s so the long edge is the maximum', (_case, width, height, expected) => {
    expect(fitWithin(width, height, MAX_LONG_EDGE)).toEqual(expected);
  });

  it.each([
    ['already small', 1200, 800],
    ['exactly the maximum', 1600, 900],
  ])('leaves an image that is %s unchanged', (_case, width, height) => {
    expect(fitWithin(width, height, MAX_LONG_EDGE)).toEqual({ width, height });
  });

  it('never returns a zero dimension', () => {
    expect(fitWithin(10_000, 1, MAX_LONG_EDGE)).toEqual({ width: 1600, height: 1 });
  });
});
