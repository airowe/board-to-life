import { describe, expect, it } from 'vitest';
import { validateWeb } from '../src/ecosystem/schema';
import { LayoutError } from './sceneWriter';
import { PROVIDERS } from './sceneReader';
import type { ModelWeb } from './webReader';
import { describeWebWithModel, webWriterPrompt } from './webWriter';

const TIMEOUT_MS = 1000;
const DESCRIPTION = 'Grass is eaten by rabbits, and rabbits are eaten by foxes.';
const WRITER_DRAWING = { width: 1200, height: 800 };

const layout: ModelWeb = {
  species: [
    { id: 'grass', name: 'Grass', role: 'producer', x: 200, y: 500, width: 160, height: 80, confidence: 1 },
    { id: 'rabbit', name: 'Rabbit', role: 'consumer', x: 500, y: 500, width: 160, height: 80, confidence: 1 },
    { id: 'fox', name: 'Fox', role: 'consumer', x: 800, y: 500, width: 160, height: 80, confidence: 1 },
  ],
  eats: [
    { id: 'e1', from: 'grass', to: 'rabbit', confidence: 1 },
    { id: 'e2', from: 'rabbit', to: 'fox', confidence: 1 },
  ],
  labels: [],
  unknownMarks: [],
  event: null,
};
const invalidLayout: ModelWeb = { ...layout, eats: [...layout.eats, { id: 'e3', from: 'grass', to: 'ghost', confidence: 1 }] };

type Call = { body: string };

const fakeFetch =
  (replies: ModelWeb[], calls: Call[] = []): typeof fetch =>
  (_input, init) => {
    calls.push({ body: String(init?.body) });
    const reply = replies[Math.min(calls.length, replies.length) - 1];
    const content = JSON.stringify(reply);
    return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }));
  };

const describeWith = (replies: ModelWeb[], calls: Call[] = []) =>
  describeWebWithModel(DESCRIPTION, { ...PROVIDERS.meta, apiKey: 'test-key' }, { timeoutMs: TIMEOUT_MS, fetchImpl: fakeFetch(replies, calls) });

describe('webWriterPrompt', () => {
  it('includes the description', () => {
    expect(webWriterPrompt(DESCRIPTION, [])).toContain(DESCRIPTION);
  });

  it('asks the model to use what it knows about who eats whom', () => {
    expect(webWriterPrompt(DESCRIPTION, [])).toContain('use what you know about who eats whom');
  });

  it('asks for no fix when there are no errors', () => {
    expect(webWriterPrompt(DESCRIPTION, [])).not.toContain('Your last layout was rejected');
  });

  it('lists each rejection reason on its own line', () => {
    expect(webWriterPrompt(DESCRIPTION, ['first problem', 'second problem'])).toContain(
      'Your last layout was rejected for these reasons; fix them:\nfirst problem\nsecond problem',
    );
  });
});

describe('describeWebWithModel', () => {
  it('returns a valid web on the writer drawing', async () => {
    const web = await describeWith([layout]);
    expect(validateWeb(web)).toMatchObject({ ok: true });
    expect(web).toMatchObject({ version: 1, drawing: WRITER_DRAWING });
  });

  it('sends the description as text with no image', async () => {
    const calls: Call[] = [];
    await describeWith([layout], calls);
    const sent = JSON.parse(calls[0]?.body ?? '{}') as { messages: { content: { type: string; text?: string }[] }[] };
    expect(sent.messages[0]?.content).toHaveLength(1);
    expect(sent.messages[0]?.content[0]?.text).toContain(DESCRIPTION);
  });

  it('retries once with the validation errors and returns the fixed web', async () => {
    const calls: Call[] = [];
    const web = await describeWith([invalidLayout, layout], calls);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.body).toContain('Your last layout was rejected');
    expect(calls[1]?.body).toContain('ghost');
    expect(validateWeb(web)).toMatchObject({ ok: true });
  });

  it('gives up after two attempts with a LayoutError carrying the details', async () => {
    const calls: Call[] = [];
    const error = await describeWith([invalidLayout], calls).catch((caught: unknown) => caught);
    expect(calls).toHaveLength(2);
    expect(error).toBeInstanceOf(LayoutError);
    expect(error).toMatchObject({ kind: 'invalid', details: [expect.stringContaining('ghost')] });
  });
});
