import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { rampBallDominoes } from '../src/scene/fixtures';
import { handleUnderstandWithModel, type ModelRead } from './understand';

const png = new Uint8Array(readFileSync(new URL('../public/samples/ramp-ball-dominoes.png', import.meta.url)));
const READER = 'meta';

const reads = (scene: unknown): ModelRead => () => Promise.resolve(scene);

describe('handleUnderstandWithModel', () => {
  it('returns the validated scene and which reader produced it', async () => {
    const response = await handleUnderstandWithModel({ contentType: 'image/png', bytes: png, reader: READER, read: reads(rampBallDominoes) });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ stub: false, reader: READER, scene: { drawing: { width: 1200, height: 800 } } });
  });

  it('passes the photo and its size to the model', async () => {
    let seen: unknown = null;
    const read: ModelRead = (photo) => {
      seen = { contentType: photo.contentType, size: photo.size, bytes: photo.bytes.length };
      return Promise.resolve(rampBallDominoes);
    };
    await handleUnderstandWithModel({ contentType: 'image/png', bytes: png, reader: READER, read });
    expect(seen).toEqual({ contentType: 'image/png', size: { width: 1200, height: 800 }, bytes: png.length });
  });

  it.each([
    ['an empty body', 'image/png', new Uint8Array()],
    ['a non-image type', 'text/plain', png],
    ['an image it cannot measure', 'image/png', new TextEncoder().encode('not really a png')],
  ])('rejects %s with 400 before calling the model', async (_name, contentType, bytes) => {
    let called = false;
    const read: ModelRead = () => {
      called = true;
      return Promise.resolve(rampBallDominoes);
    };
    const response = await handleUnderstandWithModel({ contentType, bytes, reader: READER, read });
    expect(response.status).toBe(400);
    expect(called).toBe(false);
  });

  it('answers 502 with the validation errors when the model returns an invalid scene', async () => {
    const response = await handleUnderstandWithModel({ contentType: 'image/png', bytes: png, reader: READER, read: reads({ version: 1 }) });
    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({ error: 'The scene reader returned a scene that failed validation.' });
  });

  it('answers 502 with the reason when the model call fails', async () => {
    const response = await handleUnderstandWithModel({
      contentType: 'image/png',
      bytes: png,
      reader: READER,
      read: () => Promise.reject(new Error('meta answered 401: Invalid API key')),
    });
    expect(response).toEqual({ status: 502, body: { error: 'The scene reader failed: meta answered 401: Invalid API key', details: [] } });
  });
});
