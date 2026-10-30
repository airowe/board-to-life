import { WEB_CHOICES, describeEvent, directionsForEvent, eventOf, removedSpecies, unfedSpecies, type WebQuestion } from '../src/ecosystem/questions';
import type { Direction } from '../src/ecosystem/outcomes';
import type { Web } from '../src/ecosystem/schema';
import { objectOf } from './questionDrafter';
import { requestModelJson, type CallOptions, type ProviderWithKey } from './sceneReader';

type ModelWebQuestion = { observe: string; prompt: string; explanation: string; cites: string[] };
export type WebDraftResult = { questions: ModelWebQuestion[] };

const PROMPT_LENGTH = 120;
const EXPLANATION_LENGTH = 400;

export const webDraftSchema = (web: Web): Record<string, unknown> => {
  const removed = removedSpecies(eventOf(web));
  const unfed = new Set(unfedSpecies(web));
  const ids = web.species.map((entry) => entry.id);
  return objectOf({
    questions: {
      type: 'array',
      minItems: 1,
      maxItems: 1,
      items: objectOf({
        observe: { type: 'string', enum: ids.filter((id) => id !== removed && !unfed.has(id)) },
        prompt: { type: 'string', maxLength: PROMPT_LENGTH },
        explanation: { type: 'string', maxLength: EXPLANATION_LENGTH },
        cites: { type: 'array', minItems: 1, items: { type: 'string', enum: ids } },
      }),
    },
  });
};

export const webDraftPrompt = (web: Web, directions: Record<string, Direction>): string => {
  const event = eventOf(web);
  const removed = removedSpecies(event);
  return [
    'You write a predict question for a science class. The teacher drew a food web on the whiteboard; the class',
    'watches a population model of it run, and before the event happens each student guesses what a species will do.',
    'This is a simple model, not field data. Never present the numbers as measurements of real animals.',
    '',
    'The species, as id (name, role):',
    ...web.species.map((entry) => `${entry.id} (${entry.name}, ${entry.role})`),
    '',
    'Who eats whom:',
    ...web.eats.map((arrow) => `${arrow.from} is eaten by ${arrow.to}`),
    '',
    `The event: ${describeEvent(web, event)}`,
    '',
    'What the model shows for each species once things settle (this is the true answer; never contradict it):',
    ...web.species.filter((entry) => entry.id !== removed).map((entry) => `${entry.id}: ${directions[entry.id] ?? 'steady'}`),
    '',
    'Write one question asking what happens to one species. The answers are: ' + WEB_CHOICES.join(', ') + '.',
    'Choose the species whose change best shows the knock-on effect, usually two links from the removed one.',
    `Keep the prompt under ${PROMPT_LENGTH} characters and plain enough for a 12-year-old.`,
    'The explanation is shown after the reveal: two or three sentences that follow the chain of who eats whom,',
    'say "in the model", and describe only what the model shows.',
    'Refer to species by name, never by id.',
    'cites lists the ids of every species the prompt or explanation talks about.',
  ].join('\n');
};

export const toWebQuestions = (draft: WebDraftResult): WebQuestion[] =>
  draft.questions.map((question, index) => ({
    id: `q-${index + 1}`,
    prompt: question.prompt,
    choices: [...WEB_CHOICES],
    observe: { kind: 'direction', species: question.observe },
    explanation: question.explanation,
    cites: [...new Set([...question.cites, question.observe])],
  }));

const isDraft = (value: object): value is WebDraftResult => 'questions' in value && Array.isArray(value.questions);

export const draftWebQuestionsWithModel = async (web: Web, provider: ProviderWithKey, options: CallOptions): Promise<WebQuestion[]> => {
  const parsed = await requestModelJson(
    [{ type: 'text', text: webDraftPrompt(web, directionsForEvent(web, eventOf(web))) }],
    { name: 'predict_questions', schema: webDraftSchema(web) },
    provider,
    options,
  );
  if (!isDraft(parsed)) throw new Error(`${provider.name} did not return a list of questions`);
  return toWebQuestions(parsed).slice(0, 1);
};
