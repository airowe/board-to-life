import { objectPrompt } from '../src/library/style';

const IMAGES_URL = 'https://api.meta.ai/v1/images/generations';
const IMAGE_MODEL = 'muse-image-1.0';
const IMAGE_SIZE = '1024x1024';
const ATTEMPTS = 2;
const ERROR_PREVIEW_CHARS = 200;
export const MAX_SUBJECT_LENGTH = 40;

const SUBJECT_PATTERN = /^[\p{L}][\p{L}\p{M} '-]*$/u;

// The subject goes into a model prompt, so only a plain name passes: letters, spaces, hyphens and apostrophes.
export const parsePictureSubject = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const subject = value.trim();
  return subject.length >= 1 && subject.length <= MAX_SUBJECT_LENGTH && SUBJECT_PATTERN.test(subject) ? subject : null;
};

type ImageItem = { b64_json?: string; url?: string };

const drawOnce = async (subject: string, apiKey: string, fetcher: typeof fetch): Promise<Buffer> => {
  const response = await fetcher(IMAGES_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      prompt: objectPrompt(subject),
      n: 1,
      size: IMAGE_SIZE,
      output_format: 'png',
      reasoning_strength: 'low',
    }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Muse Image answered ${response.status}: ${text.slice(0, ERROR_PREVIEW_CHARS)}`);
  const item = (JSON.parse(text) as { data?: ImageItem[] }).data?.[0];
  if (item?.b64_json) return Buffer.from(item.b64_json, 'base64');
  if (item?.url) return Buffer.from(await (await fetcher(item.url)).arrayBuffer());
  throw new Error('Muse Image returned no picture.');
};

export const drawPictureWithModel = async (subject: string, apiKey: string, fetcher: typeof fetch = fetch): Promise<Buffer> => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await drawOnce(subject, apiKey, fetcher);
    } catch (error) {
      if (attempt >= ATTEMPTS) throw error;
    }
  }
};
