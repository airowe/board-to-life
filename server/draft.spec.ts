import { describe, expect, it } from 'vitest';
import { rampBallDominoes, rampBallDominoesQuestions } from '../src/scene/fixtures';
import { handleDraftQuestionsWithModel } from './draft';

const questions: unknown = structuredClone(rampBallDominoesQuestions);
const draftReturning = (result: unknown) => () => Promise.resolve(result);

describe('handleDraftQuestionsWithModel', () => {
  it('returns grounded questions from the model', async () => {
    const response = await handleDraftQuestionsWithModel({ scene: rampBallDominoes, drafter: 'meta', draft: draftReturning(questions) });
    expect(response).toEqual({ status: 200, body: { stub: false, drafter: 'meta', questions } });
  });

  it('rejects a scene that fails validation without calling the model', async () => {
    let called = false;
    const draft = () => {
      called = true;
      return Promise.resolve(questions);
    };
    const response = await handleDraftQuestionsWithModel({ scene: { version: 1 }, drafter: 'meta', draft });
    expect(response.status).toBe(400);
    expect(called).toBe(false);
  });

  it.each([
    ['no predict point', { ...rampBallDominoes, predictPoints: [] }, /no moment to pause/],
    ['nothing that can tip over', { ...rampBallDominoes, items: rampBallDominoes.items.filter((item) => item.kind !== 'domino'), predictPoints: [] }, /no moment to pause/],
  ])('explains why it cannot draft when the scene has %s', async (_reason, scene, message) => {
    const response = await handleDraftQuestionsWithModel({ scene, drafter: 'meta', draft: draftReturning(questions) });
    expect(response.status).toBe(422);
    expect((response.body as { error: string }).error).toMatch(message);
  });

  it('says what cannot tip over when the scene has a pause but nothing to observe', async () => {
    const scene = {
      ...rampBallDominoes,
      items: [...rampBallDominoes.items.filter((item) => item.kind !== 'domino'), { id: 'pivot-1', kind: 'pivot', x: 800, y: 700, confidence: 0.9 }],
      predictPoints: [{ id: 'pp-1', trigger: { kind: 'time', seconds: 2 } }],
    };
    const response = await handleDraftQuestionsWithModel({ scene, drafter: 'meta', draft: draftReturning(questions) });
    expect(response.status).toBe(422);
    expect((response.body as { error: string }).error).toMatch(/nothing that can tip over/);
  });

  it('reports a failed model call', async () => {
    const draft = () => Promise.reject(new Error('meta answered 500: overloaded'));
    const response = await handleDraftQuestionsWithModel({ scene: rampBallDominoes, drafter: 'meta', draft });
    expect(response).toEqual({ status: 502, body: { error: 'The question drafter failed: meta answered 500: overloaded', details: [] } });
  });

  it('rejects drafted questions that are not grounded in the scene', async () => {
    const ungrounded = [{ ...rampBallDominoesQuestions[0], explanation: 'The pulley lifts the ball.' }];
    const response = await handleDraftQuestionsWithModel({ scene: rampBallDominoes, drafter: 'meta', draft: draftReturning(ungrounded) });
    expect(response.status).toBe(422);
    expect((response.body as { details: string[] }).details).toEqual(['q-1 mentions "pulley" but the scene has none']);
  });
});
