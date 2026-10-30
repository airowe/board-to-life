import { describe, expect, it } from 'vitest';
import { createSimulation, runUntil } from '../physics/simulation';
import { rampBallDominoes, rampBallDominoesQuestions } from '../scene/fixtures';
import { moveGrip } from '../scene/edit';
import { checkGrounding } from '../scene/questions';
import { validateScene } from '../scene/schema';
import type { Lesson } from '../session/store';
import { createPlayback } from './playback';

const SETTLE_SECONDS = 8;
const PLENTY = 10_000;

const lesson = (): Lesson => {
  const scene = validateScene(rampBallDominoes);
  if (!scene.ok) throw new Error('fixture scene invalid');
  const questions = checkGrounding(rampBallDominoesQuestions, scene.scene);
  if (!questions.ok) throw new Error('fixture questions invalid');
  return { scene: scene.scene, questions: questions.questions };
};

const playToEnd = (playback: ReturnType<typeof createPlayback>) => {
  playback.play();
  playback.tick(PLENTY);
  playback.reveal();
  playback.tick(PLENTY);
  return playback.phase();
};

describe('createPlayback', () => {
  it('waits for play before stepping', () => {
    const playback = createPlayback(lesson(), SETTLE_SECONDS);
    playback.tick(10);
    expect(playback.phase().kind).toBe('ready');
    expect(playback.stepIndex()).toBe(0);
  });

  it('stops exactly at the predict point even when asked for more steps', () => {
    const contactStep = runUntil(createSimulation(lesson().scene), { kind: 'contact', a: 'ball', b: 'domino-1' }, PLENTY);
    expect(contactStep).toBeGreaterThan(0);
    const playback = createPlayback(lesson(), SETTLE_SECONDS);
    playback.play();
    playback.tick(PLENTY);
    expect(playback.stepIndex()).toBe(contactStep);
    expect(playback.phase()).toEqual({ kind: 'predict', question: rampBallDominoesQuestions[0] });
    playback.tick(PLENTY);
    expect(playback.stepIndex()).toBe(contactStep);
  });

  it('resumes on reveal and reports the computed outcome when settled', () => {
    const phase = playToEnd(createPlayback(lesson(), SETTLE_SECONDS));
    expect(phase).toEqual({
      kind: 'done',
      results: [{ question: rampBallDominoesQuestions[0], happened: true }],
    });
  });

  it('replays from the start to the same outcome', () => {
    const playback = createPlayback(lesson(), SETTLE_SECONDS);
    const first = playToEnd(playback);
    playback.replay();
    expect(playback.phase().kind).toBe('ready');
    expect(playback.stepIndex()).toBe(0);
    expect(playToEnd(playback)).toEqual(first);
  });

  it('replays a setup a student changed, pausing to predict again and reaching a new outcome', () => {
    const playback = createPlayback(lesson(), SETTLE_SECONDS);
    playToEnd(playback);
    const edited = moveGrip(playback.scene(), { id: 'domino-3', part: 'body' }, { x: 1000, y: 685 });
    if (!edited.ok) throw new Error(edited.reason);
    playback.replay(edited.scene);
    expect(playback.scene()).toEqual(edited.scene);
    playback.play();
    playback.tick(PLENTY);
    expect(playback.phase().kind).toBe('predict');
    playback.reveal();
    playback.tick(PLENTY);
    expect(playback.phase()).toEqual({ kind: 'done', results: [{ question: rampBallDominoesQuestions[0], happened: false }] });
  });

  it('keeps the changed setup on a plain replay', () => {
    const playback = createPlayback(lesson(), SETTLE_SECONDS);
    const edited = moveGrip(playback.scene(), { id: 'ball', part: 'body' }, { x: 104, y: 230 });
    if (!edited.ok) throw new Error(edited.reason);
    playback.replay(edited.scene);
    playback.replay();
    expect(playback.scene()).toEqual(edited.scene);
  });

  it('records the path of each piece that moved during the run', () => {
    const playback = createPlayback(lesson(), SETTLE_SECONDS);
    playToEnd(playback);
    const trails = playback.trails();
    const ball = trails.find((trail) => trail.id === 'ball');
    const rest = playback.simulation().snapshot().find((body) => body.id === 'ball');
    expect(ball?.points[0]).toEqual({ x: 104, y: 330 });
    expect(ball?.points.at(-1)).toEqual({ x: rest?.x, y: rest?.y });
    expect(trails.map((trail) => trail.id)).not.toContain('floor');
    expect(trails.map((trail) => trail.id)).toContain('domino-5');
  });

  it('starts a fresh path on replay', () => {
    const playback = createPlayback(lesson(), SETTLE_SECONDS);
    playToEnd(playback);
    playback.replay();
    expect(playback.trails()).toEqual([]);
  });

  it('reports the opposite outcome when the drawing breaks the chain', () => {
    const broken = lesson();
    broken.scene.items = broken.scene.items.filter((item) => item.id !== 'domino-3');
    const phase = playToEnd(createPlayback(broken, SETTLE_SECONDS));
    expect(phase.kind === 'done' && phase.results[0]?.happened).toBe(false);
  });
});
