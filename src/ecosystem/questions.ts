import { z } from 'zod';
import { EVENT_STEP, MODEL_STEPS, simulate, startingPopulations } from './model';
import { directionsAfter, type Direction } from './outcomes';
import type { Web, WebEvent } from './schema';
import { suggestedEvent } from './trophic';

export const WEB_CHOICES = ['Rises', 'Falls', 'Stays about the same', 'Dies out'] as const;

export const CHOICE_FOR: Record<Direction, string> = {
  rose: 'Rises',
  fell: 'Falls',
  steady: 'Stays about the same',
  'died out': 'Dies out',
};

const PAST_TENSE_FOR: Record<Direction, string> = {
  rose: 'rose',
  fell: 'fell',
  steady: 'stayed about the same',
  'died out': 'died out',
};

const questionSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  choices: z.array(z.string().min(1)).min(2),
  observe: z.object({ kind: z.literal('direction'), species: z.string().min(1) }),
  explanation: z.string().min(1),
  cites: z.array(z.string().min(1)).min(1),
});

export type WebQuestion = z.infer<typeof questionSchema>;
export type WebGroundingResult = { ok: true; questions: WebQuestion[] } | { ok: false; errors: string[] };

export const NOTHING_TO_PREDICT = 'Nothing in the web changes after the event, so there is nothing to predict.';

export const eventOf = (web: Web): WebEvent => web.event ?? suggestedEvent(web);

export const removedSpecies = (event: WebEvent): string | null => (event.kind === 'remove' ? event.species : null);

export const unfedSpecies = (web: Web): string[] => {
  const steady = startingPopulations(web);
  return web.species.filter((entry) => entry.role === 'consumer' && steady[entry.id] === 0).map((entry) => entry.id);
};

export const directionsForEvent = (web: Web, event: WebEvent): Record<string, Direction> =>
  directionsAfter(simulate(web, { steps: MODEL_STEPS, event, eventStep: EVENT_STEP, removed: new Set() }), EVENT_STEP);

export const changingSpecies = (web: Web, event: WebEvent, directions = directionsForEvent(web, event)): string[] => {
  const removed = removedSpecies(event);
  return web.species.filter((entry) => entry.id !== removed && directions[entry.id] !== 'steady').map((entry) => entry.id);
};

const nameOf = (web: Web, speciesId: string): string => (web.species.find((entry) => entry.id === speciesId)?.name ?? speciesId).toLowerCase();

const listOfNames = (web: Web, speciesIds: string[]): string => {
  const names = speciesIds.map((id) => `the ${nameOf(web, id)}`);
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

// What the teacher's own removals do when they replace a "remove" event: those species go at the predict point.
export const describeRemoval = (web: Web, speciesIds: string[]): string => `Remove ${listOfNames(web, speciesIds)}.`;

const describeRemovalPast = (web: Web, speciesIds: string[]): string =>
  `${listOfNames(web, speciesIds)} ${speciesIds.length === 1 ? 'was' : 'were'} removed`;

export const describeEvent = (web: Web, event: WebEvent): string =>
  event.kind === 'remove' ? describeRemoval(web, [event.species]) : 'A drought hits.';

const describeEventPast = (web: Web, event: WebEvent): string =>
  event.kind === 'remove' ? describeRemovalPast(web, [event.species]) : 'the drought';

const neighboursOf = (web: Web, speciesId: string): Set<string> =>
  new Set(web.eats.flatMap((arrow) => (arrow.from === speciesId ? [arrow.to] : arrow.to === speciesId ? [arrow.from] : [])));

export const twoLinksFrom = (web: Web, speciesId: string): string[] => {
  const near = neighboursOf(web, speciesId);
  const reached = new Set([...near].flatMap((neighbour) => [...neighboursOf(web, neighbour)]));
  return web.species.map((entry) => entry.id).filter((id) => reached.has(id) && !near.has(id) && id !== speciesId);
};

const questionAbout = (
  web: Web,
  change: { now: string; past: string; removed: string[] },
  observe: string,
  directions: Record<string, Direction>,
): WebQuestion => {
  const direction = directions[observe] ?? 'steady';
  const observed = nameOf(web, observe);
  return {
    id: 'q-1',
    prompt: `${change.now} What happens to the ${observed}?`,
    choices: [...WEB_CHOICES],
    observe: { kind: 'direction', species: observe },
    explanation: `In the model, the ${observed} ${PAST_TENSE_FOR[direction]} after ${change.past}.`,
    cites: [observe, ...change.removed.filter((id) => id !== observe)],
  };
};

export const templateQuestion = (
  web: Web,
  event: WebEvent,
  observe: string,
  directions: Record<string, Direction> = directionsForEvent(web, event),
): WebQuestion => {
  const removed = removedSpecies(event);
  return questionAbout(web, { now: describeEvent(web, event), past: describeEventPast(web, event), removed: removed === null ? [] : [removed] }, observe, directions);
};

export const removalQuestion = (web: Web, removed: string[], observe: string, directions: Record<string, Direction>): WebQuestion =>
  questionAbout(web, { now: describeRemoval(web, removed), past: describeRemovalPast(web, removed), removed }, observe, directions);

const groundingErrors = (question: WebQuestion, web: Web): string[] => {
  const speciesIds = new Set(web.species.map((entry) => entry.id));
  const removed = removedSpecies(eventOf(web));
  const errors: string[] = [];
  for (const cited of question.cites) {
    if (!speciesIds.has(cited)) errors.push(`${question.id} cites missing species "${cited}"`);
  }
  if (!speciesIds.has(question.observe.species)) errors.push(`${question.id} observes missing species "${question.observe.species}"`);
  else if (question.observe.species === removed) errors.push(`${question.id} observes "${removed}", which the event removes`);
  else if (unfedSpecies(web).includes(question.observe.species)) {
    errors.push(`${question.id} observes "${question.observe.species}", which has nothing to eat in this web`);
  }
  if (question.choices.join('\n') !== WEB_CHOICES.join('\n')) errors.push(`${question.id} must offer the four standard choices`);
  return errors;
};

export const checkWebGrounding = (input: unknown, web: Web): WebGroundingResult => {
  const parsed = z.array(questionSchema).safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) };
  }
  const errors = parsed.data.flatMap((question) => groundingErrors(question, web));
  return errors.length === 0 ? { ok: true, questions: parsed.data } : { ok: false, errors };
};
