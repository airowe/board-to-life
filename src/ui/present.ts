import { SETTLE_SECONDS, STEPS_PER_SECOND, type BodySnapshot } from '../physics/simulation';
import { interpolate } from '../present/interpolate';
import { createPlayback, type Phase } from '../present/playback';
import { erasePatches, keepShapes, ringColour, type Patch, type PatchShape } from '../present/onPhoto';
import { createRedrawGate } from '../present/redraw';
import { isLink, type Scene, type SceneItem } from '../scene/schema';
import { cartWheels } from '../scene/cart';
import { linkPoints } from '../scene/linkPoints';
import type { Lesson } from '../session/store';
import { h } from './dom';

const STEP_MS = 1000 / STEPS_PER_SECOND;
const MAX_FRAME_MS = 100;

const INK = { board: '#f7f7f3', black: '#1d2433', blue: '#1f4fbf', fill: 'rgba(31, 79, 191, 0.12)' };

const drawItem = (
  ctx: CanvasRenderingContext2D,
  item: SceneItem,
  body: BodySnapshot | undefined,
  bodies: Map<string, BodySnapshot>,
): void => {
  ctx.save();
  ctx.lineWidth = 6;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK.black;
  ctx.fillStyle = 'transparent';
  switch (item.kind) {
    case 'ball':
      if (!body) break;
      ctx.translate(body.x, body.y);
      ctx.rotate(body.angle);
      ctx.strokeStyle = INK.blue;
      ctx.fillStyle = INK.fill;
      ctx.beginPath();
      ctx.arc(0, 0, item.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(item.radius * 0.7, 0);
      ctx.stroke();
      break;
    case 'ramp':
      ctx.lineWidth = item.thickness * 0.6;
      ctx.beginPath();
      ctx.moveTo(item.x1, item.y1);
      ctx.lineTo(item.x2, item.y2);
      ctx.stroke();
      break;
    case 'pivot':
      ctx.beginPath();
      ctx.moveTo(item.x, item.y);
      ctx.lineTo(item.x - 14, item.y + 24);
      ctx.lineTo(item.x + 14, item.y + 24);
      ctx.closePath();
      ctx.stroke();
      break;
    case 'pulley':
      ctx.beginPath();
      ctx.arc(item.x, item.y, item.radius, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'rope':
    case 'spring': {
      const points = linkPoints(item, (id) => bodies.get(id) ?? null);
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (const [index, point] of points.entries()) {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      }
      ctx.stroke();
      break;
    }
    case 'cart':
      if (!body) break;
      ctx.translate(body.x, body.y);
      ctx.rotate(body.angle);
      ctx.strokeRect(-item.width / 2, -item.height / 2, item.width, item.height);
      for (const wheel of cartWheels({ ...item, x: 0, y: 0, angle: 0 })) {
        ctx.beginPath();
        ctx.arc(wheel.x, wheel.y, item.wheelRadius, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    default:
      if (!body) break;
      ctx.translate(body.x, body.y);
      ctx.rotate(body.angle);
      if (item.kind === 'floor' || item.kind === 'wall') {
        ctx.beginPath();
        ctx.moveTo(-item.width / 2, -item.height / 2);
        ctx.lineTo(item.width / 2, -item.height / 2);
        if (item.kind === 'wall') {
          ctx.lineTo(item.width / 2, item.height / 2);
          ctx.moveTo(-item.width / 2, -item.height / 2);
          ctx.lineTo(-item.width / 2, item.height / 2);
        }
        ctx.stroke();
      } else {
        ctx.strokeRect(-item.width / 2, -item.height / 2, item.width, item.height);
      }
  }
  ctx.restore();
};

// How far beyond a patch the board colour is sampled, in drawing units.
const SAMPLE_MARGIN = 10;
const LABEL_FONT = '600 30px system-ui, sans-serif';

const tracePatch = (ctx: CanvasRenderingContext2D, patch: Patch): void => {
  const { shape } = patch;
  ctx.beginPath();
  if (shape.kind === 'circle') {
    ctx.arc(shape.x, shape.y, shape.radius, 0, Math.PI * 2);
    ctx.fill();
  } else if (shape.kind === 'rect') {
    ctx.save();
    ctx.translate(shape.x, shape.y);
    ctx.rotate(shape.angle);
    ctx.fillRect(-shape.width / 2, -shape.height / 2, shape.width, shape.height);
    ctx.restore();
  } else {
    ctx.lineWidth = shape.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [index, point] of shape.points.entries()) {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
  }
};

const outline = (path: Path2D, shape: PatchShape): void => {
  if (shape.kind === 'circle') {
    path.moveTo(shape.x + shape.radius, shape.y);
    path.arc(shape.x, shape.y, shape.radius, 0, Math.PI * 2);
  } else if (shape.kind === 'rect') {
    const [cos, sin] = [Math.cos(shape.angle), Math.sin(shape.angle)];
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx = 0, sy = 0]) => {
      const [dx, dy] = [(sx * shape.width) / 2, (sy * shape.height) / 2];
      return { x: shape.x + dx * cos - dy * sin, y: shape.y + dx * sin + dy * cos };
    });
    for (const [index, corner] of corners.entries()) {
      if (index === 0) path.moveTo(corner.x, corner.y);
      else path.lineTo(corner.x, corner.y);
    }
    path.closePath();
  }
};

// The photo with every moving item's own strokes painted out, in drawing units scaled to the photo's pixels.
const boardFrom = (image: HTMLImageElement, scene: Scene): { canvas: HTMLCanvasElement; moving: Set<string> } | null => {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || canvas.width === 0) return null;
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const [sx, sy] = [canvas.width / scene.drawing.width, canvas.height / scene.drawing.height];
  const patches = erasePatches(scene);
  const colours = patches.map((patch) =>
    ringColour(pixels, { x: patch.bounds.x * sx, y: patch.bounds.y * sy, width: patch.bounds.width * sx, height: patch.bounds.height * sy }, SAMPLE_MARGIN * sx),
  );
  ctx.scale(sx, sy);
  for (const [index, patch] of patches.entries()) {
    ctx.fillStyle = colours[index] ?? INK.board;
    ctx.strokeStyle = colours[index] ?? INK.board;
    tracePatch(ctx, patch);
  }
  // Fixed items win where a patch overlapped them, such as the floor line under a domino.
  const keep = new Path2D();
  for (const shape of keepShapes(scene)) outline(keep, shape);
  ctx.save();
  ctx.clip(keep);
  ctx.drawImage(image, 0, 0, scene.drawing.width, scene.drawing.height);
  ctx.restore();
  return { canvas, moving: new Set(patches.map((patch) => patch.id)) };
};

