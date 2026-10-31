import { objectPrompt } from '../src/library/style';

const IMAGES_URL = 'https://api.meta.ai/v1/images/generations';
const IMAGE_MODEL = 'muse-image-1.0';
const IMAGE_SIZE = '1024x1024';
const IMAGE_COUNT = 1;
const IMAGE_FORMAT = 'png';
const REASONING_STRENGTH = 'low';
const ATTEMPTS = 2;
const ERROR_PREVIEW_CHARS = 200;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR = 500;
// Each attempt gets this long, so two attempts fit inside the function's 150 s limit.
export const PICTURE_ATTEMPT_TIMEOUT_MS = 60_000;
export const MAX_PICTURE_BYTES = 8 * 1024 * 1024;
export const MAX_SUBJECT_LENGTH = 40;

const SUBJECT_PATTERN = /^[\p{L}][\p{L}\p{M} '-]*$/u;

// The subject goes into a model prompt, so only a plain name passes: letters, spaces, hyphens and apostrophes.
export const parsePictureSubject = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const subject = value.trim();
  return subject.length >= 1 && subject.length <= MAX_SUBJECT_LENGTH && SUBJECT_PATTERN.test(subject) ? subject : null;
};

export type DrawOptions = { fetcher?: typeof fetch; timeoutMs?: number };
type ImageItem = { b64_json?: string; url?: string };

class PermanentError extends Error {}

const isHttps = (value: string): boolean => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

const downloadPicture = async (url: string, fetcher: typeof fetch, timeoutMs: number): Promise<Buffer> => {
  if (!isHttps(url)) throw new PermanentError('Muse Image gave a picture address that is not https.');
  const response = await fetcher(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`The picture download answered ${response.status}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_PICTURE_BYTES) throw new PermanentError('The drawn picture is too large.');
  return bytes;
};

const drawOnce = async (subject: string, apiKey: string, fetcher: typeof fetch, timeoutMs: number): Promise<Buffer> => {
  const response = await fetcher(IMAGES_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model: IMAGE_MODEL,
      prompt: objectPrompt(subject),
      n: IMAGE_COUNT,
      size: IMAGE_SIZE,
      output_format: IMAGE_FORMAT,
      reasoning_strength: REASONING_STRENGTH,
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    const message = `Muse Image answered ${response.status}: ${text.slice(0, ERROR_PREVIEW_CHARS)}`;
    const retryable = response.status >= HTTP_SERVER_ERROR || response.status === HTTP_TOO_MANY_REQUESTS;
    throw retryable ? new Error(message) : new PermanentError(message);
  }
  const item = (JSON.parse(text) as { data?: ImageItem[] }).data?.[0];
  if (item?.b64_json) return Buffer.from(item.b64_json, 'base64');
  if (item?.url) return downloadPicture(item.url, fetcher, timeoutMs);
  throw new Error('Muse Image returned no picture.');
};

export const drawPictureWithModel = async (subject: string, apiKey: string, options: DrawOptions = {}): Promise<Buffer> => {
  const { fetcher = fetch, timeoutMs = PICTURE_ATTEMPT_TIMEOUT_MS } = options;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await drawOnce(subject, apiKey, fetcher, timeoutMs);
    } catch (error) {
      if (error instanceof PermanentError || attempt >= ATTEMPTS) throw error;
    }
  }
};
