import { IMAGE_SUFFIX, type Point, type Positions } from '../geometry/derive';
import { insidePolygon, pickPoint } from '../geometry/edits';
import { createFigurePlayback, liveReadouts, TRANSFORM_SECONDS, type FigurePhase, type Readout } from '../geometry/playback';
import { INVARIANT_CHOICES, type GeometryQuestion } from '../geometry/questions';
import type { Figure, Focus, Polygon, Transformation } from '../geometry/schema';
import { sketchFigure } from '../geometry/sketch';
import { createRedrawGate } from '../present/redraw';
import { TOUCH_REACH_PX, backingSize, toDrawing, viewOf, type View } from '../present/view';
import type { GeometryLesson } from '../session/store';
import { h } from './dom';

export const GHOST_DRAG_LINE = 'Drag the grey shape to where you think it lands.';
export const EXPLORE_LINE = 'Drag any point to test it, then press Replay to ask again.';
export const READOUT_OFFSET = 76;
export const LENGTH_READOUT_OFFSET = 36;
export const LABEL_DISTANCE = 34;

const READY_HEADLINE = 'Look at the figure.';
const READY_LINE = 'Press Play for the question.';
const READY_AGAIN_LINE = 'Press Play to ask again. The faint shape is where it landed last time.';
const CHOOSE_LINE = 'What do you predict?';
export const LANDED_HEADLINE = 'Here is where it lands.';
const MAX_FRAME_SECONDS = 0.1;
const MS_PER_SECOND = 1000;
const SKETCH_SEED = 7;

const INK = { board: '#f7f7f3', ink: '#1d2433', image: '#1f4fbf', ghost: '#6b7280', readout: '#ffffff' };
export const PHOTO_ALPHA = 0.35;
export const GHOST_ALPHA = 0.4;
export const PREVIOUS_ALPHA = 0.25;
const SHAPE_FILL_ALPHA = 0.12;
const LINE_WIDTH = 5;
const GUIDE_WIDTH = 3;
const GUIDE_DASH = [14, 10];
const POINT_RADIUS = 9;
const ARC_RADIUS = 34;
const RIGHT_MARK_SIZE = 26;
const ARROW_HEAD = 26;
const ARROW_SPREAD = Math.PI / 7;
const LABEL_FONT = '700 34px system-ui, sans-serif';
const READOUT_FONT = '700 30px system-ui, sans-serif';
const READOUT_PAD = 8;
const READOUT_HEIGHT = 42;
const UNNAMED_POINT = /^P\d+$/;

export type FigureAction = 'play' | 'choose' | 'reveal' | 'replay';
export type FigureControl =
  | { label: string; action: Exclude<FigureAction, 'choose'>; primary: boolean }
  | { label: string; action: 'choose'; choice: string; primary: boolean };
export type FigureCaption = { headline: string; lines: string[] };
export type Stroke = { from: string; to: string; kind: 'segment' | 'line' | 'ray' };

export const visibleReadouts = (figure: Figure, readouts: Readout[], focus: Focus | null, phase: FigurePhase['kind']): Readout[] => {
  if (focus?.kind !== 'transform' && phase === 'exploring') return readouts;
  const polygonIds = new Set(figure.polygons.map((entry) => entry.id));
  return readouts.filter((entry) => !polygonIds.has(entry.id));
};

const cornersOf = (positions: Positions, polygon: Polygon): Point[] | null => {
  const corners = polygon.vertices.map((id) => positions[id]);
  return corners.every((entry): entry is Point => entry !== undefined) ? corners : null;
};

