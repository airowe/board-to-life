import { describe, expect, it } from 'vitest';
import { angleAt, areParallel, distance, positionsOf, type Point, type Positions } from './derive';
import {
  FIT_ITERATIONS,
  FIT_TOLERANCE_DEGREES,
  FIT_TOLERANCE_FRACTION,
  fittedOrDrawn,
  fitWrittenValues,
  writtenValueConflicts,
} from './fit';
import { PARALLEL_READ_CASE_4_RUN_2, PARALLEL_READ_CASE_5_RUN_1, PARALLEL_READ_CASE_6_RUN_1 } from './fit.fixtures';
import { GEOMETRY_SAMPLES } from './samples';
import type { Figure, Mark } from './schema';

const CONFIDENCE = 0.9;
const DRAWING = { width: 1000, height: 1000 };
const MAX_MOVE_FRACTION = 0.05;
const RIGHT_ANGLE = 90;
const DEGREES_PER_RADIAN = 180 / Math.PI;

const DRAWN_AT_A = 52;
const DRAWN_AT_B = 58;
const WRITTEN_AT_A = 50;
const WRITTEN_AT_B = 60;
const BASE_LEFT = 200;
const BASE_RIGHT = 800;
const BASE_Y = 700;
const FAR_POINT = 900;

const SHORT_WRITTEN = 5;
const LONG_WRITTEN = 10;
const SHORT_DRAWN = 200;
const LONG_DRAWN = 380;
const WRITTEN_RATIO = LONG_WRITTEN / SHORT_WRITTEN;
const LENGTH_UNIT = 'cm';

const DRAWN_NEAR_RIGHT = 84;
const ARM = 400;

type MarkInput = Mark extends infer M ? (M extends Mark ? Omit<M, 'confidence'> : never) : never;

const point = (id: string, { x, y }: Point) => ({ id, x, y, confidence: CONFIDENCE });
const withConfidence = (entry: MarkInput): Mark => ({ ...entry, confidence: CONFIDENCE }) as Mark;

