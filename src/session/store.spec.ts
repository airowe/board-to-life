import { describe, expect, it } from 'vitest';
import { rampBallDominoes, rampBallDominoesQuestions } from '../scene/fixtures';
import { checkGrounding, type PredictQuestion } from '../scene/questions';
import { validateScene, type Scene } from '../scene/schema';
import { createSession } from './store';

const scene = (): Scene => {
  const result = validateScene(rampBallDominoes);
  if (!result.ok) throw new Error('fixture scene invalid');
  return result.scene;
};

const questions = (): PredictQuestion[] => {
  const result = checkGrounding(rampBallDominoesQuestions, scene());
  if (!result.ok) throw new Error('fixture questions invalid');
  return result.questions;
};

const drafted = () => {
  const session = createSession();
  const draftId = session.startDraft(scene());
  session.setDraftQuestions(draftId, questions());
  return session;
};

describe('createSession', () => {
  it('shows the scene for checking before its questions arrive', () => {
    const session = createSession();
    session.startDraft(scene());
    expect(session.draft()).toEqual({ status: 'draft', scene: scene(), questions: null });
    expect(session.presentable()).toBeNull();
  });

  it('refuses to approve while questions are still being drafted', () => {
    const session = createSession();
    session.startDraft(scene());
    expect(() => session.approve()).toThrow(/questions/);
  });

  it('refuses to approve when there is no draft', () => {
    expect(() => createSession().approve()).toThrow(/no draft/);
  });

  it('has nothing presentable until a complete draft is approved', () => {
    const session = drafted();
    expect(session.presentable()).toBeNull();
    session.approve();
    expect(session.presentable()).toEqual({ status: 'approved', scene: scene(), questions: questions() });
  });

  it('ignores questions drafted for a scene that has since been replaced', () => {
    const session = createSession();
    const stale = session.startDraft(scene());
    const current = session.startDraft(scene());
    expect(session.setDraftQuestions(stale, questions())).toBe(false);
    expect(session.draft()?.questions).toBeNull();
    expect(session.setDraftQuestions(current, questions())).toBe(true);
    expect(session.draft()?.questions).toEqual(questions());
  });

  it('keeps the approved copy unchanged when the draft is edited afterwards', () => {
    const session = drafted();
    session.approve();
    const [viaAccessor] = session.draft()?.questions ?? [];
    if (viaAccessor) viaAccessor.prompt = 'Edited via accessor';
    expect(session.presentable()?.questions[0]?.prompt).toBe('Will the last domino fall?');
  });

  it('clears the approval when a new draft starts', () => {
    const session = drafted();
    session.approve();
    session.startDraft(scene());
    expect(session.presentable()).toBeNull();
  });
});
