import { describe, expect, it } from 'vitest';
import { angleAt, positionsOf } from './derive';
import { clampToDrawing, insidePolygon, movePoint, pickPoint } from './edits';
import { FIT_TOLERANCE_DEGREES } from './fit';
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

describe('movePoint', () => {
  const CROSS = { x: 600, y: 400 };
  const MISREAD_CENTRE = { x: 440, y: 440 };
  const TEACHER_CONFIRMED = 1;

  const pointOf = (figure: ReturnType<typeof sample>, id: string) => figure.points.find((entry) => entry.id === id);

  const misreadRotation = () => {
    const figure = sample('rotation');
    return { ...figure, points: figure.points.map((entry) => (entry.id === 'O' ? { ...entry, ...MISREAD_CENTRE, confidence: 0.6 } : entry)) };
  };

  it('puts a misread centre where the teacher drops it and marks it confirmed', () => {
    expect(pointOf(movePoint(misreadRotation(), 'O', CROSS), 'O')).toEqual({ id: 'O', ...CROSS, confidence: TEACHER_CONFIRMED });
  });

  it('leaves every other point where it was when nothing written ties it to the moved one', () => {
    const before = misreadRotation();
    const after = movePoint(before, 'O', CROSS);
    expect(after.points.filter((entry) => entry.id !== 'O')).toEqual(before.points.filter((entry) => entry.id !== 'O'));
  });

  it.each([
    ['left and above', { x: -50, y: -80 }, { x: 0, y: 0 }],
    ['right and below', { x: 5000, y: 9000 }, { x: 1200, y: 800 }],
  ])('keeps a point dropped off the drawing (%s) on its edge', (_, dropped, kept) => {
    expect(pointOf(movePoint(misreadRotation(), 'O', dropped), 'O')).toMatchObject(kept);
  });

  it('returns the figure unchanged for a point it does not have', () => {
    const figure = misreadRotation();
    expect(movePoint(figure, 'Z', CROSS)).toBe(figure);
  });

  it('keeps the written angles true after a vertex is moved', () => {
    const moved = movePoint(sample('triangle'), 'C', { x: 450, y: 200 });
    const positions = positionsOf(moved);
    const corner = (at: string, from: string, to: string) => {
      const [a, f, t] = [positions[at], positions[from], positions[to]];
      return a && f && t ? angleAt(a, f, t) : null;
    };
    expect(Math.abs((corner('A', 'B', 'C') ?? 0) - 50)).toBeLessThanOrEqual(FIT_TOLERANCE_DEGREES);
    expect(Math.abs((corner('B', 'C', 'A') ?? 0) - 60)).toBeLessThanOrEqual(FIT_TOLERANCE_DEGREES);
  });
});
