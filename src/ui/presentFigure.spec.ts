import { describe, expect, it } from 'vitest';
import { IMAGE_SUFFIX, positionsOf, type Point, type Positions } from '../geometry/derive';
import { suggestedFocus } from '../geometry/focus';
import { liveReadouts, type FigurePhase } from '../geometry/playback';
import { INVARIANT_CHOICES, templateFigureQuestion, type GeometryQuestion } from '../geometry/questions';
import { GEOMETRY_SAMPLES } from '../geometry/samples';
import type { Figure, Focus } from '../geometry/schema';
import {
  EXPLORE_LINE,
  GHOST_DRAG_LINE,
  LANDED_HEADLINE,
  figureCaption,
  figureControls,
  figureStrokes,
  ghostCorners,
  LABEL_DISTANCE,
  labelPosition,
  LENGTH_READOUT_OFFSET,
  imagePolygon,
  movingPolygon,
  READOUT_OFFSET,
  readoutPosition,
  showsLabel,
  visibleReadouts,
} from './presentFigure';

const sample = (id: string): Figure => {
  const found = GEOMETRY_SAMPLES.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`missing sample ${id}`);
  return found.figure;
};

const focusOf = (figure: Figure): Focus => {
  const focus = suggestedFocus(figure);
  if (focus === null) throw new Error('no focus');
  return focus;
};

const questionOf = (figure: Figure): GeometryQuestion => templateFigureQuestion(figure, focusOf(figure));

const ANGLE_SUM_TEXT = 'A + B + C = 180°';
const [FIRST_CHOICE, SECOND_CHOICE] = INVARIANT_CHOICES;

const pointOf = (positions: Positions, id: string): Point => {
  const at = positions[id];
  if (at === undefined) throw new Error(`missing point ${id}`);
  return at;
};

const away = (from: Point, to: Point): number => Math.hypot(to.x - from.x, to.y - from.y);

const BEFORE_EXPLORING: FigurePhase['kind'][] = ['ready', 'predict', 'guessing', 'playing'];

describe('visibleReadouts', () => {
  it('shows the angle-sum readout once exploring when the focus is not a transform', () => {
    const figure = sample('triangle');
    const texts = visibleReadouts(figure, liveReadouts(figure, positionsOf(figure)), focusOf(figure), 'exploring').map((entry) => entry.text);
    expect(texts).toContain(ANGLE_SUM_TEXT);
  });

  it.each(BEFORE_EXPLORING)('hides only the angle-sum readout during %s so it does not give the answer away', (kind) => {
    const figure = sample('triangle');
    const all = liveReadouts(figure, positionsOf(figure));
    expect(all.map((entry) => entry.text)).toContain(ANGLE_SUM_TEXT);
    expect(visibleReadouts(figure, all, focusOf(figure), kind)).toEqual(all.filter((entry) => entry.text !== ANGLE_SUM_TEXT));
  });

  it('drops only the angle-sum readout when the focus is a transform, even while exploring', () => {
    const figure = sample('rotation');
    const all = liveReadouts(figure, positionsOf(figure));
    const shown = visibleReadouts(figure, all, focusOf(figure), 'exploring');
    expect(all.map((entry) => entry.text)).toContain(ANGLE_SUM_TEXT);
    expect(shown).toEqual(all.filter((entry) => entry.text !== ANGLE_SUM_TEXT));
  });

  it('keeps every readout while exploring when there is no focus', () => {
    const figure = sample('triangle');
    const all = liveReadouts(figure, positionsOf(figure));
    expect(visibleReadouts(figure, all, null, 'exploring')).toEqual(all);
  });
});

describe('readoutPosition', () => {
  it('moves an angle readout into the angle along its bisector', () => {
    const figure = sample('triangle');
    const positions = positionsOf(figure);
    const vertex = pointOf(positions, 'A');
    const readout = liveReadouts(figure, positions).find((entry) => entry.id === 'mA');
    if (!readout) throw new Error('missing readout');
    const at = readoutPosition(figure, positions, readout);
    expect(away(vertex, at)).toBeCloseTo(READOUT_OFFSET, 6);
    expect(at.x).toBeGreaterThan(vertex.x);
    expect(at.y).toBeLessThan(vertex.y);
  });

  it('moves a length readout off its segment along the normal, upward', () => {
    const figure = { ...sample('triangle'), marks: [{ id: 'len', kind: 'length' as const, from: 'A', to: 'B', confidence: 1 }] };
    const positions = positionsOf(figure);
    const readout = liveReadouts(figure, positions).find((entry) => entry.id === 'len');
    if (!readout) throw new Error('missing readout');
    expect(readoutPosition(figure, positions, readout)).toEqual({ x: readout.at.x, y: readout.at.y - LENGTH_READOUT_OFFSET });
  });

  it('leaves other readouts where they are', () => {
    const figure = sample('triangle');
    const positions = positionsOf(figure);
    const readout = { id: 'abc', text: ANGLE_SUM_TEXT, at: { x: 10, y: 20 } };
    expect(readoutPosition(figure, positions, readout)).toEqual(readout.at);
  });
});

