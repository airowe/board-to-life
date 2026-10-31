import { describe, expect, it } from 'vitest';
import { positionsOf } from './derive';
import { clampToDrawing, insidePolygon, pickPoint } from './edits';
import { GEOMETRY_SAMPLES } from './samples';
import type { View } from '../present/view';

const sample = (id: string) => {
  const found = GEOMETRY_SAMPLES.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`missing sample ${id}`);
  return found.figure;
};

const IDENTITY_VIEW: View = { scale: 1, offsetX: 0, offsetY: 0 };
const HALF_VIEW: View = { scale: 0.5, offsetX: 20, offsetY: 10 };
const REACH_PX = 30;
const JUST_INSIDE_REACH = 25;
const JUST_OUTSIDE_REACH = 40;

describe('pickPoint', () => {
  const figure = sample('triangle');
  const positions = positionsOf(figure);

  it('picks the point within reach', () => {
    expect(pickPoint(figure, positions, IDENTITY_VIEW, { x: 300 + JUST_INSIDE_REACH, y: 600 }, REACH_PX)).toBe('A');
  });

  it('misses a point outside reach', () => {
    expect(pickPoint(figure, positions, IDENTITY_VIEW, { x: 300 + JUST_OUTSIDE_REACH, y: 600 }, REACH_PX)).toBeNull();
  });

  it('maps screen pixels through the view', () => {
    const screen = { x: 800 * HALF_VIEW.scale + HALF_VIEW.offsetX, y: 600 * HALF_VIEW.scale + HALF_VIEW.offsetY };
    expect(pickPoint(figure, positions, HALF_VIEW, screen, REACH_PX)).toBe('B');
  });

  it('picks the nearest of two points inside reach', () => {
    const close = { ...positions, B: { x: 310, y: 600 } };
    expect(pickPoint(figure, close, IDENTITY_VIEW, { x: 308, y: 600 }, REACH_PX)).toBe('B');
  });

  it('ignores keys that are not figure points', () => {
    const withImage = { ...positions, 'A′': { x: 100, y: 100 } };
    expect(pickPoint(figure, withImage, IDENTITY_VIEW, { x: 100, y: 100 }, REACH_PX)).toBeNull();
  });
});

describe('insidePolygon', () => {
  const figure = sample('triangle');
  const positions = positionsOf(figure);
  const polygon = figure.polygons[0] ?? { id: 'none', vertices: [], confidence: 1 };

  it('is true inside the triangle', () => {
    expect(insidePolygon(positions, polygon, { x: 550, y: 500 })).toBe(true);
  });

  it('is false outside the triangle', () => {
    expect(insidePolygon(positions, polygon, { x: 100, y: 100 })).toBe(false);
  });

  it('is false when a vertex has no position', () => {
    expect(insidePolygon({}, polygon, { x: 550, y: 500 })).toBe(false);
  });
});

describe('clampToDrawing', () => {
  const figure = sample('triangle');
  const { width, height } = figure.drawing;

  it.each([
    [{ x: -50, y: -20 }, { x: 0, y: 0 }],
    [{ x: width + 50, y: height + 20 }, { x: width, y: height }],
    [{ x: 100, y: 200 }, { x: 100, y: 200 }],
  ])('clamps %j to %j', (input, expected) => {
    expect(clampToDrawing(figure, input)).toEqual(expected);
  });
});
