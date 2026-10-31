import type { WebQuestion } from '../ecosystem/questions';
import type { Web } from '../ecosystem/schema';
import type { GeometryQuestion } from '../geometry/questions';
import type { Figure } from '../geometry/schema';
import type { PredictQuestion } from '../scene/questions';
import type { Scene } from '../scene/schema';
import type { Subject } from '../subjects';

export type PhysicsLesson = { subject: 'physics'; scene: Scene; questions: PredictQuestion[] };
export type EcosystemLesson = { subject: 'ecosystem'; web: Web; questions: WebQuestion[] };
export type GeometryLesson = { subject: 'geometry'; figure: Figure; questions: GeometryQuestion[] };
export type Lesson = PhysicsLesson | EcosystemLesson | GeometryLesson;

export type DraftContent = { subject: 'physics'; scene: Scene } | { subject: 'ecosystem'; web: Web } | { subject: 'geometry'; figure: Figure };

export type PhysicsDraft = { status: 'draft'; subject: 'physics'; scene: Scene; questions: PredictQuestion[] | null };
export type EcosystemDraft = { status: 'draft'; subject: 'ecosystem'; web: Web; questions: WebQuestion[] | null };
export type GeometryDraft = { status: 'draft'; subject: 'geometry'; figure: Figure; questions: GeometryQuestion[] | null };
export type Draft = PhysicsDraft | EcosystemDraft | GeometryDraft;

export type ApprovedPhysicsLesson = PhysicsLesson & { status: 'approved' };
export type ApprovedEcosystemLesson = EcosystemLesson & { status: 'approved' };
export type ApprovedGeometryLesson = GeometryLesson & { status: 'approved' };
export type ApprovedLesson = ApprovedPhysicsLesson | ApprovedEcosystemLesson | ApprovedGeometryLesson;

export type Session = {
  startDraft: (content: DraftContent) => number;
  setDraftQuestions: (draftId: number, questions: Lesson['questions']) => boolean;
  approve: () => void;
  draft: () => Draft | null;
  presentable: () => ApprovedLesson | null;
};

const QUESTION_KIND: Record<Subject, string> = { physics: 'fallen', ecosystem: 'direction', geometry: 'figure' };

const questionsMatchSubject = (subject: Subject, questions: Lesson['questions']): boolean => {
  const [first] = questions;
  if (!first) return true;
  return first.observe.kind === QUESTION_KIND[subject];
};

type DraftState = { content: DraftContent; questions: Lesson['questions'] | null };

const toDraft = ({ content, questions }: DraftState): Draft =>
  structuredClone({ status: 'draft', ...content, questions }) as Draft;

const toLesson = ({ content, questions }: DraftState & { questions: Lesson['questions'] }): Lesson =>
  structuredClone({ ...content, questions }) as Lesson;

export const createSession = (): Session => {
  let draftId = 0;
  let draft: DraftState | null = null;
  let approved: Lesson | null = null;

  return {
    startDraft: (content) => {
      draftId += 1;
      draft = { content: structuredClone(content), questions: null };
      approved = null;
      return draftId;
    },
    setDraftQuestions: (id, questions) => {
      if (id !== draftId || !draft) return false;
      if (!questionsMatchSubject(draft.content.subject, questions)) return false;
      draft = { ...draft, questions: structuredClone(questions) };
      return true;
    },
    approve: () => {
      if (!draft) throw new Error('no draft to approve');
      if (!draft.questions) throw new Error('questions are still being drafted');
      approved = toLesson({ ...draft, questions: draft.questions });
    },
    draft: () => (draft ? toDraft(draft) : null),
    presentable: () => (approved ? ({ status: 'approved', ...structuredClone(approved) } as ApprovedLesson) : null),
  };
};
