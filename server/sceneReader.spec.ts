import { describe, expect, it } from 'vitest';
import { validateScene } from '../src/scene/schema';
import { ARROW_TO_SPEED, costOf, FLOOR_THICKNESS, MODEL_SCENE_SCHEMA, PROVIDERS, providerFromEnv, readSceneWithModel, toScene, type CallRecord, type ModelScene } from './sceneReader';

const SIZE = { width: 1600, height: 800 };
// The scene is always 1200 units on its long edge, whatever the photo's resolution.
const DRAWING = { width: 1200, height: 600 };
const X_SCALE = DRAWING.width / 1000;
const Y_SCALE = DRAWING.height / 1000;
const PHOTO = { bytes: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg', size: SIZE };
const TIMEOUT_MS = 1000;

const modelScene: ModelScene = {
  items: [
    { id: 'floor', kind: 'floor', x: 500, y: 950, width: 1000, height: 50, confidence: 0.9 },
    { id: 'ramp', kind: 'ramp', x: 50, y: 400, x2: 400, y2: 900, confidence: 0.8 },
    { id: 'ball', kind: 'ball', x: 80, y: 380, radius: 25, push: { dx: 50, dy: 0 }, confidence: 0.9 },
    { id: 'domino-1', kind: 'domino', x: 600, y: 860, width: 15, height: 130, angleDegrees: 90, confidence: 0.7 },
    { id: 'pulley', kind: 'pulley', x: 300, y: 100, radius: 10, confidence: 0.6 },
    { id: 'rope', kind: 'rope', from: 'pulley', to: 'ball', confidence: 0.6 },
  ],
  joints: [],
  labels: [{ id: 'label-1', text: 'push', x: 100, y: 300, attachesTo: 'ball', confidence: 0.8 }],
  unknownMarks: [{ id: 'mark-1', x: 900, y: 100, width: 100, height: 100, note: 'a sun', confidence: 0.3 }],
  predictPoints: [{ id: 'pp-1', a: 'ball', b: 'domino-1' }],
};

const itemOf = (scene: unknown, id: string): Record<string, unknown> => {
  const items = (scene as { items: Record<string, unknown>[] }).items;
  const found = items.find((item) => item.id === id);
  if (!found) throw new Error(`no item ${id}`);
  return found;
};

describe('toScene', () => {
  const scene = toScene(modelScene, SIZE);

  it('produces a valid scene 1200 units on its long edge, in the shape of the photo', () => {
    const result = validateScene(scene);
    expect(result.ok ? [] : result.errors).toEqual([]);
    expect((scene as { drawing: unknown }).drawing).toEqual(DRAWING);
  });

  it('gives the same scene for the same photo at another resolution, so the physics does not depend on the camera', () => {
    expect(toScene(modelScene, { width: SIZE.width / 2, height: SIZE.height / 2 })).toEqual(scene);
  });

  it('rounds the drawing size to whole units', () => {
    expect((toScene(modelScene, { width: 1600, height: 1067 }) as { drawing: unknown }).drawing).toEqual({ width: 1200, height: 800 });
  });

  it('scales x and y from the 0-1000 grid separately', () => {
    expect(itemOf(scene, 'domino-1')).toMatchObject({ x: 600 * X_SCALE, y: 860 * Y_SCALE, width: 15 * X_SCALE, height: 130 * Y_SCALE });
    expect(itemOf(scene, 'ramp')).toMatchObject({ x1: 50 * X_SCALE, y1: 400 * Y_SCALE, x2: 400 * X_SCALE, y2: 900 * Y_SCALE });
  });

  describe('marker line width', () => {
    const LINE = 4;
    const lined = toScene({ ...modelScene, lineWidth: LINE }, SIZE);

    it('takes the line width off outlined shapes, which the model measures to the outer edge', () => {
      expect(itemOf(lined, 'domino-1')).toMatchObject({ width: (15 - LINE) * X_SCALE, height: (130 - LINE) * Y_SCALE });
      expect(itemOf(lined, 'ball').radius).toBeCloseTo(((25 - LINE / 2) * (X_SCALE + Y_SCALE)) / 2, 9);
    });

    it('leaves lines and positions alone', () => {
      expect(itemOf(lined, 'floor')).toMatchObject({ x: 500 * X_SCALE, y: 950 * Y_SCALE, height: 50 * Y_SCALE });
      expect(itemOf(lined, 'ramp')).toEqual(itemOf(scene, 'ramp'));
    });

    it('never shrinks a shape below half its measured size', () => {
      const thick = toScene({ ...modelScene, lineWidth: 100 }, SIZE);
      expect(itemOf(thick, 'domino-1').width).toBeCloseTo((15 / 2) * X_SCALE, 9);
    });
  });

  it('treats a floor given without a height as its drawn line: the top of the ground', () => {
    const line = toScene({ ...modelScene, items: [{ id: 'floor', kind: 'floor', x: 500, y: 950, width: 1000, confidence: 0.9 }] }, SIZE);
    expect(itemOf(line, 'floor')).toMatchObject({ y: 950 * Y_SCALE + FLOOR_THICKNESS / 2, height: FLOOR_THICKNESS });
  });

  it.each([990, 1000])('keeps a floor line drawn near the bottom edge (y %d) inside the drawing', (lineY) => {
    const floorOnly = { ...modelScene, labels: [], predictPoints: [], items: [{ id: 'floor', kind: 'floor', x: 500, y: lineY, width: 1000, confidence: 0.9 }] };
    const result = validateScene(toScene(floorOnly, SIZE));
    expect(result.ok ? [] : result.errors).toEqual([]);
  });

  it('turns degrees into radians', () => {
    expect(itemOf(scene, 'domino-1').angle).toBeCloseTo(Math.PI / 2, 9);
  });

  it('turns a drawn push arrow into a starting velocity', () => {
    expect(itemOf(scene, 'ball').velocity).toEqual({ x: 50 * X_SCALE * ARROW_TO_SPEED, y: 0 });
  });

  it('measures a rope as the distance between what it ties together', () => {
    const [px, py, bx, by] = [300 * X_SCALE, 100 * Y_SCALE, 80 * X_SCALE, 380 * Y_SCALE];
    expect(itemOf(scene, 'rope').length).toBeCloseTo(Math.hypot(px - bx, py - by), 9);
  });

  it('keeps unknown marks and labels, and makes predict points contact triggers', () => {
    const typed = scene as { unknownMarks: unknown[]; labels: unknown[]; predictPoints: unknown[] };
    expect(typed.unknownMarks).toEqual([{ id: 'mark-1', x: 900 * X_SCALE, y: 100 * Y_SCALE, width: 100 * X_SCALE, height: 100 * Y_SCALE, note: 'a sun', confidence: 0.3 }]);
    expect(typed.labels).toEqual([{ id: 'label-1', text: 'push', x: 100 * X_SCALE, y: 300 * Y_SCALE, attachesTo: 'ball', confidence: 0.8 }]);
    expect(typed.predictPoints).toEqual([{ id: 'pp-1', trigger: { kind: 'contact', a: 'ball', b: 'domino-1' } }]);
  });

  it('clamps a point the model puts just past the edge', () => {
    const edge = toScene({ ...modelScene, items: [{ id: 'pivot', kind: 'pivot', x: 1003, y: -2, confidence: 0.5 }] }, SIZE);
    expect(itemOf(edge, 'pivot')).toMatchObject({ x: DRAWING.width, y: 0 });
  });

  it.each(['', 'null', 'none'])('treats an optional reference of %j as not given', (empty) => {
    const scene = toScene(
      { ...modelScene, labels: [{ id: 'label-1', text: 'push', x: 100, y: 300, attachesTo: empty, confidence: 0.8 }] },
      SIZE,
    ) as { labels: Record<string, unknown>[] };
    expect(scene.labels[0]).not.toHaveProperty('attachesTo');
    expect(validateScene(scene).ok).toBe(true);
  });

  it('leaves a missing field missing, so validation reports it rather than a guess filling it in', () => {
    const noRadius = toScene({ ...modelScene, items: [{ id: 'ball', kind: 'ball', x: 10, y: 10, confidence: 0.5 }] }, SIZE);
    const result = validateScene(noRadius);
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.errors.join(' ')).toContain('radius');
  });
});