describe('labelPosition', () => {
  it('puts a polygon vertex letter outside the shape, on the far side from its angle readout', () => {
    const figure = sample('triangle');
    const positions = positionsOf(figure);
    const vertex = pointOf(positions, 'A');
    const readout = liveReadouts(figure, positions).find((entry) => entry.id === 'mA');
    if (!readout) throw new Error('missing readout');
    const label = labelPosition(figure, positions, 'A');
    expect(away(vertex, label)).toBeCloseTo(LABEL_DISTANCE, 6);
    expect(away(label, readoutPosition(figure, positions, readout))).toBeGreaterThan(READOUT_OFFSET + LABEL_DISTANCE / 2);
  });

  it('puts a free point letter up and to the right', () => {
    const figure = sample('reflection');
    const positions = positionsOf(figure);
    const label = labelPosition(figure, positions, 'M');
    const point = pointOf(positions, 'M');
    expect(label.x).toBeGreaterThan(point.x);
    expect(label.y).toBeLessThan(point.y);
  });
});

describe('ghostCorners', () => {
  const figure = sample('reflection');
  const polygon = figure.polygons[0];
  if (!polygon) throw new Error('missing polygon');
  const positions = positionsOf(figure);
  const OFFSET = { x: 30, y: -10 };

  it('shifts the starting corners by the guess', () => {
    expect(ghostCorners(positions, polygon, OFFSET)).toEqual(
      polygon.vertices.map((id) => ({ x: pointOf(positions, id).x + OFFSET.x, y: pointOf(positions, id).y + OFFSET.y })),
    );
  });

  it('has no guess to show when the ghost never moved', () => {
    expect(ghostCorners(positions, polygon, { x: 0, y: 0 })).toBeNull();
  });
});

describe('figureControls', () => {
  const figure = sample('triangle');
  const question = questionOf(figure);

  it('offers Play when ready', () => {
    expect(figureControls({ kind: 'ready' }, null)).toEqual([{ label: 'Play', action: 'play', primary: true }]);
  });

  it('offers the invariant choices and no Reveal before a choice', () => {
    expect(figureControls({ kind: 'predict', question }, null)).toEqual(
      INVARIANT_CHOICES.map((choice) => ({ label: choice, action: 'choose', choice, primary: false })),
    );
  });

  it('highlights the chosen option and offers Reveal', () => {
    const controls = figureControls({ kind: 'predict', question }, SECOND_CHOICE ?? '');
    expect(controls.filter((control) => control.primary).map((control) => control.label)).toEqual([SECOND_CHOICE, 'Reveal']);
    expect(controls.at(-1)).toEqual({ label: 'Reveal', action: 'reveal', primary: true });
  });

  it('offers Reveal while guessing, nothing while playing and Replay while exploring', () => {
    expect(figureControls({ kind: 'guessing' }, null)).toEqual([{ label: 'Reveal', action: 'reveal', primary: true }]);
    expect(figureControls({ kind: 'playing', t: 0 }, null)).toEqual([]);
    expect(figureControls({ kind: 'exploring' }, null)).toEqual([{ label: 'Replay', action: 'replay', primary: true }]);
  });
});

