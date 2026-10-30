import { chartPaths, feedingDots, ringRadius, type FeedingDot } from '../ecosystem/chart';
import { editOnRelease, emptyEdits, pickSpecies, setStart, startMax, type WebEdits } from '../ecosystem/edits';
import { EVENT_STEP, MODEL_STEPS, STEPS_PER_SECOND_SHOWN, startingPopulations, type Series } from '../ecosystem/model';
import { EXTINCT_FRACTION } from '../ecosystem/outcomes';
import { createWebPlayback, type WebPhase } from '../ecosystem/playback';
import { CHOICE_FOR, WEB_CHOICES, describeEvent, eventOf } from '../ecosystem/questions';
import type { Species, Web } from '../ecosystem/schema';
import { sketchWeb } from '../ecosystem/sketch';
import type { Box } from '../present/onPhoto';
import { createRedrawGate } from '../present/redraw';
import { TOUCH_REACH_PX, backingSize, viewOf, type Point } from '../present/view';
import type { EcosystemLesson } from '../session/store';
import { h } from './dom';

const STEP_MS = 1000 / STEPS_PER_SECOND_SHOWN;
const MAX_FRAME_MS = 100;
const SKETCH_SEED = 7;

const INK = { board: '#f7f7f3', black: '#1d2433', label: '#ffffff' };
const FALLBACK_PALETTE = ['#1e7f4f', '#1f4fbf', '#b9770e', '#c0392b', '#7b3fa0', '#0f7c8a'];
const PALETTE_SIZE = FALLBACK_PALETTE.length;
const GHOST_ALPHA = 0.3;
const RING_WIDTH = 7;
const RING_FILL_ALPHA = 0.12;
const DOT_RADIUS = 10;
const CROSS_WIDTH = 10;
const CROSS_MARGIN = 6;
const LABEL_FONT = '700 30px system-ui, sans-serif';
const LABEL_PAD = 8;
const LABEL_HEIGHT = 42;
const LABEL_GAP = 14;
const PRECISE_BELOW = 10;

const CHART_PAD = { left: 8, right: 8, top: 8, bottom: 8 };
const CHART_LINE_WIDTH = 3;
const CHART_AXIS_WIDTH = 1;
const EVENT_DASH = [4, 6];

// A finger moving less than this is still a tap; past it the press becomes a drag of the starting number.
const TAP_SLOP_PX = 8;
// Dragging this far up takes a species from nothing to its largest start.
const DRAG_PX_FOR_FULL_RANGE = 320;

const reducedMotion = (): boolean => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const paletteOf = (element: HTMLElement): string[] => {
  const style = getComputedStyle(element);
  return FALLBACK_PALETTE.map((fallback, index) => style.getPropertyValue(`--species-${index + 1}`).trim() || fallback);
};

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

const formatCount = (value: number): string => (value < PRECISE_BELOW ? value.toFixed(1) : Math.round(value).toString());

type Drag = { pointerId: number; id: string; startY: number; from: number; value: number; moved: boolean };
type StageState = {
  web: Web;
  image: HTMLImageElement | null;
  series: Series;
  step: number;
  dotStep: number;
  steady: Record<string, number>;
  edits: WebEdits;
  drag: Drag | null;
  colours: Map<string, string>;
};

const valueAt = (state: StageState, id: string): number =>
  state.drag?.moved && state.drag.id === id && !state.edits.removed.has(id) ? state.drag.value : (state.series.values[id]?.[state.step] ?? 0);

const isGone = (state: StageState, id: string): boolean =>
  state.edits.removed.has(id) || valueAt(state, id) <= (state.steady[id] ?? 0) * EXTINCT_FRACTION;

