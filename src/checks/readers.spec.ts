import { describe, expect, it } from 'vitest';
import { rampBallDominoes } from '../scene/fixtures';
import { httpReader, readerFor } from './readers';

const URL_UNDER_TEST = 'http://127.0.0.1:5173/api/understand';
const PHOTO = { bytes: new Uint8Array([9, 8, 7]), contentType: 'image/jpeg' };
const TIMEOUT_MS = 1000;

type Call = { url: string; init: RequestInit };

const fakeFetch = (status: number, body: string, calls: Call[] = []): typeof fetch =>
  (input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    return Promise.resolve(new Response(body, { status, headers: { 'content-type': 'application/json' } }));
  };

describe('httpReader', () => {
  it('posts the photo bytes with their type and returns the scene', async () => {
    const calls: Call[] = [];
    const read = httpReader(URL_UNDER_TEST, { timeoutMs: TIMEOUT_MS, fetchImpl: fakeFetch(200, JSON.stringify({ scene: rampBallDominoes }), calls) });
    await expect(read(PHOTO)).resolves.toEqual(rampBallDominoes);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(URL_UNDER_TEST);
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.body).toBe(PHOTO.bytes);
    expect(new Headers(calls[0]?.init.headers).get('content-type')).toBe('image/jpeg');
  });

  it("fails with the server's message", async () => {
    const read = httpReader(URL_UNDER_TEST, { timeoutMs: TIMEOUT_MS, fetchImpl: fakeFetch(503, JSON.stringify({ error: 'reader asleep' })) });
    await expect(read(PHOTO)).rejects.toThrow('reader asleep');
  });

  it('fails when the server answers without a scene', async () => {
    const read = httpReader(URL_UNDER_TEST, { timeoutMs: TIMEOUT_MS, fetchImpl: fakeFetch(200, JSON.stringify({ nothing: true })) });
    await expect(read(PHOTO)).rejects.toThrow('no scene in the response');
  });
});

describe('readerFor', () => {
  it('builds the stub reader by name', () => {
    expect(readerFor('stub', {})).not.toBeNull();
  });

  it('needs a URL for the HTTP reader', () => {
    expect(() => readerFor('http', {})).toThrow('--url');
    expect(readerFor('http', { url: URL_UNDER_TEST })).not.toBeNull();
  });

  it('returns null for an unknown reader', () => {
    expect(readerFor('psychic', {})).toBeNull();
  });
});
