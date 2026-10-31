import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { rampBallDominoes } from '../src/scene/fixtures';
import { WEB_SAMPLES } from '../src/ecosystem/samples';
import { GEOMETRY_SAMPLES } from '../src/geometry/samples';
import type { Figure } from '../src/geometry/schema';
import { obeyWrittenValues } from './figureReader';
import { handleUnderstandFigureWithModel, handleUnderstandWebWithModel, handleUnderstandWithModel, type ModelRead } from './understand';

const png = new Uint8Array(readFileSync(new URL('../public/samples/ramp-ball-dominoes.png', import.meta.url)));
const READER = 'meta';

const reads = (scene: unknown): ModelRead => () => Promise.resolve(scene);

describe('handleUnderstandWithModel', () => {
  it('returns the validated scene and which reader produced it', async () => {
    const response = await handleUnderstandWithModel({ contentType: 'image/png', bytes: png, reader: READER, read: reads(rampBallDominoes) });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ stub: false, reader: READER, scene: { drawing: { width: 1200, height: 800 } } });
  });

  it('passes the photo and its size to the model', async () => {
    let seen: unknown = null;
    const read: ModelRead = (photo) => {
      seen = { contentType: photo.contentType, size: photo.size, bytes: photo.bytes.length };
      return Promise.resolve(rampBallDominoes);
    };
    await handleUnderstandWithModel({ contentType: 'image/png', bytes: png, reader: READER, read });
    expect(seen).toEqual({ contentType: 'image/png', size: { width: 1200, height: 800 }, bytes: png.length });
  });

  it.each([
    ['an empty body', 'image/png', new Uint8Array()],
    ['a non-image type', 'text/plain', png],
    ['an image it cannot measure', 'image/png', new TextEncoder().encode('not really a png')],
  ])('rejects %s with 400 before calling the model', async (_name, contentType, bytes) => {
    let called = false;
    const read: ModelRead = () => {
      called = true;
      return Promise.resolve(rampBallDominoes);
    };
    const response = await handleUnderstandWithModel({ contentType, bytes, reader: READER, read });
    expect(response.status).toBe(400);
    expect(called).toBe(false);
  });

  it('answers 502 with the validation errors when the model returns an invalid scene', async () => {
    const response = await handleUnderstandWithModel({ contentType: 'image/png', bytes: png, reader: READER, read: reads({ version: 1 }) });
    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({ error: 'The scene reader returned a scene that failed validation.' });
  });

  it('answers 502 with the reason when the model call fails', async () => {
    const response = await handleUnderstandWithModel({
      contentType: 'image/png',
      bytes: png,
      reader: READER,
      read: () => Promise.reject(new Error('meta answered 401: Invalid API key')),
    });
    expect(response).toEqual({ status: 502, body: { error: 'The scene reader failed: meta answered 401: Invalid API key', details: [] } });
  });
});

describe('handleUnderstandWebWithModel', () => {
  const web = WEB_SAMPLES[0]?.web;

  it('returns the validated web and which reader produced it', async () => {
    const response = await handleUnderstandWebWithModel({ contentType: 'image/png', bytes: png, reader: READER, read: reads(web) });
    expect(response).toEqual({ status: 200, body: { stub: false, reader: READER, web } });
  });

  it('rejects a non-image before calling the model', async () => {
    let called = false;
    const read: ModelRead = () => {
      called = true;
      return Promise.resolve(web);
    };
    const response = await handleUnderstandWebWithModel({ contentType: 'text/plain', bytes: png, reader: READER, read });
    expect(response.status).toBe(400);
    expect(called).toBe(false);
  });

  it('answers 502 when the web fails validation', async () => {
    const response = await handleUnderstandWebWithModel({ contentType: 'image/png', bytes: png, reader: READER, read: reads({ ...web, species: [] }) });
    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({ error: 'The food web reader returned a web that failed validation.' });
  });

  it('answers 502 when the model call fails', async () => {
    const read: ModelRead = () => Promise.reject(new Error('meta answered 500'));
    const response = await handleUnderstandWebWithModel({ contentType: 'image/png', bytes: png, reader: READER, read });
    expect(response).toEqual({ status: 502, body: { error: 'The food web reader failed: meta answered 500', details: [] } });
  });
});

describe('handleUnderstandFigureWithModel', () => {
  const figure = GEOMETRY_SAMPLES[0]?.figure as Figure;
  const SKEWED_DEGREES = 70;
  const CONFLICTING_DEGREES = 100;
  const withAngles = (degrees: number, ids: string[]): Figure => ({
    ...figure,
    marks: figure.marks.map((mark) => (mark.kind === 'angle' && ids.includes(mark.id) ? { ...mark, degrees } : mark)),
  });

  it('returns the validated figure, fitted to its written values, and which reader produced it', async () => {
    const response = await handleUnderstandFigureWithModel({ contentType: 'image/png', bytes: png, reader: READER, read: reads(figure) });
    expect(response).toEqual({ status: 200, body: { stub: false, reader: READER, figure: obeyWrittenValues(figure) } });
  });

  it('moves the points so the written values hold', async () => {
    const skewed = withAngles(SKEWED_DEGREES, ['mA']);
    const response = await handleUnderstandFigureWithModel({ contentType: 'image/png', bytes: png, reader: READER, read: reads(skewed) });
    const body = response.body as { figure: Figure };
    expect(response.status).toBe(200);
    expect(body.figure.marks).toEqual(skewed.marks);
    expect(body.figure.points).not.toEqual(skewed.points);
  });

  it('keeps the drawn points when the written values conflict', async () => {
    const conflicting = withAngles(CONFLICTING_DEGREES, ['mA', 'mB']);
    const response = await handleUnderstandFigureWithModel({ contentType: 'image/png', bytes: png, reader: READER, read: reads(conflicting) });
    expect(response).toEqual({ status: 200, body: { stub: false, reader: READER, figure: conflicting } });
  });

  it('answers 502 when the figure fails validation', async () => {
    const response = await handleUnderstandFigureWithModel({ contentType: 'image/png', bytes: png, reader: READER, read: reads({ ...figure, points: [] }) });
    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({ error: 'The figure reader returned a figure that failed validation.' });
  });

  it('names the figure reader when the model call fails', async () => {
    const read: ModelRead = () => Promise.reject(new Error('meta answered 500'));
    const response = await handleUnderstandFigureWithModel({ contentType: 'image/png', bytes: png, reader: READER, read });
    expect(response).toEqual({ status: 502, body: { error: 'The figure reader failed: meta answered 500', details: [] } });
  });
});
