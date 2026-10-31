import { describe, expect, it } from 'vitest';
import {
  MEASURE_SCALE_UNITLESS,
  angleAt,
  angleSum,
  angleSumOf,
  area,
  areParallel,
  displayLength,
  distance,
  imageOf,
  perimeter,
  polygonAngles,
  SHAPE_NAMES,
  positionsOf,
  screenSweepRadians,
  transformAt,
  type Point,
  type Positions,
} from './derive';
import type { Figure, Polygon, Transformation } from './schema';

const CONFIDENCE = 0.9;
const DRAWING = { width: 1000, height: 1000 };
const PRECISION = 2;
const UNIT_SCALE = 100;
const RIGHT_ANGLE = 90;
const TRIANGLE_SUM = 180;
const SQUARE_SUM = 360;
const SMALL_ANGLE_TOLERANCE = 1;

const point = (id: string, x: number, y: number) => ({ id, x, y, confidence: CONFIDENCE });
const polygonOf = (id: string, vertices: string[]): Polygon => ({ id, vertices, confidence: CONFIDENCE });

const triangle345: Positions = { A: { x: 0, y: 0 }, B: { x: 4 * UNIT_SCALE, y: 0 }, C: { x: 0, y: 3 * UNIT_SCALE } };
const triangle = polygonOf('ABC', ['A', 'B', 'C']);
const square: Positions = {
  A: { x: 0, y: 0 },
  B: { x: 100, y: 0 },
  C: { x: 100, y: 100 },
  D: { x: 0, y: 100 },
};
const squarePolygon = polygonOf('ABCD', ['A', 'B', 'C', 'D']);

const figureWith = (marks: Figure['marks']): Figure => ({
  version: 1,
  drawing: DRAWING,
  points: [point('A', 0, 0), point('B', 200, 0), point('C', 600, 0)],
  segments: [],
  lines: [],
  rays: [],
  circles: [],
  polygons: [],
  marks,
  transformations: [],
  labels: [],
  unknownMarks: [],
  focus: null,
});

const at = (positions: Positions, id: string): Point => {
  const found = positions[id];
  if (found === undefined) throw new Error(`no position for ${id}`);
  return found;
};

const expectPositionsClose = (actual: Positions, expected: Positions) => {
  expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
  for (const [id, expectedPoint] of Object.entries(expected)) {
    expect(at(actual, id).x).toBeCloseTo(expectedPoint.x, PRECISION);
    expect(at(actual, id).y).toBeCloseTo(expectedPoint.y, PRECISION);
  }
};

describe('positionsOf', () => {
  it('keys each point id to its coordinates', () => {
    expect(positionsOf(figureWith([]))).toEqual({ A: { x: 0, y: 0 }, B: { x: 200, y: 0 }, C: { x: 600, y: 0 } });
  });
});

