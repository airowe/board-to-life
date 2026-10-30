import { describe, expect, it } from 'vitest';
import { BOARD_MODE_ON, wantsBoardMode } from './boardMode';

describe('wantsBoardMode', () => {
  it.each([
    ['?board', null, true],
    ['?board=1', null, true],
    ['?code=abc&board=on', null, true],
    ['?board=0', BOARD_MODE_ON, false],
    ['?board=off', BOARD_MODE_ON, false],
    ['', BOARD_MODE_ON, true],
    ['', null, false],
    ['?code=abc', 'something else', false],
  ])('for the address %j with %j remembered is %s', (search, remembered, expected) => {
    expect(wantsBoardMode(search, remembered)).toBe(expected);
  });
});
