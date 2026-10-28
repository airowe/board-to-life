import { describe, expect, it } from 'vitest';
import { MODEL_TIMEOUT_MS, STUB_TIMEOUT_DELAY_MS } from '../server/plugin';
import { describeReading, TYPICAL_READ_MS, UNDERSTAND_TIMEOUT_MS } from './reading';

const SECOND = 1000;

describe('reading timeouts', () => {
  it('waits longer than the server waits for the model, so the server error reaches the teacher', () => {
    expect(UNDERSTAND_TIMEOUT_MS).toBeGreaterThan(MODEL_TIMEOUT_MS);
  });

  it('still lets the stub timeout mode outlast the browser', () => {
    expect(STUB_TIMEOUT_DELAY_MS).toBeGreaterThan(UNDERSTAND_TIMEOUT_MS);
  });
});

describe('describeReading', () => {
  it('counts whole seconds and gives the usual time while within it', () => {
    expect(describeReading(12.7 * SECOND)).toEqual({
      headline: 'Reading the drawing…',
      detail: `12 s · usually about ${TYPICAL_READ_MS / SECOND} s`,
      late: false,
    });
  });

  it.each([0, TYPICAL_READ_MS])('starts within the usual time at %i ms', (elapsedMs) => {
    expect(describeReading(elapsedMs).late).toBe(false);
  });

  it('says when a read is taking longer than usual, and when it will give up', () => {
    const elapsedMs = TYPICAL_READ_MS + 5 * SECOND;
    expect(describeReading(elapsedMs)).toEqual({
      headline: 'Still reading — this one is taking longer than usual',
      detail: `${elapsedMs / SECOND} s · gives up at ${UNDERSTAND_TIMEOUT_MS / SECOND} s`,
      late: true,
    });
  });

  it('never counts past the timeout', () => {
    expect(describeReading(UNDERSTAND_TIMEOUT_MS + 3 * SECOND).detail).toMatch(new RegExp(`^${UNDERSTAND_TIMEOUT_MS / SECOND} s`));
  });
});
