import { describe, expect, it } from 'vitest';
import { angleAt, distance, IMAGE_SUFFIX, positionsOf, type Point, type Positions } from './derive';
import { factsFor, focusOptions, followCrossings, invariantHolds, suggestedFocus } from './focus';
import { GEOMETRY_SAMPLES, type FigureSample } from './samples';
import type { Figure, Focus, Transformation } from './schema';

const sampleFigure = (id: string): Figure => {
  const sample: FigureSample | undefined = GEOMETRY_SAMPLES.find((entry) => entry.id === id);
  if (sample === undefined) throw new Error(`no sample ${id}`);
  return sample.figure;
};

const at = (positions: Positions, id: string): Point => {
  const found = positions[id];
  if (found === undefined) throw new Error(`no point ${id}`);
  return found;
};

const CONFIDENCE = 0.9;
const POSITION_TOLERANCE = 1e-6;
const DEGREE_DIGITS = 6;
const CIRCLE_RADIUS = 50;
const DILATION_FACTOR = 2;

const ANGLE_SUM_FOCUS: Focus = { kind: 'angle-sum', polygon: 'abc', drag: 'C' };
const EQUAL_ANGLES_FOCUS: Focus = { kind: 'equal-angles', marks: ['m1', 'm2'], drag: 'T' };
const REFLECTION_FOCUS: Focus = { kind: 'transform', transformation: 'flip' };

const withTransformation = (transformation: Transformation): Figure => ({
  ...sampleFigure('reflection'),
  transformations: [transformation],
});

const parallelWithTriangle = (): Figure => {
  const parallel = sampleFigure('parallel');
  const triangle = sampleFigure('triangle');
  return {
    ...parallel,
    points: [...parallel.points, ...triangle.points],
    segments: triangle.segments,
    polygons: triangle.polygons,
  };
};

const verticalTransversal = (from: string, to: string): Figure => {
  const figure = sampleFigure('parallel');
  const moved: Record<string, { x: number; y: number }> = {
    T: { x: 500, y: 100 },
    U: { x: 500, y: 700 },
    P1: { x: 500, y: 300 },
    P2: { x: 500, y: 500 },
  };
  return {
    ...figure,
    points: figure.points.map((entry) => ({ ...entry, ...moved[entry.id] })),
    lines: figure.lines.map((entry) => (entry.id === 'lTU' ? { ...entry, from, to } : entry)),
  };
};

const loneCircle: Figure = {
  ...sampleFigure('triangle'),
  points: [{ id: 'O', x: 600, y: 400, confidence: CONFIDENCE }],
  segments: [],
  polygons: [],
  marks: [],
  labels: [],
  circles: [{ id: 'c1', centre: 'O', radius: CIRCLE_RADIUS, confidence: CONFIDENCE }],
};

