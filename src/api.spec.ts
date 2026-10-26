import { describe, expect, it } from 'vitest';
import { requestJson } from './api';

const TIMEOUT_MS = 20;

const hangingFetch: typeof fetch = (_url, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });

const respondWith = (status: number, body: unknown): typeof fetch => async () =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('requestJson', () => {
  it('returns parsed JSON on success', async () => {
    const result = await requestJson('/x', {}, { timeoutMs: TIMEOUT_MS, fetchImpl: respondWith(200, { a: 1 }) });
    expect(result).toEqual({ ok: true, data: { a: 1 } });
  });

  it('turns a timeout into a retryable message', async () => {
    const result = await requestJson('/x', {}, { timeoutMs: TIMEOUT_MS, fetchImpl: hangingFetch });
    expect(result).toEqual({ ok: false, retryable: true, message: expect.stringMatching(/did not answer/) });
  });

  it('surfaces the server error and its details', async () => {
    const fetchImpl = respondWith(422, { error: 'Bad draft.', details: ['q-1 cites missing item "domino-9"'] });
    const result = await requestJson('/x', {}, { timeoutMs: TIMEOUT_MS, fetchImpl });
    expect(result).toEqual({ ok: false, retryable: true, message: 'Bad draft.', details: ['q-1 cites missing item "domino-9"'] });
  });

  it('handles a network failure', async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new TypeError('Failed to fetch');
    };
    const result = await requestJson('/x', {}, { timeoutMs: TIMEOUT_MS, fetchImpl });
    expect(result).toEqual({ ok: false, retryable: true, message: expect.stringMatching(/reach the server/) });
  });

  it('handles a non-JSON error body', async () => {
    const fetchImpl: typeof fetch = async () => new Response('<html>oops</html>', { status: 500 });
    const result = await requestJson('/x', {}, { timeoutMs: TIMEOUT_MS, fetchImpl });
    expect(result).toEqual({ ok: false, retryable: true, message: expect.stringMatching(/500/) });
  });
});
