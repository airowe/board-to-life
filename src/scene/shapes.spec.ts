import { describe, expect, it } from 'vitest';
import { distanceTo, outlineOf, penetration } from './shapes';
import type { Body } from './schema';

const square = (x: number, y: number, size: number) => [
  { x: x - size / 2, y: y - size / 2 },
  { x: x + size / 2, y: y - size / 2 },
  { x: x + size / 2, y: y + size / 2 },
  { x: x - size / 2, y: y + size / 2 },
];

const domino: Body = { id: 'd', kind: 'domino', x: 100, y: 100, width: 20, height: 100, angle: 0, confidence: 1 };
const ball: Body = { id: 'b', kind: 'ball', x: 0, y: 0, radius: 30, confidence: 1 };
const ramp: Body = { id: 'r', kind: 'ramp', x1: 0, y1: 0, x2: 100, y2: 0, thickness: 10, confidence: 1 };
const cart: Body = { id: 'c', kind: 'cart', x: 0, y: 0, width: 100, height: 40, wheelRadius: 10, angle: 0, confidence: 1 };
const pivot: Body = { id: 'p', kind: 'pivot', x: 0, y: 0, confidence: 1 };

const extent = (points: { x: number; y: number }[]) => ({
  left: Math.min(...points.map((p) => p.x)),
  right: Math.max(...points.map((p) => p.x)),
  top: Math.min(...points.map((p) => p.y)),
  bottom: Math.max(...points.map((p) => p.y)),
});

describe('outlineOf', () => {
  it('traces an upright domino as its rectangle', () => {
    expect(extent(outlineOf(domino) ?? [])).toEqual({ left: 90, right: 110, top: 50, bottom: 150 });
  });

  it('traces a ramp as a band along its length', () => {
    expect(extent(outlineOf(ramp) ?? [])).toEqual({ left: 0, right: 100, top: -5, bottom: 5 });
  });

  it('includes a cart wheels below its body', () => {
    expect(extent(outlineOf(cart) ?? []).bottom).toBe(30);
  });

  it('keeps every point of a ball outline on its rim', () => {
    for (const point of outlineOf(ball) ?? []) expect(Math.hypot(point.x, point.y)).toBeCloseTo(30);
  });

  it('has no outline for a pivot, which nothing collides with', () => {
    expect(outlineOf(pivot)).toBeNull();
  });
});

describe('penetration', () => {
  it.each([
    { name: 'apart', other: square(30, 0, 10), depth: 0 },
    { name: 'touching edge to edge', other: square(20, 0, 10), depth: 0 },
    { name: 'overlapping by 4', other: square(16, 0, 10), depth: 4 },
    { name: 'one inside the other', other: square(0, 0, 10), depth: 20 },
  ])('measures squares $name', ({ other, depth }) => {
    expect(penetration(square(0, 0, 30), other)).toBeCloseTo(depth);
  });
});

describe('distanceTo', () => {
  it.each([
    { name: 'inside', point: { x: 0, y: 0 }, distance: 0 },
    { name: 'beside an edge', point: { x: 25, y: 0 }, distance: 20 },
    { name: 'off a corner', point: { x: 8, y: 9 }, distance: 5 },
  ])('measures a point $name', ({ point, distance }) => {
    expect(distanceTo(square(0, 0, 10), point)).toBeCloseTo(distance);
  });
});