const figureOf = (positions: Positions, marks: MarkInput[], polygons: string[][] = []): Figure => ({
  version: 1,
  drawing: DRAWING,
  points: Object.entries(positions).map(([id, at]) => point(id, at)),
  segments: [],
  lines: [],
  rays: [],
  circles: [],
  polygons: polygons.map((vertices) => ({ id: vertices.join(''), vertices, confidence: CONFIDENCE })),
  marks: marks.map(withConfidence),
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

const angleOf = (figure: Figure, vertex: string, from: string, to: string): number => {
  const positions = positionsOf(figure);
  const measured = angleAt(at(positions, vertex), at(positions, from), at(positions, to));
  if (measured === null) throw new Error(`no angle at ${vertex}`);
  return measured;
};

const fitted = (figure: Figure): Figure => {
  const result = fitWrittenValues(figure);
  if (!result.ok) throw new Error(result.conflicts.join('\n'));
  return result.figure;
};

const largestMove = (before: Figure, after: Figure): number => {
  const original = positionsOf(before);
  const moved = positionsOf(after);
  return Math.max(...Object.keys(original).map((id) => distance(at(original, id), at(moved, id))));
};

const triangleDrawnAt = (atA: number, atB: number): Positions => {
  const base = BASE_RIGHT - BASE_LEFT;
  const atC = 180 - atA - atB;
  const sideAC = (base * Math.sin(atB / DEGREES_PER_RADIAN)) / Math.sin(atC / DEGREES_PER_RADIAN);
  return {
    A: { x: BASE_LEFT, y: BASE_Y },
    B: { x: BASE_RIGHT, y: BASE_Y },
    C: {
      x: BASE_LEFT + sideAC * Math.cos(atA / DEGREES_PER_RADIAN),
      y: BASE_Y - sideAC * Math.sin(atA / DEGREES_PER_RADIAN),
    },
  };
};

const messyTriangle = (): Figure =>
  figureOf(
    { ...triangleDrawnAt(DRAWN_AT_A, DRAWN_AT_B), D: { x: FAR_POINT, y: FAR_POINT } },
    [
      { id: 'mA', kind: 'angle', at: 'A', from: 'B', to: 'C', degrees: WRITTEN_AT_A },
      { id: 'mB', kind: 'angle', at: 'B', from: 'A', to: 'C', degrees: WRITTEN_AT_B },
    ],
    [['A', 'B', 'C']],
  );

const twoLengths = (): Figure =>
  figureOf(
    {
      A: { x: 100, y: 100 },
      B: { x: 100 + SHORT_DRAWN, y: 100 },
      C: { x: 100, y: 500 },
      D: { x: 100 + LONG_DRAWN, y: 500 },
    },
    [
      { id: 'lAB', kind: 'length', from: 'A', to: 'B', value: SHORT_WRITTEN, unit: LENGTH_UNIT },
      { id: 'lCD', kind: 'length', from: 'C', to: 'D', value: LONG_WRITTEN, unit: LENGTH_UNIT },
    ],
  );

const nearRightAngle = (): Positions => ({
  A: { x: BASE_LEFT, y: BASE_Y },
  B: { x: BASE_LEFT + ARM, y: BASE_Y },
  C: {
    x: BASE_LEFT + ARM * Math.cos(DRAWN_NEAR_RIGHT / DEGREES_PER_RADIAN),
    y: BASE_Y - ARM * Math.sin(DRAWN_NEAR_RIGHT / DEGREES_PER_RADIAN),
  },
});

const triangleWritten = (degrees: [number, number, number]): Figure =>
  figureOf(
    triangleDrawnAt(DRAWN_AT_A, DRAWN_AT_B),
    [
      { id: 'mA', kind: 'angle', at: 'A', from: 'B', to: 'C', degrees: degrees[0] },
      { id: 'mB', kind: 'angle', at: 'B', from: 'C', to: 'A', degrees: degrees[1] },
      { id: 'mC', kind: 'angle', at: 'C', from: 'A', to: 'B', degrees: degrees[2] },
    ],
    [['A', 'B', 'C']],
  );

const TOO_MUCH_TRIANGLE: [number, number, number] = [70, 60, 60];
const TOO_MUCH_MESSAGE =
  "The angles written at A (70°), B (60°) and C (60°) add up to 190°, but a triangle's angles add up to 180°.";

describe('fitWrittenValues', () => {
  it('fits a messy triangle to its written angles without big moves', () => {
    const drawn = messyTriangle();
    const result = fitted(drawn);
    expect(Math.abs(angleOf(drawn, 'A', 'B', 'C') - WRITTEN_AT_A)).toBeGreaterThan(FIT_TOLERANCE_DEGREES);
    expect(Math.abs(angleOf(result, 'A', 'B', 'C') - WRITTEN_AT_A)).toBeLessThanOrEqual(FIT_TOLERANCE_DEGREES);
    expect(Math.abs(angleOf(result, 'B', 'A', 'C') - WRITTEN_AT_B)).toBeLessThanOrEqual(FIT_TOLERANCE_DEGREES);
    expect(largestMove(drawn, result)).toBeLessThanOrEqual(MAX_MOVE_FRACTION * DRAWING.width);
  });

  it('keeps a point no written value touches exactly where it was drawn', () => {
    const drawn = messyTriangle();
    expect(at(positionsOf(fitted(drawn)), 'D')).toEqual(at(positionsOf(drawn), 'D'));
  });

  it('fits written lengths to their ratio', () => {
    const result = positionsOf(fitted(twoLengths()));
    const ratio = distance(at(result, 'C'), at(result, 'D')) / distance(at(result, 'A'), at(result, 'B'));
    expect(Math.abs(ratio - WRITTEN_RATIO) / WRITTEN_RATIO).toBeLessThanOrEqual(FIT_TOLERANCE_FRACTION);
  });

  it('fits a right mark to 90°', () => {
    const result = fitted(figureOf(nearRightAngle(), [{ id: 'r', kind: 'right', at: 'A', from: 'B', to: 'C' }]));
    expect(Math.abs(angleOf(result, 'A', 'B', 'C') - RIGHT_ANGLE)).toBeLessThanOrEqual(FIT_TOLERANCE_DEGREES);
  });

  it('refuses a 190° triangle before fitting and leaves the input unchanged', () => {
    const drawn = triangleWritten(TOO_MUCH_TRIANGLE);
    const before = structuredClone(drawn);
    expect(fitWrittenValues(drawn)).toEqual({ ok: false, conflicts: [TOO_MUCH_MESSAGE] });
    expect(drawn).toEqual(before);
  });

  it(`names every written value when the fit cannot converge in ${FIT_ITERATIONS} passes`, () => {
    const drawn = figureOf(
      { ...nearRightAngle(), D: { x: FAR_POINT, y: FAR_POINT } },
      [
        { id: 'r', kind: 'right', at: 'A', from: 'B', to: 'C' },
        { id: 'm', kind: 'angle', at: 'A', from: 'B', to: 'C', degrees: WRITTEN_AT_B },
        { id: 'l', kind: 'length', from: 'A', to: 'D', value: SHORT_WRITTEN, unit: LENGTH_UNIT },
      ],
    );
    const before = structuredClone(drawn);
    expect(writtenValueConflicts(drawn)).toEqual([]);
    expect(fitWrittenValues(drawn)).toEqual({
      ok: false,
      conflicts: [
        "These written values can't all hold at once: angle BAC is a right angle, angle BAC = 60° and AD = 5 cm.",
      ],
    });
    expect(drawn).toEqual(before);
  });

  it('returns a figure with no written values unchanged', () => {
    const drawn = figureOf(nearRightAngle(), [{ id: 'm', kind: 'angle', at: 'A', from: 'B', to: 'C' }], [['A', 'B', 'C']]);
    expect(fitted(drawn)).toEqual(drawn);
  });

  it.each([
    ['a messy triangle', messyTriangle],
    ['two lengths', twoLengths],
  ])('is idempotent on %s', (_name, make) => {
    const once = fitted(make());
    expect(fitted(once)).toEqual(once);
  });
});

const CORRESPONDING_ANGLE = 65;
const ON_LINE_PIXELS = 1;
const TILT = 6;
const LINE_LENGTH = 600;
const UPPER_Y = 300;
const LOWER_Y = 600;

const offLine = (positions: Positions, id: string, from: string, to: string): number => {
  const [p, a, b] = [at(positions, id), at(positions, from), at(positions, to)];
  return Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / distance(a, b);
};

const parallelOf = (figure: Figure): boolean | null =>
  areParallel(positionsOf(figure), ['P', 'Q'], ['R', 'S'], FIT_TOLERANCE_DEGREES);

const tiltedLines = (marks: MarkInput[]): Figure =>
  figureOf(
    {
      P: { x: BASE_LEFT, y: UPPER_Y },
      Q: { x: BASE_LEFT + LINE_LENGTH, y: UPPER_Y },
      R: { x: BASE_LEFT, y: LOWER_Y },
      S: {
        x: BASE_LEFT + LINE_LENGTH * Math.cos(TILT / DEGREES_PER_RADIAN),
        y: LOWER_Y - LINE_LENGTH * Math.sin(TILT / DEGREES_PER_RADIAN),
      },
    },
    marks,
  );

describe('fitWrittenValues on parallel lines and a transversal', () => {
  it.each([
    ['case-4-run-2', PARALLEL_READ_CASE_4_RUN_2, 'T'],
    ['case-5-run-1', PARALLEL_READ_CASE_5_RUN_1, 'P1'],
  ])('makes both corresponding angles in the %s read match the written angle', (_name, read, armOfSecond) => {
    const result = fitted(read);
    expect(Math.abs(angleOf(result, 'P1', 'T', 'Q') - CORRESPONDING_ANGLE)).toBeLessThanOrEqual(FIT_TOLERANCE_DEGREES);
    expect(Math.abs(angleOf(result, 'P2', armOfSecond, 'S') - CORRESPONDING_ANGLE)).toBeLessThanOrEqual(FIT_TOLERANCE_DEGREES);
  });

  it.each([
    ['case-4-run-2', PARALLEL_READ_CASE_4_RUN_2],
    ['case-5-run-1', PARALLEL_READ_CASE_5_RUN_1],
  ])('keeps the crossings in the %s read on the transversal TU', (_name, read) => {
    const positions = positionsOf(fitted(read));
    expect(offLine(positions, 'P1', 'T', 'U')).toBeLessThanOrEqual(ON_LINE_PIXELS);
    expect(offLine(positions, 'P2', 'T', 'U')).toBeLessThanOrEqual(ON_LINE_PIXELS);
  });

  it('makes two lines with a parallel mark parallel', () => {
    const drawn = tiltedLines([{ id: 'par', kind: 'parallel', lines: [['P', 'Q'], ['R', 'S']] }]);
    expect(parallelOf(drawn)).toBe(false);
    expect(parallelOf(fitted(drawn))).toBe(true);
  });

  it('does not make lines parallel when nothing marks them parallel', () => {
    const drawn = tiltedLines([]);
    expect(parallelOf(fitted(drawn))).toBe(false);
    expect(parallelOf(PARALLEL_READ_CASE_6_RUN_1)).toBe(false);
    expect(parallelOf(fitted(PARALLEL_READ_CASE_6_RUN_1))).toBe(false);
  });

  it('leaves the parallel sample exactly as drawn', () => {
    const sample = GEOMETRY_SAMPLES.find((entry) => entry.id === 'parallel');
    if (sample === undefined) throw new Error('no parallel sample');
    expect(fitted(sample.figure)).toEqual(sample.figure);
  });

  it('is idempotent on a read of the parallel-lines board', () => {
    const once = fitted(PARALLEL_READ_CASE_4_RUN_2);
    expect(fitted(once)).toEqual(once);
  });
});

describe('writtenValueConflicts', () => {
  it.each<[string, Figure, string[]]>([
    ['a triangle whose angles add to 180', triangleWritten([50, 60, 70]), []],
    ['a triangle whose angles add to 190', triangleWritten(TOO_MUCH_TRIANGLE), [TOO_MUCH_MESSAGE]],
    [
      'a triangle whose two written angles already reach 180',
      figureOf(
        triangleDrawnAt(DRAWN_AT_A, DRAWN_AT_B),
        [
          { id: 'mA', kind: 'angle', at: 'A', from: 'B', to: 'C', degrees: 100 },
          { id: 'mB', kind: 'angle', at: 'B', from: 'A', to: 'C', degrees: 80 },
        ],
        [['A', 'B', 'C']],
      ),
      ["The angles written at A (100°) and B (80°) already add up to 180°, but a triangle's three angles add up to 180°."],
    ],
    [
      'a quadrilateral whose angles add to 350',
      figureOf(
        { A: { x: 0, y: 0 }, B: { x: 100, y: 0 }, C: { x: 100, y: 100 }, D: { x: 0, y: 100 } },
        [
          { id: 'mA', kind: 'angle', at: 'A', from: 'D', to: 'B', degrees: 90 },
          { id: 'mB', kind: 'angle', at: 'B', from: 'A', to: 'C', degrees: 90 },
          { id: 'mC', kind: 'angle', at: 'C', from: 'B', to: 'D', degrees: 90 },
          { id: 'mD', kind: 'angle', at: 'D', from: 'C', to: 'A', degrees: 80 },
        ],
        [['A', 'B', 'C', 'D']],
      ),
      [
        "The angles written at A (90°), B (90°), C (90°) and D (80°) add up to 350°, but a quadrilateral's angles add up to 360°.",
      ],
    ],
    [
      'two different angles written between the same rays',
      figureOf(nearRightAngle(), [
        { id: 'm1', kind: 'angle', at: 'A', from: 'B', to: 'C', degrees: 50 },
        { id: 'm2', kind: 'angle', at: 'A', from: 'C', to: 'B', degrees: 60 },
      ]),
      ['Two different angles are written for angle BAC: 50° and 60°.'],
    ],
    [
      'a right mark and a written angle on the same corner',
      figureOf(nearRightAngle(), [
        { id: 'r', kind: 'right', at: 'A', from: 'B', to: 'C' },
        { id: 'm', kind: 'angle', at: 'A', from: 'B', to: 'C', degrees: 60 },
      ]),
      [],
    ],
  ])('for %s', (_name, figure, expected) => {
    expect(writtenValueConflicts(figure)).toEqual(expected);
  });
});

describe('fittedOrDrawn', () => {
  const CONFLICTING = [100, 90] as const;

  it('returns the fitted figure when the written values can hold', () => {
    const fitted = fitWrittenValues(PARALLEL_READ_CASE_4_RUN_2);
    if (!fitted.ok) throw new Error('case-4-run-2 should fit');
    expect(fittedOrDrawn(PARALLEL_READ_CASE_4_RUN_2)).toEqual(fitted.figure);
  });

  it('returns the drawn figure itself when the written values cannot all hold', () => {
    const triangle = GEOMETRY_SAMPLES.find((sample) => sample.id === 'triangle')?.figure;
    if (triangle === undefined) throw new Error('no triangle sample');
    const [first, second] = CONFLICTING;
    const conflicting: Figure = {
      ...triangle,
      marks: triangle.marks.map((mark) =>
        mark.kind === 'angle' && mark.id === 'mA' ? { ...mark, degrees: first } : mark.kind === 'angle' && mark.id === 'mB' ? { ...mark, degrees: second } : mark,
      ),
    };
    expect(fittedOrDrawn(conflicting)).toBe(conflicting);
  });
});
