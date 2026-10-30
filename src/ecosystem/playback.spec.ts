import { describe, expect, it } from 'vitest';
import { emptyEdits, setStart, toggleRemoved } from './edits';
import { grasslandWeb } from './fixtures';
import { EVENT_STEP, MODEL_STEPS, simulate } from './model';
import { directionsAfter } from './outcomes';
import { createWebPlayback } from './playback';
import { WEB_CHOICES, templateQuestion, type WebQuestion } from './questions';
import type { Web, WebEvent } from './schema';
import { suggestedEvent } from './trophic';
import type { EcosystemLesson } from '../session/store';

const FOX_REMOVED: WebEvent = { kind: 'remove', species: 'fox' };
const BIG_TICK = 10_000;
const SMALL_TICK = 40;
const PAST_TENSE_FOR_DIED_OUT = 'died out';

const question: WebQuestion = {
  id: 'q-1',
  prompt: 'Remove the fox. What happens to the rabbit?',
  choices: [...WEB_CHOICES],
  observe: { kind: 'direction', species: 'rabbit' },
  explanation: 'In the model, the rabbit rose after the fox was removed.',
  cites: ['rabbit', 'fox'],
};

const lessonOf = (web: Web, questions: WebQuestion[] = [question]): EcosystemLesson => ({ subject: 'ecosystem', web, questions });
const grassland = (): EcosystemLesson => lessonOf({ ...grasslandWeb(), event: FOX_REMOVED });

const runToPause = (playback: ReturnType<typeof createWebPlayback>): void => {
  playback.play();
  playback.tick(BIG_TICK);
};

describe('createWebPlayback phases', () => {
  it('starts ready at step 0 with the whole series ready to draw', () => {
    const playback = createWebPlayback(grassland());
    expect(playback.phase()).toEqual({ kind: 'ready' });
    expect(playback.step()).toBe(0);
    expect(playback.previous()).toBeNull();
    expect(playback.series().values.rabbit).toHaveLength(MODEL_STEPS + 1);
  });

  it('moves ready to steady on play and ignores a second play', () => {
    const playback = createWebPlayback(grassland());
    playback.play();
    expect(playback.phase()).toEqual({ kind: 'steady' });
    playback.tick(SMALL_TICK);
    playback.play();
    expect(playback.phase()).toEqual({ kind: 'steady' });
    expect(playback.step()).toBe(SMALL_TICK);
  });

  it('does not advance before play', () => {
    const playback = createWebPlayback(grassland());
    playback.tick(SMALL_TICK);
    expect(playback.step()).toBe(0);
  });

  it('pauses on the question at exactly EVENT_STEP, however big the tick', () => {
    const playback = createWebPlayback(grassland());
    runToPause(playback);
    expect(playback.step()).toBe(EVENT_STEP);
    expect(playback.phase()).toEqual({ kind: 'predict', question });
  });

  it('stays paused through ticks until revealed', () => {
    const playback = createWebPlayback(grassland());
    runToPause(playback);
    playback.tick(BIG_TICK);
    expect(playback.step()).toBe(EVENT_STEP);
    expect(playback.phase().kind).toBe('predict');
  });

  it('plays on after reveal and finishes at MODEL_STEPS with the observed direction', () => {
    const lesson = grassland();
    const playback = createWebPlayback(lesson);
    runToPause(playback);
    playback.reveal();
    expect(playback.phase()).toEqual({ kind: 'playing' });
    playback.tick(SMALL_TICK);
    expect(playback.step()).toBe(EVENT_STEP + SMALL_TICK);
    playback.tick(BIG_TICK);
    const expected = directionsAfter(
      simulate(lesson.web, { steps: MODEL_STEPS, event: FOX_REMOVED, eventStep: EVENT_STEP, removed: new Set() }),
      EVENT_STEP,
    ).rabbit;
    expect(playback.step()).toBe(MODEL_STEPS);
    expect(playback.phase()).toEqual({ kind: 'done', result: { question, direction: expected } });
    expect(expected).toBe('rose');
  });

  it('ignores reveal outside a predict pause', () => {
    const playback = createWebPlayback(grassland());
    playback.reveal();
    expect(playback.phase()).toEqual({ kind: 'ready' });
    playback.play();
    playback.reveal();
    expect(playback.phase()).toEqual({ kind: 'steady' });
  });

  it('uses the suggested event when the web has none', () => {
    const web = grasslandWeb();
    const playback = createWebPlayback(lessonOf(web));
    const expected = simulate(web, { steps: MODEL_STEPS, event: suggestedEvent(web), eventStep: EVENT_STEP, removed: new Set() });
    expect(playback.series()).toEqual(expected);
  });

  it('runs straight through with no pause when the lesson has no question', () => {
    const playback = createWebPlayback(lessonOf({ ...grasslandWeb(), event: FOX_REMOVED }, []));
    runToPause(playback);
    expect(playback.step()).toBe(MODEL_STEPS);
    expect(playback.phase()).toEqual({ kind: 'done', result: null });
  });
});