const drawDots = (ctx: CanvasRenderingContext2D, state: StageState): void => {
  const centreKey = (point: Point): string => `${point.x},${point.y}`;
  const byCentre = new Map(state.web.species.map((entry) => [centreKey(entry), entry.id]));
  const alive = (point: Point): boolean => {
    const id = byCentre.get(centreKey(point));
    return id !== undefined && !isGone(state, id);
  };
  const dots = feedingDots(state.web, state.dotStep).filter((dot: FeedingDot) => alive(dot.from) && alive(dot.to));
  for (const dot of dots) {
    const eaten = byCentre.get(centreKey(dot.from));
    ctx.fillStyle = (eaten && state.colours.get(eaten)) || INK.black;
    ctx.beginPath();
    ctx.arc(dot.from.x + (dot.to.x - dot.from.x) * dot.t, dot.from.y + (dot.to.y - dot.from.y) * dot.t, DOT_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }
};

const drawRing = (ctx: CanvasRenderingContext2D, state: StageState, entry: Species): void => {
  if (state.edits.removed.has(entry.id)) return;
  const colour = state.colours.get(entry.id) ?? INK.black;
  const radius = Math.max(entry.width, entry.height) / 2 + ringRadius(valueAt(state, entry.id), state.steady[entry.id] ?? 0);
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineWidth = RING_WIDTH;
  ctx.beginPath();
  ctx.arc(entry.x, entry.y, radius, 0, Math.PI * 2);
  ctx.globalAlpha = RING_FILL_ALPHA;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.stroke();
  ctx.restore();
};

const drawCross = (ctx: CanvasRenderingContext2D, entry: Species): void => {
  const [halfWidth, halfHeight] = [entry.width / 2 + CROSS_MARGIN, entry.height / 2 + CROSS_MARGIN];
  ctx.save();
  ctx.strokeStyle = INK.black;
  ctx.lineWidth = CROSS_WIDTH;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(entry.x - halfWidth, entry.y - halfHeight);
  ctx.lineTo(entry.x + halfWidth, entry.y + halfHeight);
  ctx.moveTo(entry.x + halfWidth, entry.y - halfHeight);
  ctx.lineTo(entry.x - halfWidth, entry.y + halfHeight);
  ctx.stroke();
  ctx.restore();
};

const drawStartLabel = (ctx: CanvasRenderingContext2D, state: StageState, entry: Species, value: number): void => {
  const text = `Start: ${formatCount(value)}`;
  ctx.save();
  ctx.font = LABEL_FONT;
  const width = ctx.measureText(text).width + LABEL_PAD * 2;
  const top = entry.y - entry.height / 2 - LABEL_GAP - LABEL_HEIGHT;
  ctx.fillStyle = state.colours.get(entry.id) ?? INK.black;
  ctx.fillRect(entry.x - width / 2, top, width, LABEL_HEIGHT);
  ctx.fillStyle = INK.label;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, entry.x, top + LABEL_HEIGHT / 2);
  ctx.restore();
};

const drawStage = (canvas: HTMLCanvasElement, state: StageState, showStarts: boolean): void => {
  const sized = sizeCanvas(canvas);
  if (!sized) return;
  const { ctx, width, height } = sized;
  const { drawing } = state.web;
  const view = viewOf({ width, height }, drawing);
  ctx.fillStyle = INK.board;
  ctx.fillRect(0, 0, width, height);
  ctx.translate(view.offsetX, view.offsetY);
  ctx.scale(view.scale, view.scale);
  if (state.image) ctx.drawImage(state.image, 0, 0, drawing.width, drawing.height);
  for (const entry of state.web.species) drawRing(ctx, state, entry);
  drawDots(ctx, state);
  for (const entry of state.web.species) {
    if (state.edits.removed.has(entry.id)) drawCross(ctx, entry);
    const edited = state.edits.start[entry.id];
    if (state.drag?.moved && state.drag.id === entry.id && !state.edits.removed.has(entry.id)) drawStartLabel(ctx, state, entry, state.drag.value);
    else if (showStarts && edited !== undefined && !state.edits.removed.has(entry.id)) drawStartLabel(ctx, state, entry, edited);
  }
};

