import { describe, expect, it } from 'vitest';
import { factsFor } from '../src/geometry/focus';
import { INVARIANT_CHOICES, templateFigureQuestion } from '../src/geometry/questions';
import { GEOMETRY_SAMPLES, type FigureSample } from '../src/geometry/samples';
import type { Figure, Focus } from '../src/geometry/schema';
import { draftFigureQuestionsWithModel, figureDraftPrompt, figureDraftSchema, type FigureDraftResult } from './figureDrafter';
import { PROVIDERS } from './sceneReader';

const TIMEOUT_MS = 1000;
const provider = { ...PROVIDERS.meta, apiKey: 'test-key' };

const sampleFigure = (id: string): Figure => {
  const sample: FigureSample | undefined = GEOMETRY_SAMPLES.find((entry) => entry.id === id);
  if (sample === undefined) throw new Error(`no sample ${id}`);
  return sample.figure;
};

const triangle = sampleFigure('triangle');
const ANGLE_SUM_FOCUS: Focus = { kind: 'angle-sum', polygon: 'abc', drag: 'C' };
const REFLECTION_FOCUS: Focus = { kind: 'transform', transformation: 'flip' };
const EQUAL_ANGLES_FOCUS: Focus = { kind: 'equal-angles', marks: ['m1', 'm2'], drag: 'T' };

const modelQuestion: FigureDraftResult['questions'][number] = {
  prompt: 'Drag C around. Do the angles of ABC still make 180°?',
  explanation: 'However C moves, the three angles share out the same straight line.',
  cites: ['A', 'B', 'C', 'C'],
};

type Call = { url: string; init: RequestInit };
const completion = (content: string): string => JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] });
const fakeFetch = (body: string, calls: Call[] = []): typeof fetch =>
  (input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    return Promise.resolve(new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }));
  };

type SchemaNode = { enum?: string[]; items?: SchemaNode; properties?: Record<string, SchemaNode>; required?: string[] };

describe('figureDraftSchema', () => {
  const node = (): SchemaNode => (figureDraftSchema(triangle) as SchemaNode).properties?.questions?.items ?? {};

  it('lets the model write only the prompt, explanation and cites', () => {
    expect(node().required).toEqual(['prompt', 'explanation', 'cites']);
  });

  it('lets the model cite only the figure’s points, and asks for one question', () => {
    expect(node().properties?.cites?.items?.enum).toEqual(['A', 'B', 'C']);
    expect(figureDraftSchema(triangle)).toMatchObject({ properties: { questions: { minItems: 1, maxItems: 1 } }, additionalProperties: false });
  });
});

describe('figureDraftPrompt', () => {
  it('lists the angle-sum fact in words', () => {
    expect(figureDraftPrompt(triangle, ANGLE_SUM_FOCUS, factsFor(triangle, ANGLE_SUM_FOCUS))).toContain('The angles of ABC add up to 180°.');
  });

  it('lists the reflection facts in words', () => {
    const reflection = sampleFigure('reflection');
    const prompt = figureDraftPrompt(reflection, REFLECTION_FOCUS, factsFor(reflection, REFLECTION_FOCUS));
    expect(prompt).toContain('After the reflection, ABC lands at A′ (950, 250), B′ (750, 350) and C′ (900, 550).');
    expect(prompt).toContain('The image is congruent to ABC: the same side lengths and angles.');
  });

  it('lists the equal-angles fact in words', () => {
    const parallel = sampleFigure('parallel');
    expect(figureDraftPrompt(parallel, EQUAL_ANGLES_FOCUS, factsFor(parallel, EQUAL_ANGLES_FOCUS))).toContain(
      'The marked angles at P1 and P2 are equal: both 65°.',
    );
  });

  it('states the template question and its answer', () => {
    const prompt = figureDraftPrompt(triangle, ANGLE_SUM_FOCUS, factsFor(triangle, ANGLE_SUM_FOCUS));
    const template = templateFigureQuestion(triangle, ANGLE_SUM_FOCUS);
    expect(prompt).toContain(template.prompt);
    expect(prompt).toContain(`The answer is: ${INVARIANT_CHOICES[0]}`);
  });
});

describe('draftFigureQuestionsWithModel', () => {
  const draft = (reply: unknown, calls: Call[] = []) =>
    draftFigureQuestionsWithModel(triangle, ANGLE_SUM_FOCUS, provider, { timeoutMs: TIMEOUT_MS, fetchImpl: fakeFetch(completion(JSON.stringify(reply)), calls) });

  it('sends the prompt as text only, with the figure-specific schema', async () => {
    const calls: Call[] = [];
    await draft({ questions: [modelQuestion] }, calls);
    const body = JSON.parse(String(calls[0]?.init.body)) as {
      messages: { content: { type: string; text?: string }[] }[];
      response_format: { json_schema: { name: string; schema: unknown } };
    };
    expect(body.messages[0]?.content.map((part) => part.type)).toEqual(['text']);
    expect(body.messages[0]?.content[0]?.text).toBe(figureDraftPrompt(triangle, ANGLE_SUM_FOCUS, factsFor(triangle, ANGLE_SUM_FOCUS)));
    expect(body.response_format.json_schema).toEqual({ name: 'predict_questions', schema: figureDraftSchema(triangle) });
  });

  it('takes the wording from the model and the choices and answer from the template', async () => {
    const template = templateFigureQuestion(triangle, ANGLE_SUM_FOCUS);
    expect(await draft({ questions: [modelQuestion] })).toEqual([
      { ...template, prompt: modelQuestion.prompt, explanation: modelQuestion.explanation, cites: ['A', 'B', 'C'] },
    ]);
  });

  it('keeps the template answer when the model tries to set its own', async () => {
    const meddling = { ...modelQuestion, answer: INVARIANT_CHOICES[2], choices: ['Maybe'] };
    const [question] = await draft({ questions: [meddling] });
    expect(question?.answer).toBe(INVARIANT_CHOICES[0]);
    expect(question?.choices).toEqual([...INVARIANT_CHOICES]);
  });

  it('keeps only the first question when the model sends several', async () => {
    expect(await draft({ questions: [modelQuestion, { ...modelQuestion, prompt: 'Second?' }] })).toHaveLength(1);
  });

  it('fails when the answer has no questions list', async () => {
    await expect(draft({ nothing: true })).rejects.toThrow('meta did not return a list of questions');
  });
});
