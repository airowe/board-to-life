import { describe, expect, it } from 'vitest';
import { angleAt, distance, positionsOf, type Point, type Positions } from './derive';
import { FIT_TOLERANCE_DEGREES, FIT_TOLERANCE_FRACTION, fitWrittenValues } from './fit';
import { factsFor, suggestedFocus, type FigureFact } from './focus';
import { figureSampleUrl, GEOMETRY_SAMPLES, type FigureSample } from './samples';
import { validateFigure, type Figure, type Focus } from './schema';

const EXPECTED_IDS = ['triangle', 'parallel', 'reflection', 'rotation', 'triangle-messy'];
const SAMPLE_DRAWING = { width: 1200, height: 800 };
const POSITION_TOLERANCE = 1;
const ANGLE_AT_C = 70;
const MESSY_LETTER_DISTANCE = { min: 40, max: 70 };
const WRITTEN_VALUE = '50°';

const ANGLE_SUM_FOCUS: Focus = { kind: 'angle-sum', polygon: 'abc', drag: 'C' };
const EXPECTED_FOCUS: Record<string, Focus> = {
  triangle: ANGLE_SUM_FOCUS,
  parallel: { kind: 'equal-angles', marks: ['m1', 'm2'], drag: 'T' },
  reflection: { kind: 'transform', transformation: 'flip' },
  rotation: { kind: 'transform', transformation: 'turn' },
  'triangle-messy': ANGLE_SUM_FOCUS,
};

const cases = GEOMETRY_SAMPLES.map((sample) => [sample.id, sample] as const);

const sampleById = (id: string): FigureSample => {
  const sample = GEOMETRY_SAMPLES.find((entry) => entry.id === id);
  if (sample === undefined) throw new Error(`no sample ${id}`);
  return sample;
};

const fitted = (sample: FigureSample): Figure => {
  const result = fitWrittenValues(sample.figure);
  if (!result.ok) throw new Error(`${sample.id} does not fit: ${result.conflicts.join(' ')}`);
  return result.figure;
};

const focusOf = (figure: Figure): Focus => {
  const chosen = suggestedFocus(figure);
  if (chosen === null) throw new Error('no focus');
  return chosen;
};

const at = (positions: Positions, id: string): Point => {
  const found = positions[id];
  if (found === undefined) throw new Error(`no point ${id}`);
  return found;
};

const expectPositionsClose = (actual: Positions, expected: Positions): void => {
  expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
  for (const [id, point] of Object.entries(expected)) {
    expect(distance(at(actual, id), point)).toBeLessThanOrEqual(POSITION_TOLERANCE);
  }
};

const identityOf = (fact: FigureFact): Record<string, unknown> => {
  switch (fact.kind) {
    case 'angle-sum':
      return { kind: fact.kind, polygon: fact.polygon };
    case 'equal-angles':
      return { kind: fact.kind, marks: fact.marks };
    case 'lands':
    case 'congruent':
    case 'area-scale':
      return { kind: fact.kind, transformation: fact.transformation };
  }
};

const measureOf = (fact: FigureFact): number | null => {
  switch (fact.kind) {
    case 'angle-sum':
    case 'equal-angles':
      return fact.degrees;
    case 'area-scale':
      return fact.factor;
    case 'lands':
    case 'congruent':
      return null;
  }
};

const expectFactClose = (actual: FigureFact, expected: FigureFact): void => {
  expect(identityOf(actual)).toEqual(identityOf(expected));
  const [measured, pinned] = [measureOf(actual), measureOf(expected)];
  const tolerance = expected.kind === 'area-scale' ? FIT_TOLERANCE_FRACTION * Math.abs(pinned ?? 0) : FIT_TOLERANCE_DEGREES;
  if (pinned !== null) expect(Math.abs((measured ?? Number.NaN) - pinned)).toBeLessThanOrEqual(tolerance);
  if (actual.kind === 'lands' && expected.kind === 'lands') expectPositionsClose(actual.image, expected.image);
};

