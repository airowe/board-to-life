import { chartPaths, feedingDots, fitWebToScreen, percentOfStart, percentScale, ringRadius, shortenedArrow, spreadLabels } from '../ecosystem/chart';
import { speciesColours } from '../ecosystem/colours';
import { editOnRelease, emptyEdits, pickSpecies, setStart, startMax, type WebEdits } from '../ecosystem/edits';
import { EVENT_STEP, MODEL_STEPS, STEPS_PER_SECOND_SHOWN, startingPopulations, type Series } from '../ecosystem/model';
import { isGoneAt } from '../ecosystem/outcomes';
import { createWebPlayback, type WebPhase } from '../ecosystem/playback';
import { CHOICE_FOR, WEB_CHOICES } from '../ecosystem/questions';
import type { Species, Web } from '../ecosystem/schema';
import { sketchWeb } from '../ecosystem/sketch';
import type { Box } from '../present/onPhoto';
import { createRedrawGate } from '../present/redraw';
import { libraryFile } from '../library/match';
import { pictureSource } from '../library/source';
import { TOUCH_REACH_PX } from '../present/view';
import type { EcosystemLesson } from '../session/store';
import { sizeCanvas } from './canvasSize';
import { h } from './dom';
import { createPlaceScene, type PlaceScene, type ScenePictures } from './placeScene';
import { createPlaceImages, FALLBACK_FOLDER } from './placeView';
import { WEB_VIEW_LABELS, availableViews, editHintFor, initialView, type WebView } from './webViews';

const STEP_MS = 1000 / STEPS_PER_SECOND_SHOWN;
const MAX_FRAME_MS = 100;
const SKETCH_SEED = 7;

const INK = { board: '#f7f7f3', black: '#1d2433', label: '#ffffff' };
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
const PORTRAIT_FILL = 1.75;
const PORTRAIT_DISC = '#fcfdfd';
const FOOD_ARROW = '#c0392b';
const FOOD_ARROW_WIDTH = 7;
const FOOD_ARROW_GAP = 22;
const FOOD_ARROW_HEAD = 20;
const FOOD_ARROW_SPREAD = (Math.PI * 5) / 6;

const CHART_PAD = { left: 46, right: 132, top: 26, bottom: 26 };
const CHART_GRID = '#e3e7ec';
const CHART_MUTED = '#566173';
const CHART_LABEL_GAP = 24;
const CHART_PICTURE = 22;
const CHART_START_LEVEL = 100;
const CHART_TEXT_PX = 13;
const ROOT_FONT_PX = 16;
const CHART_LINE_WIDTH = 3;
const CHART_AXIS_WIDTH = 1;
const EVENT_DASH = [4, 6];

// A finger moving less than this is still a tap; past it the press becomes a drag of the starting number.
const TAP_SLOP_PX = 8;
// Dragging this far up takes a species from nothing to its largest start.
const DRAG_PX_FOR_FULL_RANGE = 320;

const reducedMotion = (): boolean => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

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
  portrait: ((name: string) => CanvasImageSource | null) | null;
};

const valueAt = (state: StageState, id: string): number =>
  state.drag?.moved && state.drag.id === id && !state.edits.removed.has(id) ? state.drag.value : (state.series.values[id]?.[state.step] ?? 0);

// A species the teacher removed is gone once the run has taken it away, which may be at the predict point.
const removedNow = (state: StageState, id: string): boolean => state.edits.removed.has(id) && (state.series.values[id]?.[state.step] ?? 0) === 0;

const isGone = (state: StageState, id: string): boolean =>
  removedNow(state, id) || isGoneAt(valueAt(state, id), state.series.values[id] ?? [], state.step, state.steady[id] ?? 0, EVENT_STEP);