const unit = (from: Point, to: Point): Point | null => {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  return length === 0 ? null : { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
};

const ORIGIN: Point = { x: 0, y: 0 };
const UP_RIGHT: Point = { x: Math.SQRT1_2, y: -Math.SQRT1_2 };

const along = (at: Point, direction: Point, distance: number): Point => ({ x: at.x + direction.x * distance, y: at.y + direction.y * distance });

const bisectorAt = (positions: Positions, vertex: string, from: string, to: string): Point | null => {
  const [at, start, end] = [positions[vertex], positions[from], positions[to]];
  const first = at && start && unit(at, start);
  const second = at && end && unit(at, end);
  return first && second ? unit(ORIGIN, { x: first.x + second.x, y: first.y + second.y }) : null;
};

const upwardNormal = (from: Point, to: Point): Point | null => {
  const direction = unit(from, to);
  if (!direction) return null;
  const normal = { x: direction.y, y: -direction.x };
  const flip = normal.y > 0 || (normal.y === 0 && normal.x < 0);
  return flip ? { x: -normal.x, y: -normal.y } : normal;
};

export const readoutPosition = (figure: Figure, positions: Positions, readout: Readout): Point => {
  const mark = figure.marks.find((entry) => entry.id === readout.id);
  if (mark?.kind === 'angle') {
    const [at, bisector] = [positions[mark.at], bisectorAt(positions, mark.at, mark.from, mark.to)];
    return at && bisector ? along(at, bisector, READOUT_OFFSET) : readout.at;
  }
  if (mark?.kind === 'length') {
    const [from, to] = [positions[mark.from], positions[mark.to]];
    const normal = from && to && upwardNormal(from, to);
    return normal ? along(readout.at, normal, LENGTH_READOUT_OFFSET) : readout.at;
  }
  return readout.at;
};

const centroidOf = (points: Point[]): Point => ({
  x: points.reduce((sum, entry) => sum + entry.x, 0) / points.length,
  y: points.reduce((sum, entry) => sum + entry.y, 0) / points.length,
});

const outwardFrom = (figure: Figure, positions: Positions, id: string, at: Point): Point | null => {
  for (const polygon of figure.polygons.filter((entry) => entry.vertices.includes(id))) {
    const corners = cornersOf(positions, polygon);
    const outward = corners && unit(centroidOf(corners), at);
    if (outward) return outward;
  }
  for (const mark of figure.marks) {
    if ((mark.kind !== 'angle' && mark.kind !== 'right') || mark.at !== id) continue;
    const bisector = bisectorAt(positions, mark.at, mark.from, mark.to);
    if (bisector) return { x: -bisector.x, y: -bisector.y };
  }
  return null;
};

export const labelPosition = (figure: Figure, positions: Positions, id: string): Point => {
  const at = positions[id] ?? ORIGIN;
  return along(at, outwardFrom(figure, positions, id, at) ?? UP_RIGHT, LABEL_DISTANCE);
};

export const ghostCorners = (positions: Positions, polygon: Polygon, offset: Point): Point[] | null => {
  if (offset.x === 0 && offset.y === 0) return null;
  const corners = cornersOf(positions, polygon);
  return corners && corners.map((corner) => ({ x: corner.x + offset.x, y: corner.y + offset.y }));
};

export const figureControls = (phase: FigurePhase, chosen: string | null): FigureControl[] => {
  switch (phase.kind) {
    case 'ready':
      return [{ label: 'Play', action: 'play', primary: true }];
    case 'predict':
      return [
        ...INVARIANT_CHOICES.map((choice): FigureControl => ({ label: choice, action: 'choose', choice, primary: choice === chosen })),
        ...(chosen ? [{ label: 'Reveal', action: 'reveal', primary: true } as const] : []),
      ];
    case 'guessing':
      return [{ label: 'Reveal', action: 'reveal', primary: true }];
    case 'playing':
      return [];
    case 'exploring':
      return [{ label: 'Replay', action: 'replay', primary: true }];
  }
};

const predictedLine = (chosen: string | null): string[] => (chosen ? [`You predicted: ${chosen}.`] : []);

export const figureCaption = (
  phase: FigurePhase,
  question: GeometryQuestion | null,
  chosen: string | null,
  playedBefore = false,
): FigureCaption => {
  const prompt = question?.prompt ?? READY_HEADLINE;
  switch (phase.kind) {
    case 'ready':
      return { headline: READY_HEADLINE, lines: [playedBefore ? READY_AGAIN_LINE : READY_LINE] };
    case 'predict':
      return { headline: phase.question.prompt, lines: chosen ? predictedLine(chosen) : [CHOOSE_LINE] };
    case 'guessing':
      return { headline: prompt, lines: [GHOST_DRAG_LINE] };
    case 'playing':
      return { headline: prompt, lines: [] };
    case 'exploring':
      if (question?.answer != null) {
        return { headline: `Answer: ${question.answer}`, lines: [[...predictedLine(chosen), question.explanation].join(' '), EXPLORE_LINE] };
      }
      return { headline: LANDED_HEADLINE, lines: [...(question?.explanation ? [question.explanation] : []), EXPLORE_LINE] };
  }
};

const strokeKey = (a: string, b: string): string => [a, b].sort().join('|');

export const figureStrokes = (figure: Figure): Stroke[] => {
  const drawn: Stroke[] = [
    ...figure.segments.map((entry): Stroke => ({ from: entry.from, to: entry.to, kind: 'segment' })),
    ...figure.lines.map((entry): Stroke => ({ from: entry.from, to: entry.to, kind: 'line' })),
    ...figure.rays.map((entry): Stroke => ({ from: entry.from, to: entry.to, kind: 'ray' })),
  ];
  const seen = new Set(drawn.map((entry) => strokeKey(entry.from, entry.to)));
  const sides = figure.polygons.flatMap((polygon) =>
    polygon.vertices.flatMap((from, index): Stroke[] => {
      const to = polygon.vertices[(index + 1) % polygon.vertices.length] ?? from;
      const key = strokeKey(from, to);
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ from, to, kind: 'segment' }];
    }),
  );
  return [...drawn, ...sides];
};