type Board = ReturnType<typeof boardFrom>;

// Written labels ride along with the item they are attached to, such as "5 kg" on a block.
const drawLabels = (ctx: CanvasRenderingContext2D, scene: Scene, bodies: Map<string, BodySnapshot>): void => {
  const start = new Map(scene.items.flatMap((item) => (isLink(item) || item.kind === 'ramp' ? [] : [[item.id, item] as const])));
  ctx.save();
  ctx.font = LABEL_FONT;
  ctx.fillStyle = INK.blue;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const label of scene.labels) {
    const from = label.attachesTo ? start.get(label.attachesTo) : undefined;
    const now = label.attachesTo ? bodies.get(label.attachesTo) : undefined;
    const [x, y] = from && now ? [now.x + label.x - from.x, now.y + label.y - from.y] : [label.x, label.y];
    ctx.fillText(label.text, x, y);
  }
  ctx.restore();
};

const drawScene = (canvas: HTMLCanvasElement, scene: Scene, snapshot: BodySnapshot[], board: Board): void => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const ratio = window.devicePixelRatio || 1;
  const { clientWidth, clientHeight } = canvas;
  if (canvas.width !== clientWidth * ratio || canvas.height !== clientHeight * ratio) {
    canvas.width = clientWidth * ratio;
    canvas.height = clientHeight * ratio;
  }
  const scale = Math.min(clientWidth / scene.drawing.width, clientHeight / scene.drawing.height);
  const offsetX = (clientWidth - scene.drawing.width * scale) / 2;
  const offsetY = (clientHeight - scene.drawing.height * scale) / 2;

  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.fillStyle = INK.board;
  ctx.fillRect(0, 0, clientWidth, clientHeight);
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  const bodies = new Map(snapshot.map((body) => [body.id, body]));
  if (!board) {
    for (const item of scene.items) drawItem(ctx, item, bodies.get(item.id), bodies);
    drawLabels(ctx, scene, bodies);
    return;
  }
  // On the photo only what moves is drawn again, with the pulleys and pivots it hangs from or turns on.
  ctx.drawImage(board.canvas, 0, 0, scene.drawing.width, scene.drawing.height);
  for (const item of scene.items) {
    if (board.moving.has(item.id) || item.kind === 'pulley' || item.kind === 'pivot') drawItem(ctx, item, bodies.get(item.id), bodies);
  }
};

const describeResult = (happened: boolean, item: string): string =>
  happened ? `Yes: ${item} fell over.` : `No: ${item} stayed standing.`;