const drawDots = (ctx: CanvasRenderingContext2D, state: StageState): void => {
  const dots = feedingDots(state.web, state.dotStep).filter((dot) => !isGone(state, dot.fromId) && !isGone(state, dot.toId));
  for (const dot of dots) {
    ctx.fillStyle = state.colours.get(dot.fromId) ?? INK.black;
    ctx.beginPath();
    ctx.arc(dot.from.x + (dot.to.x - dot.from.x) * dot.t, dot.from.y + (dot.to.y - dot.from.y) * dot.t, DOT_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }
};

const drawRing = (ctx: CanvasRenderingContext2D, state: StageState, entry: Species): void => {
  if (removedNow(state, entry.id)) return;
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

const pictureSize = (picture: CanvasImageSource): { width: number; height: number } | null => {
  if (picture instanceof HTMLImageElement) return { width: picture.naturalWidth, height: picture.naturalHeight };
  return picture instanceof HTMLCanvasElement || picture instanceof ImageBitmap ? { width: picture.width, height: picture.height } : null;
};

// Wide enough to cover the corners of the species' box on the board.
const discRadius = (entry: Species): number => Math.hypot(entry.width, entry.height) / 2;

// Who eats whom, drawn over the board's arrows since the discs cover their heads.
const drawFoodArrows = (ctx: CanvasRenderingContext2D, web: Web): void => {
  const byId = new Map(web.species.map((entry) => [entry.id, entry]));
  ctx.save();
  ctx.strokeStyle = FOOD_ARROW;
  ctx.fillStyle = FOOD_ARROW;
  ctx.lineWidth = FOOD_ARROW_WIDTH;
  ctx.lineCap = 'round';
  for (const link of web.eats) {
    const [from, to] = [byId.get(link.from), byId.get(link.to)];
    const arrow = from && to ? shortenedArrow(from, to, discRadius(from), discRadius(to) + FOOD_ARROW_GAP) : null;
    if (!arrow) continue;
    const angle = Math.atan2(arrow.to.y - arrow.from.y, arrow.to.x - arrow.from.x);
    ctx.beginPath();
    ctx.moveTo(arrow.from.x, arrow.from.y);
    ctx.lineTo(arrow.to.x, arrow.to.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(arrow.to.x + Math.cos(angle) * FOOD_ARROW_HEAD, arrow.to.y + Math.sin(angle) * FOOD_ARROW_HEAD);
    ctx.lineTo(arrow.to.x + Math.cos(angle + FOOD_ARROW_SPREAD) * FOOD_ARROW_HEAD, arrow.to.y + Math.sin(angle + FOOD_ARROW_SPREAD) * FOOD_ARROW_HEAD);
    ctx.lineTo(arrow.to.x + Math.cos(angle - FOOD_ARROW_SPREAD) * FOOD_ARROW_HEAD, arrow.to.y + Math.sin(angle - FOOD_ARROW_SPREAD) * FOOD_ARROW_HEAD);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
};

// The species' own picture on a disc over its box on the board, with its name under it.
const drawPortrait = (ctx: CanvasRenderingContext2D, state: StageState, entry: Species): void => {
  if (!state.portrait) return;
  const picture = state.portrait(entry.name);
  const size = picture ? pictureSize(picture) : null;
  const radius = discRadius(entry);
  ctx.save();
  ctx.fillStyle = PORTRAIT_DISC;
  ctx.beginPath();
  ctx.arc(entry.x, entry.y, radius, 0, Math.PI * 2);
  ctx.fill();
  if (picture && size) {
    const scale = (radius * PORTRAIT_FILL) / Math.max(size.width, size.height);
    const [pictureWidth, pictureHeight] = [size.width * scale, size.height * scale];
    ctx.drawImage(picture, entry.x - pictureWidth / 2, entry.y - pictureHeight / 2, pictureWidth, pictureHeight);
  }
  ctx.font = LABEL_FONT;
  const width = ctx.measureText(entry.name).width + LABEL_PAD * 2;
  const top = entry.y + radius - LABEL_HEIGHT / 2;
  ctx.fillStyle = state.colours.get(entry.id) ?? INK.black;
  ctx.beginPath();
  ctx.roundRect(entry.x - width / 2, top, width, LABEL_HEIGHT, LABEL_HEIGHT / 2);
  ctx.fill();
  ctx.fillStyle = INK.label;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(entry.name, entry.x, top + LABEL_HEIGHT / 2);
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
  const view = fitWebToScreen({ width, height }, state.web);
  ctx.fillStyle = INK.board;
  ctx.fillRect(0, 0, width, height);
  ctx.translate(view.offsetX, view.offsetY);
  ctx.scale(view.scale, view.scale);
  // With pictures the web is drawn clean; the sketch's own boxes and arrows would show around them.
  if (state.image && !state.portrait) ctx.drawImage(state.image, 0, 0, drawing.width, drawing.height);
  for (const entry of state.web.species) drawRing(ctx, state, entry);
  drawDots(ctx, state);
  for (const entry of state.web.species) drawPortrait(ctx, state, entry);
  if (state.portrait) drawFoodArrows(ctx, state.web);
  for (const entry of state.web.species) {
    if (state.edits.removed.has(entry.id)) drawCross(ctx, entry);
    const edited = state.edits.start[entry.id];
    if (state.drag?.moved && state.drag.id === entry.id && !state.edits.removed.has(entry.id)) drawStartLabel(ctx, state, entry, state.drag.value);
    else if (showStarts && edited !== undefined && !state.edits.removed.has(entry.id)) drawStartLabel(ctx, state, entry, edited);
  }
};

// The current run and the faint previous one are drawn against one shared scale, so their heights compare.
const sharedPaths = (series: Series, ghost: Series | null, box: Box, upTo: number, max: number): { now: Record<string, string>; before: Record<string, string> } => ({
  now: chartPaths(series, box, upTo, max),
  before: ghost ? chartPaths(ghost, box, MODEL_STEPS, max) : {},
});

type ChartLook = { web: Web; changeLabel: string; colours: Map<string, string>; portrait: ((name: string) => CanvasImageSource | null) | null };

const highestOf = (series: Series): number => Math.max(CHART_START_LEVEL, ...series.ids.flatMap((id) => series.values[id] ?? []));

const drawChart = (canvas: HTMLCanvasElement, raw: Series, rawGhost: Series | null, step: number, { web, changeLabel, colours, portrait }: ChartLook): void => {
  const sized = sizeCanvas(canvas);
  if (!sized) return;
  const { ctx, width, height } = sized;
  // Board mode scales the page's type, and the chart's labels have to be read from as far away.
  const unit = parseFloat(getComputedStyle(document.documentElement).fontSize) / ROOT_FONT_PX || 1;
  const font = (weight: number): string => `${weight} ${CHART_TEXT_PX * unit}px system-ui, sans-serif`;
  const box: Box = {
    x: CHART_PAD.left * unit,
    y: CHART_PAD.top * unit,
    width: Math.max(0, width - (CHART_PAD.left + CHART_PAD.right) * unit),
    height: Math.max(0, height - (CHART_PAD.top + CHART_PAD.bottom) * unit),
  };
  const series = percentOfStart(raw);
  const ghost = rawGhost && percentOfStart(rawGhost);
  const { max, ticks } = percentScale(Math.max(highestOf(series), ghost ? highestOf(ghost) : 0));
  const yOf = (percent: number): number => box.y + box.height - (Math.min(percent, max) / max) * box.height;
  const right = box.x + box.width;

  ctx.font = font(400);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  for (const tick of ticks) {
    const start = tick === CHART_START_LEVEL;
    ctx.strokeStyle = start ? CHART_MUTED : CHART_GRID;
    ctx.lineWidth = CHART_AXIS_WIDTH;
    ctx.beginPath();
    ctx.moveTo(box.x, yOf(tick));
    ctx.lineTo(right, yOf(tick));
    ctx.stroke();
    ctx.fillStyle = CHART_MUTED;
    ctx.fillText(`${tick}%`, box.x - 6 * unit, yOf(tick));
  }
  ctx.strokeStyle = INK.black;
  ctx.beginPath();
  ctx.moveTo(box.x, box.y);
  ctx.lineTo(box.x, box.y + box.height);
  ctx.lineTo(right, box.y + box.height);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = CHART_MUTED;
  ctx.fillText('Time', box.x + box.width / 2, box.y + box.height + (CHART_PAD.bottom * unit) / 2);

  const eventX = box.x + (EVENT_STEP / MODEL_STEPS) * box.width;
  ctx.setLineDash(EVENT_DASH);
  ctx.beginPath();
  ctx.moveTo(eventX, box.y);
  ctx.lineTo(eventX, box.y + box.height);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = INK.black;
  ctx.font = font(700);
  ctx.textAlign = 'left';
  ctx.fillText(changeLabel, eventX + 4 * unit, box.y - (CHART_PAD.top * unit) / 2);

  const { now, before } = sharedPaths(series, ghost, box, step, max);
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

  // Each line says what it is at its current height, in the margin beside the plot.
  const heights = web.species.map((entry) => yOf(series.values[entry.id]?.[step] ?? 0));
  const placed = spreadLabels(heights, CHART_LABEL_GAP * unit, box.y, box.y + box.height);
  const size = CHART_PICTURE * unit;
  ctx.font = font(700);
  web.species.forEach((entry, index) => {
    const y = placed[index] ?? box.y;
    const picture = portrait?.(entry.name);
    const measured = picture ? pictureSize(picture) : null;
    if (picture && measured) {
      const scale = size / Math.max(measured.width, measured.height);
      const [drawnWidth, drawnHeight] = [measured.width * scale, measured.height * scale];
      ctx.drawImage(picture, right + 6 * unit + (size - drawnWidth) / 2, y - drawnHeight / 2, drawnWidth, drawnHeight);
    }
    ctx.fillStyle = colours.get(entry.id) ?? INK.black;
    ctx.fillText(entry.name, right + 10 * unit + size, y);
  });
};

const sketchUrl = (web: Web): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sketchWeb(web, SKETCH_SEED))}`;

export const renderWebPresent = (
  root: HTMLElement,
  lesson: EcosystemLesson,
  photoUrl: string | null,
  onExit: () => void,
  pictures: ScenePictures | null,
): (() => void) => {
  const { web } = lesson;
  const playback = createWebPlayback(lesson);
  const steady = startingPopulations(web);
  const maxStart = new Map(web.species.map((entry) => [entry.id, startMax(steady, entry.id)]));

  const canvas = h('canvas', { class: 'stage', 'aria-label': 'Food web drawing with each population shown as a ring' });
  const chartCanvas = h('canvas', { class: 'web-chart-lines', 'aria-hidden': 'true' });
  const chart = h(
    'figure',
    { class: 'web-chart' },
    h('figcaption', {}, 'How each population changed, compared with its starting number (a model)'),
    h('div', { class: 'canvas-frame' }, chartCanvas),
  );
  const placeCanvas = h('canvas', { class: 'stage', 'aria-label': 'The food web as a living place, each population shown as a crowd' });
  const placeFrame = h('div', { class: 'canvas-frame place-frame' }, placeCanvas);
  const ringFrame = h('div', { class: 'canvas-frame' }, canvas);
  const body = h('div', { class: 'web-body' }, ...(pictures ? [placeFrame] : []), ringFrame, chart);
  const views = availableViews(pictures !== null);
  const tabs = new Map(
    views.map((name) => [name, h('button', { role: 'tab', class: 'view-tab', onclick: () => showView(name) }, WEB_VIEW_LABELS[name])]),
  );
  const viewSwitch = h('div', { class: 'view-switch', role: 'tablist', 'aria-label': 'Show the food web as' }, ...tabs.values());
  const caption = h('div', { class: 'caption', role: 'status', 'aria-live': 'polite' });
  const controls = h('div', { class: 'controls' });
  const section = h(
    'section',
    { class: 'present web-present' },
    caption,
    viewSwitch,
    body,
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
  let view: WebView = initialView(pictures !== null);
  let scene: PlaceScene | null = null;

  const photo = new Image();
  photo.addEventListener('load', () => {
    image = photo;
    redraw.invalidate();
  });
  photo.src = photoUrl ?? sketchUrl(web);

  const editable = (): boolean => {
    const kind = playback.phase().kind;
    return kind === 'done' || kind === 'ready';
  };
  const edited = (): boolean => edits.removed.size > 0 || Object.keys(edits.start).length > 0;

  const rerun = (next: WebEdits): void => {
    if (playback.step() > 0) ghost = playback.series();
    edits = next;
    chosen = null;
    playback.replay(edits);
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
  const editHint = (): string =>
    editHintFor(
      view,
      view === 'place'
        ? 'Tap an animal to remove its species. Drag one up or down to change how many there are at the start.'
        : 'Tap a species to remove it or bring it back. Drag one up or down to change how many there are at the start.',
    );

  const showView = (next: WebView): void => {
    view = next;
    body.dataset.view = next;
    placeFrame.hidden = next !== 'place';
    ringFrame.hidden = next !== 'chart';
    chart.hidden = next === 'place';
    for (const [name, tab] of tabs) tab.setAttribute('aria-selected', String(name === next));
    drag = null;
    if (next === 'place') scene?.wake();
    shownPhase = null;
    redraw.invalidate();
  };

  const showPhase = (phase: WebPhase): void => {
    if (phase === shownPhase) return;
    shownPhase = phase;
    switch (phase.kind) {
      case 'ready':
        if (ghost || edited()) {
          caption.replaceChildren(line('question-text', playback.change()), line('explanation-text', ghost ? `${editHint()} The faint lines show the last run.` : editHint()));
          controls.replaceChildren(button('Play', playback.play, true), ...(edited() ? [button('Put everything back', resetEdits)] : []));
        } else {
          caption.replaceChildren(line('question-text', playback.change()), line('explanation-text', `Press Play. The populations settle first, then we stop to predict. ${editHint()}`));
          controls.replaceChildren(button('Play', playback.play, true));
        }
        break;
      case 'steady':
        caption.replaceChildren(line('question-text', playback.change()), line('explanation-text', 'Watch the populations settle.'));
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
        caption.replaceChildren(line('question-text', playback.change()), ...(chosen ? [line('choices-text', `You predicted: ${chosen}.`)] : []));
        controls.replaceChildren();
        break;
      case 'done':
        caption.replaceChildren(
          line('question-text', phase.result ? `${CHOICE_FOR[phase.result.direction]}: ${phase.result.question.explanation}` : 'Nothing changes after these edits.'),
          line('explanation-text', editHint()),
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
    const seconds = now / 1000;
    scene?.follow(playback.series(), playback.step(), edits, seconds);
    const placeMoving = view === 'place' && scene !== null && (!reducedMotion() || scene.busy(seconds));
    if (redraw.shouldDraw(moving() || placeMoving)) {
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
        portrait,
      };
      if (view === 'place') scene?.draw(placeCanvas, seconds, reducedMotion());
      if (view === 'chart') drawStage(canvas, state, playback.phase().kind === 'ready');
      if (view !== 'place') drawChart(chartCanvas, playback.series(), ghost, step, { web, changeLabel: playback.changeLabel(), colours, portrait });
    }
    showPhase(playback.phase());
    for (const each of [canvas, placeCanvas]) {
      each.classList.toggle('editable', editable());
      each.classList.toggle('holding', drag !== null && drag.moved && !edits.removed.has(drag.id));
    }
    frame = requestAnimationFrame(loop);
  };

  const portraitImages = createPlaceImages(() => redraw.invalidate());
  const portrait = pictures
    ? (name: string): CanvasImageSource | null => {
        const source = pictureSource(name, pictures.library, pictures.fallback, pictures.live.state);
        if (source.kind === 'live') return pictures.live.image(source.key);
        if (source.kind === 'emoji') return portraitImages.get(`${FALLBACK_FOLDER}${source.file}`);
        if (source.kind !== 'library') return null;
        const file = libraryFile(pictures.library, source.subject, 'rest');
        return file ? portraitImages.get(file) : null;
      }
    : null;

  const startOf = (id: string): number => edits.start[id] ?? steady[id] ?? 0;

  const pickAt = (target: HTMLCanvasElement, event: PointerEvent): string | null => {
    const rect = target.getBoundingClientRect();
    const size = { width: rect.width, height: rect.height };
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    if (target === placeCanvas) return scene?.pick(size, point, TOUCH_REACH_PX) ?? null;
    return pickSpecies(web, fitWebToScreen(size, web), point, TOUCH_REACH_PX);
  };
  const onPointerDown = (event: PointerEvent): void => {
    if (drag || !editable()) return;
    const target = event.currentTarget as HTMLCanvasElement;
    const id = pickAt(target, event);
    if (id === null) return;
    event.preventDefault();
    target.setPointerCapture(event.pointerId);
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
  for (const each of [canvas, placeCanvas]) {
    each.addEventListener('pointerdown', onPointerDown);
    each.addEventListener('pointermove', onPointerMove);
    each.addEventListener('pointerup', onPointerUp);
    each.addEventListener('pointercancel', onPointerCancel);
  }

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
  colours = speciesColours(web);
  if (pictures) scene = createPlaceScene(web, steady, () => colours, pictures, () => redraw.invalidate());
  showView(view);
  section.requestFullscreen?.().catch(() => undefined);
  window.addEventListener('keydown', onKey);
  resizeObserver.observe(canvas);
  resizeObserver.observe(chartCanvas);
  resizeObserver.observe(placeCanvas);
  frame = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    window.removeEventListener('keydown', onKey);
    scene?.dispose();
  };
};
