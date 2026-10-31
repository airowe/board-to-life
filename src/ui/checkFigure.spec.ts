import { describe, expect, it, vi } from 'vitest';
import { writtenValueConflicts } from '../geometry/fit';
import { focusOptions } from '../geometry/focus';
import { INVARIANT_CHOICES, NO_FIGURE_FOCUS, templateFigureQuestion } from '../geometry/questions';
import { GEOMETRY_SAMPLES } from '../geometry/samples';
import type { Figure, Focus, Mark, Transformation } from '../geometry/schema';
import {
  currentFocusValue,
  DRAG_THRESHOLD_PX,
  drawingPointAt,
  figureFocusChoices,
  figureAnswerLine,
  figureEdges,
  figureQuestionsFailureStatus,
  figureRows,
  fitWarnings,
  GHOST_GUESS_NOTE,
  NOTHING_TO_PREDICT_FIGURE,
  pointDrag,
  type PointerSample,
} from './checkFigure';

const CONFIDENCE = 0.9;
const TRIANGLE_SIDES = 3;
const CONFLICTING_DEGREES = [100, 90] as const;

const sampleFigure = (id: string): Figure => {
  const found = GEOMETRY_SAMPLES.find((sample) => sample.id === id);
  if (!found) throw new Error(`no sample ${id}`);
  return structuredClone(found.figure);
};

const everyMarkAndTransformation = (): Figure => {
  const base = sampleFigure('reflection');
  const marks: Mark[] = [
    { id: 'm1', kind: 'angle', at: 'A', from: 'B', to: 'C', degrees: 50, confidence: CONFIDENCE },
    { id: 'm2', kind: 'angle', at: 'B', from: 'C', to: 'A', confidence: CONFIDENCE },
    { id: 'm3', kind: 'right', at: 'C', from: 'A', to: 'B', confidence: CONFIDENCE },
    { id: 'm4', kind: 'length', from: 'A', to: 'B', value: 5, unit: 'cm', confidence: CONFIDENCE },
    { id: 'm5', kind: 'length', from: 'B', to: 'C', confidence: CONFIDENCE },
    { id: 'm6', kind: 'equal', segments: [['A', 'B'], ['A', 'C']], ticks: 1, confidence: CONFIDENCE },
    { id: 'm7', kind: 'parallel', lines: [['A', 'B'], ['M', 'N']], confidence: CONFIDENCE },
  ];
  const transformations: Transformation[] = [
    ...base.transformations,
    { id: 't2', kind: 'rotate', centre: 'M', degrees: -90, polygon: 'abc', confidence: CONFIDENCE },
    { id: 't3', kind: 'translate', from: 'M', to: 'N', polygon: 'abc', confidence: CONFIDENCE },
    { id: 't4', kind: 'dilate', centre: 'N', factor: 2, polygon: 'abc', confidence: CONFIDENCE },
  ];
  return { ...base, marks, transformations };
};

describe('NOTHING_TO_PREDICT_FIGURE', () => {
  it('matches the server text for a figure with no focus', () => {
    expect(NOTHING_TO_PREDICT_FIGURE).toBe('There is nothing in this figure to predict. Draw a shape or a transformation.');
    expect(NOTHING_TO_PREDICT_FIGURE).toBe(NO_FIGURE_FOCUS);
  });
});

describe('figureRows', () => {
  it('lists the triangle sample points and written angles', () => {
    expect(figureRows(sampleFigure('triangle'))).toEqual([
      'A · point',
      'B · point',
      'C · point',
      'Angle at A · 50° written',
      'Angle at B · 60° written',
      'Angle at C',
    ]);
  });

  it('lists every point, mark and transformation once, in order', () => {
    expect(figureRows(everyMarkAndTransformation())).toEqual([
      'A · point',
      'B · point',
      'C · point',
      'M · point',
      'N · point',
      'Angle at A · 50° written',
      'Angle at B',
      'Right angle at C',
      'Length AB · 5 cm written',
      'Length BC',
      'Equal sides AB, AC',
      'Parallel lines AB, MN',
      'Reflect ABC over MN',
      'Rotate ABC -90° about M',
      'Translate ABC from M to N',
      'Dilate ABC by 2 about N',
    ]);
  });

  it('gives one row per point, mark and transformation', () => {
    const figure = everyMarkAndTransformation();
    expect(figureRows(figure)).toHaveLength(figure.points.length + figure.marks.length + figure.transformations.length);
  });
});