describe('figureCaption', () => {
  const invariant = questionOf(sample('triangle'));
  const transform = questionOf(sample('reflection'));

  it('asks the question with the choice so far while predicting', () => {
    expect(figureCaption({ kind: 'predict', question: invariant }, invariant, null)).toEqual({
      headline: invariant.prompt,
      lines: ['What do you predict?'],
    });
    expect(figureCaption({ kind: 'predict', question: invariant }, invariant, FIRST_CHOICE ?? '').lines).toEqual([
      `You predicted: ${FIRST_CHOICE}.`,
    ]);
  });

  it('asks for a ghost guess while guessing', () => {
    expect(figureCaption({ kind: 'guessing' }, transform, null)).toEqual({ headline: transform.prompt, lines: [GHOST_DRAG_LINE] });
  });

  it('reveals the model answer with the prediction and explanation in one paragraph once exploring', () => {
    expect(figureCaption({ kind: 'exploring' }, invariant, SECOND_CHOICE ?? '')).toEqual({
      headline: `Answer: ${invariant.answer}`,
      lines: [`You predicted: ${SECOND_CHOICE}. ${invariant.explanation}`, EXPLORE_LINE],
    });
  });

  it('gives a transformation a short headline and the explanation as detail once exploring', () => {
    expect(figureCaption({ kind: 'exploring' }, transform, null)).toEqual({
      headline: LANDED_HEADLINE,
      lines: [transform.explanation, EXPLORE_LINE],
    });
  });

  // The caption row reserves two heading lines and three detail lines (styles.css, .figure-present). These widths are
  // conservative counts of characters per line at 1024 px and 1280 px wide, where the caption must not scroll.
  const HEADING_CHARS_PER_LINE = 50;
  const DETAIL_CHARS_PER_LINE = 80;
  const RESERVED_HEADING_LINES = 2;
  const RESERVED_DETAIL_LINES = 3;
  const linesFor = (text: string, perLine: number): number => Math.ceil(text.length / perLine);
  const translated = (): Figure => ({
    ...sample('rotation'),
    transformations: [{ id: 'slide', kind: 'translate', from: 'A', to: 'O', polygon: 'abc', confidence: 1 }],
    focus: { kind: 'transform', transformation: 'slide' },
  });
  const worstChoice = INVARIANT_CHOICES.reduce((longest, choice) => (choice.length > longest.length ? choice : longest));

  it.each([...GEOMETRY_SAMPLES.map((entry) => [entry.id, entry.figure] as const), ['translation', translated()] as const])(
    'fits the %s exploring caption in the reserved row',
    (_id, figure) => {
      const question = templateFigureQuestion(figure, figure.focus ?? focusOf(figure));
      const caption = figureCaption({ kind: 'exploring' }, question, question.answer === null ? null : worstChoice);
      const headingLines = linesFor(caption.headline, HEADING_CHARS_PER_LINE);
      const detailLines = caption.lines.reduce((sum, line) => sum + linesFor(line, DETAIL_CHARS_PER_LINE), 0);
      expect(headingLines).toBe(1);
      expect(detailLines).toBeLessThanOrEqual(RESERVED_DETAIL_LINES + (RESERVED_HEADING_LINES - headingLines));
    },
  );
});

describe('figureStrokes', () => {
  it('draws polygon sides that no segment already draws', () => {
    expect(figureStrokes(sample('reflection'))).toEqual([
      { from: 'A', to: 'B', kind: 'segment' },
      { from: 'B', to: 'C', kind: 'segment' },
      { from: 'C', to: 'A', kind: 'segment' },
    ]);
  });

  it('does not draw a side twice when a segment covers it', () => {
    expect(figureStrokes(sample('triangle'))).toHaveLength(sample('triangle').segments.length);
  });

  it('keeps lines as lines', () => {
    expect(figureStrokes(sample('parallel')).map((stroke) => stroke.kind)).toEqual(['line', 'line', 'line']);
  });
});

describe('movingPolygon and imagePolygon', () => {
  it('finds the polygon a transform focus moves', () => {
    const figure = sample('reflection');
    expect(movingPolygon(figure, focusOf(figure))?.id).toBe('abc');
    expect(movingPolygon(figure, null)).toBeNull();
    expect(movingPolygon(sample('triangle'), focusOf(sample('triangle')))).toBeNull();
  });

  it('names the image vertices with a prime', () => {
    const polygon = sample('reflection').polygons[0];
    if (!polygon) throw new Error('missing polygon');
    expect(imagePolygon(polygon).vertices).toEqual(polygon.vertices.map((id) => `${id}${IMAGE_SUFFIX}`));
  });
});

describe('showsLabel', () => {
  it.each([
    ['A', true],
    ['P', true],
    ['P1', false],
    ['P12', false],
  ])('labels %s: %s', (id, shown) => {
    expect(showsLabel(id)).toBe(shown);
  });
});