const transformationOf = (figure: Figure, focus: Focus | null): Transformation | null =>
  focus?.kind === 'transform' ? (figure.transformations.find((entry) => entry.id === focus.transformation) ?? null) : null;

export const movingPolygon = (figure: Figure, focus: Focus | null): Polygon | null => {
  const transformation = transformationOf(figure, focus);
  return (transformation && figure.polygons.find((entry) => entry.id === transformation.polygon)) ?? null;
};

export const imagePolygon = (polygon: Polygon): Polygon => ({
  ...polygon,
  vertices: polygon.vertices.map((id) => `${id}${IMAGE_SUFFIX}`),
});

export const showsLabel = (id: string): boolean => !UNNAMED_POINT.test(id);

const reducedMotion = (): boolean => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const sizeCanvas = (canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; width: number; height: number } | null => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const ratio = window.devicePixelRatio || 1;
  const { width, height } = canvas.getBoundingClientRect();
  const backing = backingSize({ width, height }, ratio);
  if (canvas.width !== backing.width || canvas.height !== backing.height) {
    canvas.width = backing.width;
    canvas.height = backing.height;
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
};

const extended = (from: Point, to: Point, reach: number): Point => {
  const direction = unit(from, to);
  return direction ? { x: to.x + direction.x * reach, y: to.y + direction.y * reach } : to;
};

const strokeLine = (ctx: CanvasRenderingContext2D, from: Point, to: Point): void => {
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
};

const drawStrokes = (ctx: CanvasRenderingContext2D, figure: Figure, positions: Positions): void => {
  const reach = Math.hypot(figure.drawing.width, figure.drawing.height);
  ctx.strokeStyle = INK.ink;
  ctx.lineWidth = LINE_WIDTH;
  ctx.lineCap = 'round';
  for (const stroke of figureStrokes(figure)) {
    const [from, to] = [positions[stroke.from], positions[stroke.to]];
    if (!from || !to) continue;
    const start = stroke.kind === 'line' ? extended(to, from, reach) : from;
    const end = stroke.kind === 'segment' ? to : extended(from, to, reach);
    strokeLine(ctx, start, end);
  }
};

const drawArrowHead = (ctx: CanvasRenderingContext2D, from: Point, to: Point): void => {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.beginPath();
  ctx.moveTo(to.x - ARROW_HEAD * Math.cos(angle - ARROW_SPREAD), to.y - ARROW_HEAD * Math.sin(angle - ARROW_SPREAD));
  ctx.lineTo(to.x, to.y);
  ctx.lineTo(to.x - ARROW_HEAD * Math.cos(angle + ARROW_SPREAD), to.y - ARROW_HEAD * Math.sin(angle + ARROW_SPREAD));
  ctx.stroke();
};

const drawGuide = (ctx: CanvasRenderingContext2D, figure: Figure, positions: Positions, transformation: Transformation | null): void => {
  if (!transformation) return;
  ctx.save();
  ctx.strokeStyle = INK.image;
  ctx.lineWidth = GUIDE_WIDTH;
  if (transformation.kind === 'reflect') {
    const [first, second] = [positions[transformation.mirror[0]], positions[transformation.mirror[1]]];
    const reach = Math.hypot(figure.drawing.width, figure.drawing.height);
    ctx.setLineDash(GUIDE_DASH);
    if (first && second) strokeLine(ctx, extended(second, first, reach), extended(first, second, reach));
  }
  if (transformation.kind === 'translate') {
    const [from, to] = [positions[transformation.from], positions[transformation.to]];
    if (from && to) {
      strokeLine(ctx, from, to);
      drawArrowHead(ctx, from, to);
    }
  }
  ctx.restore();
};

