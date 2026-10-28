import { describe, expect, it } from 'vitest';
import { linkPoints, SPRING_COILS } from './linkPoints';
import type { Link } from './schema';

const positions = new Map([
  ['a', { x: 0, y: 300 }],
  ['b', { x: 200, y: 300 }],
  ['wheel', { x: 100, y: 0 }],
]);
const at = (id: string) => positions.get(id) ?? null;
const link = (fields: Partial<Link>): Link => ({ id: 'l', kind: 'rope', from: 'a', to: 'b', length: 200, confidence: 1, ...fields }) as Link;

describe('linkPoints', () => {
  it('draws a rope straight between its ends', () => {
    expect(linkPoints(link({}), at)).toEqual([positions.get('a'), positions.get('b')]);
  });

  it('runs a rope over its pulley', () => {
    expect(linkPoints(link({ over: 'wheel' }), at)).toEqual([positions.get('a'), positions.get('wheel'), positions.get('b')]);
  });

  it('draws a spring as a zigzag from end to end', () => {
    const points = linkPoints(link({ kind: 'spring' }), at);
    expect(points[0]).toEqual(positions.get('a'));
    expect(points.at(-1)).toEqual(positions.get('b'));
    expect(points).toHaveLength(SPRING_COILS * 2 + 4);
  });

  it('draws nothing when an end is missing', () => {
    expect(linkPoints(link({ to: 'ghost' }), at)).toEqual([]);
  });
});
