import type { ApiFailure } from '../api';
import { positionsOf, type Point } from '../geometry/derive';
import { fitWrittenValues } from '../geometry/fit';
import { focusLabel, focusOptions, suggestedFocus, type FocusOption } from '../geometry/focus';
import { NO_FIGURE_FOCUS, polygonName, type GeometryQuestion } from '../geometry/questions';
import type { Figure, Focus, Mark, Polygon, Transformation } from '../geometry/schema';
import type { ApprovedGeometryLesson, ApprovedLesson, Draft, GeometryDraft, Session } from '../session/store';
import { linkHighlights, LOW_CONFIDENCE, percent } from './check';
import { h, s } from './dom';
import { questionCard, questionsPlaceholder, type CheckScreen, type QuestionsStatus } from './questionCards';

export const NOTHING_TO_PREDICT_FIGURE = NO_FIGURE_FOCUS;
export const GHOST_GUESS_NOTE = 'Students drag a ghost shape to their guess.';
export const MOVE_POINT_NOTE = 'If a point is in the wrong place, drag it on the photo to where it is on the board.';

type FigureCheckHandlers = {
  onPresent: () => void;
  onRestart: () => void;
  onFocus: (focus: Focus) => void;
  onMovePoint: (id: string, to: Point) => void;
};

type ShownBox = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;

type FigureRow = { id: string; text: string; confidence: number };

export type FigureEdge = { id: string; from: Point; to: Point; confidence: number };

const POINT_RADIUS = 10;
const POINT_REACH = 40;
const BADGE_OFFSET = 18;

const pair = ([from, to]: [string, string]): string => `${from}${to}`;

const writtenSuffix = (value: string | undefined): string => (value === undefined ? '' : ` · ${value} written`);

const markText = (mark: Mark): string => {
  switch (mark.kind) {
    case 'angle':
      return `Angle at ${mark.at}${writtenSuffix(mark.degrees === undefined ? undefined : `${mark.degrees}°`)}`;
    case 'right':
      return `Right angle at ${mark.at}`;
    case 'length':
      return `Length ${mark.from}${mark.to}${writtenSuffix(mark.value === undefined ? undefined : `${mark.value}${mark.unit === undefined ? '' : ` ${mark.unit}`}`)}`;
    case 'equal':
      return `Equal sides ${mark.segments.map(pair).join(', ')}`;
    case 'parallel':
      return `Parallel lines ${mark.lines.map(pair).join(', ')}`;
  }
};

const transformationText = (figure: Figure, transformation: Transformation): string => {
  const polygon = figure.polygons.find((entry) => entry.id === transformation.polygon);
  const shape = polygon ? polygonName(polygon) : transformation.polygon;
  switch (transformation.kind) {
    case 'reflect':
      return `Reflect ${shape} over ${pair(transformation.mirror)}`;
    case 'rotate':
      return `Rotate ${shape} ${transformation.degrees}° about ${transformation.centre}`;
    case 'translate':
      return `Translate ${shape} from ${transformation.from} to ${transformation.to}`;
    case 'dilate':
      return `Dilate ${shape} by ${transformation.factor} about ${transformation.centre}`;
  }
};

const rowsOf = (figure: Figure): FigureRow[] => [
  ...figure.points.map((point) => ({ id: point.id, text: `${point.id} · point`, confidence: point.confidence })),
  ...figure.marks.map((mark) => ({ id: mark.id, text: markText(mark), confidence: mark.confidence })),
  ...figure.transformations.map((entry) => ({ id: entry.id, text: transformationText(figure, entry), confidence: entry.confidence })),
];

export const figureRows = (figure: Figure): string[] => rowsOf(figure).map((row) => row.text);

const edgeKey = (a: string, b: string): string => [a, b].sort().join('|');

const polygonSides = (polygon: Polygon): [string, string][] =>
  polygon.vertices.map((vertex, index): [string, string] => [vertex, polygon.vertices[(index + 1) % polygon.vertices.length] ?? vertex]);