describe('GEOMETRY_SAMPLES', () => {
  it('has the five sample figures, each with a distinct id', () => {
    expect(GEOMETRY_SAMPLES.map((sample) => sample.id)).toEqual(EXPECTED_IDS);
  });

  it.each(cases)('%s validates', (_, sample) => {
    expect(validateFigure(sample.figure)).toEqual({ ok: true, figure: sample.figure });
  });

  it.each(cases)('%s is drawn on a 1200 x 800 drawing', (_, sample) => {
    expect(sample.figure.drawing).toEqual(SAMPLE_DRAWING);
  });

  it.each(cases)('%s fits its written values', (_, sample) => {
    expect(fitWrittenValues(sample.figure).ok).toBe(true);
  });

  it.each(cases)('%s suggests the focus it is built for', (id, sample) => {
    expect(suggestedFocus(fitted(sample))).toEqual(EXPECTED_FOCUS[id]);
  });

  it.each(cases)('%s demonstrates its pinned facts', (_, sample) => {
    const figure = fitted(sample);
    const facts = factsFor(figure, focusOf(figure));
    expect(facts).toHaveLength(sample.expect.length);
    facts.forEach((fact, index) => expectFactClose(fact, sample.expect[index] as FigureFact));
  });

  it.each([['triangle'], ['triangle-messy']])('%s has a 70° angle at C after the fit', (id) => {
    const positions = positionsOf(fitted(sampleById(id)));
    const measured = angleAt(at(positions, 'C'), at(positions, 'A'), at(positions, 'B'));
    expect(Math.abs((measured ?? Number.NaN) - ANGLE_AT_C)).toBeLessThanOrEqual(FIT_TOLERANCE_DEGREES);
  });

  it('draws the triangle off its written angles, so the fit moves it', () => {
    const sample = sampleById('triangle');
    expect(fitted(sample).points).not.toEqual(sample.figure.points);
  });

  it('writes each messy letter 40 to 70 units from its vertex', () => {
    const { figure } = sampleById('triangle-messy');
    const positions = positionsOf(figure);
    for (const id of ['A', 'B', 'C']) {
      const letter = figure.labels.find((entry) => entry.text === id);
      if (letter === undefined) throw new Error(`no letter ${id}`);
      const gap = distance(letter, at(positions, id));
      expect(gap).toBeGreaterThanOrEqual(MESSY_LETTER_DISTANCE.min);
      expect(gap).toBeLessThanOrEqual(MESSY_LETTER_DISTANCE.max);
    }
  });

  it('writes the messy 50° nearer B than A', () => {
    const { figure } = sampleById('triangle-messy');
    const positions = positionsOf(figure);
    const written = figure.labels.find((entry) => entry.text === WRITTEN_VALUE);
    if (written === undefined) throw new Error('no written value');
    expect(distance(written, at(positions, 'B'))).toBeLessThan(distance(written, at(positions, 'A')));
  });
});

const direction = (positions: Positions, from: string, to: string): Point => {
  const [a, b] = [at(positions, from), at(positions, to)];
  const length = distance(a, b);
  return { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
};

const SAME_DIRECTION = 1 - 1e-4;

describe('the parallel sample', () => {
  it('marks corresponding angles: each ray of m2 points the same way as the matching ray of m1', () => {
    const { figure } = sampleById('parallel');
    const positions = positionsOf(figure);
    const angleMark = (id: string) => {
      const found = figure.marks.find((entry) => entry.id === id);
      if (found?.kind !== 'angle') throw new Error(`no angle mark ${id}`);
      return found;
    };
    const [first, second] = [angleMark('m1'), angleMark('m2')];
    const dot = (p: Point, q: Point): number => p.x * q.x + p.y * q.y;
    expect(dot(direction(positions, first.at, first.from), direction(positions, second.at, second.from))).toBeGreaterThan(SAME_DIRECTION);
    expect(dot(direction(positions, first.at, first.to), direction(positions, second.at, second.to))).toBeGreaterThan(SAME_DIRECTION);
  });

  it('draws U clearly nearer the crossings than T', () => {
    const positions = positionsOf(sampleById('parallel').figure);
    const nearest = (id: string): number => Math.min(distance(at(positions, id), at(positions, 'P1')), distance(at(positions, id), at(positions, 'P2')));
    expect(nearest('U')).toBeLessThan(nearest('T') / 2);
  });
});

describe('figureSampleUrl', () => {
  it('points at the sample image under /samples', () => {
    expect(figureSampleUrl('triangle')).toBe('/samples/geo-triangle.png');
  });
});
