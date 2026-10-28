export const UNDERSTAND_TIMEOUT_MS = 75_000;
export const TYPICAL_READ_MS = 20_000;

const SECOND = 1000;

export type ReadingProgress = { headline: string; detail: string; late: boolean };

export const describeReading = (elapsedMs: number): ReadingProgress => {
  const seconds = Math.floor(Math.min(elapsedMs, UNDERSTAND_TIMEOUT_MS) / SECOND);
  return elapsedMs <= TYPICAL_READ_MS
    ? { headline: 'Reading the drawing…', detail: `${seconds} s · usually about ${TYPICAL_READ_MS / SECOND} s`, late: false }
    : {
        headline: 'Still reading — this one is taking longer than usual',
        detail: `${seconds} s · gives up at ${UNDERSTAND_TIMEOUT_MS / SECOND} s`,
        late: true,
      };
};
