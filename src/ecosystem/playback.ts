import type { EcosystemLesson } from '../session/store';
import { emptyEdits, type WebEdits } from './edits';
import { EVENT_STEP, MODEL_STEPS, simulate, startingPopulations, type Series } from './model';
import { directionsAfter, type Direction } from './outcomes';
import { eventOf, removedSpecies, templateQuestion, type WebQuestion } from './questions';

export type WebResult = { question: WebQuestion; direction: Direction };
export type WebPhase =
  | { kind: 'ready' }
  | { kind: 'steady' }
  | { kind: 'predict'; question: WebQuestion }
  | { kind: 'playing' }
  | { kind: 'done'; result: WebResult | null };

export type WebPlayback = {
  phase: () => WebPhase;
  step: () => number;
  series: () => Series;
  previous: () => Series | null;
  play: () => void;
  tick: (maxSteps: number) => void;
  reveal: () => void;
  // Runs the same event again with the setup the students changed.
  replay: (edits?: WebEdits) => void;
};

export const createWebPlayback = (lesson: EcosystemLesson): WebPlayback => {
  const { web } = lesson;
  const event = eventOf(web);
  const eventRemoves = removedSpecies(event);
  const settled = startingPopulations(web);

  const run = (edits: WebEdits): Series =>
    simulate(web, { steps: MODEL_STEPS, event, eventStep: EVENT_STEP, removed: edits.removed, start: edits.start }, settled);

  let series = run(emptyEdits());
  let previous: Series | null = null;
  let question: WebQuestion | null = lesson.questions[0] ?? null;
  let step = 0;
  let phase: WebPhase = { kind: 'ready' };

  const firstChanging = (next: Series, edits: WebEdits): string | undefined => {
    const directions = directionsAfter(next, EVENT_STEP);
    return web.species.find((entry) => !edits.removed.has(entry.id) && entry.id !== eventRemoves && directions[entry.id] !== 'steady')?.id;
  };

  const finish = (): void => {
    step = MODEL_STEPS;
    const direction = question ? directionsAfter(series, EVENT_STEP)[question.observe.species] : undefined;
    phase = { kind: 'done', result: question ? { question, direction: direction ?? 'steady' } : null };
  };

  const advanceTo = (target: number): void => {
    step = Math.min(target, MODEL_STEPS);
    if (step >= MODEL_STEPS) finish();
  };

  return {
    phase: () => phase,
    step: () => step,
    series: () => series,
    previous: () => previous,
    play: () => {
      if (phase.kind === 'ready') phase = { kind: 'steady' };
    },
    tick: (maxSteps) => {
      if (phase.kind === 'steady') {
        const pauseAt = question ? EVENT_STEP : MODEL_STEPS;
        advanceTo(Math.min(step + maxSteps, pauseAt));
        if (phase.kind === 'steady' && question && step >= EVENT_STEP) phase = { kind: 'predict', question };
      } else if (phase.kind === 'playing') {
        advanceTo(step + maxSteps);
      }
    },
    reveal: () => {
      if (phase.kind === 'predict') phase = { kind: 'playing' };
    },
    replay: (edits = emptyEdits()) => {
      previous = series;
      series = run(edits);
      const observe = firstChanging(series, edits);
      question = observe === undefined ? null : templateQuestion(web, event, observe, directionsAfter(series, EVENT_STEP));
      step = 0;
      phase = { kind: 'ready' };
    },
  };
};
