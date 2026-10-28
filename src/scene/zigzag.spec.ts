import { describe, expect, it } from 'vitest';
import { zigzag } from './zigzag';

const FROM = { x: 100, y: 100 };
const TO = { x: 100, y: 400 };
const COILS = 6;
const AMPLITUDE = 14;

describe('zigzag', () => {
  const points = zigzag(FROM, TO, COILS, AMPLITUDE);

  it('starts and ends exactly at the two ends', () => {
    expect(points[0]).toEqual(FROM);
    expect(points.at(-1)).toEqual(TO);
  });

  it('swings to alternate sides, by the amplitude, once per half coil', () => {
    const sides = points.slice(2, -2).map((point) => point.x - FROM.x);
    expect(sides).toHaveLength(COILS * 2);
    sides.forEach((side, index) => expect(side).toBeCloseTo(index % 2 === 0 ? AMPLITUDE : -AMPLITUDE, 9));
  });

  it('keeps straight leads at both ends so it joins the things it links', () => {
    expect(points[1]?.x).toBeCloseTo(FROM.x, 9);
    expect(points.at(-2)?.x).toBeCloseTo(TO.x, 9);
  });

  it('degrades to a straight line when the ends meet', () => {
    expect(zigzag(FROM, FROM, COILS, AMPLITUDE).every((point) => point.x === FROM.x && point.y === FROM.y)).toBe(true);
  });
});
