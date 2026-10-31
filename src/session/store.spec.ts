import { describe, expect, it } from 'vitest';
import { rampBallDominoes, rampBallDominoesQuestions } from '../scene/fixtures';
import { checkGrounding, type PredictQuestion } from '../scene/questions';
import { validateScene, type Scene } from '../scene/schema';
import type { WebQuestion } from '../ecosystem/questions';
import type { Web } from '../ecosystem/schema';
import type { GeometryQuestion } from '../geometry/questions';
import { GEOMETRY_SAMPLES } from '../geometry/samples';
import type { Figure } from '../geometry/schema';
import { createSession } from './store';

const NO_EVENT_WEB: Web = {
  version: 1,
  drawing: { width: 1000, height: 1000 },
  species: [
    { id: 'grass', name: 'Grass', role: 'producer', x: 100, y: 100, width: 100, height: 100, confidence: 1 },
    { id: 'rabbit', name: 'Rabbit', role: 'consumer', x: 400, y: 100, width: 100, height: 100, confidence: 1 },
  ],
  eats: [{ id: 'eats-1', from: 'grass', to: 'rabbit', confidence: 1 }],
  labels: [],
  unknownMarks: [],
  event: null,
};
const DROUGHT_WEB: Web = { ...NO_EVENT_WEB, event: { kind: 'drought' } };

const webQuestions = (): WebQuestion[] => [
  {
    id: 'q1',
    prompt: 'What happens to the rabbits if the grass dies?',
    choices: ['more', 'fewer'],
    observe: { kind: 'direction', species: 'rabbit' },
    explanation: 'Rabbits eat grass.',
    cites: ['grass', 'rabbit'],
  },
];

const TRIANGLE_POLYGON = 'abc';
const DRAGGED_POINT = 'C';

const figure = (): Figure => {
  const sample = GEOMETRY_SAMPLES[0];
  if (!sample) throw new Error('missing geometry sample');
  return sample.figure;
};

const geometryQuestions = (): GeometryQuestion[] => [
  {
    id: 'q1',
    prompt: 'Drag C anywhere. Do the angles of ABC still add to 180°?',
    choices: ['Yes, always', 'Only sometimes', 'Never'],
    observe: { kind: 'figure', focus: { kind: 'angle-sum', polygon: TRIANGLE_POLYGON, drag: DRAGGED_POINT } },
    answer: 'Yes, always',
    explanation: 'The angles of a triangle always add to 180°.',
    cites: [TRIANGLE_POLYGON, DRAGGED_POINT],
  },
];

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
  const draftId = session.startDraft({ subject: 'physics', scene: scene() });
  session.setDraftQuestions(draftId, questions());
  return session;
};

describe('createSession', () => {
  it('shows the scene for checking before its questions arrive', () => {
    const session = createSession();
    session.startDraft({ subject: 'physics', scene: scene() });
    expect(session.draft()).toEqual({ status: 'draft', subject: 'physics', scene: scene(), questions: null });
    expect(session.presentable()).toBeNull();
  });

  it('refuses to approve while questions are still being drafted', () => {
    const session = createSession();
    session.startDraft({ subject: 'physics', scene: scene() });
    expect(() => session.approve()).toThrow(/questions/);
  });

  it('refuses to approve when there is no draft', () => {
    expect(() => createSession().approve()).toThrow(/no draft/);
  });

  it('has nothing presentable until a complete draft is approved', () => {
    const session = drafted();
    expect(session.presentable()).toBeNull();
    session.approve();
    expect(session.presentable()).toEqual({ status: 'approved', subject: 'physics', scene: scene(), questions: questions() });
  });

  it('ignores questions drafted for a scene that has since been replaced', () => {
    const session = createSession();
    const stale = session.startDraft({ subject: 'physics', scene: scene() });
    const current = session.startDraft({ subject: 'physics', scene: scene() });
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
    session.startDraft({ subject: 'physics', scene: scene() });
    expect(session.presentable()).toBeNull();
  });

  it('approves an ecosystem draft into an ecosystem lesson', () => {
    const session = createSession();
    const draftId = session.startDraft({ subject: 'ecosystem', web: NO_EVENT_WEB });
    expect(session.setDraftQuestions(draftId, webQuestions())).toBe(true);
    session.approve();
    expect(session.presentable()).toEqual({ status: 'approved', subject: 'ecosystem', web: NO_EVENT_WEB, questions: webQuestions() });
  });

  it('refuses questions of the other subject', () => {
    const physics = createSession();
    const physicsId = physics.startDraft({ subject: 'physics', scene: scene() });
    expect(physics.setDraftQuestions(physicsId, webQuestions())).toBe(false);
    expect(physics.draft()?.questions).toBeNull();

    const ecosystem = createSession();
    const ecosystemId = ecosystem.startDraft({ subject: 'ecosystem', web: NO_EVENT_WEB });
    expect(ecosystem.setDraftQuestions(ecosystemId, questions())).toBe(false);
    expect(ecosystem.draft()?.questions).toBeNull();
  });

  it('accepts an empty question list for either subject', () => {
    const session = createSession();
    const id = session.startDraft({ subject: 'ecosystem', web: NO_EVENT_WEB });
    expect(session.setDraftQuestions(id, [])).toBe(true);
  });

  it('clears the questions and stales the old draft id when the web changes', () => {
    const session = createSession();
    const first = session.startDraft({ subject: 'ecosystem', web: NO_EVENT_WEB });
    session.setDraftQuestions(first, webQuestions());
    const second = session.startDraft({ subject: 'ecosystem', web: DROUGHT_WEB });
    expect(session.draft()).toEqual({ status: 'draft', subject: 'ecosystem', web: DROUGHT_WEB, questions: null });
    expect(session.setDraftQuestions(first, webQuestions())).toBe(false);
    expect(session.setDraftQuestions(second, webQuestions())).toBe(true);
  });

  it('approves a geometry draft into a geometry lesson', () => {
    const session = createSession();
    const draftId = session.startDraft({ subject: 'geometry', figure: figure() });
    expect(session.draft()).toEqual({ status: 'draft', subject: 'geometry', figure: figure(), questions: null });
    expect(session.setDraftQuestions(draftId, geometryQuestions())).toBe(true);
    session.approve();
    expect(session.presentable()).toEqual({ status: 'approved', subject: 'geometry', figure: figure(), questions: geometryQuestions() });
  });

  it('refuses ecosystem and physics questions for a geometry draft, and geometry questions for the others', () => {
    const geometry = createSession();
    const geometryId = geometry.startDraft({ subject: 'geometry', figure: figure() });
    expect(geometry.setDraftQuestions(geometryId, webQuestions())).toBe(false);
    expect(geometry.setDraftQuestions(geometryId, questions())).toBe(false);
    expect(geometry.draft()?.questions).toBeNull();

    const ecosystem = createSession();
    const ecosystemId = ecosystem.startDraft({ subject: 'ecosystem', web: NO_EVENT_WEB });
    expect(ecosystem.setDraftQuestions(ecosystemId, geometryQuestions())).toBe(false);
    expect(ecosystem.draft()?.questions).toBeNull();
  });
});
