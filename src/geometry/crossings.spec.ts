import { describe, expect, it } from 'vitest';
import { CROSSING_MARGIN_FRACTION, CROSSING_SNAP_FRACTION, CROSSING_TOLERANCE_PIXELS, crossingsInPlace, crossingsOf, placeCrossings } from './crossings';
import { distance, positionsOf, type Point, type Positions } from './derive';
import { fitWrittenValues } from './fit';
import { PARALLEL_READ_CASE_4_RUN_2 } from './fit.fixtures';
import { followCrossings } from './focus';
import { GEOMETRY_SAMPLES } from './samples';
import type { Figure } from './schema';

const CONFIDENCE = 0.9;
const DRAWING = { width: 1000, height: 1000 };
const MID = 500;
const FAR = 900;
const NEAR = 100;
const OFF_BY = 20;
const TOO_FAR = CROSSING_SNAP_FRACTION * DRAWING.width * 2;

const point = (id: string, x: number, y: number) => ({ id, x, y, confidence: CONFIDENCE });
const line = (from: string, to: string) => ({ id: `l${from}${to}`, from, to, confidence: CONFIDENCE });

const cross = (crossing: Point): Figure => ({
  version: 1,
  drawing: DRAWING,
  points: [point('A', NEAR, MID), point('B', FAR, MID), point('C', MID, NEAR), point('D', MID, FAR), point('X', crossing.x, crossing.y)],
  segments: [line('A', 'B')],
  lines: [],
  rays: [line('C', 'D')],
  circles: [],
  polygons: [],
  marks: [],
  transformations: [],
  labels: [],
  unknownMarks: [],
  focus: null,
});

const at = (positions: Positions, id: string): Point => {
  const found = positions[id];
  if (found === undefined) throw new Error(`no point ${id}`);
  return found;
};

describe('crossingsOf', () => {
  it('finds a point drawn near where two drawn lines meet, with the two lines', () => {
    expect(crossingsOf(cross({ x: MID + OFF_BY, y: MID - OFF_BY }))).toEqual([
      { point: 'X', lines: [['A', 'B'], ['C', 'D']] },
    ]);
  });

  it('ignores a point too far from any meeting of two lines', () => {
    expect(crossingsOf(cross({ x: MID + TOO_FAR, y: MID + TOO_FAR }))).toEqual([]);
  });

  it('never treats a line end as a crossing', () => {
    expect(crossingsOf(cross({ x: MID, y: MID })).map(({ point: id }) => id)).toEqual(['X']);
  });

  it('finds both unnamed crossings in a read of the parallel-lines board', () => {
    expect(crossingsOf(PARALLEL_READ_CASE_4_RUN_2)).toEqual([
      { point: 'P1', lines: [['P', 'Q'], ['T', 'U']] },
      { point: 'P2', lines: [['R', 'S'], ['T', 'U']] },
    ]);
  });
});

describe('placeCrossings', () => {
  it('moves each crossing to where its two lines meet and leaves every other point alone', () => {
    const figure = cross({ x: MID + OFF_BY, y: MID - OFF_BY });
    const before = positionsOf(figure);
    const placed = placeCrossings(before, crossingsOf(figure), figure.drawing);
    expect(distance(at(placed, 'X'), { x: MID, y: MID })).toBeLessThan(CROSSING_TOLERANCE_PIXELS);
    expect({ ...placed, X: before.X }).toEqual(before);
  });
});

describe('crossingsInPlace', () => {
  it('is false for a crossing off its lines and true once it is placed', () => {
    const figure = cross({ x: MID + OFF_BY, y: MID - OFF_BY });
    const crossings = crossingsOf(figure);
    const before = positionsOf(figure);
    expect(crossingsInPlace(before, crossings, figure.drawing)).toBe(false);
    expect(crossingsInPlace(placeCrossings(before, crossings, figure.drawing), crossings, figure.drawing)).toBe(true);
  });
});

const sampleFigure = (id: string): Figure => {
  const sample = GEOMETRY_SAMPLES.find((entry) => entry.id === id);
  if (sample === undefined) throw new Error(`no sample ${id}`);
  return sample.figure;
};

const DRAGGED_T = { x: 650, y: 150 };
const NEAR_PARALLEL_T = { x: 1100, y: 300.01 };
const NEAR_P1 = { x: 525, y: 305 };
const NEARLY_LEVEL_U = { x: 100, y: 300.02 };

