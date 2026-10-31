import { describe, expect, it } from 'vitest';
import { fittedOrDrawn } from './fit';
import { PARALLEL_READ_CASE_5_RUN_1, PARALLEL_READ_LATER_CASE_5_RUN_2 } from './fit.fixtures';
import { suggestedFocus } from './focus';
import { checkFigureGrounding, INVARIANT_CHOICES, NO_FIGURE_FOCUS, templateFigureQuestion } from './questions';
import { GEOMETRY_SAMPLES, type FigureSample } from './samples';
import type { Figure, Focus } from './schema';

const sampleFigure = (id: string): Figure => {
  const sample: FigureSample | undefined = GEOMETRY_SAMPLES.find((entry) => entry.id === id);
  if (sample === undefined) throw new Error(`no sample ${id}`);
  return sample.figure;
};

const ANGLE_SUM_FOCUS: Focus = { kind: 'angle-sum', polygon: 'abc', drag: 'C' };
const EQUAL_ANGLES_FOCUS: Focus = { kind: 'equal-angles', marks: ['m1', 'm2'], drag: 'T' };
const REFLECTION_FOCUS: Focus = { kind: 'transform', transformation: 'flip' };
const ROTATION_FOCUS: Focus = { kind: 'transform', transformation: 'turn' };
const ALWAYS = INVARIANT_CHOICES[0];
const SOMETIMES = INVARIANT_CHOICES[1];
const C_ONE_DRAG_STEP_FROM_A = { x: 420, y: 600 };

const flattenedAt = (figure: Figure, id: string, spot: { x: number; y: number }): Figure => ({
  ...figure,
  points: figure.points.map((entry) => (entry.id === id ? { ...entry, ...spot } : entry)),
});

describe('INVARIANT_CHOICES', () => {
  it('offers the three standard answers in order', () => {
    expect(INVARIANT_CHOICES).toEqual(['Yes, always', 'Only sometimes', 'Never']);
  });
});

describe('NO_FIGURE_FOCUS', () => {
  it('tells the teacher what to draw', () => {
    expect(NO_FIGURE_FOCUS).toBe('There is nothing in this figure to predict. Draw a shape or a transformation.');
  });
});

describe('templateFigureQuestion', () => {
  it('asks where a reflected triangle lands, with no choices and no answer', () => {
    expect(templateFigureQuestion(sampleFigure('reflection'), REFLECTION_FOCUS)).toMatchObject({
      id: 'q-1',
      prompt: 'Where will triangle ABC land after the reflection over MN?',
      choices: [],
      observe: { kind: 'figure', focus: REFLECTION_FOCUS },
      answer: null,
      cites: ['A', 'B', 'C', 'M', 'N'],
    });
  });

  it('names the centre of a rotation', () => {
    expect(templateFigureQuestion(sampleFigure('rotation'), ROTATION_FOCUS)).toMatchObject({
      prompt: 'Where will triangle ABC land after the rotation about O?',
      choices: [],
      answer: null,
      cites: ['A', 'B', 'C', 'O'],
    });
  });

  it('asks whether the angle sum holds as a vertex is dragged, answered by the invariant', () => {
    expect(templateFigureQuestion(sampleFigure('triangle'), ANGLE_SUM_FOCUS)).toMatchObject({
      prompt: 'Drag C anywhere. Will the angles of ABC still add up to 180°?',
      choices: [...INVARIANT_CHOICES],
      observe: { kind: 'figure', focus: ANGLE_SUM_FOCUS },
      answer: ALWAYS,
      cites: ['A', 'B', 'C'],
    });
  });

  it('answers "Only sometimes" when the invariant does not hold', () => {
    const flat = flattenedAt(sampleFigure('triangle'), 'C', C_ONE_DRAG_STEP_FROM_A);
    expect(templateFigureQuestion(flat, ANGLE_SUM_FOCUS).answer).toBe(SOMETIMES);
  });

  it('asks whether the marked angles at parallel lines stay equal', () => {
    expect(templateFigureQuestion(sampleFigure('parallel'), EQUAL_ANGLES_FOCUS)).toMatchObject({
      prompt: 'Drag T anywhere. Will the marked angles at P1 and P2 still be equal?',
      choices: [...INVARIANT_CHOICES],
      answer: ALWAYS,
      cites: ['T', 'P1', 'P2'],
    });
  });

  it('gives an explanation for every focus', () => {
    const cases: [string, Focus][] = [
      ['reflection', REFLECTION_FOCUS],
      ['triangle', ANGLE_SUM_FOCUS],
      ['parallel', EQUAL_ANGLES_FOCUS],
    ];
    for (const [id, focus] of cases) expect(templateFigureQuestion(sampleFigure(id), focus).explanation.length).toBeGreaterThan(0);
  });
});