export const figureEdges = (figure: Figure): FigureEdge[] => {
  const positions = positionsOf(figure);
  const drawn = [...figure.segments, ...figure.lines, ...figure.rays];
  const seen = new Set(drawn.map((entry) => edgeKey(entry.from, entry.to)));
  const sides = figure.polygons.flatMap((polygon) =>
    polygonSides(polygon)
      .filter(([from, to]) => !seen.has(edgeKey(from, to)))
      .map(([from, to]) => ({ id: polygon.id, from, to, confidence: polygon.confidence })),
  );
  return [...drawn, ...sides].flatMap((entry) => {
    const [from, to] = [positions[entry.from], positions[entry.to]];
    return from && to ? [{ id: entry.id, from, to, confidence: entry.confidence }] : [];
  });
};

export const fitWarnings = (figure: Figure): string[] => {
  const fitted = fitWrittenValues(figure);
  return fitted.ok ? [] : fitted.conflicts;
};

export type FigureFocusChoices = { options: FocusOption[]; predictable: boolean; value: string };

const sameFocus = (first: Focus, second: Focus): boolean => JSON.stringify(first) === JSON.stringify(second);

const chosenValue = (focus: Focus): string => {
  switch (focus.kind) {
    case 'transform':
      return `chosen:transform:${focus.transformation}`;
    case 'angle-sum':
      return `chosen:angle-sum:${focus.polygon}:${focus.drag}`;
    case 'equal-angles':
      return `chosen:equal-angles:${focus.marks.join(':')}`;
  }
};

export const figureFocusChoices = (figure: Figure): FigureFocusChoices => {
  const listed = focusOptions(figure);
  const focus = suggestedFocus(figure);
  if (focus === null) return { options: listed, predictable: false, value: '' };
  const found = listed.find((option) => sameFocus(option.focus, focus));
  if (found) return { options: listed, predictable: true, value: found.value };
  const added: FocusOption = { value: chosenValue(focus), label: focusLabel(figure, focus), focus };
  return { options: [...listed, added], predictable: true, value: added.value };
};

export const currentFocusValue = (figure: Figure): string => figureFocusChoices(figure).value;

export const figureAnswerLine = (question: GeometryQuestion): string =>
  question.answer === null ? GHOST_GUESS_NOTE : `Model answer: ${question.answer}`;

type DraftFailure = Pick<ApiFailure, 'message' | 'details'>;

export const figureQuestionsFailureStatus = (failure: DraftFailure, retry: () => void): QuestionsStatus =>
  failure.message === NOTHING_TO_PREDICT_FIGURE ? { kind: 'nothing-to-predict' } : { kind: 'failed', failure, retry };

export const drawingPointAt = (shown: ShownBox, drawing: Figure['drawing'], client: Point): Point => ({
  x: ((client.x - shown.left) / shown.width) * drawing.width,
  y: ((client.y - shown.top) / shown.height) * drawing.height,
});

const lowClass = (confidence: number): string => (confidence < LOW_CONFIDENCE ? ' low' : '');

const overlay = (figure: Figure): SVGElement => {
  const edges = figureEdges(figure).map((edge) =>
    s(
      'g',
      { class: `overlay-item figure-edge${lowClass(edge.confidence)}`, 'data-id': edge.id },
      s('line', { x1: edge.from.x, y1: edge.from.y, x2: edge.to.x, y2: edge.to.y }),
    ),
  );
  const points = figure.points.map((point) => {
    const low = point.confidence < LOW_CONFIDENCE;
    return s(
      'g',
      { class: `overlay-item figure-point${lowClass(point.confidence)}`, 'data-id': point.id },
      s('circle', { class: 'reach', cx: point.x, cy: point.y, r: POINT_REACH }),
      s('circle', { cx: point.x, cy: point.y, r: POINT_RADIUS }),
      low ? s('text', { x: point.x + BADGE_OFFSET, y: point.y - BADGE_OFFSET, class: 'badge' }, `? ${percent(point.confidence)}`) : null,
    );
  });
  const unknown = figure.unknownMarks.map((mark) =>
    s(
      'g',
      { class: 'overlay-unknown', 'data-id': mark.id },
      s('rect', { x: mark.x - mark.width / 2, y: mark.y - mark.height / 2, width: mark.width, height: mark.height }),
      s('text', { x: mark.x - mark.width / 2, y: mark.y + mark.height / 2 + 30, class: 'badge' }, 'Not understood'),
    ),
  );
  return s('svg', { class: 'overlay', viewBox: `0 0 ${figure.drawing.width} ${figure.drawing.height}`, preserveAspectRatio: 'none' }, ...edges, ...points, ...unknown);
};