type Call = { url: string; init: RequestInit };

const completion = (content: string): string => JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] });

const fakeFetch = (status: number, body: string, calls: Call[] = []): typeof fetch =>
  (input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    return Promise.resolve(new Response(body, { status, headers: { 'content-type': 'application/json' } }));
  };

const provider = { ...PROVIDERS.meta, apiKey: 'test-key' };

describe('readSceneWithModel', () => {
  it('sends the photo inline with the prompt and a JSON schema to the chat completions endpoint', async () => {
    const calls: Call[] = [];
    await readSceneWithModel(PHOTO, provider, { timeoutMs: TIMEOUT_MS, fetchImpl: fakeFetch(200, completion(JSON.stringify(modelScene)), calls) });
    const call = calls[0];
    expect(call?.url).toBe('https://api.meta.ai/v1/chat/completions');
    expect(new Headers(call?.init.headers).get('authorization')).toBe('Bearer test-key');
    const body = JSON.parse(String(call?.init.body)) as {
      model: string;
      messages: { role: string; content: { type: string; text?: string; image_url?: { url: string } }[] }[];
      response_format: { type: string; json_schema: { schema: { type: string } } };
    };
    expect(body.model).toBe('muse-spark-1.3');
    const content = body.messages[0]?.content ?? [];
    expect(body.messages[0]?.role).toBe('user');
    expect(content.find((part) => part.type === 'image_url')?.image_url?.url).toBe('data:image/jpeg;base64,AQID');
    expect(content.find((part) => part.type === 'text')?.text).toContain('0-1000');
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.schema.type).toBe('object');
  });

  it.each([['low'], [undefined]] as const)('asks for reasoning effort %s only when one is chosen', async (effort) => {
    const calls: Call[] = [];
    const options = { timeoutMs: TIMEOUT_MS, fetchImpl: fakeFetch(200, completion(JSON.stringify(modelScene)), calls), ...(effort ? { effort } : {}) };
    await readSceneWithModel(PHOTO, provider, options);
    const body = JSON.parse(String(calls[0]?.init.body)) as Record<string, unknown>;
    expect(body.reasoning_effort).toBe(effort);
  });

  it('returns the scene converted to photo pixels', async () => {
    const scene = await readSceneWithModel(PHOTO, provider, { timeoutMs: TIMEOUT_MS, fetchImpl: fakeFetch(200, completion(JSON.stringify(modelScene))) });
    expect(scene).toEqual(toScene(modelScene, SIZE));
  });

  it('records the raw reply, token usage and time taken', async () => {
    const usage = { prompt_tokens: 3000, completion_tokens: 2000 };
    const body = JSON.stringify({ choices: [{ message: { content: JSON.stringify(modelScene) } }], usage });
    const records: CallRecord[] = [];
    await readSceneWithModel(PHOTO, provider, { timeoutMs: TIMEOUT_MS, fetchImpl: fakeFetch(200, body), onCall: (record) => records.push(record) });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ provider: 'meta', status: 200, content: JSON.stringify(modelScene), usage });
    expect(records[0]?.ms).toBeGreaterThanOrEqual(0);
  });

  it('records a failed call too', async () => {
    const records: CallRecord[] = [];
    const body = JSON.stringify({ error: { message: 'Invalid API key' } });
    await readSceneWithModel(PHOTO, provider, { timeoutMs: TIMEOUT_MS, fetchImpl: fakeFetch(401, body), onCall: (record) => records.push(record) }).catch(() => null);
    expect(records[0]).toMatchObject({ status: 401, content: null, usage: null });
  });

  it("fails with the provider's error message", async () => {
    const body = JSON.stringify({ error: { message: 'Invalid API key', type: 'authentication_error' } });
    await expect(readSceneWithModel(PHOTO, provider, { timeoutMs: TIMEOUT_MS, fetchImpl: fakeFetch(401, body) })).rejects.toThrow(
      'meta answered 401: Invalid API key',
    );
  });

  it('fails clearly when the model does not return JSON', async () => {
    await expect(readSceneWithModel(PHOTO, provider, { timeoutMs: TIMEOUT_MS, fetchImpl: fakeFetch(200, completion('sorry, no')) })).rejects.toThrow(
      'meta did not return JSON',
    );
  });

  it('gives up after the timeout', async () => {
    const never: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    await expect(readSceneWithModel(PHOTO, provider, { timeoutMs: 10, fetchImpl: never })).rejects.toThrow('meta did not answer within 0 seconds');
  });
});

