import { createSimulation, SETTLE_SECONDS, STEPS_PER_SECOND } from '../src/physics/simulation';
import type { PredictQuestion } from '../src/scene/questions';
import { BODY_KINDS, type Scene, type Trigger } from '../src/scene/schema';
import { requestModelJson, type CallOptions, type ProviderWithKey } from './sceneReader';

export type Outcome = { item: string; fallen: boolean };
export type SceneEvent = { seconds: number } & ({ kind: 'contact'; a: string; b: string } | { kind: 'fallen'; item: string });
type ModelQuestion = { predictPointId: string; observe: string; prompt: string; explanation: string; cites: string[] };
export type ModelDraft = { questions: ModelQuestion[] };

// "Fallen" means turned past a threshold, which only reads as falling over for things that stand up.
const TIPPABLE_KINDS: readonly string[] = ['domino', 'block', 'lever'];
const PROMPT_LENGTH = 120;
const EXPLANATION_LENGTH = 400;
// Enough to tell the story of a check drawing without flooding the prompt.
const EVENTS_SHOWN = 24;

export const outcomesOf = (scene: Scene): Outcome[] => {
  const tippable = scene.items.filter((item) => TIPPABLE_KINDS.includes(item.kind));
  const simulation = createSimulation(scene);
  for (let step = 0; step < SETTLE_SECONDS * STEPS_PER_SECOND; step += 1) simulation.step();
  return tippable.map((item) => ({ item: item.id, fallen: simulation.observe({ kind: 'fallen', item: item.id }) }));
};

const pairsOf = (ids: string[]): [string, string][] => ids.flatMap((a, index) => ids.slice(index + 1).map((b): [string, string] => [a, b]));

export const eventsOf = (scene: Scene): SceneEvent[] => {
  const bodies = scene.items.filter((item) => item.kind !== 'rope');
  const tippable = new Set(bodies.filter((item) => TIPPABLE_KINDS.includes(item.kind)).map((item) => item.id));
  const simulation = createSimulation(scene);
  simulation.step();
  // Whatever touches during the first step was resting there from the start.
  let pending = pairsOf(bodies.map((item) => item.id)).filter(([a, b]) => !simulation.isTriggered({ kind: 'contact', a, b }));
  let standing = [...tippable];
  const events: SceneEvent[] = [];
  for (let step = 1; step < SETTLE_SECONDS * STEPS_PER_SECOND && events.length < EVENTS_SHOWN; step += 1) {
    simulation.step();
    const seconds = simulation.stepIndex / STEPS_PER_SECOND;
    const touched = pending.filter(([a, b]) => simulation.isTriggered({ kind: 'contact', a, b }));
    const fell = standing.filter((item) => simulation.observe({ kind: 'fallen', item }));
    events.push(...touched.map(([a, b]): SceneEvent => ({ seconds, kind: 'contact', a, b })));
    events.push(...fell.map((item): SceneEvent => ({ seconds, kind: 'fallen', item })));
    pending = pending.filter((pair) => !touched.includes(pair));
    standing = standing.filter((item) => !fell.includes(item));
  }
  return events.slice(0, EVENTS_SHOWN);
};

export const describeEvent = (event: SceneEvent): string =>
  `${event.seconds.toFixed(1)} s: ${event.kind === 'contact' ? `${event.a} touches ${event.b}` : `${event.item} falls over`}`;

const objectOf = (properties: Record<string, unknown>): Record<string, unknown> => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const draftSchema = (scene: Scene): Record<string, unknown> =>
  objectOf({
    questions: {
      type: 'array',
      minItems: 1,
      maxItems: scene.predictPoints.length,
      items: objectOf({
        predictPointId: { type: 'string', enum: scene.predictPoints.map((point) => point.id) },
        observe: { type: 'string', enum: outcomesOf(scene).map((outcome) => outcome.item) },
        prompt: { type: 'string', maxLength: PROMPT_LENGTH },
        explanation: { type: 'string', maxLength: EXPLANATION_LENGTH },
        cites: { type: 'array', minItems: 1, items: { type: 'string', enum: scene.items.map((item) => item.id) } },
      }),
    },
  });

const describeTrigger = (trigger: Trigger): string =>
  trigger.kind === 'contact' ? `pauses when ${trigger.a} touches ${trigger.b}` : `pauses after ${trigger.seconds} seconds`;

export const draftPrompt = (scene: Scene, outcomes: Outcome[]): string => {
  const present = new Set<string>(scene.items.map((item) => item.kind));
  const absent = BODY_KINDS.filter((kind) => !present.has(kind));
  return [
    'You write a predict question for a physics class. The teacher drew a machine on the whiteboard; the class',
    'watches it run as a simulation, which pauses at a predict point so students can guess what happens next.',
    '',
    'The scene, in drawing units (y grows downward):',
    JSON.stringify({ items: scene.items, labels: scene.labels }),
    '',
    'Predict points:',
    ...scene.predictPoints.map((point) => `${point.id}: ${describeTrigger(point.trigger)}`),
    '',
    'What happens in the simulation, in order:',
    ...eventsOf(scene).map(describeEvent),
    '',
    'What the simulation shows once everything settles (this is the true answer; never contradict it):',
    ...outcomes.map((outcome) => `${outcome.item}: ${outcome.fallen ? 'falls over' : 'stays standing'}`),
    '',
    'Write one question per predict point. Each asks, as a yes-or-no question, whether one item falls over.',
    'Choose the item whose fate best tests understanding: usually the end of a chain, or one that surprisingly stays up.',
    `Keep the prompt under ${PROMPT_LENGTH} characters and plain enough for a 12-year-old.`,
    'The explanation is shown after the reveal: two or three sentences giving the physical reason for what happened',
    '(transfer of momentum, a gap too wide to bridge, an obstacle). Tell it in the order the events above happen,',
    'and describe only what the events show.',
    'Refer to things by what they are ("the first domino", "the ball"), never by their ids.',
    'cites lists the ids of every item the prompt or explanation talks about.',
    `Never use these words, because the drawing has none of them: ${absent.join(', ')}.`,
  ].join('\n');
};

export const toQuestions = (draft: ModelDraft): PredictQuestion[] =>
  draft.questions.map((question, index) => ({
    id: `q-${index + 1}`,
    predictPointId: question.predictPointId,
    prompt: question.prompt,
    choices: ['Yes', 'No'],
    observe: { kind: 'fallen', item: question.observe },
    explanation: question.explanation,
    cites: [...new Set([...question.cites, question.observe])],
  }));

const isDraft = (value: object): value is ModelDraft => 'questions' in value && Array.isArray(value.questions);

export const draftQuestionsWithModel = async (scene: Scene, provider: ProviderWithKey, options: CallOptions): Promise<PredictQuestion[]> => {
  const parsed = await requestModelJson(
    [{ type: 'text', text: draftPrompt(scene, outcomesOf(scene)) }],
    { name: 'predict_questions', schema: draftSchema(scene) },
    provider,
    options,
  );
  if (!isDraft(parsed)) throw new Error(`${provider.name} did not return a list of questions`);
  return toQuestions(parsed);
};
