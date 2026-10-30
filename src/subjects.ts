export const SUBJECTS = ['physics', 'ecosystem'] as const;
export type Subject = (typeof SUBJECTS)[number];

export const SUBJECT_LABELS: Record<Subject, string> = { physics: 'Physics', ecosystem: 'Ecosystem' };

export const parseSubject = (value: unknown): Subject | null => {
  if (value === undefined) return 'physics';
  return SUBJECTS.find((subject) => subject === value) ?? null;
};