describe('transformation explanations', () => {
  const translated = (): Figure => {
    const figure = sampleFigure('rotation');
    return { ...figure, transformations: [{ id: 'slide', kind: 'translate', from: 'A', to: 'O', polygon: 'abc', confidence: 1 }] };
  };

  it.each([
    [
      'reflection',
      () => sampleFigure('reflection'),
      REFLECTION_FOCUS,
      'A reflection flips every point to the same distance on the other side of MN, so the triangle ABC keeps its side lengths and angles but faces the other way.',
    ],
    [
      'rotation',
      () => sampleFigure('rotation'),
      ROTATION_FOCUS,
      'A rotation turns every point through the same angle about O, so the triangle ABC keeps its side lengths and angles.',
    ],
    [
      'translation',
      translated,
      { kind: 'transform', transformation: 'slide' } as Focus,
      'A translation slides every point the same distance in the same direction, so the triangle ABC keeps its side lengths and angles.',
    ],
  ])('explains a %s in its own words', (_name, figureOf, focus, explanation) => {
    expect(templateFigureQuestion(figureOf(), focus).explanation).toBe(explanation);
  });
});

describe('checkFigureGrounding', () => {
  const figure = sampleFigure('triangle');
  const question = templateFigureQuestion(figure, ANGLE_SUM_FOCUS);

  it('accepts the template question for the suggested focus', () => {
    expect(checkFigureGrounding([question], figure)).toEqual({ ok: true, questions: [question] });
  });

  it('rejects a cite of a missing point', () => {
    expect(checkFigureGrounding([{ ...question, cites: ['A', 'Z'] }], figure)).toEqual({ ok: false, errors: ['q-1 cites missing point "Z"'] });
  });

  it('rejects a focus that differs from the figure’s chosen focus', () => {
    const chosen: Figure = { ...figure, focus: ANGLE_SUM_FOCUS };
    const other = { ...question, observe: { kind: 'figure', focus: { ...ANGLE_SUM_FOCUS, drag: 'A' } } };
    expect(checkFigureGrounding([other], chosen)).toEqual({ ok: false, errors: ['q-1 observes a focus other than the figure’s chosen focus'] });
  });

  it('accepts the same focus written with its keys in another order', () => {
    const reordered = { ...question, observe: { kind: 'figure', focus: { drag: 'C', polygon: 'abc', kind: 'angle-sum' } } };
    expect(checkFigureGrounding([reordered], figure)).toMatchObject({ ok: true });
  });

  it('rejects input that is not a list of questions', () => {
    expect(checkFigureGrounding({ prompt: 'no' }, figure)).toMatchObject({ ok: false });
  });
});

describe('equal-angles answer when the dragged end sits close to a parallel line', () => {
  const NEAR_LINE_PIXELS = 120;
  const TILTED_S_Y = 700;
  const reads: [string, Figure][] = [
    ['case-5-run-1', PARALLEL_READ_CASE_5_RUN_1],
    ['later case-5-run-2', PARALLEL_READ_LATER_CASE_5_RUN_2],
  ];
  const gapToPQ = (figure: Figure): number => {
    const find = (id: string) => figure.points.find((entry) => entry.id === id) ?? { x: 0, y: 0 };
    const [p, q, t] = [find('P'), find('Q'), find('T')];
    return Math.abs((q.x - p.x) * (t.y - p.y) - (q.y - p.y) * (t.x - p.x)) / Math.hypot(q.x - p.x, q.y - p.y);
  };

  it.each(reads)('%s: T really is within the close range of PQ', (_, figure) => {
    expect(gapToPQ(figure)).toBeLessThan(NEAR_LINE_PIXELS);
  });

  it.each(reads)('%s: answers "Yes, always" for the read and the fitted figure', (_, figure) => {
    for (const candidate of [figure, fittedOrDrawn(figure)]) {
      const focus = suggestedFocus(candidate);
      expect(focus?.kind).toBe('equal-angles');
      if (focus === null) return;
      expect(templateFigureQuestion(candidate, focus).answer).toBe(ALWAYS);
    }
  });

  it.each(reads)('%s: without the parallel mark the same angles only sometimes stay equal', (_, figure) => {
    const unmarked: Figure = { ...figure, marks: figure.marks.filter((entry) => entry.kind !== 'parallel') };
    expect(templateFigureQuestion(unmarked, EQUAL_ANGLES_FOCUS).answer).toBe(SOMETIMES);
  });

  it.each(reads)('%s: with RS tilted away from parallel the angles only sometimes stay equal', (_, figure) => {
    const tilted: Figure = flattenedAt(figure, 'S', { x: figure.points.find((entry) => entry.id === 'S')?.x ?? 0, y: TILTED_S_Y });
    expect(templateFigureQuestion(tilted, EQUAL_ANGLES_FOCUS).answer).toBe(SOMETIMES);
  });
});
