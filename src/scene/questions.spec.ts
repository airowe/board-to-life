import { describe, expect, it } from 'vitest';
import { rampBallDominoes, rampBallDominoesQuestions } from './fixtures';
import { checkGrounding } from './questions';
import { validateScene, type Scene } from './schema';

const scene = ((): Scene => {
  const result = validateScene(rampBallDominoes);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.scene;
})();

const draftWith = (patch: Record<string, unknown>): unknown[] => [{ ...rampBallDominoesQuestions[0], ...patch }];

const errorsFor = (input: unknown): string => {
  const result = checkGrounding(input, scene);
  if (result.ok) throw new Error('expected grounding check to fail');
  return result.errors.join('\n');
};

describe('checkGrounding', () => {
  it('accepts drafts that cite only scene items', () => {
    const result = checkGrounding(rampBallDominoesQuestions, scene);
    expect(result).toEqual({ ok: true, questions: rampBallDominoesQuestions });
  });

  it('rejects a draft citing a missing item', () => {
    expect(errorsFor(draftWith({ cites: ['ball', 'domino-9'] }))).toMatch(/q-1 cites missing item "domino-9"/);
  });

  it('rejects a draft observing a missing item', () => {
    expect(errorsFor(draftWith({ observe: { kind: 'fallen', item: 'domino-9' } }))).toMatch(/"domino-9"/);
  });

  it('rejects a draft attached to a missing predict point', () => {
    expect(errorsFor(draftWith({ predictPointId: 'pp-7' }))).toMatch(/missing predict point "pp-7"/);
  });

  it.each([
    ['prompt', 'Will the pulley turn?', 'pulley'],
    ['explanation', 'The levers lift the ball.', 'lever'],
  ])('rejects a %s that names a body kind absent from the scene', (field, text, kind) => {
    expect(errorsFor(draftWith({ [field]: text }))).toMatch(new RegExp(`mentions "${kind}"`));
  });

  it('rejects a draft that cites nothing', () => {
    expect(errorsFor(draftWith({ cites: [] })).length).toBeGreaterThan(0);
  });

  it('rejects malformed drafts', () => {
    expect(errorsFor([{ id: 'q-1' }]).length).toBeGreaterThan(0);
  });
});