describe('measurements', () => {
  it('measures a 3-4-5 triangle', () => {
    const [atA, atB, atC] = polygonAngles(triangle345, triangle);
    expect(atA).toBeCloseTo(RIGHT_ANGLE, PRECISION);
    expect(atB).toBeCloseTo(36.87, PRECISION);
    expect(atC).toBeCloseTo(53.13, PRECISION);
    expect(angleSum(triangle345, triangle)).toBeCloseTo(TRIANGLE_SUM, PRECISION);
    expect(area(triangle345, triangle)).toBeCloseTo(6 * UNIT_SCALE * UNIT_SCALE, PRECISION);
    expect(perimeter(triangle345, triangle)).toBeCloseTo(12 * UNIT_SCALE, PRECISION);
  });

  it('sums a square to 360', () => {
    expect(angleSum(square, squarePolygon)).toBeCloseTo(SQUARE_SUM, PRECISION);
  });

  it('reports a concave vertex as a reflex interior angle', () => {
    const arrowhead: Positions = { A: { x: 0, y: 0 }, B: { x: 100, y: 50 }, C: { x: 200, y: 0 }, D: { x: 100, y: 200 } };
    const angles = polygonAngles(arrowhead, polygonOf('ABCD', ['A', 'B', 'C', 'D']));
    expect(angles[1] ?? 0).toBeGreaterThan(TRIANGLE_SUM);
    expect(angleSum(arrowhead, polygonOf('ABCD', ['A', 'B', 'C', 'D']))).toBeCloseTo(SQUARE_SUM, PRECISION);
  });

  it('measures distance', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('gives null for an angle with a zero-length ray', () => {
    expect(angleAt({ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 9, y: 5 })).toBeNull();
    expect(angleAt({ x: 5, y: 5 }, { x: 9, y: 5 }, { x: 5, y: 5 })).toBeNull();
  });

  it('gives null, never NaN, when points coincide', () => {
    const coincident: Positions = { A: { x: 7, y: 7 }, B: { x: 7, y: 7 }, C: { x: 7, y: 7 } };
    expect(polygonAngles(coincident, triangle)).toEqual([null, null, null]);
    expect(angleSum(coincident, triangle)).toBeNull();
    expect(area(coincident, triangle)).toBeNull();
    expect(perimeter(coincident, triangle)).toBe(0);
  });

  it('gives null area for a collinear triangle', () => {
    const collinear: Positions = { A: { x: 0, y: 0 }, B: { x: 100, y: 100 }, C: { x: 300, y: 300 } };
    expect(area(collinear, triangle)).toBeNull();
  });

  it('gives null when a polygon vertex has no position', () => {
    expect(area({ A: { x: 0, y: 0 } }, triangle)).toBeNull();
    expect(angleSum({ A: { x: 0, y: 0 } }, triangle)).toBeNull();
  });
});

describe('areParallel', () => {
  const positions: Positions = {
    A: { x: 0, y: 0 },
    B: { x: 100, y: 0 },
    C: { x: 0, y: 50 },
    D: { x: 300, y: 50 },
    E: { x: 0, y: 100 },
    F: { x: 100, y: 130 },
    Z: { x: 0, y: 0 },
  };

  it('recognises parallel lines whatever their direction', () => {
    expect(areParallel(positions, ['A', 'B'], ['C', 'D'], SMALL_ANGLE_TOLERANCE)).toBe(true);
    expect(areParallel(positions, ['A', 'B'], ['D', 'C'], SMALL_ANGLE_TOLERANCE)).toBe(true);
  });

  it('rejects lines that diverge by more than the tolerance', () => {
    expect(areParallel(positions, ['A', 'B'], ['E', 'F'], SMALL_ANGLE_TOLERANCE)).toBe(false);
  });

  it('gives null for a zero-length line', () => {
    expect(areParallel(positions, ['A', 'Z'], ['C', 'D'], SMALL_ANGLE_TOLERANCE)).toBeNull();
  });
});

const reflect = (mirror: [string, string]): Transformation => ({
  id: 't',
  kind: 'reflect',
  mirror,
  polygon: 'P',
  confidence: CONFIDENCE,
});

describe('imageOf', () => {
  const polygon = polygonOf('P', ['A', 'B', 'C']);

  it('reflects over a vertical mirror', () => {
    const positions: Positions = {
      A: { x: 500, y: 300 },
      B: { x: 550, y: 300 },
      C: { x: 500, y: 350 },
      M1: { x: 600, y: 0 },
      M2: { x: 600, y: 900 },
    };
    const image = imageOf(positions, reflect(['M1', 'M2']), polygon);
    expectPositionsClose(image, { 'A′': { x: 700, y: 300 }, 'B′': { x: 650, y: 300 }, 'C′': { x: 700, y: 350 } });
  });

  it('returns the original positions when the mirror points coincide', () => {
    const positions: Positions = {
      A: { x: 500, y: 300 },
      B: { x: 550, y: 300 },
      C: { x: 500, y: 350 },
      M1: { x: 600, y: 10 },
      M2: { x: 600, y: 10 },
    };
    const original = { 'A′': at(positions, 'A'), 'B′': at(positions, 'B'), 'C′': at(positions, 'C') };
    expect(imageOf(positions, reflect(['M1', 'M2']), polygon)).toEqual(original);
    expect(transformAt(positions, reflect(['M1', 'M2']), 0.5, polygon)).toEqual(original);
  });

  it('rotates counterclockwise as seen on the board', () => {
    const positions: Positions = { A: { x: 700, y: 400 }, B: { x: 700, y: 400 }, C: { x: 700, y: 400 }, O: { x: 600, y: 400 } };
    const rotate: Transformation = { id: 't', kind: 'rotate', centre: 'O', degrees: 90, polygon: 'P', confidence: CONFIDENCE };
    expect(at(imageOf(positions, rotate, polygon), 'A′').x).toBeCloseTo(600, PRECISION);
    expect(at(imageOf(positions, rotate, polygon), 'A′').y).toBeCloseTo(300, PRECISION);
    const clockwise = { ...rotate, degrees: -90 };
    expect(at(imageOf(positions, clockwise, polygon), 'A′').y).toBeCloseTo(500, PRECISION);
  });

  it('translates by the arrow', () => {
    const positions: Positions = {
      A: { x: 10, y: 20 },
      B: { x: 30, y: 40 },
      C: { x: 50, y: 60 },
      S: { x: 100, y: 100 },
      E: { x: 300, y: 150 },
    };
    const translate: Transformation = { id: 't', kind: 'translate', from: 'S', to: 'E', polygon: 'P', confidence: CONFIDENCE };
    expectPositionsClose(imageOf(positions, translate, polygon), {
      'A′': { x: 210, y: 70 },
      'B′': { x: 230, y: 90 },
      'C′': { x: 250, y: 110 },
    });
  });

  it('dilates so that area grows by the square of the factor', () => {
    const positions: Positions = { ...triangle345, O: { x: 0, y: 0 } };
    const dilate: Transformation = { id: 't', kind: 'dilate', centre: 'O', factor: 2, polygon: 'P', confidence: CONFIDENCE };
    const image = imageOf(positions, dilate, polygon);
    const imageArea = area({ A: at(image, 'A′'), B: at(image, 'B′'), C: at(image, 'C′') }, triangle);
    expect(imageArea).toBeCloseTo(4 * (area(triangle345, triangle) as number), PRECISION);
  });
});

describe('transformAt', () => {
  const polygon = polygonOf('P', ['A', 'B', 'C']);
  const base: Positions = { A: { x: 500, y: 300 }, B: { x: 550, y: 320 }, C: { x: 480, y: 360 } };
  const withHelpers: Positions = {
    ...base,
    M1: { x: 600, y: 0 },
    M2: { x: 600, y: 900 },
    O: { x: 600, y: 400 },
    S: { x: 100, y: 100 },
    E: { x: 300, y: 150 },
  };
  const mirror = reflect(['M1', 'M2']);
  const rotate: Transformation = { id: 't', kind: 'rotate', centre: 'O', degrees: 135, polygon: 'P', confidence: CONFIDENCE };
  const translate: Transformation = { id: 't', kind: 'translate', from: 'S', to: 'E', polygon: 'P', confidence: CONFIDENCE };
  const dilate: Transformation = { id: 't', kind: 'dilate', centre: 'O', factor: 2.5, polygon: 'P', confidence: CONFIDENCE };
  const cases: [string, Transformation][] = [
    ['reflect', mirror],
    ['rotate', rotate],
    ['translate', translate],
    ['dilate', dilate],
  ];

  it.each(cases)('%s starts at the original vertices and ends at the image', (_kind, transformation) => {
    expectPositionsClose(transformAt(withHelpers, transformation, 0, polygon), {
      'A′': at(base, 'A'),
      'B′': at(base, 'B'),
      'C′': at(base, 'C'),
    });
    expectPositionsClose(transformAt(withHelpers, transformation, 1, polygon), imageOf(withHelpers, transformation, polygon));
  });

  it('puts every vertex on the mirror halfway through a reflection', () => {
    const halfway = transformAt(withHelpers, reflect(['M1', 'M2']), 0.5, polygon);
    for (const id of ['A′', 'B′', 'C′']) expect(at(halfway, id).x).toBeCloseTo(600, PRECISION);
  });

  it('turns by a fraction of the angle, translates by a fraction of the arrow and scales by a fraction of the factor', () => {
    const rotated = at(transformAt(withHelpers, rotate, 0.5, polygon), 'A′');
    const expected = at(imageOf(withHelpers, { ...rotate, degrees: 67.5 }, polygon), 'A′');
    expect(rotated.x).toBeCloseTo(expected.x, PRECISION);
    expect(rotated.y).toBeCloseTo(expected.y, PRECISION);
    expect(at(transformAt(withHelpers, translate, 0.5, polygon), 'A′')).toEqual({ x: 600, y: 325 });
    expect(at(transformAt(withHelpers, dilate, 0.5, polygon), 'A′').x).toBeCloseTo(600 + (500 - 600) * 1.75, PRECISION);
  });
});

describe('displayLength', () => {
  const positions: Positions = { A: { x: 0, y: 0 }, B: { x: 200, y: 0 }, C: { x: 600, y: 0 } };

  it('scales from the first length mark that has a value', () => {
    const figure = figureWith([
      { id: 'l0', kind: 'length', from: 'A', to: 'C', confidence: CONFIDENCE },
      { id: 'l1', kind: 'length', from: 'A', to: 'B', value: 5, unit: 'cm', confidence: CONFIDENCE },
    ]);
    expect(displayLength(figure, positions, 'A', 'C')).toEqual({ value: 15, unit: 'cm' });
    expect(displayLength(figure, positions, 'B', 'C')).toEqual({ value: 10, unit: 'cm' });
  });

  it('falls back to drawing units over the unitless scale', () => {
    expect(MEASURE_SCALE_UNITLESS).toBe(100);
    expect(displayLength(figureWith([]), positions, 'B', 'C')).toEqual({ value: 4, unit: null });
  });

  it('keeps unitless marks unitless and ignores a mark drawn with zero length', () => {
    const unitless = figureWith([{ id: 'l1', kind: 'length', from: 'A', to: 'B', value: 4, confidence: CONFIDENCE }]);
    expect(displayLength(unitless, positions, 'A', 'C')).toEqual({ value: 12, unit: null });
    const degenerate = figureWith([{ id: 'l1', kind: 'length', from: 'A', to: 'A', value: 4, unit: 'cm', confidence: CONFIDENCE }]);
    expect(displayLength(degenerate, positions, 'B', 'C')).toEqual({ value: 4, unit: null });
  });
});

describe('screenSweepRadians', () => {
  it.each([
    [RIGHT_ANGLE, -Math.PI / 2],
    [-RIGHT_ANGLE, Math.PI / 2],
    [0, 0],
  ])('turns %i board degrees into %f screen radians', (degrees, expected) => {
    expect(screenSweepRadians(degrees)).toBeCloseTo(expected, PRECISION);
  });
});

describe('angleSumOf', () => {
  it.each([
    [['A', 'B', 'C'], 180],
    [['A', 'B', 'C', 'D'], 360],
    [['A', 'B', 'C', 'D', 'E'], 540],
  ])('gives the interior angle sum of %j', (vertices, degrees) => {
    expect(angleSumOf({ vertices })).toBe(degrees);
  });
});

describe('SHAPE_NAMES', () => {
  it('names polygons from three to six sides', () => {
    expect(SHAPE_NAMES).toEqual({ 3: 'triangle', 4: 'quadrilateral', 5: 'pentagon', 6: 'hexagon' });
  });
});