const parallelAndTriangle = (extra: Partial<Figure>): Figure => {
  const parallel = sampleFigure('parallel');
  const triangle = sampleFigure('triangle');
  return {
    ...parallel,
    points: [...parallel.points, ...triangle.points, ...(extra.points ?? [])],
    segments: [...triangle.segments, ...(extra.segments ?? [])],
    polygons: triangle.polygons,
    transformations: extra.transformations ?? [],
    labels: extra.labels ?? [],
  };
};

const ROTATION_CENTRE_NEAR_A = parallelAndTriangle({
  points: [point('O', 330, 625)],
  transformations: [{ id: 'turn', kind: 'rotate', centre: 'O', degrees: 90, polygon: 'abc', confidence: CONFIDENCE }],
});
const LABELLED_POINT_NEAR_B = parallelAndTriangle({
  points: [point('D', 840, 630)],
  labels: [{ id: 'tD', text: 'D', x: 860, y: 650, confidence: CONFIDENCE }],
});
const POINT_NEAR_EXTENSIONS = parallelAndTriangle({
  points: [point('E', 100, 750), point('F', 200, 750), point('G', 1000, 580), point('H', 1000, 680), point('X', 990, 745)],
  segments: [line('E', 'F'), line('G', 'H')],
});

describe('points that are not crossings', () => {
  it.each<[string, Figure, string]>([
    ['a rotation centre drawn near a triangle vertex', ROTATION_CENTRE_NEAR_A, 'O'],
    ['a labelled point drawn near a triangle vertex', LABELLED_POINT_NEAR_B, 'D'],
    ['a point near where two segments would meet if extended', POINT_NEAR_EXTENSIONS, 'X'],
  ])('%s is not a crossing, and neither the fit nor a drag moves it', (_case, figure, id) => {
    const drawn = at(positionsOf(figure), id);
    expect(crossingsOf(figure).map(({ point: crossing }) => crossing)).toEqual(['P1', 'P2']);
    const result = fitWrittenValues(figure);
    if (!result.ok) throw new Error(result.conflicts.join(' '));
    expect(at(positionsOf(result.figure), id)).toEqual(drawn);
    const followed = followCrossings({ ...positionsOf(figure), T: DRAGGED_T }, figure, ['m1', 'm2']);
    expect(at(followed, id)).toEqual(drawn);
  });

  const nearP1 = (extra: Partial<Figure>): Figure => {
    const parallel = sampleFigure('parallel');
    return {
      ...parallel,
      points: [...parallel.points, point('A', NEAR, NEAR), point('B', NEAR, FAR), point('Z', NEAR_P1.x, NEAR_P1.y)],
      ...extra,
    };
  };

  it.each<[string, Partial<Figure>]>([
    ['a polygon vertex', { polygons: [{ id: 'abz', vertices: ['A', 'B', 'Z'], confidence: CONFIDENCE }] }],
    ['a transformation centre', { transformations: [{ id: 'turn', kind: 'rotate', centre: 'Z', degrees: 90, polygon: 'abz', confidence: CONFIDENCE }] }],
    ['a labelled point', { labels: [{ id: 'tZ', text: 'Z', x: NEAR_P1.x, y: NEAR_P1.y, confidence: CONFIDENCE }] }],
  ])('never treats %s as a crossing, even right beside one', (_case, extra) => {
    expect(crossingsOf(nearP1(extra)).map(({ point: crossing }) => crossing)).toEqual(['P1', 'P2']);
  });

  it('keeps every crossing on the drawing when T is dragged nearly level with P', () => {
    const figure = sampleFigure('parallel');
    const followed = followCrossings({ ...positionsOf(figure), T: NEAR_PARALLEL_T }, figure, ['m1', 'm2']);
    const margin = CROSSING_MARGIN_FRACTION * figure.drawing.width;
    for (const id of ['P1', 'P2']) {
      const { x, y } = at(followed, id);
      expect(x).toBeGreaterThanOrEqual(-margin);
      expect(x).toBeLessThanOrEqual(figure.drawing.width + margin);
      expect(y).toBeGreaterThanOrEqual(-margin);
      expect(y).toBeLessThanOrEqual(figure.drawing.height + margin);
    }
  });

  it('keeps a crossing where it was when its two lines meet far off the drawing', () => {
    const figure = sampleFigure('parallel');
    const drawn = positionsOf(figure);
    const followed = followCrossings({ ...drawn, T: NEAR_PARALLEL_T, U: NEARLY_LEVEL_U }, figure, ['m1', 'm2']);
    expect(at(followed, 'P1')).toEqual(at(drawn, 'P1'));
    expect(at(followed, 'P2')).toEqual(at(drawn, 'P2'));
  });
});
