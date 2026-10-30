import { parseSubject, type Subject } from './subjects';

export const SUBJECT_STORAGE_KEY = 'board-to-life.subject';

type SubjectStorage = { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void };

export const loadSubject = (storage: SubjectStorage): Subject => {
  try {
    return parseSubject(storage.getItem(SUBJECT_STORAGE_KEY) ?? undefined) ?? 'physics';
  } catch {
    return 'physics';
  }
};

export const saveSubject = (storage: SubjectStorage, subject: Subject): void => {
  try {
    storage.setItem(SUBJECT_STORAGE_KEY, subject);
  } catch {
    // storage may be blocked; the choice then lasts only for this page
  }
};
