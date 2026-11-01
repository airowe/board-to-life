import { parseSubject, type Subject } from './subjects';

export const SUBJECT_STORAGE_KEY = 'board-to-life.subject';
const FIRST_VISIT_SUBJECT: Subject = 'ecosystem';

type SubjectStorage = { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void };

export const loadSubject = (storage: SubjectStorage): Subject => {
  try {
    const stored = storage.getItem(SUBJECT_STORAGE_KEY);
    return (stored === null ? null : parseSubject(stored)) ?? FIRST_VISIT_SUBJECT;
  } catch {
    return FIRST_VISIT_SUBJECT;
  }
};

export const saveSubject = (storage: SubjectStorage, subject: Subject): void => {
  try {
    storage.setItem(SUBJECT_STORAGE_KEY, subject);
  } catch {
    // storage may be blocked; the choice then lasts only for this page
  }
};
