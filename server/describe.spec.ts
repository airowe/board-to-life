import { describe, expect, it } from 'vitest';
import { rampBallDominoes } from '../src/scene/fixtures';
import { handleDescribeWithModel } from './describe';
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