const drawAngleMarks = (ctx: CanvasRenderingContext2D, figure: Figure, positions: Positions): void => {
  ctx.save();
  ctx.strokeStyle = INK.ink;
  ctx.lineWidth = GUIDE_WIDTH;
  for (const mark of figure.marks) {
    if (mark.kind !== 'angle' && mark.kind !== 'right') continue;
    const [at, from, to] = [positions[mark.at], positions[mark.from], positions[mark.to]];
    const first = at && from && unit(at, from);
    const second = at && to && unit(at, to);
    if (!at || !first || !second) continue;
    ctx.beginPath();
    if (mark.kind === 'right') {
      ctx.moveTo(at.x + first.x * RIGHT_MARK_SIZE, at.y + first.y * RIGHT_MARK_SIZE);
      ctx.lineTo(at.x + (first.x + second.x) * RIGHT_MARK_SIZE, at.y + (first.y + second.y) * RIGHT_MARK_SIZE);
      ctx.lineTo(at.x + second.x * RIGHT_MARK_SIZE, at.y + second.y * RIGHT_MARK_SIZE);
    } else {
      const start = Math.atan2(first.y, first.x);
      const sweep = Math.atan2(first.x * second.y - first.y * second.x, first.x * second.x + first.y * second.y);
      ctx.arc(at.x, at.y, ARC_RADIUS, start, start + sweep, sweep < 0);
    }
    ctx.stroke();
  }
  ctx.restore();
};

const drawShape = (ctx: CanvasRenderingContext2D, corners: Point[], colour: string, alpha: number): void => {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineWidth = LINE_WIDTH;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  corners.forEach((corner, index) => (index === 0 ? ctx.moveTo(corner.x, corner.y) : ctx.lineTo(corner.x, corner.y)));
  ctx.closePath();
  ctx.stroke();
  ctx.globalAlpha = alpha * SHAPE_FILL_ALPHA;
  ctx.fill();
  ctx.restore();
};

const drawLabel = (ctx: CanvasRenderingContext2D, text: string, at: Point, colour: string): void => {
  ctx.fillStyle = colour;
  ctx.font = LABEL_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, at.x, at.y);
};

const drawPoints = (ctx: CanvasRenderingContext2D, figure: Figure, positions: Positions): void => {
  for (const point of figure.points) {
    const at = positions[point.id];
    if (!at) continue;
    ctx.fillStyle = INK.ink;
    ctx.beginPath();
    ctx.arc(at.x, at.y, POINT_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    if (showsLabel(point.id)) drawLabel(ctx, point.id, labelPosition(figure, positions, point.id), INK.ink);
  }
};

const drawImageLabels = (ctx: CanvasRenderingContext2D, polygon: Polygon, positions: Positions, colour: string): void => {
  const corners = cornersOf(positions, polygon);
  if (!corners) return;
  const centre = centroidOf(corners);
  polygon.vertices.forEach((id, index) => {
    const at = corners[index];
    if (at) drawLabel(ctx, id, along(at, unit(centre, at) ?? UP_RIGHT, LABEL_DISTANCE), colour);
  });
};

const drawReadouts = (ctx: CanvasRenderingContext2D, figure: Figure, positions: Positions, readouts: Readout[]): void => {
  ctx.save();
  ctx.font = READOUT_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const readout of readouts) {
    const at = readoutPosition(figure, positions, readout);
    const width = ctx.measureText(readout.text).width + READOUT_PAD * 2;
    ctx.fillStyle = INK.ink;
    ctx.fillRect(at.x - width / 2, at.y - READOUT_HEIGHT / 2, width, READOUT_HEIGHT);
    ctx.fillStyle = INK.readout;
    ctx.fillText(readout.text, at.x, at.y);
  }
  ctx.restore();
};

