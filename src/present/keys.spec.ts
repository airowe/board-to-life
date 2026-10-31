import { describe, expect, it } from 'vitest';
import { presenterKeyAction, type KeyInput } from './keys';

const press = (key: string, rest: Partial<KeyInput> = {}): KeyInput => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  onButton: false,
  ...rest,
});

describe('presenterKeyAction', () => {
  it.each([
    [' ', 'advance'],
    ['Enter', 'advance'],
    ['r', 'replay'],
    ['R', 'replay'],
  ])('maps %j to %s', (key, action) => {
    expect(presenterKeyAction(press(key))).toBe(action);
  });

  it.each(['Enter', ' '])('leaves %j to the focused button', (key) => {
    expect(presenterKeyAction(press(key, { onButton: true }))).toBeNull();
  });

  it.each([{ metaKey: true }, { ctrlKey: true }, { altKey: true }])('ignores r held with %o, as in a browser reload', (modifier) => {
    expect(presenterKeyAction(press('r', modifier))).toBeNull();
  });

  it('ignores other keys', () => {
    expect(presenterKeyAction(press('x'))).toBeNull();
  });
});
