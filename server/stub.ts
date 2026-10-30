import { checkDescription } from '../src/capture/description';
import { NOTHING_TO_PREDICT, changingSpecies, checkWebGrounding, eventOf, removedSpecies, templateQuestion, twoLinksFrom } from '../src/ecosystem/questions';
import { WEB_SAMPLES } from '../src/ecosystem/samples';
import { validateWeb, type Web } from '../src/ecosystem/schema';
import { flipArrow } from '../src/ecosystem/trophic';
import { rampBallDominoes, rampBallDominoesQuestions } from '../src/scene/fixtures';
import { checkGrounding } from '../src/scene/questions';
import { validateScene } from '../src/scene/schema';

export const STUB_MODES = ['ok', 'error', 'timeout', 'invalid', 'ungrounded', 'backward'] as const;
export type StubMode = (typeof STUB_MODES)[number];
export type StubResponse = { status: number; body: unknown };

type Timing = { mode: StubMode; delayMs: number };
export type UnderstandRequest = Timing & { contentType: string; bytes: number };
export type DescribeRequest = Timing & { text: unknown };
export type DraftQuestionsRequest = Timing & { scene: unknown };
export type DraftWebQuestionsRequest = Timing & { web: unknown };

export const parseStubMode = (value: string | undefined): StubMode =>
  STUB_MODES.find((mode) => mode === value) ?? 'ok';

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const failure = (status: number, error: string, details: string[] = []): StubResponse => ({
  status,
  body: { error, details },
});

const SCENE_READER = 'scene reader';
const WEB_READER = 'food web reader';
const WEB_WRITER = 'food web writer';

const simulatedFailure = (mode: StubMode, who = SCENE_READER): StubResponse | null => {
  if (mode === 'error') return failure(503, `The ${who} is unavailable (stub error mode).`);
  if (mode === 'timeout') return failure(504, `The ${who} took too long (stub timeout mode).`);
  return null;
};

const sceneFromModel = (mode: StubMode): unknown =>
  mode === 'invalid'
    ? { ...rampBallDominoes, items: [...rampBallDominoes.items, { id: 'spring-1', kind: 'spring', x: 10, y: 10, confidence: 0.4 }] }
    : rampBallDominoes;

const questionsFromModel = (mode: StubMode): unknown =>
  mode === 'ungrounded'
    ? rampBallDominoesQuestions.map((question) => ({ ...question, cites: [...question.cites, 'domino-9'] }))
    : rampBallDominoesQuestions;

export const handleUnderstand = async (request: UnderstandRequest): Promise<StubResponse> => {
  if (request.bytes === 0 || !request.contentType.startsWith('image/')) {
    return failure(400, 'Send a photo of the drawing (an image file).');
  }
  await wait(request.delayMs);
  const simulated = simulatedFailure(request.mode);
  if (simulated) return simulated;

  const result = validateScene(sceneFromModel(request.mode));
  if (!result.ok) return failure(502, 'The scene reader returned a scene that failed validation.', result.errors);
  return { status: 200, body: { stub: true, scene: result.scene } };
};

export const handleDraftQuestions = async (request: DraftQuestionsRequest): Promise<StubResponse> => {
  const scene = validateScene(request.scene);
  if (!scene.ok) return failure(400, 'The scene sent for drafting failed validation.', scene.errors);
  await wait(request.delayMs);
  const simulated = simulatedFailure(request.mode);
  if (simulated) return simulated;

  const grounded = checkGrounding(questionsFromModel(request.mode), scene.scene);
  if (!grounded.ok) return failure(422, 'A drafted question cited something not in the scene.', grounded.errors);
  return { status: 200, body: { stub: true, questions: grounded.questions } };
};

export const handleDescribe = async (request: DescribeRequest): Promise<StubResponse> => {
  const checked = checkDescription(request.text);
  if (!checked.ok) return failure(400, checked.error);
  await wait(request.delayMs);
  const simulated = simulatedFailure(request.mode);
  if (simulated) return simulated;

  const result = validateScene(sceneFromModel(request.mode));
  if (!result.ok) return failure(502, 'The scene writer returned a scene that failed validation.', result.errors);
  return { status: 200, body: { stub: true, scene: result.scene } };
};

const ARROW_TO_MISSING_SPECIES = { id: 'e-stub', from: 'grass', to: 'ghost', confidence: 0.4 };

const RABBIT_EATEN_BY_FOX = { from: 'rabbit', to: 'fox' };

const reverseFoxRabbit = (web: Web): Web => {
  const arrow = web.eats.find((each) => each.from === RABBIT_EATEN_BY_FOX.from && each.to === RABBIT_EATEN_BY_FOX.to);
  return arrow ? flipArrow(web, arrow.id) : web;
};

const webFromModel = (mode: StubMode): unknown => {
  const sample = WEB_SAMPLES[0]?.web;
  if (!sample) return sample;
  if (mode === 'invalid') return { ...sample, eats: [...sample.eats, ARROW_TO_MISSING_SPECIES] };
  return mode === 'backward' ? reverseFoxRabbit(sample) : sample;
};

const webResponse = async (mode: StubMode, delayMs: number, who: string): Promise<StubResponse> => {
  await wait(delayMs);
  const simulated = simulatedFailure(mode, who);
  if (simulated) return simulated;
  const result = validateWeb(webFromModel(mode));
  if (!result.ok) return failure(502, `The ${who} returned a web that failed validation.`, result.errors);
  return { status: 200, body: { stub: true, web: result.web } };
};

export const handleUnderstandWeb = (request: UnderstandRequest): Promise<StubResponse> | StubResponse =>
  request.bytes === 0 || !request.contentType.startsWith('image/')
    ? failure(400, 'Send a photo of the drawing (an image file).')
    : webResponse(request.mode, request.delayMs, WEB_READER);

export const handleDescribeWeb = (request: DescribeRequest): Promise<StubResponse> | StubResponse => {
  const checked = checkDescription(request.text);
  return checked.ok ? webResponse(request.mode, request.delayMs, WEB_WRITER) : failure(400, checked.error);
};

const GHOST_SPECIES = 'ghost';

const stubObservation = (web: Web, changing: string[]): string => {
  const removed = removedSpecies(eventOf(web));
  const twoLinks = removed === null ? [] : twoLinksFrom(web, removed);
  return twoLinks.find((id) => changing.includes(id)) ?? (changing[0] as string);
};

export const handleDraftWebQuestions = async (request: DraftWebQuestionsRequest): Promise<StubResponse> => {
  const validated = validateWeb(request.web);
  if (!validated.ok) return failure(400, 'The web sent for drafting failed validation.', validated.errors);
  const web = validated.web;
  const event = eventOf(web);
  const changing = changingSpecies(web, event);
  if (changing.length === 0) return failure(422, NOTHING_TO_PREDICT);
  await wait(request.delayMs);
  const simulated = simulatedFailure(request.mode, WEB_READER);
  if (simulated) return simulated;

  const question = templateQuestion(web, event, stubObservation(web, changing));
  const drafted = request.mode === 'ungrounded' ? [{ ...question, cites: [...question.cites, GHOST_SPECIES] }] : [question];
  const grounded = checkWebGrounding(drafted, web);
  if (!grounded.ok) return failure(422, 'A drafted question cited something not in the web.', grounded.errors);
  return { status: 200, body: { stub: true, questions: grounded.questions } };
};
