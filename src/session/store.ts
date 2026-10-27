import type { PredictQuestion } from '../scene/questions';
import type { Scene } from '../scene/schema';

export type Lesson = { scene: Scene; questions: PredictQuestion[] };
export type Draft = { status: 'draft'; scene: Scene; questions: PredictQuestion[] | null };
export type ApprovedLesson = Lesson & { status: 'approved' };

export type Session = {
  startDraft: (scene: Scene) => number;
  setDraftQuestions: (draftId: number, questions: PredictQuestion[]) => boolean;
  approve: () => void;
  draft: () => Draft | null;
  presentable: () => ApprovedLesson | null;
};

export const createSession = (): Session => {
  let draftId = 0;
  let draft: { scene: Scene; questions: PredictQuestion[] | null } | null = null;
  let approved: Lesson | null = null;

  return {
    startDraft: (scene) => {
      draftId += 1;
      draft = { scene: structuredClone(scene), questions: null };
      approved = null;
      return draftId;
    },
    setDraftQuestions: (id, questions) => {
      if (id !== draftId || !draft) return false;
      draft = { ...draft, questions: structuredClone(questions) };
      return true;
    },
    approve: () => {
      if (!draft) throw new Error('no draft to approve');
      if (!draft.questions) throw new Error('questions are still being drafted');
      approved = structuredClone({ scene: draft.scene, questions: draft.questions });
    },
    draft: () => (draft ? { status: 'draft', ...structuredClone(draft) } : null),
    presentable: () => (approved ? { status: 'approved', ...structuredClone(approved) } : null),
  };
};
