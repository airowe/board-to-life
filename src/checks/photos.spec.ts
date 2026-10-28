import { describe, expect, it } from 'vitest';
import { rampBallDominoes } from '../scene/fixtures';
import { validateScene, type Scene } from '../scene/schema';
import { formatPhotoReport, PHOTO_CHECKS, pickItem, scorePhoto, type PhotoCheck } from './photos';

const sceneFrom = (input: unknown): Scene => {
  const result = validateScene(input);
  if (!result.ok) throw new Error(result.errors.join('; '));
  return result.scene;
};

const sample = sceneFrom(rampBallDominoes);
const chain: PhotoCheck = {
  name: 'chain',
  title: 'Ramp, ball and five dominoes',
  counts: { ramp: 1, ball: 1, domino: 5 },
  outcomes: [{ kind: 'domino', from: 'right', place: 1, fallen: true }],
  doodles: 1,
};

describe('pickItem', () => {
  it.each([
    ['left', 1, 'domino-1'],
    ['left', 4, 'domino-4'],
    ['right', 1, 'domino-5'],
    ['right', 2, 'domino-4'],
  ] as const)('counts from the %s: place %i is %s', (from, place, id) => {
    expect(pickItem(sample, { kind: 'domino', from, place })).toBe(id);
  });

  it('finds nothing when there are not enough of that kind', () => {
    expect(pickItem(sample, { kind: 'domino', from: 'left', place: 6 })).toBeNull();
  });
});

describe('scorePhoto', () => {
  it('passes a scene with the right counts, outcome and flagged doodle', () => {
    const score = scorePhoto(chain, sample, new Map([['domino-5', true]]));
    expect(score).toEqual({
      counts: [
        { kind: 'ramp', expected: 1, actual: 1 },
        { kind: 'ball', expected: 1, actual: 1 },
        { kind: 'domino', expected: 5, actual: 5 },
      ],
      outcomes: [{ label: 'domino 1st from the right', item: 'domino-5', expected: true, actual: true }],
      doodles: { expected: 1, actual: 1 },
      passed: true,
    });
  });

  it('fails when a count is off', () => {
    const fewer = sceneFrom({ ...rampBallDominoes, items: rampBallDominoes.items.filter((item) => item.id !== 'domino-3') });
    const score = scorePhoto(chain, fewer, new Map([['domino-5', true]]));
    expect(score.counts).toContainEqual({ kind: 'domino', expected: 5, actual: 4 });
    expect(score.passed).toBe(false);
  });

  it('fails when the picked item does the wrong thing', () => {
    expect(scorePhoto(chain, sample, new Map([['domino-5', false]])).passed).toBe(false);
  });

  it('fails when a doodle is not flagged', () => {
    const score = scorePhoto(chain, sceneFrom({ ...rampBallDominoes, unknownMarks: [] }), new Map([['domino-5', true]]));
    expect(score.doodles).toEqual({ expected: 1, actual: 0 });
    expect(score.passed).toBe(false);
  });

  it('does not mind extra flagged marks when no doodle is drawn', () => {
    const noDoodle: PhotoCheck = { name: chain.name, title: chain.title, counts: chain.counts, outcomes: chain.outcomes };
    expect(scorePhoto(noDoodle, sample, new Map([['domino-5', true]]))).toMatchObject({ doodles: null, passed: true });
  });
});

describe('PHOTO_CHECKS', () => {
  it('has one check per drawing on the shot list, with unique names', () => {
    expect(PHOTO_CHECKS.map((check) => check.name)).toEqual(['01-chain', '01-chain-angle', '02-gap', '03-wall', '04-pendulum', '05-messy', '06-spring', '07-pulley', '08-cart', '09-seesaw']);
  });
});

describe('formatPhotoReport', () => {
  it('shows each photo with what was wrong, and the total', () => {
    const passed = scorePhoto(chain, sample, new Map([['domino-5', true]]));
    const failed = scorePhoto(chain, sample, new Map([['domino-5', false]]));
    const report = formatPhotoReport([
      { name: '01-chain', title: chain.title, score: passed, error: null },
      { name: '02-gap', title: 'Wide gap', score: failed, error: null },
      { name: '03-wall', title: 'Wall', score: null, error: 'meta answered 500' },
    ]);
    expect(report).toContain('01-chain  PASS  Ramp, ball and five dominoes');
    expect(report).toContain('domino 1st from the right (domino-5): expected falls, read scene stays up (WRONG)');
    expect(report).toContain('03-wall   FAIL  Wall\n          meta answered 500');
    expect(report).toMatch(/1 of 3 photos read correctly$/);
  });
});
