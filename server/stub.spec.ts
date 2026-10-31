import { describe, expect, it } from 'vitest';
import { rampBallDominoes, rampBallDominoesQuestions } from '../src/scene/fixtures';
import { grasslandWeb, speciesAt, webOf } from '../src/ecosystem/fixtures';
import { backwardArrows } from '../src/ecosystem/trophic';
import { templateQuestion } from '../src/ecosystem/questions';
import type { Web } from '../src/ecosystem/schema';
import { WEB_SAMPLES } from '../src/ecosystem/samples';
import { GEOMETRY_SAMPLES } from '../src/geometry/samples';
import { NO_FIGURE_FOCUS, templateFigureQuestion } from '../src/geometry/questions';
import type { Figure, Focus } from '../src/geometry/schema';
import { handleDescribe, handleDescribeFigure, handleDescribeWeb, handleDraftFigureQuestions, handleDraftQuestions, handleDraftWebQuestions, handleUnderstand, handleUnderstandFigure, handleUnderstandWeb, parseStubMode } from './stub';

const image = { contentType: 'image/png', bytes: 1024 };
const noDelay = { delayMs: 0 };

describe('parseStubMode', () => {
  it.each(['ok', 'error', 'timeout', 'invalid', 'ungrounded', 'backward'])('accepts %s', (mode) => {
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

describe('handleDescribe', () => {
  const text = 'a ball rolls into dominoes';

  it('returns the hand-written scene for a description', async () => {
    expect(await handleDescribe({ text, mode: 'ok', ...noDelay })).toEqual({ status: 200, body: { stub: true, scene: rampBallDominoes } });
  });

  it('refuses empty text before the stub delay', async () => {
    const started = Date.now();
    const response = await handleDescribe({ text: '  ', mode: 'ok', delayMs: 5000 });
    expect(response.status).toBe(400);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it.each([
    ['error', 503],
    ['timeout', 504],
    ['invalid', 502],
  ] as const)('behaves as understand does in %s mode', async (mode, status) => {
    expect((await handleDescribe({ text, mode, ...noDelay })).status).toBe(status);
  });
});

describe('ecosystem stubs', () => {
  const firstSample = WEB_SAMPLES[0]?.web;

  it('reads the first sample web for a photo', async () => {
    expect(await handleUnderstandWeb({ ...image, mode: 'ok', ...noDelay })).toEqual({ status: 200, body: { stub: true, web: firstSample } });
  });

  it('reverses fox and rabbit in backward mode when reading and describing', async () => {
    const responses = [
      await handleUnderstandWeb({ ...image, mode: 'backward', ...noDelay }),
      await handleDescribeWeb({ text: 'grass, rabbits and foxes', mode: 'backward', ...noDelay }),
    ];
    for (const response of responses) {
      const web = (response.body as { web: Web }).web;
      expect(response.status).toBe(200);
      expect(web.eats.find((arrow) => arrow.from === 'fox' && arrow.to === 'rabbit')).toBeDefined();
      expect(web.eats.find((arrow) => arrow.from === 'rabbit' && arrow.to === 'fox')).toBeUndefined();
      expect(backwardArrows(web)).toEqual([web.eats.find((arrow) => arrow.from === 'fox')?.id]);
    }
  });

  it('describes the first sample web for a description', async () => {
    expect(await handleDescribeWeb({ text: 'grass, rabbits and foxes', mode: 'ok', ...noDelay })).toEqual({ status: 200, body: { stub: true, web: firstSample } });
  });

  it.each([
    ['reading', () => handleUnderstandWeb({ ...image, mode: 'invalid', ...noDelay })],
    ['describing', () => handleDescribeWeb({ text: 'grass and rabbits', mode: 'invalid', ...noDelay })],
  ])('refuses a web that fails validation when %s in invalid mode', async (_case, run) => {
    const response = await run();
    expect(response.status).toBe(502);
    expect(JSON.stringify(response.body)).toContain('missing species');
  });

  it('names the food web reader and writer when a web fails validation', async () => {
    expect((await handleUnderstandWeb({ ...image, mode: 'invalid', ...noDelay })).body).toMatchObject({ error: 'The food web reader returned a web that failed validation.' });
    expect((await handleDescribeWeb({ text: 'grass and rabbits', mode: 'invalid', ...noDelay })).body).toMatchObject({ error: 'The food web writer returned a web that failed validation.' });
  });

  it.each([
    ['error', 503, 'The food web reader is unavailable (stub error mode).', 'The food web writer is unavailable (stub error mode).'],
    ['timeout', 504, 'The food web reader took too long (stub timeout mode).', 'The food web writer took too long (stub timeout mode).'],
  ] as const)('reports %s mode, naming the food web reader or writer', async (mode, status, readerError, writerError) => {
    expect(await handleUnderstandWeb({ ...image, mode, ...noDelay })).toEqual({ status, body: { error: readerError, details: [] } });
    expect(await handleDescribeWeb({ text: 'grass and rabbits', mode, ...noDelay })).toEqual({ status, body: { error: writerError, details: [] } });
  });

  it('rejects a non-image upload and an empty description', async () => {
    expect((await handleUnderstandWeb({ contentType: 'text/plain', bytes: 10, mode: 'ok', ...noDelay })).status).toBe(400);
    expect((await handleDescribeWeb({ text: '', mode: 'ok', ...noDelay })).status).toBe(400);
  });
});

describe('handleDraftWebQuestions', () => {
  const foxRemoved = { kind: 'remove', species: 'fox' } as const;
  const web: Web = { ...grasslandWeb(), event: foxRemoved };

  it('asks about a species two links from the removed one, from a template', async () => {
    const response = await handleDraftWebQuestions({ web, mode: 'ok', ...noDelay });
    expect(response).toEqual({ status: 200, body: { stub: true, questions: [templateQuestion(web, foxRemoved, 'grass')] } });
  });

  it('judges the suggested event when the web has none', async () => {
    const response = await handleDraftWebQuestions({ web: grasslandWeb(), mode: 'ok', ...noDelay });
    expect(response.body).toEqual({ stub: true, questions: [templateQuestion(web, foxRemoved, 'grass')] });
  });

  it('falls back to the first species that changes when none is two links away', async () => {
    const drought: Web = { ...grasslandWeb(), event: { kind: 'drought' } };
    const response = await handleDraftWebQuestions({ web: drought, mode: 'ok', ...noDelay });
    expect(response.body).toEqual({ stub: true, questions: [templateQuestion(drought, { kind: 'drought' }, 'grass')] });
  });

  it('answers 400 for a web that fails validation', async () => {
    expect((await handleDraftWebQuestions({ web: { version: 1 }, mode: 'ok', ...noDelay })).status).toBe(400);
  });

  it('answers 422 when nothing changes after the event', async () => {
    const alone: Web = { ...webOf([speciesAt('grass', 'producer', 0, 0)], []), event: { kind: 'remove', species: 'grass' } };
    expect(await handleDraftWebQuestions({ web: alone, mode: 'ok', ...noDelay })).toEqual({
      status: 422,
      body: { error: 'Nothing in the web changes after the event, so there is nothing to predict.', details: [] },
    });
  });

  it('rejects an ungrounded draft in ungrounded mode', async () => {
    const response = await handleDraftWebQuestions({ web, mode: 'ungrounded', ...noDelay });
    expect(response.status).toBe(422);
    expect(JSON.stringify(response.body)).toMatch(/missing species \\"ghost\\"/);
  });

  it.each([
    ['error', 503],
    ['timeout', 504],
  ] as const)('reports %s mode', async (mode, status) => {
    expect((await handleDraftWebQuestions({ web, mode, ...noDelay })).status).toBe(status);
  });
});

describe('geometry stubs', () => {
  const firstFigure = GEOMETRY_SAMPLES[0]?.figure;
  const description = 'Triangle ABC with a 50° angle at A and a 60° angle at B.';

  it('reads and describes the first sample figure', async () => {
    expect(await handleUnderstandFigure({ ...image, mode: 'ok', ...noDelay })).toEqual({ status: 200, body: { stub: true, figure: firstFigure } });
    expect(await handleDescribeFigure({ text: description, mode: 'ok', ...noDelay })).toEqual({ status: 200, body: { stub: true, figure: firstFigure } });
  });

  it('names the figure reader and writer when a figure fails validation in invalid mode', async () => {
    const read = await handleUnderstandFigure({ ...image, mode: 'invalid', ...noDelay });
    const described = await handleDescribeFigure({ text: description, mode: 'invalid', ...noDelay });
    expect(read).toMatchObject({ status: 502, body: { error: 'The figure reader returned a figure that failed validation.' } });
    expect(described).toMatchObject({ status: 502, body: { error: 'The figure writer returned a figure that failed validation.' } });
    expect((read.body as { details: string[] }).details.length).toBeGreaterThan(0);
  });

  it.each([
    ['error', 503, 'The figure reader is unavailable (stub error mode).'],
    ['timeout', 504, 'The figure reader took too long (stub timeout mode).'],
  ] as const)('reports %s mode, naming the figure reader', async (mode, status, error) => {
    expect(await handleUnderstandFigure({ ...image, mode, ...noDelay })).toEqual({ status, body: { error, details: [] } });
  });

  it('rejects a non-image upload and an empty description', async () => {
    expect((await handleUnderstandFigure({ contentType: 'text/plain', bytes: 10, mode: 'ok', ...noDelay })).status).toBe(400);
    expect((await handleDescribeFigure({ text: '', mode: 'ok', ...noDelay })).status).toBe(400);
  });
});

describe('handleDraftFigureQuestions', () => {
  const triangle = GEOMETRY_SAMPLES[0]?.figure as Figure;
  const SUGGESTED: Focus = { kind: 'angle-sum', polygon: 'abc', drag: 'C' };
  const CHOSEN: Focus = { kind: 'angle-sum', polygon: 'abc', drag: 'B' };
  const lineOnly: Figure = { ...triangle, polygons: [], marks: [], segments: [triangle.segments[0] as Figure['segments'][number]] };

  it('serves the template question for the suggested focus', async () => {
    expect(await handleDraftFigureQuestions({ figure: triangle, mode: 'ok', ...noDelay })).toEqual({
      status: 200,
      body: { stub: true, questions: [templateFigureQuestion(triangle, SUGGESTED)] },
    });
  });

  it('serves the template question for the figure’s own focus', async () => {
    const chosen: Figure = { ...triangle, focus: CHOSEN };
    expect(await handleDraftFigureQuestions({ figure: chosen, mode: 'ok', ...noDelay })).toEqual({
      status: 200,
      body: { stub: true, questions: [templateFigureQuestion(chosen, CHOSEN)] },
    });
  });

  it('answers 422 when there is nothing to predict', async () => {
    expect(await handleDraftFigureQuestions({ figure: lineOnly, mode: 'ok', ...noDelay })).toEqual({ status: 422, body: { error: NO_FIGURE_FOCUS, details: [] } });
  });

  it('rejects a figure that fails validation', async () => {
    expect((await handleDraftFigureQuestions({ figure: { version: 1 }, mode: 'ok', ...noDelay })).status).toBe(400);
  });

  it('rejects an ungrounded draft in ungrounded mode', async () => {
    const response = await handleDraftFigureQuestions({ figure: triangle, mode: 'ungrounded', ...noDelay });
    expect(response).toMatchObject({ status: 422, body: { error: 'A drafted question cited something not in the figure.' } });
  });

  it.each([
    ['error', 503],
    ['timeout', 504],
  ] as const)('reports %s mode', async (mode, status) => {
    expect((await handleDraftFigureQuestions({ figure: triangle, mode, ...noDelay })).status).toBe(status);
  });
});
