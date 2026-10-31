import { describe, expect, it } from 'vitest';
import { rampBallDominoes, rampBallDominoesQuestions } from '../src/scene/fixtures';
import { grasslandWeb, speciesAt, webOf } from '../src/ecosystem/fixtures';
import { templateQuestion } from '../src/ecosystem/questions';
import type { Web } from '../src/ecosystem/schema';
import { NO_FIGURE_FOCUS, templateFigureQuestion } from '../src/geometry/questions';
import { GEOMETRY_SAMPLES } from '../src/geometry/samples';
import type { Figure, Focus } from '../src/geometry/schema';
import { handleDraftFigureQuestionsWithModel, handleDraftQuestionsWithModel, handleDraftWebQuestionsWithModel } from './draft';

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

describe('handleDraftWebQuestionsWithModel', () => {
  const web: Web = { ...grasslandWeb(), event: { kind: 'remove', species: 'fox' } };
  const grounded: unknown = [templateQuestion(web, { kind: 'remove', species: 'fox' }, 'grass')];
  const aloneWeb: Web = { ...webOf([speciesAt('grass', 'producer', 0, 0)], []), event: { kind: 'remove', species: 'grass' } };

  it('returns grounded questions from the model', async () => {
    const response = await handleDraftWebQuestionsWithModel({ web, drafter: 'meta', draft: draftReturning(grounded) });
    expect(response).toEqual({ status: 200, body: { stub: false, drafter: 'meta', questions: grounded } });
  });

  it('rejects a web that fails validation without calling the model', async () => {
    let called = false;
    const draft = () => {
      called = true;
      return Promise.resolve(grounded);
    };
    const response = await handleDraftWebQuestionsWithModel({ web: { version: 1 }, drafter: 'meta', draft });
    expect(response.status).toBe(400);
    expect(called).toBe(false);
  });

  it('answers 422 without calling the model when nothing changes after the event', async () => {
    let called = false;
    const draft = () => {
      called = true;
      return Promise.resolve(grounded);
    };
    const response = await handleDraftWebQuestionsWithModel({ web: aloneWeb, drafter: 'meta', draft });
    expect(response).toEqual({ status: 422, body: { error: 'Nothing in the web changes after the event, so there is nothing to predict.', details: [] } });
    expect(called).toBe(false);
  });

  it('reports a failed model call', async () => {
    const draft = () => Promise.reject(new Error('meta answered 500: overloaded'));
    const response = await handleDraftWebQuestionsWithModel({ web, drafter: 'meta', draft });
    expect(response).toEqual({ status: 502, body: { error: 'The question drafter failed: meta answered 500: overloaded', details: [] } });
  });

  it('rejects a drafted question that cites a species not in the web', async () => {
    const ungrounded = [{ ...templateQuestion(web, { kind: 'remove', species: 'fox' }, 'grass'), cites: ['grass', 'wolf'] }];
    const response = await handleDraftWebQuestionsWithModel({ web, drafter: 'meta', draft: draftReturning(ungrounded) });
    expect(response.status).toBe(422);
    expect((response.body as { details: string[] }).details).toEqual(['q-1 cites missing species "wolf"']);
  });

  it('rejects a drafted question about the removed species', async () => {
    const aboutFox = [{ ...templateQuestion(web, { kind: 'remove', species: 'fox' }, 'grass'), observe: { kind: 'direction', species: 'fox' } }];
    const response = await handleDraftWebQuestionsWithModel({ web, drafter: 'meta', draft: draftReturning(aboutFox) });
    expect(response.status).toBe(422);
    expect((response.body as { details: string[] }).details).toEqual(['q-1 observes "fox", which the event removes']);
  });
});

describe('handleDraftFigureQuestionsWithModel', () => {
  const triangle = GEOMETRY_SAMPLES[0]?.figure as Figure;
  const SUGGESTED: Focus = { kind: 'angle-sum', polygon: 'abc', drag: 'C' };
  const CHOSEN: Focus = { kind: 'angle-sum', polygon: 'abc', drag: 'A' };
  const lineOnly: Figure = { ...triangle, polygons: [], marks: [], segments: [triangle.segments[0] as Figure['segments'][number]] };
  const drafting = (figure: unknown, draft: (figure: Figure, focus: Focus) => Promise<unknown>) =>
    handleDraftFigureQuestionsWithModel({ figure, drafter: 'meta', draft });

  it('drafts for the suggested focus when the figure has none, and returns grounded questions', async () => {
    const seen: Focus[] = [];
    const response = await drafting(triangle, (_figure, focus) => {
      seen.push(focus);
      return Promise.resolve([templateFigureQuestion(triangle, focus)]);
    });
    expect(seen).toEqual([SUGGESTED]);
    expect(response).toEqual({ status: 200, body: { stub: false, drafter: 'meta', questions: [templateFigureQuestion(triangle, SUGGESTED)] } });
  });

  it('drafts for the figure’s own focus when it has one', async () => {
    const seen: Focus[] = [];
    const chosen: Figure = { ...triangle, focus: CHOSEN };
    await drafting(chosen, (_figure, focus) => {
      seen.push(focus);
      return Promise.resolve([templateFigureQuestion(chosen, focus)]);
    });
    expect(seen).toEqual([CHOSEN]);
  });

  it('answers 422 without calling the model when there is nothing to predict', async () => {
    let called = false;
    const response = await drafting(lineOnly, () => {
      called = true;
      return Promise.resolve([]);
    });
    expect(response).toEqual({ status: 422, body: { error: NO_FIGURE_FOCUS, details: [] } });
    expect(called).toBe(false);
  });

  it('rejects a figure that fails validation', async () => {
    const response = await drafting({ version: 1 }, () => Promise.resolve([]));
    expect(response.status).toBe(400);
    expect((response.body as { error: string }).error).toBe('The figure sent for drafting failed validation.');
  });

  it('reports a failed model call', async () => {
    const response = await drafting(triangle, () => Promise.reject(new Error('meta answered 500: overloaded')));
    expect(response).toEqual({ status: 502, body: { error: 'The question drafter failed: meta answered 500: overloaded', details: [] } });
  });

  it('rejects a drafted question that cites a point not in the figure', async () => {
    const ungrounded = [{ ...templateFigureQuestion(triangle, SUGGESTED), cites: ['A', 'Z'] }];
    const response = await drafting(triangle, () => Promise.resolve(ungrounded));
    expect(response).toEqual({ status: 422, body: { error: 'A drafted question cited something not in the figure.', details: ['q-1 cites missing point "Z"'] } });
  });
});
