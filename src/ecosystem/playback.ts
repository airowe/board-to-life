import type { EcosystemLesson } from '../session/store';
import type { Web, WebEvent } from './schema';
import { eventLabel } from './chart';
import { emptyEdits, type WebEdits } from './edits';
import { EVENT_STEP, MODEL_STEPS, simulate, startingPopulations, type Series } from './model';
import { directionsAfter, type Direction } from './outcomes';
import { describeEvent, describeRemoval, eventOf, removalQuestion, removedSpecies, templateQuestion, type WebQuestion } from './questions';

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
  // What happens at the predict point in this run, e.g. "Remove the sea otter."
  change: () => string;
  // The same, short enough for the chart's marker line, e.g. "Sea otter removed".
  changeLabel: () => string;
  previous: () => Series | null;
  play: () => void;
  tick: (maxSteps: number) => void;
  reveal: () => void;
  // Runs the same event again with the setup the students changed.
  replay: (edits?: WebEdits) => void;
};

// Removing species is itself the experiment when the lesson's event is a removal: the species the teacher took away go
// at the predict point instead of the lesson's own, so removing the kelp does not also remove the otters. Returns
// those species in the web's order, or null when the lesson's own event still happens.
export const removalsReplacingEvent = (web: Web, event: WebEvent, edits: WebEdits): string[] | null =>
  event.kind === 'remove' && edits.removed.size > 0 ? web.species.map((entry) => entry.id).filter((id) => edits.removed.has(id)) : null;

export const createWebPlayback = (lesson: EcosystemLesson): WebPlayback => {
  const { web } = lesson;
  const event = eventOf(web);
  const eventRemoves = removedSpecies(event);
  const settled = startingPopulations(web);

  const replacesEvent = (edits: WebEdits): boolean => removalsReplacingEvent(web, event, edits) !== null;
  const removedInOrder = (edits: WebEdits): string[] => removalsReplacingEvent(web, event, edits) ?? [];

  const run = (edits: WebEdits): Series =>
    simulate(
      web,
      replacesEvent(edits)
        ? { steps: MODEL_STEPS, event: null, eventStep: EVENT_STEP, removed: edits.removed, removedFrom: EVENT_STEP, start: edits.start }
        : { steps: MODEL_STEPS, event, eventStep: EVENT_STEP, removed: edits.removed, start: edits.start },
      settled,
    );

  let series = run(emptyEdits());
  const nameOf = (id: string): string => web.species.find((entry) => entry.id === id)?.name ?? id;
  const labelFor = (edits: WebEdits): string =>
    replacesEvent(edits) ? `${removedInOrder(edits).map(nameOf).join(', ')} removed` : eventLabel({ species: web.species, event });

  let change = describeEvent(web, event);
  let changeLabel = labelFor(emptyEdits());
  let previous: Series | null = null;
  let question: WebQuestion | null = lesson.questions[0] ?? null;
  let step = 0;
  let phase: WebPhase = { kind: 'ready' };

  const firstChanging = (next: Series, edits: WebEdits): string | undefined => {
    const directions = directionsAfter(next, EVENT_STEP);
    const gone = replacesEvent(edits) ? null : eventRemoves;
    return web.species.find((entry) => !edits.removed.has(entry.id) && entry.id !== gone && directions[entry.id] !== 'steady')?.id;
  };

  const questionFor = (next: Series, edits: WebEdits, observe: string): WebQuestion => {
    const directions = directionsAfter(next, EVENT_STEP);
    return replacesEvent(edits)
      ? removalQuestion(web, removedInOrder(edits), observe, directions)
      : templateQuestion(web, event, observe, directions);
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
    change: () => change,
    changeLabel: () => changeLabel,
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
      question = observe === undefined ? null : questionFor(series, edits, observe);
      change = replacesEvent(edits) ? describeRemoval(web, removedInOrder(edits)) : describeEvent(web, event);
      changeLabel = labelFor(edits);
      step = 0;
      phase = { kind: 'ready' };
    },
  };
};
