import { STEPS_PER_SECOND, type BodySnapshot } from '../physics/simulation';
import { createPlayback, type Phase } from '../present/playback';
import type { Scene, SceneItem } from '../scene/schema';
import type { Lesson } from '../session/store';
import { h } from './dom';

const SETTLE_SECONDS = 7;
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
    case 'rope': {
      const from = bodies.get(item.from);
      const to = bodies.get(item.to);
      if (!from || !to) break;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      break;
    }
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

const drawScene = (canvas: HTMLCanvasElement, scene: Scene, snapshot: BodySnapshot[]): void => {
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
  for (const item of scene.items) drawItem(ctx, item, bodies.get(item.id), bodies);
};

const describeResult = (happened: boolean, item: string): string =>
  happened ? `Yes: ${item} fell over.` : `No: ${item} stayed standing.`;

export const renderPresent = (root: HTMLElement, lesson: Lesson, onExit: () => void): (() => void) => {
  const playback = createPlayback(lesson, SETTLE_SECONDS);
  const canvas = h('canvas', { class: 'stage', 'aria-label': 'Physics animation of the approved scene' });
  const caption = h('div', { class: 'caption', role: 'status', 'aria-live': 'polite' });
  const controls = h('div', { class: 'controls' });
  let shownPhase: Phase | null = null;
  let frame = 0;
  let last = performance.now();
  let carry = 0;

  const button = (label: string, action: () => void, primary = false): HTMLButtonElement =>
    h('button', { class: primary ? 'primary big' : 'big', onclick: action }, label);

  const replay = (): void => {
    playback.replay();
    carry = 0;
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
    } else {
      carry = 0;
    }
    drawScene(canvas, lesson.scene, playback.simulation().snapshot());
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
    h('button', { class: 'exit quiet', onclick: exit }, 'Exit'),
  );
  root.replaceChildren(stage);
  stage.requestFullscreen?.().catch(() => undefined);
  window.addEventListener('keydown', onKey);
  frame = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('keydown', onKey);
  };
};