const draggablePoints = (svg: SVGElement, figure: Figure, onMove: (id: string, to: Point) => void): SVGElement => {
  svg.addEventListener('pointerdown', (down: PointerEvent) => {
    const group = down.target instanceof Element ? down.target.closest('.figure-point') : null;
    const id = group?.getAttribute('data-id');
    const start = figure.points.find((entry) => entry.id === id);
    if (!group || !id || !start) return;
    down.preventDefault();
    svg.setPointerCapture(down.pointerId);
    group.classList.add('dragging');
    let dropped: Point | null = null;
    const move = (event: PointerEvent): void => {
      dropped = drawingPointAt(svg.getBoundingClientRect(), figure.drawing, { x: event.clientX, y: event.clientY });
      group.setAttribute('transform', `translate(${dropped.x - start.x} ${dropped.y - start.y})`);
    };
    const finish = (event: PointerEvent): void => {
      svg.removeEventListener('pointermove', move);
      svg.removeEventListener('pointerup', finish);
      svg.removeEventListener('pointercancel', finish);
      group.classList.remove('dragging');
      group.removeAttribute('transform');
      if (event.type === 'pointerup' && dropped) onMove(id, dropped);
    };
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerup', finish);
    svg.addEventListener('pointercancel', finish);
  });
  return svg;
};

const row = ({ id, text, confidence }: FigureRow): HTMLElement => {
  const low = confidence < LOW_CONFIDENCE;
  return h(
    'li',
    { class: `item-row figure-row${low ? ' low' : ''}`, 'data-id': id },
    h('span', { class: 'kind' }, text),
    h('span', { class: 'confidence' }, low ? `check · ${percent(confidence)}` : percent(confidence)),
  );
};

const geometryOnly = <T extends Draft | ApprovedLesson>(lesson: T | null): Extract<T, { subject: 'geometry' }> | null => {
  if (lesson && lesson.subject !== 'geometry') throw new Error(`the figure check screen cannot show a ${lesson.subject} lesson`);
  return lesson as Extract<T, { subject: 'geometry' }> | null;
};

const lessonQuestions = (lesson: GeometryDraft | ApprovedGeometryLesson | null): HTMLElement[] =>
  lesson?.questions?.map((question) => questionCard(question, lesson.status, figureAnswerLine(question))) ?? [];

const warningsFor = (figure: Figure): HTMLElement[] => {
  const low = [...figure.points, ...figure.segments, ...figure.lines, ...figure.rays, ...figure.polygons, ...figure.marks, ...figure.transformations].filter(
    (entry) => entry.confidence < LOW_CONFIDENCE,
  );
  return [
    low.length > 0 &&
      h('li', { class: 'warn' }, `${low.length} reading${low.length === 1 ? '' : 's'} below ${percent(LOW_CONFIDENCE)} confidence: ${low.map((entry) => entry.id).join(', ')}. Check against the photo.`),
    ...fitWarnings(figure).map((conflict) => h('li', { class: 'warn' }, `${conflict} The figure keeps its drawn positions.`)),
    ...figure.unknownMarks.map((mark) => h('li', { class: 'unknown' }, `${mark.note}. Not understood, so it will not be used.`)),
  ].filter((entry): entry is HTMLLIElement => entry instanceof HTMLLIElement);
};

