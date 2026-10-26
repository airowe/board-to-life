import { rampBallDominoes, rampBallDominoesQuestions } from '../src/scene/fixtures';
import { checkGrounding } from '../src/scene/questions';
import { validateScene } from '../src/scene/schema';

export const STUB_MODES = ['ok', 'error', 'timeout', 'invalid', 'ungrounded'] as const;
export type StubMode = (typeof STUB_MODES)[number];
export type StubResponse = { status: number; body: unknown };

type Timing = { mode: StubMode; delayMs: number };
export type UnderstandRequest = Timing & { contentType: string; bytes: number };
export type DraftQuestionsRequest = Timing & { scene: unknown };

export const parseStubMode = (value: string | undefined): StubMode =>
  STUB_MODES.find((mode) => mode === value) ?? 'ok';

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const failure = (status: number, error: string, details: string[] = []): StubResponse => ({
  status,
  body: { error, details },
});

const simulatedFailure = (mode: StubMode): StubResponse | null => {
  if (mode === 'error') return failure(503, 'The scene reader is unavailable (stub error mode).');
  if (mode === 'timeout') return failure(504, 'The scene reader took too long (stub timeout mode).');
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