type StageState = {
  figure: Figure;
  focus: Focus | null;
  image: HTMLImageElement | null;
  phase: FigurePhase;
  positions: Positions;
  previous: Positions | null;
  guess: Point[] | null;
};

const drawStage = (canvas: HTMLCanvasElement, state: StageState): void => {
  const sized = sizeCanvas(canvas);
  if (!sized) return;
  const { ctx, width, height } = sized;
  const { figure, focus, positions, phase } = state;
  const view = viewOf({ width, height }, figure.drawing);
  ctx.fillStyle = INK.board;
  ctx.fillRect(0, 0, width, height);
  ctx.translate(view.offsetX, view.offsetY);
  ctx.scale(view.scale, view.scale);
  ctx.beginPath();
  ctx.rect(0, 0, figure.drawing.width, figure.drawing.height);
  ctx.clip();
  if (state.image) {
    ctx.globalAlpha = PHOTO_ALPHA;
    ctx.drawImage(state.image, 0, 0, figure.drawing.width, figure.drawing.height);
    ctx.globalAlpha = 1;
  }

  const moving = movingPolygon(figure, focus);
  const image = moving && imagePolygon(moving);
  drawGuide(ctx, figure, positions, transformationOf(figure, focus));
  const previousCorners = image && state.previous && cornersOf(state.previous, image);
  if (previousCorners) drawShape(ctx, previousCorners, INK.image, PREVIOUS_ALPHA);
  drawStrokes(ctx, figure, positions);
  drawAngleMarks(ctx, figure, positions);
  const imageCorners = image && cornersOf(positions, image);
  if (state.guess && phase.kind !== 'guessing') drawShape(ctx, state.guess, INK.ghost, GHOST_ALPHA);
  if (image && imageCorners) {
    const ghost = phase.kind === 'guessing';
    drawShape(ctx, imageCorners, ghost ? INK.ghost : INK.image, ghost ? GHOST_ALPHA : 1);
    if (!ghost) drawImageLabels(ctx, image, positions, INK.image);
  }
  drawPoints(ctx, figure, positions);
  drawReadouts(ctx, figure, positions, visibleReadouts(figure, liveReadouts(figure, positions), focus, phase.kind));
};

