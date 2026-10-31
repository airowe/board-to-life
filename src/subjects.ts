export const SUBJECTS = ['physics', 'ecosystem', 'geometry'] as const;
export type Subject = (typeof SUBJECTS)[number];

export const SUBJECT_LABELS: Record<Subject, string> = { physics: 'Physics', ecosystem: 'Ecosystem', geometry: 'Geometry' };

export const parseSubject = (value: unknown): Subject | null => {
  if (value === undefined) return 'physics';
  return SUBJECTS.find((subject) => subject === value) ?? null;
};