describe('figureEdges', () => {
  it('draws each triangle side once when segments and the polygon share it', () => {
    const edges = figureEdges(sampleFigure('triangle'));
    expect(edges).toHaveLength(TRIANGLE_SIDES);
    expect(edges.map((edge) => edge.id)).toEqual(['sAB', 'sBC', 'sCA']);
  });

  it('draws polygon edges when no segment was read', () => {
    const figure = sampleFigure('reflection');
    expect(figureEdges(figure)).toEqual([
      { id: 'abc', from: { x: 250, y: 250 }, to: { x: 450, y: 350 }, confidence: 0.95 },
      { id: 'abc', from: { x: 450, y: 350 }, to: { x: 300, y: 550 }, confidence: 0.95 },
      { id: 'abc', from: { x: 300, y: 550 }, to: { x: 250, y: 250 }, confidence: 0.95 },
    ]);
  });

  it('draws the lines of the parallel sample', () => {
    expect(figureEdges(sampleFigure('parallel')).map((edge) => edge.id)).toEqual(['lPQ', 'lRS', 'lTU']);
  });
});

describe('fitWarnings', () => {
  it('names the written values that cannot all hold', () => {
    const figure = sampleFigure('triangle');
    const [first, second] = CONFLICTING_DEGREES;
    const conflicting: Figure = {
      ...figure,
      marks: figure.marks.map((mark) =>
        mark.id === 'mA' && mark.kind === 'angle' ? { ...mark, degrees: first } : mark.id === 'mB' && mark.kind === 'angle' ? { ...mark, degrees: second } : mark,
      ),
    };
    const warnings = fitWarnings(conflicting);
    expect(warnings).toEqual(writtenValueConflicts(conflicting));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(`${first + second}°`);
  });

  it('says nothing when the written values hold', () => {
    expect(fitWarnings(sampleFigure('triangle'))).toEqual([]);
  });
});

describe('currentFocusValue', () => {
  it('selects the suggested focus when none was chosen', () => {
    const figure = sampleFigure('reflection');
    expect(currentFocusValue(figure)).toBe('transform:flip');
  });

  it('selects the chosen focus', () => {
    const figure = sampleFigure('triangle');
    const [option] = focusOptions(figure);
    if (!option) throw new Error('triangle has no focus options');
    expect(currentFocusValue({ ...figure, focus: option.focus })).toBe('angle-sum:abc');
  });

  it('is empty when there is nothing to predict', () => {
    const figure: Figure = { ...sampleFigure('triangle'), segments: [], polygons: [], marks: [] };
    expect(currentFocusValue(figure)).toBe('');
  });
});

describe('figureAnswerLine', () => {
  it('gives the model answer for an invariant question', () => {
    const figure = sampleFigure('triangle');
    const question = templateFigureQuestion(figure, { kind: 'angle-sum', polygon: 'abc', drag: 'C' });
    expect(figureAnswerLine(question)).toBe(`Model answer: ${INVARIANT_CHOICES[0]}`);
    expect(figureAnswerLine(question)).toBe('Model answer: Yes, always');
  });

  it('tells the teacher how students answer a transform question', () => {
    const figure = sampleFigure('reflection');
    const question = templateFigureQuestion(figure, { kind: 'transform', transformation: 'flip' });
    expect(figureAnswerLine(question)).toBe(GHOST_GUESS_NOTE);
    expect(GHOST_GUESS_NOTE).toBe('Students drag a ghost shape to their guess.');
  });
});

describe('figureQuestionsFailureStatus', () => {
  const retry = (): void => undefined;

  it('treats the server saying there is nothing to predict as a state, not an error', () => {
    expect(figureQuestionsFailureStatus({ message: NO_FIGURE_FOCUS }, retry)).toEqual({ kind: 'nothing-to-predict' });
  });

  it('passes any other failure through with its retry', () => {
    const failure = { message: 'The figure drafter timed out.', details: ['after 120 s'] };
    expect(figureQuestionsFailureStatus(failure, retry)).toEqual({ kind: 'failed', failure, retry });
  });
});