const sketchUrl = (figure: Figure): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sketchFigure(figure, SKETCH_SEED))}`;

type Drag = { pointerId: number; target: { kind: 'point'; id: string } | { kind: 'ghost'; last: Point } };

export const renderFigurePresent = (root: HTMLElement, lesson: GeometryLesson, photoUrl: string | null, onExit: () => void): (() => void) => {
  const { figure } = lesson;
  const focus: Focus | null = lesson.questions[0]?.observe.focus ?? null;
  const moving = movingPolygon(figure, focus);
  const ghostShape = moving && imagePolygon(moving);
  const playback = createFigurePlayback(lesson);

  const canvas = h('canvas', { class: 'stage', 'aria-label': 'The figure from the board, redrawn with live measurements' });
  const caption = h('div', { class: 'caption', role: 'status', 'aria-live': 'polite' });
  const controls = h('div', { class: 'controls' });
  const section = h(
    'section',
    { class: 'present figure-present' },
    caption,
    h('div', { class: 'canvas-frame' }, canvas),
    controls,
    h('button', { class: 'exit quiet', onclick: () => exit() }, 'Exit'),
  );

  const redraw = createRedrawGate();
  const resizeObserver = new ResizeObserver(() => redraw.invalidate());
  let image: HTMLImageElement | null = null;
  let question: GeometryQuestion | null = null;
  let chosen: string | null = null;
  let drag: Drag | null = null;
  let guess: Point[] | null = null;
  let shown = '';
  let frame = 0;
  let last = performance.now();

  const photo = new Image();
  photo.addEventListener('load', () => {
    image = photo;
    redraw.invalidate();
  });
  photo.src = photoUrl ?? sketchUrl(figure);

  const changed = (): void => redraw.invalidate();

  const play = (): void => {
    playback.play();
    changed();
  };
  const choose = (choice: string): void => {
    chosen = choice;
    changed();
  };
  const reveal = (): void => {
    const kind = playback.phase().kind;
    if (kind === 'predict' && chosen) playback.answer();
    if (kind === 'guessing') {
      guess = moving && ghostCorners(playback.positions(), moving, playback.ghostOffset());
      playback.reveal();
      if (reducedMotion()) playback.tick(TRANSFORM_SECONDS);
    }
    changed();
  };
  const replay = (): void => {
    playback.replay();
    chosen = null;
    guess = null;
    changed();
  };

  const run = (control: FigureControl): void => {
    if (control.action === 'choose') choose(control.choice);
    else ({ play, reveal, replay })[control.action]();
  };

  const showPhase = (phase: FigurePhase): void => {
    const playedBefore = playback.previousImage() !== null;
    const key = JSON.stringify([phase.kind, question?.prompt ?? null, chosen, playedBefore]);
    if (key === shown) return;
    shown = key;
    const text = figureCaption(phase, question, chosen, playedBefore);
    caption.replaceChildren(h('p', { class: 'question-text' }, text.headline), ...text.lines.map((line) => h('p', { class: 'explanation-text' }, line)));
    controls.replaceChildren(
      ...figureControls(phase, chosen).map((control) =>
        h('button', { class: control.primary ? 'primary big' : 'big', onclick: () => run(control) }, control.label),
      ),
    );
  };

  const editable = (): boolean => ['guessing', 'exploring'].includes(playback.phase().kind);

  const loop = (now: number): void => {
    const elapsed = Math.min((now - last) / MS_PER_SECOND, MAX_FRAME_SECONDS);
    last = now;
    const phase = playback.phase();
    if (phase.kind === 'predict') {
      question = phase.question;
      if (phase.question.answer === null) playback.answer();
    }
    const playing = playback.phase().kind === 'playing';
    if (playing) playback.tick(elapsed);
    if (redraw.shouldDraw(playing)) {
      drawStage(canvas, {
        figure,
        focus,
        image,
        phase: playback.phase(),
        positions: playback.positions(),
        previous: playback.previousImage(),
        guess,
      });
    }
    showPhase(playback.phase());
    canvas.classList.toggle('editable', editable());
    canvas.classList.toggle('holding', drag !== null);
    frame = requestAnimationFrame(loop);
  };

  const viewNow = (): { view: View; rect: DOMRect } => {
    const rect = canvas.getBoundingClientRect();
    return { view: viewOf({ width: rect.width, height: rect.height }, figure.drawing), rect };
  };
  const drawingPoint = (event: PointerEvent): Point => {
    const { view, rect } = viewNow();
    return toDrawing(view, { x: event.clientX - rect.left, y: event.clientY - rect.top });
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (drag || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const kind = playback.phase().kind;
    const at = drawingPoint(event);
    let target: Drag['target'] | null = null;
    if (kind === 'guessing' && ghostShape && insidePolygon(playback.positions(), ghostShape, at)) target = { kind: 'ghost', last: at };
    if (kind === 'exploring') {
      const { view, rect } = viewNow();
      const id = pickPoint(figure, playback.positions(), view, { x: event.clientX - rect.left, y: event.clientY - rect.top }, TOUCH_REACH_PX);
      if (id !== null) target = { kind: 'point', id };
    }
    if (!target) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    drag = { pointerId: event.pointerId, target };
  };
  const onPointerMove = (event: PointerEvent): void => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const at = drawingPoint(event);
    if (drag.target.kind === 'ghost') {
      playback.dragGhost({ x: at.x - drag.target.last.x, y: at.y - drag.target.last.y });
      drag = { ...drag, target: { kind: 'ghost', last: at } };
    } else {
      playback.dragPoint(drag.target.id, at);
    }
    redraw.invalidate();
  };
  const onPointerEnd = (event: PointerEvent): void => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag = null;
    redraw.invalidate();
  };
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerEnd);
  canvas.addEventListener('pointercancel', onPointerEnd);

  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    if (event.target instanceof HTMLButtonElement) return;
    const kind = playback.phase().kind;
    event.preventDefault();
    if (kind === 'ready') play();
    else if ((kind === 'predict' && chosen) || kind === 'guessing') reveal();
    else if (kind === 'exploring') replay();
  };

  const exit = (): void => {
    if (document.fullscreenElement) void document.exitFullscreen();
    onExit();
  };

  root.replaceChildren(section);
  section.requestFullscreen?.().catch(() => undefined);
  window.addEventListener('keydown', onKey);
  resizeObserver.observe(canvas);
  frame = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    window.removeEventListener('keydown', onKey);
  };
};
