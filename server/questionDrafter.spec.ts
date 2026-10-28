import { describe, expect, it } from 'vitest';
import { DRAWING_CASES } from '../src/checks/cases';
import { rampBallDominoes } from '../src/scene/fixtures';
import { checkGrounding } from '../src/scene/questions';
import { validateScene, type Scene } from '../src/scene/schema';
import { describeEvent, draftPrompt, draftQuestionsWithModel, draftSchema, eventsOf, outcomesOf, toQuestions, type ModelDraft } from './questionDrafter';
import { PROVIDERS, type CallRecord } from './sceneReader';

const TIMEOUT_MS = 1000;
const provider = { ...PROVIDERS.meta, apiKey: 'test-key' };

const sceneFrom = (input: unknown): Scene => {
  const result = validateScene(input);
  if (!result.ok) throw new Error(result.errors.join('; '));
  return result.scene;
};

const sample = sceneFrom(rampBallDominoes);
const CLEAN = DRAWING_CASES.filter((drawingCase) => !drawingCase.id.endsWith('-photo'));

const modelQuestion: ModelDraft['questions'][number] = {
      predictPointId: 'pp-1',
      observe: 'domino-5',
      prompt: 'Will the last domino fall?',
      explanation: 'The ball rolls down the ramp into the first domino, and each domino tips the next.',
  cites: ['ball', 'ramp', 'domino-1', 'domino-5', 'ball'],
};
const modelDraft: ModelDraft = { questions: [modelQuestion] };

type Call = { url: string; init: RequestInit };
const completion = (content: string): string => JSON.stringify({ choices: [{ message: { role: 'assistant', content } }], usage: { prompt_tokens: 900, completion_tokens: 120 } });
const fakeFetch = (status: number, body: string, calls: Call[] = []): typeof fetch =>
  (input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    return Promise.resolve(new Response(body, { status, headers: { 'content-type': 'application/json' } }));
  };

type SchemaNode = { enum?: string[]; items?: SchemaNode; properties?: Record<string, SchemaNode>; additionalProperties?: boolean; maxItems?: number };
const questionNode = (scene: Scene): SchemaNode => (draftSchema(scene) as SchemaNode).properties?.questions?.items ?? {};

describe('outcomesOf', () => {
  it.each(CLEAN.map((drawingCase) => [drawingCase.id, drawingCase] as const))('agrees with the expected outcomes for %s', (_id, drawingCase) => {
    const outcomes = outcomesOf(drawingCase.scene);
    for (const expected of drawingCase.outcomes) expect(outcomes).toContainEqual({ item: expected.item, fallen: expected.fallen });
  });

  it('only covers things that can tip over: dominoes, blocks and levers', () => {
    const kinds = new Map(sample.items.map((item) => [item.id, item.kind]));
    expect(outcomesOf(sample).map((outcome) => kinds.get(outcome.item))).toEqual(expect.arrayContaining(['domino']));
    expect(outcomesOf(sample).every((outcome) => ['domino', 'block', 'lever'].includes(kinds.get(outcome.item) ?? ''))).toBe(true);
  });
});