describe('figureFocusChoices', () => {
  const DRAG_A: Focus = { kind: 'angle-sum', polygon: 'abc', drag: 'A' };
  const SWAPPED_MARKS: Focus = { kind: 'equal-angles', marks: ['m2', 'm1'], drag: 'T' };
  const MARKS_WITHOUT_LINES: Focus = { kind: 'equal-angles', marks: ['mA', 'mB'], drag: 'C' };

  it('offers the figure options and selects the suggested one', () => {
    const figure = sampleFigure('triangle');
    expect(figureFocusChoices(figure)).toEqual({ options: focusOptions(figure), predictable: true, value: 'angle-sum:abc' });
  });

  it.each([
    ['triangle', DRAG_A, 'Angle sum of ABC (drag A)'],
    ['parallel', SWAPPED_MARKS, 'Equal angles at the parallel lines (drag T)'],
  ] as const)('adds a chosen %s focus the options do not list, labelled the same way, and selects it', (id, focus, label) => {
    const figure: Figure = { ...sampleFigure(id), focus };
    const added = { value: `chosen:${focus.kind}:${focus.kind === 'angle-sum' ? `abc:${focus.drag}` : focus.marks.join(':')}`, label, focus };
    expect(figureFocusChoices(figure)).toEqual({ options: [...focusOptions(figure), added], predictable: true, value: added.value });
  });

  it('stays predictable when the only focus is the chosen one', () => {
    const figure: Figure = { ...sampleFigure('triangle'), segments: [], polygons: [], focus: MARKS_WITHOUT_LINES };
    const choices = figureFocusChoices(figure);
    expect(choices.predictable).toBe(true);
    expect(choices.options.map((option) => option.focus)).toEqual([MARKS_WITHOUT_LINES]);
    expect(choices.value).toBe(choices.options[0]?.value);
  });

  it('is not predictable when there is no focus at all', () => {
    const figure: Figure = { ...sampleFigure('triangle'), segments: [], polygons: [], marks: [] };
    expect(figureFocusChoices(figure)).toEqual({ options: [], predictable: false, value: '' });
  });
});

describe('drawingPointAt', () => {
  const DRAWING = { width: 1200, height: 800 };
  const SHOWN = { left: 40, top: 100, width: 600, height: 400 };

  it.each([
    ['top-left corner', { x: 40, y: 100 }, { x: 0, y: 0 }],
    ['centre', { x: 340, y: 300 }, { x: 600, y: 400 }],
    ['bottom-right corner', { x: 640, y: 500 }, { x: 1200, y: 800 }],
  ])('maps the %s of the shown photo into drawing units', (_, client, expected) => {
    expect(drawingPointAt(SHOWN, DRAWING, client)).toEqual(expected);
  });

  it('stretches each axis on its own, as the overlay does', () => {
    const squashed = { ...SHOWN, height: 200 };
    expect(drawingPointAt(squashed, DRAWING, { x: 340, y: 200 })).toEqual({ x: 600, y: 400 });
  });
});

describe('drawingPointAt on a box with no size', () => {
  const DRAWING = { width: 1200, height: 800 };

  it.each([
    ['width', { left: 40, top: 100, width: 0, height: 400 }],
    ['height', { left: 40, top: 100, width: 600, height: 0 }],
  ])('gives no point when the shown box has no %s', (_, shown) => {
    expect(drawingPointAt(shown, DRAWING, { x: 340, y: 300 })).toBeNull();
  });
});

