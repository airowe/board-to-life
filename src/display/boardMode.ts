export const BOARD_MODE_ON = 'on';
export const BOARD_MODE_OFF = 'off';
export const BOARD_MODE_KEY = 'board-to-life.board-mode';

const OFF_VALUES = new Set(['0', 'off', 'false', 'no']);

// `?board` in the address turns board mode on (a bookmark on the classroom panel), `?board=0` turns it off,
// and otherwise the last choice made on this device stands.
export const wantsBoardMode = (search: string, remembered: string | null): boolean => {
  const asked = new URLSearchParams(search).get('board');
  if (asked !== null) return !OFF_VALUES.has(asked.trim().toLowerCase());
  return remembered === BOARD_MODE_ON;
};