export const renderPresent = (root: HTMLElement, lesson: Lesson, photoUrl: string | null, onExit: () => void): (() => void) => {
  const playback = createPlayback(lesson, SETTLE_SECONDS);
  const canvas = h('canvas', { class: 'stage', 'aria-label': 'Physics animation of the approved scene' });
  const caption = h('div', { class: 'caption', role: 'status', 'aria-live': 'polite' });
  const controls = h('div', { class: 'controls' });
  const redraw = createRedrawGate();
  const resizeObserver = new ResizeObserver(() => redraw.invalidate());
  let shownPhase: Phase | null = null;
  let frame = 0;
  let last = performance.now();
  let carry = 0;
  let board: Board = null;
  let onPhoto = photoUrl !== null;
  const photoToggle = h('button', { class: 'photo-toggle quiet', hidden: true }, '');
  const showToggle = (): void => {
    photoToggle.hidden = board === null;
    photoToggle.textContent = onPhoto ? 'Show the clean drawing' : 'Show it on the photo';
  };
  photoToggle.addEventListener('click', () => {
    onPhoto = !onPhoto;
    showToggle();
    redraw.invalidate();
  });
  if (photoUrl) {
    const image = new Image();
    image.addEventListener('load', () => {
      board = boardFrom(image, lesson.scene);
      showToggle();
      redraw.invalidate();
    });
    image.src = photoUrl;
  }

  const button = (label: string, action: () => void, primary = false): HTMLButtonElement =>
    h('button', { class: primary ? 'primary big' : 'big', onclick: action }, label);

  const replay = (): void => {
    playback.replay();
    carry = 0;
    redraw.invalidate();
  };

  const showPhase = (phase: Phase): void => {
    if (phase === shownPhase) return;
    shownPhase = phase;
    const firstQuestion = lesson.questions[0];
    switch (phase.kind) {
      case 'ready':
        caption.replaceChildren(h('p', { class: 'question-text' }, firstQuestion ? `Watch closely. ${firstQuestion.prompt}` : 'Watch closely.'));
        controls.replaceChildren(button('Play', playback.play, true));
        break;
      case 'running':
        caption.replaceChildren();
        controls.replaceChildren();
        break;
      case 'predict':
        caption.replaceChildren(
          h('p', { class: 'question-text' }, phase.question.prompt),
          h('p', { class: 'choices-text' }, `Predict: ${phase.question.choices.join(' or ')}?`),
        );
        controls.replaceChildren(button('Reveal', playback.reveal, true));
        break;
      case 'done':
        caption.replaceChildren(
          ...phase.results.flatMap(({ question, happened }) => [
            h('p', { class: 'question-text' }, describeResult(happened, question.observe.item)),
            h('p', { class: 'explanation-text' }, question.explanation),
          ]),
        );
        controls.replaceChildren(button('Replay', replay, true));
        break;
    }
  };

  const loop = (now: number): void => {
    const elapsed = Math.min(now - last, MAX_FRAME_MS);
    last = now;
    if (playback.phase().kind === 'running') {
      carry += elapsed;
      const steps = Math.floor(carry / STEP_MS);
      carry -= steps * STEP_MS;
      playback.tick(steps);
    }
    const moving = playback.phase().kind === 'running';
    if (!moving) carry = 0;
    if (redraw.shouldDraw(moving)) {
      const sim = playback.simulation();
      const alpha = moving ? carry / STEP_MS : 1;
      drawScene(canvas, lesson.scene, interpolate(sim.previousSnapshot(), sim.snapshot(), alpha), onPhoto ? board : null);
    }
    showPhase(playback.phase());
    frame = requestAnimationFrame(loop);
  };

  const onKey = (event: KeyboardEvent): void => {
    const kind = playback.phase().kind;
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (kind === 'ready') playback.play();
      else if (kind === 'predict') playback.reveal();
      else if (kind === 'done') replay();
    } else if (event.key.toLowerCase() === 'r') {
      replay();
    }
  };

  const exit = (): void => {
    if (document.fullscreenElement) void document.exitFullscreen();
    onExit();
  };

  const stage = h(
    'section',
    { class: 'present' },
    canvas,
    caption,
    controls,
    photoToggle,
    h('button', { class: 'exit quiet', onclick: exit }, 'Exit'),
  );
  root.replaceChildren(stage);
  stage.requestFullscreen?.().catch(() => undefined);
  window.addEventListener('keydown', onKey);
  resizeObserver.observe(canvas);
  frame = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    window.removeEventListener('keydown', onKey);
  };
};
