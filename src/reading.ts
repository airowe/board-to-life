import type { Subject } from './subjects';

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

const CHECK_AGAINST_PHOTO: Record<Subject, string> = {
  physics: 'Check each item against the photo.',
  ecosystem: 'Check each species and arrow in the food web against the photo.',
  geometry: 'Check each point, line and mark in the figure against the photo.',
};
const STUB_READING: Record<Subject, string> = {
  physics: 'Stub reading: a fixed, hand-written scene for the test drawing. No AI was called.',
  ecosystem: 'Stub reading: a fixed, hand-written food web for the test drawing. No AI was called.',
  geometry: 'Stub reading: a fixed, hand-written figure for the test drawing. No AI was called.',
};
const READERS: Record<string, string> = {
  meta: 'Muse Spark on the Meta Model API',
  baseten: 'Muse Spark Open on Baseten',
};

export const readingNote = (body: unknown, subject: Subject = 'physics'): string => {
  const source = typeof body === 'object' && body !== null ? (body as { stub?: unknown; reader?: unknown }) : {};
  if (source.stub === true) return STUB_READING[subject];
  const reader = typeof source.reader === 'string' ? READERS[source.reader] : undefined;
  return reader ? `Read by ${reader}. ${CHECK_AGAINST_PHOTO[subject]}` : CHECK_AGAINST_PHOTO[subject];
};

const CHECK_AGAINST_DESCRIPTION = 'Check that it matches what you meant.';

const STUB_LAYOUT: Record<Subject, string> = {
  physics: 'Stub layout: a fixed scene for the sample drawing. No AI was called.',
  ecosystem: 'Stub layout: a fixed food web for the sample drawing. No AI was called.',
  geometry: 'Stub layout: a fixed figure for the sample drawing. No AI was called.',
};
const LAID_OUT_AS: Record<Subject, string> = { physics: '', ecosystem: ' as a food web', geometry: ' as a figure' };

export const describedNote = (body: unknown, subject: Subject = 'physics'): string => {
  const source = typeof body === 'object' && body !== null ? (body as { stub?: unknown; reader?: unknown }) : {};
  if (source.stub === true) return STUB_LAYOUT[subject];
  const reader = typeof source.reader === 'string' ? READERS[source.reader] : undefined;
  return reader
    ? `Laid out by ${reader} from your description${LAID_OUT_AS[subject]}. ${CHECK_AGAINST_DESCRIPTION}`
    : `Laid out from your description${LAID_OUT_AS[subject]}. ${CHECK_AGAINST_DESCRIPTION}`;
};