const focusSelect = ({ options, value }: FigureFocusChoices, onFocus: (focus: Focus) => void): HTMLElement => {
  const choose = (): void => {
    const picked = options.find((option) => option.value === select.value);
    if (picked) onFocus(picked.focus);
  };
  const select = h(
    'select',
    { id: 'figure-focus', title: 'What to predict', onchange: choose },
    ...options.map((option) => h('option', { value: option.value }, option.label)),
  );
  select.value = value;
  return h('label', { class: 'event-picker' }, h('span', {}, 'What to predict'), select);
};

const placeholderFor = (status: QuestionsStatus): HTMLElement | string =>
  status.kind === 'nothing-to-predict'
    ? h('p', { class: 'inline-note', role: 'status' }, NOTHING_TO_PREDICT_FIGURE)
    : (questionsPlaceholder(status) ?? '');

export const renderFigureCheck = (root: HTMLElement, session: Session, photoUrl: string, note: string, handlers: FigureCheckHandlers): CheckScreen => {
  const draft = geometryOnly(session.draft());
  if (!draft) throw new Error('nothing to check');
  const { figure } = draft;
  const choices = figureFocusChoices(figure);

  const draftSlot = h('div', { class: 'draft-slot' });
  const approvedSlot = h('div', { class: 'approved-slot' });
  let questionsStatus: QuestionsStatus = draft.questions ? { kind: 'ready' } : { kind: 'drafting' };
  const presentButton = h('button', { class: 'primary', disabled: true, onclick: handlers.onPresent }, 'Present to the class');
  const approveButton = h('button', {}, 'Approve figure and questions');

  const refreshApproval = (): void => {
    const approved = geometryOnly(session.presentable());
    const ready = questionsStatus.kind === 'ready';
    draftSlot.replaceChildren(...(ready ? lessonQuestions(geometryOnly(session.draft())) : [placeholderFor(questionsStatus)]));
    approvedSlot.replaceChildren(...lessonQuestions(approved));
    presentButton.disabled = approved === null;
    approveButton.disabled = approved !== null || !ready;
    approveButton.textContent = approved ? 'Approved' : 'Approve figure and questions';
  };
  approveButton.addEventListener('click', () => {
    session.approve();
    refreshApproval();
  });

  const warnings = warningsFor(figure);
  const questionsSection = choices.predictable
    ? [
        focusSelect(choices, handlers.onFocus),
        h('h2', {}, 'Predict questions'),
        draftSlot,
        approvedSlot,
        h('div', { class: 'panel-actions' }, approveButton, presentButton),
      ]
    : [h('p', { class: 'inline-note', role: 'status' }, NOTHING_TO_PREDICT_FIGURE)];

  root.replaceChildren(
    h(
      'section',
      { class: 'check' },
      h('div', { class: 'photo-frame' }, h('img', { src: photoUrl, alt: 'Photo of the board drawing' }), draggablePoints(overlay(figure), figure, handlers.onMovePoint)),
      h(
        'aside',
        { class: 'panel' },
        h('h1', {}, 'Check the reading'),
        h('p', { class: 'note' }, note),
        warnings.length > 0 ? h('ul', { class: 'warnings' }, ...warnings) : null,
        h('h2', {}, 'Figure'),
        h('p', { class: 'note' }, MOVE_POINT_NOTE),
        h('ul', { class: 'items' }, ...rowsOf(figure).map(row)),
        figure.unknownMarks.length > 0
          ? h('ul', { class: 'items' }, ...figure.unknownMarks.map((mark) => row({ id: mark.id, text: mark.note, confidence: mark.confidence })))
          : null,
        ...questionsSection,
        h('button', { class: 'quiet', onclick: handlers.onRestart }, 'Start over with a new photo'),
      ),
    ),
  );
  linkHighlights(root);
  refreshApproval();
  return {
    setQuestionsStatus: (status) => {
      questionsStatus = status;
      refreshApproval();
    },
  };
};
