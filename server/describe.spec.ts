import { describe, expect, it } from 'vitest';
import { rampBallDominoes } from '../src/scene/fixtures';
import { WEB_SAMPLES } from '../src/ecosystem/samples';
import { GEOMETRY_SAMPLES } from '../src/geometry/samples';
import { handleDescribeFigureWithModel, handleDescribeWebWithModel, handleDescribeWithModel } from './describe';
import { LayoutError } from './sceneWriter';

const describing = (describe: (text: string) => Promise<unknown>, text: unknown = 'a ball rolls into dominoes') =>
  handleDescribeWithModel({ text, reader: 'meta', describe });

describe('handleDescribeWithModel', () => {
  it('returns the scene the model laid out, from the trimmed text', async () => {
    const received: string[] = [];
    const response = await describing((text) => {
      received.push(text);
      return Promise.resolve(rampBallDominoes);
    }, '  a ball rolls into dominoes  ');
    expect(response).toEqual({ status: 200, body: { stub: false, reader: 'meta', scene: rampBallDominoes } });
    expect(received).toEqual(['a ball rolls into dominoes']);
  });

  it.each([
    ['empty text', '', 'Type a description of the setup first.'],
    ['a non-string', 7, 'Type a description of the setup first.'],
    ['over-long text', 'x'.repeat(601), 'Keep the description under 600 characters.'],
  ])('rejects %s without calling the model', async (_case, text, error) => {
    let called = false;
    const response = await describing(() => {
      called = true;
      return Promise.resolve(rampBallDominoes);
    }, text);
    expect(response).toEqual({ status: 400, body: { error, details: [] } });
    expect(called).toBe(false);
  });

  it('answers 422 when nothing in the layout can move', async () => {
    const response = await describing(() => Promise.reject(new LayoutError('nothing-moves', 'Nothing moves.')));
    expect(response.status).toBe(422);
    expect(response.body).toEqual({ error: 'Nothing moves.', details: [] });
  });

  it('answers 502 with the details when the layout stays invalid', async () => {
    const response = await describing(() => Promise.reject(new LayoutError('invalid', 'The layout failed validation.', ['items[0].x is off the board'])));
    expect(response).toEqual({
      status: 502,
      body: { error: 'The layout failed validation.', details: ['items[0].x is off the board'] },
    });
  });

  it('answers 502 for any other failure', async () => {
    const response = await describing(() => Promise.reject(new Error('meta answered 500: overloaded')));
    expect(response).toEqual({ status: 502, body: { error: 'The scene writer failed: meta answered 500: overloaded', details: [] } });
  });
});

describe('handleDescribeWebWithModel', () => {
  const web = WEB_SAMPLES[0]?.web;
  const describingWeb = (run: (text: string) => Promise<unknown>, text: unknown = 'grass, rabbits and foxes') =>
    handleDescribeWebWithModel({ text, reader: 'meta', describe: run });

  it('returns the web the model laid out, from the trimmed text', async () => {
    const received: string[] = [];
    const response = await describingWeb((text) => {
      received.push(text);
      return Promise.resolve(web);
    }, '  grass, rabbits and foxes  ');
    expect(response).toEqual({ status: 200, body: { stub: false, reader: 'meta', web } });
    expect(received).toEqual(['grass, rabbits and foxes']);
  });

  it('rejects empty text without calling the model', async () => {
    let called = false;
    const response = await describingWeb(() => {
      called = true;
      return Promise.resolve(web);
    }, '');
    expect(response).toEqual({ status: 400, body: { error: 'Type a description of the setup first.', details: [] } });
    expect(called).toBe(false);
  });

  it('answers 502 with the details when the layout stays invalid', async () => {
    const response = await describingWeb(() => Promise.reject(new LayoutError('invalid', 'The layout failed validation.', ['arrow e1 references missing species "x"'])));
    expect(response).toEqual({ status: 502, body: { error: 'The layout failed validation.', details: ['arrow e1 references missing species "x"'] } });
  });

  it('names the food web writer for any other failure', async () => {
    const response = await describingWeb(() => Promise.reject(new Error('meta answered 500: overloaded')));
    expect(response).toEqual({ status: 502, body: { error: 'The food web writer failed: meta answered 500: overloaded', details: [] } });
  });
});

describe('handleDescribeFigureWithModel', () => {
  const figure = GEOMETRY_SAMPLES[0]?.figure;
  const describingFigure = (describe: (text: string) => Promise<unknown>, text: unknown = 'Triangle ABC.') =>
    handleDescribeFigureWithModel({ text, reader: 'meta', describe });

  it('returns the figure the model laid out', async () => {
    expect(await describingFigure(() => Promise.resolve(figure))).toEqual({ status: 200, body: { stub: false, reader: 'meta', figure } });
  });

  it('rejects empty text without calling the model', async () => {
    let called = false;
    const response = await describingFigure(() => {
      called = true;
      return Promise.resolve(figure);
    }, '');
    expect(response.status).toBe(400);
    expect(called).toBe(false);
  });

  it('answers 502 with the details when the layout stays invalid', async () => {
    const details = ['segment "s1" references missing point "ghost"'];
    const response = await describingFigure(() => Promise.reject(new LayoutError('invalid', 'The layout failed validation.', details)));
    expect(response).toEqual({ status: 502, body: { error: 'The layout failed validation.', details } });
  });

  it('names the figure writer for any other failure', async () => {
    const response = await describingFigure(() => Promise.reject(new Error('meta answered 500: overloaded')));
    expect(response).toEqual({ status: 502, body: { error: 'The figure writer failed: meta answered 500: overloaded', details: [] } });
  });
});