// The current run and the faint previous one are drawn against one shared scale, so their heights compare.
const sharedPaths = (series: Series, ghost: Series | null, box: Box, upTo: number): { now: Record<string, string>; before: Record<string, string> } => {
  if (!ghost) return { now: chartPaths(series, box, upTo), before: {} };
  const ghostId = (id: string): string => `before:${id}`;
  const both: Series = {
    ids: [...series.ids, ...ghost.ids.map(ghostId)],
    values: { ...series.values, ...Object.fromEntries(ghost.ids.map((id) => [ghostId(id), ghost.values[id] ?? []])) },
  };
  const now = chartPaths(both, box, upTo);
  const full = chartPaths(both, box, MODEL_STEPS);
  return {
    now: Object.fromEntries(series.ids.map((id) => [id, now[id] ?? ''])),
    before: Object.fromEntries(ghost.ids.map((id) => [id, full[ghostId(id)] ?? ''])),
  };
};

const drawChart = (canvas: HTMLCanvasElement, series: Series, ghost: Series | null, step: number, colours: Map<string, string>): void => {
  const sized = sizeCanvas(canvas);
  if (!sized) return;
  const { ctx, width, height } = sized;
  const box: Box = {
    x: CHART_PAD.left,
    y: CHART_PAD.top,
    width: Math.max(0, width - CHART_PAD.left - CHART_PAD.right),
    height: Math.max(0, height - CHART_PAD.top - CHART_PAD.bottom),
  };
  ctx.strokeStyle = INK.black;
  ctx.lineWidth = CHART_AXIS_WIDTH;
  ctx.beginPath();
  ctx.moveTo(box.x, box.y);
  ctx.lineTo(box.x, box.y + box.height);
  ctx.lineTo(box.x + box.width, box.y + box.height);
  ctx.stroke();
  const eventX = box.x + (EVENT_STEP / MODEL_STEPS) * box.width;
  ctx.setLineDash(EVENT_DASH);
  ctx.beginPath();
  ctx.moveTo(eventX, box.y);
  ctx.lineTo(eventX, box.y + box.height);
  ctx.stroke();
  ctx.setLineDash([]);

  const { now, before } = sharedPaths(series, ghost, box, step);
  ctx.lineWidth = CHART_LINE_WIDTH;
  ctx.lineJoin = 'round';
  ctx.globalAlpha = GHOST_ALPHA;
  for (const [id, path] of Object.entries(before)) {
    ctx.strokeStyle = colours.get(id) ?? INK.black;
    ctx.stroke(new Path2D(path));
  }
  ctx.globalAlpha = 1;
  for (const [id, path] of Object.entries(now)) {
    ctx.strokeStyle = colours.get(id) ?? INK.black;
    ctx.stroke(new Path2D(path));
  }
};