describe('pointDrag', () => {
  const SHOWN = { left: 0, top: 0, width: 600, height: 400 };
  const FINGER = 1;
  const OTHER_FINGER = 2;
  const SECONDARY_BUTTON = 2;
  const figure = (): Figure => sampleFigure('triangle');
  const startOf = (id: string): { x: number; y: number } => {
    const found = figure().points.find((entry) => entry.id === id);
    if (!found) throw new Error(`no point ${id}`);
    return { x: (found.x * SHOWN.width) / figure().drawing.width, y: (found.y * SHOWN.height) / figure().drawing.height };
  };
  const sample = (client: { x: number; y: number }, overrides: Partial<PointerSample> = {}): PointerSample => ({
    pointerId: FINGER,
    pointerType: 'touch',
    button: 0,
    clientX: client.x,
    clientY: client.y,
    ...overrides,
  });
  const setUp = (box: () => typeof SHOWN = () => SHOWN) => {
    const hooks = { box, preview: vi.fn(), release: vi.fn(), drop: vi.fn() };
    return { hooks, drag: pointDrag(figure(), hooks) };
  };
  const A = startOf('A');
  const PAST_THRESHOLD = { x: A.x + DRAG_THRESHOLD_PX * 2, y: A.y };
  const WITHIN_THRESHOLD = { x: A.x + DRAG_THRESHOLD_PX / 2, y: A.y + DRAG_THRESHOLD_PX / 2 };

  it('drops a point dragged past the threshold where it was let go, once', () => {
    const { hooks, drag } = setUp();
    expect(drag.begin(sample(A), 'A')).toBe(true);
    drag.move(sample(PAST_THRESHOLD));
    drag.end(sample(PAST_THRESHOLD), true);
    drag.end(sample(PAST_THRESHOLD), false);
    expect(hooks.drop).toHaveBeenCalledTimes(1);
    expect(hooks.drop).toHaveBeenCalledWith('A', drawingPointAt(SHOWN, figure().drawing, PAST_THRESHOLD));
    expect(hooks.release).toHaveBeenCalledTimes(1);
  });

  it('treats a tap with a tiny wobble as a tap, not a move', () => {
    const { hooks, drag } = setUp();
    drag.begin(sample(A), 'A');
    drag.move(sample(WITHIN_THRESHOLD));
    drag.end(sample(WITHIN_THRESHOLD), true);
    expect(hooks.drop).not.toHaveBeenCalled();
    expect(hooks.preview).toHaveBeenLastCalledWith(null);
    expect(hooks.release).toHaveBeenCalledTimes(1);
  });

  it('never drops when the drag is cancelled or loses its capture', () => {
    const { hooks, drag } = setUp();
    drag.begin(sample(A), 'A');
    drag.move(sample(PAST_THRESHOLD));
    drag.end(sample(PAST_THRESHOLD), false);
    expect(hooks.drop).not.toHaveBeenCalled();
    expect(hooks.release).toHaveBeenCalledTimes(1);
  });

  it('follows only the pointer that started the drag', () => {
    const { hooks, drag } = setUp();
    drag.begin(sample(A), 'A');
    expect(drag.begin(sample(startOf('B'), { pointerId: OTHER_FINGER }), 'B')).toBe(false);
    drag.move(sample(PAST_THRESHOLD, { pointerId: OTHER_FINGER }));
    drag.end(sample(PAST_THRESHOLD, { pointerId: OTHER_FINGER }), true);
    expect(hooks.drop).not.toHaveBeenCalled();
    expect(hooks.release).not.toHaveBeenCalled();
    drag.move(sample(PAST_THRESHOLD));
    drag.end(sample(PAST_THRESHOLD), true);
    expect(hooks.drop).toHaveBeenCalledTimes(1);
    expect(hooks.drop).toHaveBeenCalledWith('A', expect.anything());
  });

  it('ignores a mouse button other than the main one', () => {
    const { hooks, drag } = setUp();
    expect(drag.begin(sample(A, { pointerType: 'mouse', button: SECONDARY_BUTTON }), 'A')).toBe(false);
    drag.move(sample(PAST_THRESHOLD, { pointerType: 'mouse' }));
    drag.end(sample(PAST_THRESHOLD, { pointerType: 'mouse' }), true);
    expect(hooks.drop).not.toHaveBeenCalled();
  });

  it('does not start on an id that is not a point', () => {
    const { drag } = setUp();
    expect(drag.begin(sample(A), 'Z')).toBe(false);
  });

  it('does not drop when the photo has no size at the moment of the move', () => {
    const { hooks, drag } = setUp(() => ({ ...SHOWN, width: 0, height: 0 }));
    drag.begin(sample(A), 'A');
    drag.move(sample(PAST_THRESHOLD));
    drag.end(sample(PAST_THRESHOLD), true);
    expect(hooks.drop).not.toHaveBeenCalled();
  });

  it('can start a new drag after the last one ends', () => {
    const { hooks, drag } = setUp();
    drag.begin(sample(A), 'A');
    drag.end(sample(A), true);
    expect(drag.begin(sample(A, { pointerId: OTHER_FINGER }), 'A')).toBe(true);
    drag.move(sample(PAST_THRESHOLD, { pointerId: OTHER_FINGER }));
    drag.end(sample(PAST_THRESHOLD, { pointerId: OTHER_FINGER }), true);
    expect(hooks.drop).toHaveBeenCalledTimes(1);
  });
});
