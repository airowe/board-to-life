import { describe, expect, it } from 'vitest';
import { rampBallDominoes, rampBallDominoesQuestions } from '../src/scene/fixtures';
import { handleDraftQuestions, handleUnderstand, parseStubMode } from './stub';

const image = { contentType: 'image/png', bytes: 1024 };
const noDelay = { delayMs: 0 };

describe('parseStubMode', () => {
  it.each(['ok', 'error', 'timeout', 'invalid', 'ungrounded'])('accepts %s', (mode) => {
    expect(parseStubMode(mode)).toBe(mode);
  });

  it.each([undefined, '', 'bogus'])('falls back to ok for %s', (mode) => {
    expect(parseStubMode(mode)).toBe('ok');
  });
});

describe('handleUnderstand', () => {
  it('returns the validated hand-written scene for an image', async () => {
    const response = await handleUnderstand({ ...image, mode: 'ok', ...noDelay });
    expect(response).toEqual({ status: 200, body: { stub: true, scene: rampBallDominoes } });
  });

  it.each([
    ['an empty body', { contentType: 'image/png', bytes: 0 }],
    ['a non-image body', { contentType: 'text/plain', bytes: 10 }],
  ])('rejects %s', async (_reason, upload) => {
    expect((await handleUnderstand({ ...upload, mode: 'ok', ...noDelay })).status).toBe(400);
  });

  it('reports an upstream failure in error mode', async () => {
    expect((await handleUnderstand({ ...image, mode: 'error', ...noDelay })).status).toBe(503);
  });

  it('refuses to pass on a model scene that fails validation', async () => {
    const response = await handleUnderstand({ ...image, mode: 'invalid', ...noDelay });
    expect(response.status).toBe(502);
    expect(JSON.stringify(response.body)).toMatch(/failed validation/);
  });
});

describe('handleDraftQuestions', () => {
  it('returns grounded drafts for a valid scene', async () => {
    const response = await handleDraftQuestions({ scene: rampBallDominoes, mode: 'ok', ...noDelay });
    expect(response).toEqual({ status: 200, body: { stub: true, questions: rampBallDominoesQuestions } });
  });

  it('rejects an invalid scene', async () => {
    expect((await handleDraftQuestions({ scene: { version: 1 }, mode: 'ok', ...noDelay })).status).toBe(400);
  });

  it('rejects a draft that cites a missing item', async () => {
    const response = await handleDraftQuestions({ scene: rampBallDominoes, mode: 'ungrounded', ...noDelay });
    expect(response.status).toBe(422);
    expect(JSON.stringify(response.body)).toMatch(/missing item \\"domino-9\\"/);
  });
});