const sketchUrl = (web: Web): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sketchWeb(web, SKETCH_SEED))}`;

export const renderWebPresent = (root: HTMLElement, lesson: EcosystemLesson, photoUrl: string | null, onExit: () => void): (() => void) => {
  const { web } = lesson;
  const playback = createWebPlayback(lesson);
  const eventText = describeEvent(web, eventOf(web));
  const steady = startingPopulations(web);
  const maxStart = new Map(web.species.map((entry) => [entry.id, startMax(web, entry.id)]));

  const canvas = h('canvas', { class: 'stage', 'aria-label': 'Food web drawing with each population shown as a ring' });
  const chartCanvas = h('canvas', { class: 'web-chart-lines', 'aria-hidden': 'true' });
  const legend = h('ul', { class: 'web-legend' });
  const chart = h(
    'figure',
    { class: 'web-chart' },
    h('figcaption', {}, 'Populations (a model)'),
    h('div', { class: 'canvas-frame' }, chartCanvas),
    legend,
  );
  const caption = h('div', { class: 'caption', role: 'status', 'aria-live': 'polite' });
  const controls = h('div', { class: 'controls' });
  const section = h(
    'section',
    { class: 'present web-present' },
    caption,
    h('div', { class: 'web-body' }, h('div', { class: 'canvas-frame' }, canvas), chart),
    controls,
    h('button', { class: 'exit quiet', onclick: () => exit() }, 'Exit'),
  );

  const redraw = createRedrawGate();
  const resizeObserver = new ResizeObserver(() => redraw.invalidate());
  let image: HTMLImageElement | null = null;
  let colours = new Map<string, string>();
  let edits = emptyEdits();
  let ghost: Series | null = null;
  let drag: Drag | null = null;
  let chosen: string | null = null;
  let shownPhase: WebPhase | null = null;
  let frame = 0;
  let last = performance.now();
  let carry = 0;

  const photo = new Image();
  photo.addEventListener('load', () => {
    image = photo;
    redraw.invalidate();
  });
  photo.src = photoUrl ?? sketchUrl(web);

  const editable = (): boolean => {
    const kind = playback.phase().kind;
    return kind === 'done' || (kind === 'ready' && ghost !== null);
  };
  const edited = (): boolean => edits.removed.size > 0 || Object.keys(edits.start).length > 0;

  const renderLegend = (): void => {
    legend.replaceChildren(
      ...web.species.map((entry) =>
        h('li', { style: `--swatch: ${colours.get(entry.id) ?? INK.black}`, class: edits.removed.has(entry.id) ? 'removed' : '' }, entry.name),
      ),
    );
  };

  const rerun = (next: WebEdits): void => {
    if (playback.step() > 0) ghost = playback.series();
    edits = next;
    chosen = null;
    playback.replay(edits);
    renderLegend();
    carry = 0;
    shownPhase = null;
    redraw.invalidate();
  };
  const replay = (): void => rerun(edits);
  const resetEdits = (): void => rerun(emptyEdits());
  const choose = (choice: string): void => {
    chosen = choice;
    shownPhase = null;
  };

  const button = (label: string, action: () => void, primary = false): HTMLButtonElement =>
    h('button', { class: primary ? 'primary big' : 'big', onclick: action }, label);
  const line = (className: string, text: string): HTMLParagraphElement => h('p', { class: className }, text);
  const editHint = 'Tap a species to remove it or bring it back. Drag one up or down to change how many there are at the start.';

  const showPhase = (phase: WebPhase): void => {
    if (phase === shownPhase) return;
    shownPhase = phase;
    switch (phase.kind) {
      case 'ready':
        if (ghost) {
          caption.replaceChildren(line('question-text', eventText), line('explanation-text', `${editHint} The faint lines show the last run.`));
          controls.replaceChildren(button('Play', playback.play, true), ...(edited() ? [button('Put everything back', resetEdits)] : []));
        } else {
          caption.replaceChildren(line('question-text', eventText), line('explanation-text', 'Press Play. The populations settle first, then we stop to predict.'));
          controls.replaceChildren(button('Play', playback.play, true));
        }
        break;
      case 'steady':
        caption.replaceChildren(line('question-text', eventText), line('explanation-text', 'Watch the populations settle.'));
        controls.replaceChildren();
        break;
      case 'predict':
        caption.replaceChildren(
          line('question-text', phase.question.prompt),
          line('choices-text', chosen ? `You predicted: ${chosen}.` : 'What do you predict?'),
        );
        controls.replaceChildren(
          ...WEB_CHOICES.map((choice) => button(choice, () => choose(choice), choice === chosen)),
          ...(chosen ? [button('Reveal', playback.reveal, true)] : []),
        );
        break;
      case 'playing':
        caption.replaceChildren(line('question-text', eventText), ...(chosen ? [line('choices-text', `You predicted: ${chosen}.`)] : []));
        controls.replaceChildren();
        break;
      case 'done':
        caption.replaceChildren(
          line('question-text', phase.result ? `${CHOICE_FOR[phase.result.direction]}: ${phase.result.question.explanation}` : 'Nothing changes after these edits.'),
          line('explanation-text', editHint),
        );
        controls.replaceChildren(button('Replay', replay, true));
        break;
    }
  };

  const loop = (now: number): void => {
    const elapsed = Math.min(now - last, MAX_FRAME_MS);
    last = now;
    const moving = (): boolean => ['steady', 'playing'].includes(playback.phase().kind);
    if (moving()) {
      carry += elapsed;
      const steps = Math.floor(carry / STEP_MS);
      carry -= steps * STEP_MS;
      playback.tick(steps);
    } else {
      carry = 0;
    }
    if (redraw.shouldDraw(moving())) {
      const step = playback.step();
      const state: StageState = {
        web,
        image,
        series: playback.series(),
        step,
        dotStep: reducedMotion() ? 0 : step,
        steady,
        edits,
        drag,
        colours,
      };
      drawStage(canvas, state, playback.phase().kind === 'ready');
      drawChart(chartCanvas, playback.series(), ghost, step, colours);
    }
    showPhase(playback.phase());
    canvas.classList.toggle('editable', editable());
    canvas.classList.toggle('holding', drag !== null && drag.moved && !edits.removed.has(drag.id));
    frame = requestAnimationFrame(loop);
  };

  const startOf = (id: string): number => edits.start[id] ?? steady[id] ?? 0;

  const onPointerDown = (event: PointerEvent): void => {
    if (drag || !editable()) return;
    const rect = canvas.getBoundingClientRect();
    const view = viewOf({ width: rect.width, height: rect.height }, web.drawing);
    const id = pickSpecies(web, view, { x: event.clientX - rect.left, y: event.clientY - rect.top }, TOUCH_REACH_PX);
    if (id === null) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    drag = { pointerId: event.pointerId, id, startY: event.clientY, from: startOf(id), value: startOf(id), moved: false };
  };
  const onPointerMove = (event: PointerEvent): void => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const rise = drag.startY - event.clientY;
    if (!drag.moved && Math.abs(rise) < TAP_SLOP_PX) return;
    if (edits.removed.has(drag.id)) {
      drag = { ...drag, moved: true };
      return;
    }
    const max = maxStart.get(drag.id) ?? 0;
    const value = setStart(edits, drag.id, drag.from + (rise / DRAG_PX_FOR_FULL_RANGE) * max, max).start[drag.id] ?? 0;
    drag = { ...drag, moved: true, value };
    redraw.invalidate();
  };
  const onPointerUp = (event: PointerEvent): void => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const released = drag;
    drag = null;
    if (!editable()) return;
    const next = editOnRelease(edits, { ...released, max: maxStart.get(released.id) ?? 0 });
    if (next) rerun(next);
    else redraw.invalidate();
  };
  const onPointerCancel = (event: PointerEvent): void => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag = null;
    redraw.invalidate();
  };
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);

  const onKey = (event: KeyboardEvent): void => {
    const kind = playback.phase().kind;
    if (event.key === ' ' || event.key === 'Enter') {
      if (event.target instanceof HTMLButtonElement) return;
      event.preventDefault();
      if (kind === 'ready') playback.play();
      else if (kind === 'predict' && chosen) playback.reveal();
      else if (kind === 'done') replay();
    }
  };

  const exit = (): void => {
    if (document.fullscreenElement) void document.exitFullscreen();
    onExit();
  };

  root.replaceChildren(section);
  const palette = paletteOf(section);
  colours = new Map(web.species.map((entry, index) => [entry.id, palette[index % PALETTE_SIZE] ?? INK.black]));
  renderLegend();
  section.requestFullscreen?.().catch(() => undefined);
  window.addEventListener('keydown', onKey);
  resizeObserver.observe(canvas);
  resizeObserver.observe(chartCanvas);
  frame = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    window.removeEventListener('keydown', onKey);
  };
};
