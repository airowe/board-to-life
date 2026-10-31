export type KeyInput = { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; onButton: boolean };
export type PresenterKeyAction = 'advance' | 'replay';

// A focused button keeps Space and Enter for itself, and a shortcut held with a modifier belongs to the browser.
export const presenterKeyAction = (input: KeyInput): PresenterKeyAction | null => {
  if (input.ctrlKey || input.metaKey || input.altKey) return null;
  if (input.key === ' ' || input.key === 'Enter') return input.onButton ? null : 'advance';
  return input.key.toLowerCase() === 'r' ? 'replay' : null;
};
