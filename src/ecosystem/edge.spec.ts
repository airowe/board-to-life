import { describe, expect, it } from 'vitest';
import { edgePoint } from './edge';
import { speciesAt } from './fixtures';

describe('edgePoint', () => {
  const box = speciesAt('rabbit', 'consumer', 400, 600);
  const halfWidth = box.width / 2;
  const halfHeight = box.height / 2;

  it.each([
    ['right', { x: 900, y: 600 }, { x: 400 + halfWidth, y: 600 }],
    ['left', { x: 0, y: 600 }, { x: 400 - halfWidth, y: 600 }],
    ['above', { x: 400, y: 0 }, { x: 400, y: 600 - halfHeight }],
    ['below', { x: 400, y: 1000 }, { x: 400, y: 600 + halfHeight }],
  ])('clips a target to the %s edge', (_side, target, expected) => {
    expect(edgePoint(box, target)).toEqual(expected);
  });

  it('keeps a diagonal on the box boundary', () => {
    const point = edgePoint(box, { x: 400 + 10 * halfWidth, y: 600 + 10 * halfHeight });
    expect(point).toEqual({ x: 400 + halfWidth, y: 600 + halfHeight });
  });

  it('returns the target itself when it lies inside the box', () => {
    const inside = { x: 410, y: 610 };
    expect(edgePoint(box, inside)).toEqual(inside);
  });

  it('returns the centre rather than NaN when the target is the centre itself', () => {
    expect(edgePoint(box, { x: box.x, y: box.y })).toEqual({ x: box.x, y: box.y });
  });
});
