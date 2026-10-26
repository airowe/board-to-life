import { describe, expect, it } from 'vitest';
import { STEPS_PER_SECOND } from '../physics/simulation';
import { rampBallDominoes, rampBallDominoesQuestions } from '../scene/fixtures';
import { checkGrounding } from '../scene/questions';
import { validateScene } from '../scene/schema';
import type { Lesson } from '../session/store';
import { createPlayback } from './playback';

const SETTLE_SECONDS = 8;
const PREDICT_STEP = 0.75 * STEPS_PER_SECOND;
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
    const playback = createPlayback(lesson(), SETTLE_SECONDS);
    playback.play();
    playback.tick(PLENTY);
    expect(playback.stepIndex()).toBe(PREDICT_STEP);
    expect(playback.phase()).toEqual({ kind: 'predict', question: rampBallDominoesQuestions[0] });
    playback.tick(PLENTY);
    expect(playback.stepIndex()).toBe(PREDICT_STEP);
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

  it('reports the opposite outcome when the drawing breaks the chain', () => {
    const broken = lesson();
    broken.scene.items = broken.scene.items.filter((item) => item.id !== 'domino-3');
    const phase = playToEnd(createPlayback(broken, SETTLE_SECONDS));
    expect(phase.kind === 'done' && phase.results[0]?.happened).toBe(false);
  });
});