describe('focusOptions', () => {
  it('lists each transformation, then each polygon angle sum', () => {
    expect(focusOptions(sampleFigure('reflection'))).toEqual([
      { value: 'transform:flip', label: 'Play the reflection of ABC', focus: REFLECTION_FOCUS },
      { value: 'angle-sum:abc', label: 'Angle sum of ABC (drag C)', focus: ANGLE_SUM_FOCUS },
    ]);
  });

  it('offers equal angles at the crossings of a transversal with parallel lines, dragging the far endpoint', () => {
    expect(focusOptions(sampleFigure('parallel'))).toEqual([
      { value: 'equal-angles:m1:m2', label: 'Equal angles at the parallel lines (drag T)', focus: EQUAL_ANGLES_FOCUS },
    ]);
  });

  it('still drags T when the transversal is written from U to T', () => {
    const figure = sampleFigure('parallel');
    const swapped = { ...figure, lines: figure.lines.map((entry) => (entry.id === 'lTU' ? { ...entry, from: 'U', to: 'T' } : entry)) };
    expect(focusOptions(swapped).map((option) => option.focus)).toEqual([EQUAL_ANGLES_FOCUS]);
  });

  it.each([
    ['T', 'U', 'T'],
    ['U', 'T', 'U'],
  ] as const)('breaks a tie between endpoints in favour of the first-written one (%s to %s)', (from, to, drag) => {
    const figure = verticalTransversal(from, to);
    expect(focusOptions(figure).map((option) => option.focus)).toEqual([{ ...EQUAL_ANGLES_FOCUS, drag }]);
  });

  it('lists angle sums before equal angles', () => {
    expect(focusOptions(parallelWithTriangle()).map((option) => option.label)).toEqual([
      'Angle sum of ABC (drag C)',
      'Equal angles at the parallel lines (drag T)',
    ]);
  });

  it.each([
    ['rotation', { id: 't', kind: 'rotate', centre: 'M', degrees: 90, polygon: 'abc', confidence: CONFIDENCE }],
    ['translation', { id: 't', kind: 'translate', from: 'M', to: 'N', polygon: 'abc', confidence: CONFIDENCE }],
    ['dilation', { id: 't', kind: 'dilate', centre: 'M', factor: DILATION_FACTOR, polygon: 'abc', confidence: CONFIDENCE }],
  ] as const)('names a %s after its polygon', (noun, transformation) => {
    expect(focusOptions(withTransformation(transformation))[0]?.label).toBe(`Play the ${noun} of ABC`);
  });

  it('gives nothing for a lone circle', () => {
    expect(focusOptions(loneCircle)).toEqual([]);
  });
});

describe('suggestedFocus', () => {
  it('keeps the focus the figure already has', () => {
    const chosen: Focus = { kind: 'angle-sum', polygon: 'abc', drag: 'A' };
    expect(suggestedFocus({ ...sampleFigure('reflection'), focus: chosen })).toEqual(chosen);
  });

  it('picks the first transformation first', () => {
    expect(suggestedFocus(sampleFigure('reflection'))).toEqual(REFLECTION_FOCUS);
  });

  it('picks equal angles before an angle sum', () => {
    expect(suggestedFocus(parallelWithTriangle())).toEqual(EQUAL_ANGLES_FOCUS);
  });

  it('falls back to the angle sum of the first polygon', () => {
    expect(suggestedFocus(sampleFigure('triangle'))).toEqual(ANGLE_SUM_FOCUS);
  });

  it('gives null for a lone circle', () => {
    expect(suggestedFocus(loneCircle)).toBeNull();
  });
});

describe('factsFor', () => {
  it('gives a translation its landing spots and congruence', () => {
    const figure = withTransformation({ id: 't', kind: 'translate', from: 'M', to: 'N', polygon: 'abc', confidence: CONFIDENCE });
    const positions = positionsOf(figure);
    const shift = { x: at(positions, 'N').x - at(positions, 'M').x, y: at(positions, 'N').y - at(positions, 'M').y };
    const image = Object.fromEntries(
      ['A', 'B', 'C'].map((id) => [`${id}${IMAGE_SUFFIX}`, { x: at(positions, id).x + shift.x, y: at(positions, id).y + shift.y }]),
    );
    expect(factsFor(figure, { kind: 'transform', transformation: 't' })).toEqual([
      { kind: 'lands', transformation: 't', image },
      { kind: 'congruent', transformation: 't' },
    ]);
  });

  it('gives a dilation its area scale of the factor squared, not congruence', () => {
    const figure = withTransformation({ id: 't', kind: 'dilate', centre: 'M', factor: DILATION_FACTOR, polygon: 'abc', confidence: CONFIDENCE });
    const facts = factsFor(figure, { kind: 'transform', transformation: 't' });
    expect(facts.map((fact) => fact.kind)).toEqual(['lands', 'area-scale']);
    const scale = facts.find((fact) => fact.kind === 'area-scale');
    expect(scale?.kind === 'area-scale' && scale.factor).toBeCloseTo(DILATION_FACTOR ** 2, DEGREE_DIGITS);
  });

  it('gives a dilation no area-scale fact when the polygon has no area', () => {
    const base = withTransformation({ id: 't', kind: 'dilate', centre: 'M', factor: DILATION_FACTOR, polygon: 'abc', confidence: CONFIDENCE });
    const flat = { ...base, points: base.points.map((entry) => (entry.id === 'C' ? { ...entry, x: 350, y: 300 } : entry)) };
    expect(factsFor(flat, { kind: 'transform', transformation: 't' }).map((fact) => fact.kind)).toEqual(['lands']);
  });

  it('gives nothing for a focus that names a missing transformation', () => {
    expect(factsFor(sampleFigure('triangle'), { kind: 'transform', transformation: 'missing' })).toEqual([]);
  });

  it('gives no equal-angles fact when the marked angles differ', () => {
    const figure = sampleFigure('parallel');
    const tilted = { ...figure, points: figure.points.map((entry) => (entry.id === 'S' ? { ...entry, y: entry.y - CIRCLE_RADIUS } : entry)) };
    expect(factsFor(tilted, { kind: 'equal-angles', marks: ['m1', 'm2'], drag: 'T' })).toEqual([]);
  });
});

