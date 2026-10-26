import type { PredictQuestion } from '../scene/questions';
import type { Scene } from '../scene/schema';

export type Lesson = { scene: Scene; questions: PredictQuestion[] };
export type LabelledLesson<S extends 'draft' | 'approved'> = Lesson & { status: S };

export type Session = {
  setDraft: (lesson: Lesson) => void;
  approve: () => void;
  draft: () => LabelledLesson<'draft'> | null;
  presentable: () => LabelledLesson<'approved'> | null;
};

export const createSession = (): Session => {
  let draft: Lesson | null = null;
  let approved: Lesson | null = null;

  return {
    setDraft: (lesson) => {
      draft = structuredClone(lesson);
      approved = null;
    },
    approve: () => {
      if (!draft) throw new Error('no draft to approve');
      approved = structuredClone(draft);
    },
    draft: () => (draft ? { status: 'draft', ...structuredClone(draft) } : null),
    presentable: () => (approved ? { status: 'approved', ...structuredClone(approved) } : null),
  };
};
