import { describe, expect, it } from 'vitest';
import { MODEL_TIMEOUT_MS, STUB_TIMEOUT_DELAY_MS } from '../server/plugin';
import { describedNote, describeReading, MODEL_REQUEST_TIMEOUT_MS, readingNote, TYPICAL_READ_MS } from './reading';

const SECOND = 1000;

describe('reading timeouts', () => {
  it('waits longer than the server waits for the model, so the server error reaches the teacher', () => {
    expect(MODEL_REQUEST_TIMEOUT_MS).toBeGreaterThan(MODEL_TIMEOUT_MS);
  });

  it('still lets the stub timeout mode outlast the browser', () => {
    expect(STUB_TIMEOUT_DELAY_MS).toBeGreaterThan(MODEL_REQUEST_TIMEOUT_MS);
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
      detail: `${elapsedMs / SECOND} s · gives up at ${MODEL_REQUEST_TIMEOUT_MS / SECOND} s`,
      late: true,
    });
  });

  it('never counts past the timeout', () => {
    expect(describeReading(MODEL_REQUEST_TIMEOUT_MS + 3 * SECOND).detail).toMatch(new RegExp(`^${MODEL_REQUEST_TIMEOUT_MS / SECOND} s`));
  });
});

describe('readingNote', () => {
  it.each([
    [{ stub: true }, 'Stub reading: a fixed, hand-written scene for the test drawing. No AI was called.'],
    [{ stub: false, reader: 'meta' }, 'Read by Muse Spark on the Meta Model API. Check each item against the photo.'],
    [{ stub: false, reader: 'baseten' }, 'Read by Muse Spark Open on Baseten. Check each item against the photo.'],
    [null, 'Check each item against the photo.'],
  ])('says who read the drawing for %j', (body, note) => {
    expect(readingNote(body)).toBe(note);
  });
});

describe('describedNote', () => {
  it.each([
    [{ stub: true }, 'Stub layout: a fixed scene for the sample drawing. No AI was called.'],
    [{ stub: false, reader: 'meta' }, 'Laid out by Muse Spark on the Meta Model API from your description. Check that it matches what you meant.'],
    [{ stub: false, reader: 'unheard-of' }, 'Laid out from your description. Check that it matches what you meant.'],
  ])('says who laid out the scene for %j', (body, note) => {
    expect(describedNote(body)).toBe(note);
  });
});
