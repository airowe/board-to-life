import { describe, expect, it } from 'vitest';
import { grasslandWeb, speciesAt } from '../src/ecosystem/fixtures';
import { WEB_CHOICES, directionsForEvent, eventOf } from '../src/ecosystem/questions';
import type { Web } from '../src/ecosystem/schema';
import { PROVIDERS, type CallRecord } from './sceneReader';
import { draftWebQuestionsWithModel, toWebQuestions, webDraftPrompt, webDraftSchema, type WebDraftResult } from './webDrafter';

const TIMEOUT_MS = 1000;
const provider = { ...PROVIDERS.meta, apiKey: 'test-key' };

const web: Web = { ...grasslandWeb(), event: { kind: 'remove', species: 'fox' } };
const directions = directionsForEvent(web, eventOf(web));

const modelQuestion: WebDraftResult['questions'][number] = {
  observe: 'grass',
  prompt: 'Remove the fox. What happens to the grass?',
  explanation: 'With no fox, the rabbits multiply and eat more grass.',
  cites: ['rabbit', 'grass', 'grass'],
};
const modelDraft: WebDraftResult = { questions: [modelQuestion] };

type Call = { url: string; init: RequestInit };
const completion = (content: string): string => JSON.stringify({ choices: [{ message: { role: 'assistant', content } }], usage: { prompt_tokens: 900, completion_tokens: 120 } });
const fakeFetch = (status: number, body: string, calls: Call[] = []): typeof fetch =>
  (input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    return Promise.resolve(new Response(body, { status, headers: { 'content-type': 'application/json' } }));
  };

type SchemaNode = { enum?: string[]; items?: SchemaNode; properties?: Record<string, SchemaNode>; additionalProperties?: boolean; maxItems?: number };
const questionNode = (): SchemaNode => (webDraftSchema(web) as SchemaNode).properties?.questions?.items ?? {};

describe('webDraftSchema', () => {
  it('lets the model observe every species but the removed one', () => {
    expect(questionNode().properties?.observe?.enum).toEqual(['grass', 'rabbit', 'hawk']);
  });

  it('lets the model cite any species, and asks for exactly one question', () => {
    expect(questionNode().properties?.cites?.items?.enum).toEqual(['grass', 'rabbit', 'fox', 'hawk']);
    expect(webDraftSchema(web)).toMatchObject({ properties: { questions: { minItems: 1, maxItems: 1 } }, additionalProperties: false });
  });

  it('observes every species when the event is a drought', () => {
    const drought: Web = { ...web, event: { kind: 'drought' } };
    const node = (webDraftSchema(drought) as SchemaNode).properties?.questions?.items;
    expect(node?.properties?.observe?.enum).toEqual(['grass', 'rabbit', 'fox', 'hawk']);
  });

  it('never lets the model observe a consumer with nothing to eat', () => {
    const withDeer: Web = { ...web, species: [...web.species, speciesAt('deer', 'consumer', 900, 900)], event: { kind: 'drought' } };
    const node = (webDraftSchema(withDeer) as SchemaNode).properties?.questions?.items;
    expect(node?.properties?.observe?.enum).toEqual(['grass', 'rabbit', 'fox', 'hawk']);
  });
});

describe('webDraftPrompt', () => {
  const prompt = webDraftPrompt(web, directions);

  it.each(Object.entries(directions).filter(([id]) => id !== 'fox'))('states the model result "%s: %s"', (id, direction) => {
    expect(prompt).toContain(`${id}: ${direction}`);
  });

  it('says the numbers come from a simple model, not field data', () => {
    expect(prompt).toContain('This is a simple model, not field data');
  });

  it('asks for the species whose change shows the knock-on effect', () => {
    expect(prompt).toContain('whose change best shows the knock-on effect, usually two links from the removed one');
  });

  it('describes the event and who eats whom', () => {
    expect(prompt).toContain('Remove the fox.');
    expect(prompt).toContain('grass is eaten by rabbit');
  });
});

describe('toWebQuestions', () => {
  it('builds the question with the fixed choices and cites the observed species once', () => {
    expect(toWebQuestions(modelDraft)).toEqual([
      {
        id: 'q-1',
        prompt: modelQuestion.prompt,
        choices: [...WEB_CHOICES],
        observe: { kind: 'direction', species: 'grass' },
        explanation: modelQuestion.explanation,
        cites: ['rabbit', 'grass'],
      },
    ]);
  });

  it('adds the observed species to the citations when the model left it out', () => {
    expect(toWebQuestions({ questions: [{ ...modelQuestion, cites: ['rabbit'] }] })[0]?.cites).toEqual(['rabbit', 'grass']);
  });
});

describe('draftWebQuestionsWithModel', () => {
  it('sends the prompt as text only, with the web-specific schema', async () => {
    const calls: Call[] = [];
    await draftWebQuestionsWithModel(web, provider, { timeoutMs: TIMEOUT_MS, fetchImpl: fakeFetch(200, completion(JSON.stringify(modelDraft)), calls) });
    const body = JSON.parse(String(calls[0]?.init.body)) as {
      messages: { content: { type: string; text?: string }[] }[];
      response_format: { json_schema: { name: string; schema: unknown } };
    };
    expect(body.messages[0]?.content.map((part) => part.type)).toEqual(['text']);
    expect(body.messages[0]?.content[0]?.text).toBe(webDraftPrompt(web, directions));
    expect(body.response_format.json_schema).toEqual({ name: 'predict_questions', schema: webDraftSchema(web) });
  });

  it('returns one drafted question and records the call', async () => {
    const records: CallRecord[] = [];
    const questions = await draftWebQuestionsWithModel(web, provider, {
      timeoutMs: TIMEOUT_MS,
      fetchImpl: fakeFetch(200, completion(JSON.stringify(modelDraft))),
      onCall: (record) => records.push(record),
    });
    expect(questions).toEqual(toWebQuestions(modelDraft));
    expect(records).toEqual([expect.objectContaining({ provider: 'meta', status: 200, error: null })]);
  });

  it('keeps only the first question when the model sends several', async () => {
    const second = { ...modelQuestion, observe: 'rabbit' };
    const questions = await draftWebQuestionsWithModel(web, provider, {
      timeoutMs: TIMEOUT_MS,
      fetchImpl: fakeFetch(200, completion(JSON.stringify({ questions: [modelQuestion, second] }))),
    });
    expect(questions).toHaveLength(1);
    expect(questions[0]?.observe.species).toBe('grass');
  });

  it('fails when the answer has no questions list', async () => {
    await expect(
      draftWebQuestionsWithModel(web, provider, { timeoutMs: TIMEOUT_MS, fetchImpl: fakeFetch(200, completion(JSON.stringify({ nothing: true }))) }),
    ).rejects.toThrow('meta did not return a list of questions');
  });
});
