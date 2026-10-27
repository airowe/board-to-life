import { handleUnderstand } from '../../server/stub';
import { requestJson } from '../api';
import type { SceneReader } from './replay';

const HTTP_TIMEOUT_MS = 60_000;

const field = (body: unknown, name: string): unknown =>
  typeof body === 'object' && body !== null && name in body ? (body as Record<string, unknown>)[name] : undefined;

export const stubReader: SceneReader = async (photo) => {
  const response = await handleUnderstand({ mode: 'ok', delayMs: 0, contentType: photo.contentType, bytes: photo.bytes.length });
  if (response.status !== 200) throw new Error(String(field(response.body, 'error') ?? `status ${response.status}`));
  return field(response.body, 'scene');
};

type HttpOptions = { timeoutMs: number; fetchImpl?: typeof fetch };

// Sends each drawing to a running /api/understand, so the whole endpoint is checked, not just the model call.
export const httpReader =
  (url: string, options: HttpOptions): SceneReader =>
  async (photo) => {
    const result = await requestJson(
      url,
      { method: 'POST', headers: { 'content-type': photo.contentType }, body: photo.bytes as BodyInit },
      options,
    );
    if (!result.ok) throw new Error([result.message, ...(result.details ?? [])].join(' '));
    const scene = field(result.data, 'scene');
    if (scene === undefined) throw new Error('no scene in the response');
    return scene;
  };

export type ReaderOptions = { url?: string };
export const READER_NAMES = ['stub', 'http'] as const;

export const readerFor = (name: string, options: ReaderOptions): SceneReader | null => {
  if (name === 'stub') return stubReader;
  if (name !== 'http') return null;
  if (!options.url) throw new Error('The http reader needs --url, for example --url http://127.0.0.1:5173/api/understand');
  return httpReader(options.url, { timeoutMs: HTTP_TIMEOUT_MS });
};