describe('createWebPlayback replay', () => {
  const finish = (playback: ReturnType<typeof createWebPlayback>): void => {
    runToPause(playback);
    if (playback.phase().kind === 'predict') {
      playback.reveal();
      playback.tick(BIG_TICK);
    }
  };

  it('keeps the first run as previous and asks a template question about a species that is still there', () => {
    const playback = createWebPlayback(grassland());
    finish(playback);
    const first = playback.series();
    playback.replay({ ...emptyEdits(), removed: new Set(['rabbit']) });
    expect(playback.previous()).toBe(first);
    expect(playback.phase()).toEqual({ kind: 'ready' });
    expect(playback.step()).toBe(0);
    playback.play();
    playback.tick(BIG_TICK);
    const paused = playback.phase();
    expect(paused.kind).toBe('predict');
    if (paused.kind !== 'predict') return;
    const observed = paused.question.observe.species;
    expect(['grass', 'fox', 'hawk']).toContain(observed);
    expect(observed).not.toBe('rabbit');
    expect(observed).not.toBe('fox');
    expect(paused.question.id).toBe('q-1');
    expect(paused.question.choices).toEqual([...WEB_CHOICES]);
    expect(playback.series().values.rabbit?.every((value) => value === 0)).toBe(true);
  });

  it('picks the first species, in species order, whose direction is not steady', () => {
    const playback = createWebPlayback(grassland());
    finish(playback);
    playback.replay(emptyEdits());
    playback.play();
    playback.tick(BIG_TICK);
    const paused = playback.phase();
    if (paused.kind !== 'predict') throw new Error('expected a predict pause');
    const directions = directionsAfter(playback.series(), EVENT_STEP);
    const expected = ['grass', 'rabbit', 'hawk'].find((id) => directions[id] !== 'steady');
    expect(paused.question.observe.species).toBe(expected);
  });

  it('runs the same event again with the edited starts', () => {
    const playback = createWebPlayback(grassland());
    finish(playback);
    const edits = setStart(emptyEdits(), 'rabbit', 5, 100);
    playback.replay(edits);
    expect(playback.series().values.rabbit?.[0]).toBe(5);
    expect(playback.series().values.fox?.[EVENT_STEP + 1]).toBe(0);
  });

  it('with every species removed completes at once with no question and an empty series', () => {
    const playback = createWebPlayback(grassland());
    finish(playback);
    const everything = grasslandWeb().species.reduce((edits, { id }) => toggleRemoved(edits, id), emptyEdits());
    playback.replay(everything);
    playback.play();
    playback.tick(BIG_TICK);
    expect(playback.phase()).toEqual({ kind: 'done', result: null });
    expect(playback.step()).toBe(MODEL_STEPS);
    for (const values of Object.values(playback.series().values)) expect(values.every((value) => value === 0)).toBe(true);
  });

  it('explains the edited run, so the explanation agrees with the result and not the unedited run', () => {
    const lesson = grassland();
    const playback = createWebPlayback(lesson);
    finish(playback);
    const unedited = templateQuestion(lesson.web, FOX_REMOVED, 'rabbit');
    playback.replay(toggleRemoved(emptyEdits(), 'grass'));
    finish(playback);
    const done = playback.phase();
    if (done.kind !== 'done' || done.result === null) throw new Error('expected a finished run with a result');
    expect(done.result.question.observe.species).toBe('rabbit');
    expect(done.result.direction).toBe('died out');
    expect(done.result.question.explanation).toContain(`rabbit ${PAST_TENSE_FOR_DIED_OUT} after`);
    expect(done.result.question.explanation).not.toBe(unedited.explanation);
    expect(unedited.explanation).toContain('rabbit rose after');
  });

  it('replays with no edits as the same run again', () => {
    const playback = createWebPlayback(grassland());
    finish(playback);
    const first = playback.series();
    playback.replay();
    expect(playback.previous()).toBe(first);
    expect(playback.series().values.grass).toEqual(first.values.grass);
  });
});