describe('MODEL_SCENE_SCHEMA', () => {
  const objects = (node: unknown): Record<string, unknown>[] => {
    if (typeof node !== 'object' || node === null) return [];
    const record = node as Record<string, unknown>;
    const own = record.type === 'object' ? [record] : [];
    return [...own, ...Object.values(record).flatMap(objects)];
  };

  it('limits every text field, so a model cannot ramble inside one', () => {
    const strings = (node: unknown): Record<string, unknown>[] => {
      if (typeof node !== 'object' || node === null) return [];
      const record = node as Record<string, unknown>;
      const own = record.type === 'string' && !('enum' in record) ? [record] : [];
      return [...own, ...Object.values(record).flatMap(strings)];
    };
    const all = strings(MODEL_SCENE_SCHEMA);
    expect(all.length).toBeGreaterThan(1);
    expect(all.every((field) => typeof field.maxLength === 'number' && field.maxLength <= 200)).toBe(true);
  });

  it('forbids field names it does not list, so a garbled key cannot be emitted', () => {
    const all = objects(MODEL_SCENE_SCHEMA);
    expect(all.length).toBeGreaterThan(1);
    expect(all.every((object) => object.additionalProperties === false)).toBe(true);
  });
});

describe('costOf', () => {
  const MILLION = 1_000_000;

  it.each(['meta', 'baseten'] as const)('prices %s tokens at $1.25 in, $0.15 cached in and $4.25 out per million', (name) => {
    const usage = { prompt_tokens: 2 * MILLION, completion_tokens: MILLION, prompt_tokens_details: { cached_tokens: MILLION } };
    expect(costOf(name, usage)).toBeCloseTo(1.25 + 0.15 + 4.25, 9);
  });

  it('counts nothing when the provider reported no usage', () => {
    expect(costOf('meta', null)).toBe(0);
  });
});

describe('providerFromEnv', () => {
  it.each([
    ['meta', 'MODEL_API_KEY'],
    ['baseten', 'BASETEN_API_KEY'],
  ] as const)('needs %s key %s', (name, variable) => {
    expect(() => providerFromEnv(name, {})).toThrow(`Set ${variable} in .env or .env.local`);
    expect(providerFromEnv(name, { [variable]: 'k' })).toEqual({ ...PROVIDERS[name], apiKey: 'k' });
  });
});
