import { describe, expect, it } from 'vitest';
import { validateWeb } from '../src/ecosystem/schema';
import { drawingSize, PROVIDERS } from './sceneReader';
import { MODEL_WEB_SCHEMA, readWebWithModel, toWeb, WEB_READER_PROMPT, type ModelWeb } from './webReader';

const PHOTO = { width: 2000, height: 1000 };
const PHOTO_SIZE = drawingSize(PHOTO);
const TIMEOUT_MS = 1000;

const grass = { id: 'grass', name: 'Grass', role: 'producer' as const, x: 200, y: 500, width: 100, height: 50, count: 120, confidence: 0.9 };
const rabbit = { id: 'rabbit', name: 'Rabbit', role: 'consumer' as const, x: 500, y: 500, width: 100, height: 50, confidence: 0.9 };
const model: ModelWeb = {
  species: [grass, rabbit],
  eats: [{ id: 'e1', from: 'grass', to: 'rabbit', confidence: 0.8 }],
  labels: [{ id: 'l1', text: 'drought', x: 900, y: 100, confidence: 0.7 }],
  unknownMarks: [{ id: 'u1', x: 100, y: 100, width: 40, height: 40, note: 'a sun', confidence: 0.6 }],
  event: null,
};

describe('WEB_READER_PROMPT', () => {
  it.each([
    'Draw each arrow from the thing eaten to the thing that eats it: grass → rabbit means the rabbit eats the grass.',
    'Read every arrow the way it is drawn, even if it looks backwards; never reverse one.',
    'If an arrowhead is unclear, give that arrow a confidence below 0.7.',
    'If a species is crossed out, or the board says something like drought or remove foxes, report it as the event.',
    'Write each name exactly as it is spelled on the board.',
  ])('tells the model: %s', (sentence) => {
    expect(WEB_READER_PROMPT).toContain(sentence);
  });
});

describe('MODEL_WEB_SCHEMA', () => {
  it('requires every collection and an event', () => {
    expect(MODEL_WEB_SCHEMA.required).toEqual(['species', 'eats', 'labels', 'unknownMarks', 'event']);
    expect(MODEL_WEB_SCHEMA.additionalProperties).toBe(false);
  });
});

describe('toWeb', () => {
  const web = (input: ModelWeb) => toWeb(input, PHOTO) as ReturnType<typeof toWeb> & { species: typeof model.species; drawing: unknown };

  it('scales grid boxes to the drawing size and sets the version', () => {
    const converted = web(model);
    expect(converted).toMatchObject({ version: 1, drawing: PHOTO_SIZE });
    expect(converted.species[1]).toMatchObject({
      x: (500 * PHOTO_SIZE.width) / 1000,
      y: (500 * PHOTO_SIZE.height) / 1000,
      width: (100 * PHOTO_SIZE.width) / 1000,
      height: (50 * PHOTO_SIZE.height) / 1000,
    });
  });

  it('keeps a written count', () => {
    expect(web(model).species[0]).toMatchObject({ count: 120 });
    expect(web(model).species[1]).not.toHaveProperty('count');
  });

  it('produces a web that validates', () => {
    expect(validateWeb(toWeb(model, PHOTO))).toMatchObject({ ok: true });
  });

  it('keeps an event that names a species on the board', () => {
    expect(web({ ...model, event: { kind: 'remove', species: 'rabbit' } })).toMatchObject({ event: { kind: 'remove', species: 'rabbit' } });
    expect(web({ ...model, event: { kind: 'drought' } })).toMatchObject({ event: { kind: 'drought' } });
  });

  it('drops an event that names a missing species', () => {
    expect(web({ ...model, event: { kind: 'remove', species: 'fox' } })).toMatchObject({ event: null });
  });

  it('scales labels and unknown marks', () => {
    const converted = web(model) as unknown as { labels: { x: number; y: number }[]; unknownMarks: { width: number; height: number }[] };
    expect(converted.labels[0]).toMatchObject({ x: (900 * PHOTO_SIZE.width) / 1000, y: (100 * PHOTO_SIZE.height) / 1000 });
    expect(converted.unknownMarks[0]).toMatchObject({ width: (40 * PHOTO_SIZE.width) / 1000, height: (40 * PHOTO_SIZE.height) / 1000 });
  });
});

describe('readWebWithModel', () => {
  it('sends the prompt and the photo, and returns a converted web', async () => {
    const requests: string[] = [];
    const fetchImpl: typeof fetch = (_input, init) => {
      requests.push(String(init?.body));
      const content = JSON.stringify(model);
      return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }));
    };
    const photo = { bytes: new Uint8Array([1, 2, 3]), contentType: 'image/png', size: PHOTO };
    const result = await readWebWithModel(photo, { ...PROVIDERS.meta, apiKey: 'test-key' }, { timeoutMs: TIMEOUT_MS, fetchImpl });
    const sent = JSON.parse(requests[0] ?? '{}') as { messages: { content: { type: string; text?: string }[] }[]; response_format: { json_schema: { name: string } } };
    expect(sent.messages[0]?.content.map((part) => part.type)).toEqual(['text', 'image_url']);
    expect(sent.messages[0]?.content[0]?.text).toBe(WEB_READER_PROMPT);
    expect(sent.response_format.json_schema.name).toBe('food_web');
    expect(result).toMatchObject({ version: 1, drawing: PHOTO_SIZE });
  });
});