describe('eventsOf', () => {
  const events = eventsOf(sample);
  const indexOf = (text: string): number => events.map(describeEvent).findIndex((line) => line.includes(text));

  it('lists what happens in the order it happens', () => {
    expect(indexOf('ball touches domino-1')).toBeGreaterThanOrEqual(0);
    expect(indexOf('ball touches domino-1')).toBeLessThan(indexOf('domino-1 touches domino-2'));
    expect(indexOf('domino-1 touches domino-2')).toBeLessThan(indexOf('domino-5 falls over'));
    const times = events.map((event) => event.seconds);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('leaves out things that were already touching when the machine starts', () => {
    expect(events.map(describeEvent).some((line) => /domino-1 touches floor|floor touches domino-1/.test(line))).toBe(false);
  });

  it('describes each event with its time', () => {
    expect(describeEvent({ seconds: 1.25, kind: 'contact', a: 'ball', b: 'domino-1' })).toBe('1.3 s: ball touches domino-1');
    expect(describeEvent({ seconds: 2, kind: 'fallen', item: 'domino-5' })).toBe('2.0 s: domino-5 falls over');
  });
});

describe('draftSchema', () => {
  it('limits every id the model can give to ids in the scene', () => {
    const node = questionNode(sample);
    expect(node.properties?.predictPointId?.enum).toEqual(sample.predictPoints.map((point) => point.id));
    expect(node.properties?.observe?.enum).toEqual(outcomesOf(sample).map((outcome) => outcome.item));
    expect(node.properties?.cites?.items?.enum).toEqual(sample.items.map((item) => item.id));
  });

  it('allows no fields the reader did not ask for, and one question per predict point', () => {
    expect(questionNode(sample).additionalProperties).toBe(false);
    expect((draftSchema(sample) as SchemaNode).properties?.questions?.maxItems).toBe(sample.predictPoints.length);
  });
});

describe('draftPrompt', () => {
  const prompt = draftPrompt(sample, outcomesOf(sample));

  it('tells the model what the physics showed', () => {
    for (const outcome of outcomesOf(sample)) expect(prompt).toContain(`${outcome.item}: ${outcome.fallen ? 'falls over' : 'stays standing'}`);
  });

  it('gives the model the order of events, so the explanation tells what really happened', () => {
    for (const event of eventsOf(sample)) expect(prompt).toContain(describeEvent(event));
  });

  it('describes each predict point', () => {
    expect(prompt).toContain('pp-1: pauses when ball touches domino-1');
  });

  it('forbids the words for kinds the scene does not have, and only those', () => {
    const forbidden = prompt.split('\n').find((line) => line.startsWith('Never use these words')) ?? '';
    expect(forbidden).toContain('pulley');
    expect(forbidden).toContain('lever');
    expect(forbidden).not.toContain('domino');
    expect(forbidden).not.toContain('ramp');
  });
});

describe('toQuestions', () => {
  const questions = toQuestions(modelDraft);

  it('builds yes-or-no questions about whether the chosen item falls', () => {
    expect(questions).toEqual([
      {
        id: 'q-1',
        predictPointId: 'pp-1',
        prompt: 'Will the last domino fall?',
        choices: ['Yes', 'No'],
        observe: { kind: 'fallen', item: 'domino-5' },
        explanation: modelQuestion.explanation,
        cites: ['ball', 'ramp', 'domino-1', 'domino-5'],
      },
    ]);
  });

  it('cites the observed item even when the model leaves it out', () => {
    const [question] = toQuestions({ questions: [{ ...modelQuestion, cites: ['ball'] }] });
    expect(question?.cites).toEqual(['ball', 'domino-5']);
  });

  it('gives grounded questions for the sample scene', () => {
    expect(checkGrounding(questions, sample)).toEqual({ ok: true, questions });
  });
});

describe('draftQuestionsWithModel', () => {
  it('sends the prompt as text only, with the scene-specific schema', async () => {
    const calls: Call[] = [];
    await draftQuestionsWithModel(sample, provider, { timeoutMs: TIMEOUT_MS, fetchImpl: fakeFetch(200, completion(JSON.stringify(modelDraft)), calls) });
    const body = JSON.parse(String(calls[0]?.init.body)) as {
      messages: { content: { type: string; text?: string }[] }[];
      response_format: { json_schema: { name: string; schema: unknown } };
    };
    expect(calls[0]?.url).toBe('https://api.meta.ai/v1/chat/completions');
    expect(body.messages[0]?.content.map((part) => part.type)).toEqual(['text']);
    expect(body.messages[0]?.content[0]?.text).toBe(draftPrompt(sample, outcomesOf(sample)));
    expect(body.response_format.json_schema).toEqual({ name: 'predict_questions', schema: draftSchema(sample) });
  });

  it('returns the drafted questions and records the call', async () => {
    const records: CallRecord[] = [];
    const questions = await draftQuestionsWithModel(sample, provider, {
      timeoutMs: TIMEOUT_MS,
      fetchImpl: fakeFetch(200, completion(JSON.stringify(modelDraft))),
      onCall: (record) => records.push(record),
    });
    expect(questions).toEqual(toQuestions(modelDraft));
    expect(records).toEqual([expect.objectContaining({ provider: 'meta', status: 200, error: null, usage: { prompt_tokens: 900, completion_tokens: 120 } })]);
  });

  it('fails when the answer has no questions list', async () => {
    await expect(
      draftQuestionsWithModel(sample, provider, { timeoutMs: TIMEOUT_MS, fetchImpl: fakeFetch(200, completion(JSON.stringify({ nothing: true }))) }),
    ).rejects.toThrow('meta did not return a list of questions');
  });
});