describe('followCrossings', () => {
  it('moves the crossing points to where the transversal now meets each parallel line', () => {
    const figure = sampleFigure('parallel');
    const moved = { ...positionsOf(figure), T: { x: 650, y: 150 } };
    const followed = followCrossings(moved, figure, ['m1', 'm2']);
    const onLine = (id: string, from: string, to: string): number => {
      const [p, a, b] = [at(followed, id), at(followed, from), at(followed, to)];
      return Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / distance(a, b);
    };
    expect(onLine('P1', 'P', 'Q')).toBeLessThan(POSITION_TOLERANCE);
    expect(onLine('P1', 'T', 'U')).toBeLessThan(POSITION_TOLERANCE);
    expect(onLine('P2', 'R', 'S')).toBeLessThan(POSITION_TOLERANCE);
    expect(onLine('P2', 'T', 'U')).toBeLessThan(POSITION_TOLERANCE);
    expect(at(followed, 'P1')).not.toEqual(at(moved, 'P1'));
  });

  it('keeps the corresponding angles equal after the move', () => {
    const figure = sampleFigure('parallel');
    const followed = followCrossings({ ...positionsOf(figure), T: { x: 650, y: 150 } }, figure, ['m1', 'm2']);
    const first = angleAt(at(followed, 'P1'), at(followed, 'T'), at(followed, 'Q'));
    const second = angleAt(at(followed, 'P2'), at(followed, 'T'), at(followed, 'S'));
    expect(first).toBeCloseTo(second ?? Number.NaN, DEGREE_DIGITS);
  });
});

describe('invariantHolds', () => {
  it('holds for the angle sum of a triangle when C is dragged', () => {
    expect(invariantHolds(sampleFigure('triangle'), ANGLE_SUM_FOCUS)).toBe(true);
  });

  it('holds for the angle sum of a quadrilateral', () => {
    const figure: Figure = {
      ...sampleFigure('triangle'),
      points: [...sampleFigure('triangle').points, { id: 'D', x: 250, y: 300, confidence: CONFIDENCE }],
      marks: [],
      polygons: [{ id: 'abcd', vertices: ['A', 'B', 'C', 'D'], confidence: CONFIDENCE }],
    };
    expect(invariantHolds(figure, { kind: 'angle-sum', polygon: 'abcd', drag: 'D' })).toBe(true);
  });

  it('holds for equal angles at parallel lines when the transversal end T is dragged', () => {
    expect(invariantHolds(sampleFigure('parallel'), EQUAL_ANGLES_FOCUS)).toBe(true);
  });

  it('fails for equal angles when P, a point on one of the parallel lines, is dragged', () => {
    expect(invariantHolds(sampleFigure('parallel'), { ...EQUAL_ANGLES_FOCUS, drag: 'P' })).toBe(false);
  });

  it('holds for congruence under a reflection when a vertex is dragged', () => {
    expect(invariantHolds(sampleFigure('reflection'), REFLECTION_FOCUS)).toBe(true);
  });

  it('fails when the drag point is missing', () => {
    expect(invariantHolds(sampleFigure('triangle'), { ...ANGLE_SUM_FOCUS, drag: 'Z' })).toBe(false);
  });
});
