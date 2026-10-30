export const MODEL_REQUEST_TIMEOUT_MS = 130_000;
export const TYPICAL_READ_MS = 20_000;

const SECOND = 1000;

export type ReadingProgress = { headline: string; detail: string; late: boolean };

export const describeReading = (elapsedMs: number): ReadingProgress => {
  const seconds = Math.floor(Math.min(elapsedMs, MODEL_REQUEST_TIMEOUT_MS) / SECOND);
  return elapsedMs <= TYPICAL_READ_MS
    ? { headline: 'Reading the drawing…', detail: `${seconds} s · usually about ${TYPICAL_READ_MS / SECOND} s`, late: false }
    : {
        headline: 'Still reading — this one is taking longer than usual',
        detail: `${seconds} s · gives up at ${MODEL_REQUEST_TIMEOUT_MS / SECOND} s`,
        late: true,
      };
};

const CHECK_AGAINST_PHOTO = 'Check each item against the photo.';
const READERS: Record<string, string> = {
  meta: 'Muse Spark on the Meta Model API',
  baseten: 'Muse Spark Open on Baseten',
};

export const readingNote = (body: unknown): string => {
  const source = typeof body === 'object' && body !== null ? (body as { stub?: unknown; reader?: unknown }) : {};
  if (source.stub === true) return 'Stub reading: a fixed, hand-written scene for the test drawing. No AI was called.';
  const reader = typeof source.reader === 'string' ? READERS[source.reader] : undefined;
  return reader ? `Read by ${reader}. ${CHECK_AGAINST_PHOTO}` : CHECK_AGAINST_PHOTO;
};

const CHECK_AGAINST_DESCRIPTION = 'Check that it matches what you meant.';

export const describedNote = (body: unknown): string => {
  const source = typeof body === 'object' && body !== null ? (body as { stub?: unknown; reader?: unknown }) : {};
  if (source.stub === true) return 'Stub layout: a fixed scene for the sample drawing. No AI was called.';
  const reader = typeof source.reader === 'string' ? READERS[source.reader] : undefined;
  return reader
    ? `Laid out by ${reader} from your description. ${CHECK_AGAINST_DESCRIPTION}`
    : `Laid out from your description. ${CHECK_AGAINST_DESCRIPTION}`;
};
