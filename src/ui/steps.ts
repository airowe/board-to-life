export const STEPS = ['capture', 'check', 'present'] as const;
export type Step = (typeof STEPS)[number];

export const STEP_LABELS: Record<Step, string> = { capture: 'Bring in the board', check: 'Check the reading', present: 'Present' };

export const stepState = (current: Step, step: Step): 'done' | 'current' | 'todo' => {
  const gap = STEPS.indexOf(step) - STEPS.indexOf(current);
  if (gap === 0) return 'current';
  return gap < 0 ? 'done' : 'todo';
};
