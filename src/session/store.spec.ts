import { describe, expect, it } from 'vitest';
import { rampBallDominoes, rampBallDominoesQuestions } from '../scene/fixtures';
import { checkGrounding } from '../scene/questions';
import { validateScene } from '../scene/schema';
import { createSession, type Lesson } from './store';

const lesson = (): Lesson => {
  const scene = validateScene(rampBallDominoes);
  if (!scene.ok) throw new Error('fixture scene invalid');
  const questions = checkGrounding(rampBallDominoesQuestions, scene.scene);
  if (!questions.ok) throw new Error('fixture questions invalid');
  return { scene: scene.scene, questions: questions.questions };
};

describe('createSession', () => {
  it('has nothing presentable until a draft is approved', () => {
    const session = createSession();
    expect(session.presentable()).toBeNull();
    session.setDraft(lesson());
    expect(session.presentable()).toBeNull();
    expect(session.draft()?.status).toBe('draft');
  });

  it('presents exactly the approved copy, labelled as approved', () => {
    const session = createSession();
    session.setDraft(lesson());
    session.approve();
    expect(session.presentable()).toEqual({ status: 'approved', ...lesson() });
  });

  it('keeps the approved copy unchanged when the draft is edited afterwards', () => {
    const session = createSession();
    const draft = lesson();
    session.setDraft(draft);
    session.approve();
    const [original] = draft.questions;
    if (original) original.prompt = 'Edited after approval';
    const [viaAccessor] = session.draft()?.questions ?? [];
    if (viaAccessor) viaAccessor.prompt = 'Edited via accessor';
    expect(session.presentable()?.questions[0]?.prompt).toBe('Will the last domino fall?');
  });

  it('clears the approval when a new draft arrives', () => {
    const session = createSession();
    session.setDraft(lesson());
    session.approve();
    session.setDraft(lesson());
    expect(session.presentable()).toBeNull();
  });

  it('refuses to approve when there is no draft', () => {
    expect(() => createSession().approve()).toThrow(/no draft/);
  });
});
