import { describe, expect, it } from 'vitest';
import { DEFAULT_STUB_MODE, stubModeFor } from './stubMode';

const PICKED_MODES = ['ok', 'error', 'timeout', 'invalid', 'ungrounded', 'backward'];

describe('stubModeFor', () => {
  it.each(PICKED_MODES)('passes the picked mode %s through in development', (picked) => {
    expect(stubModeFor({ isDev: true, picked })).toBe(picked);
  });

  it.each(PICKED_MODES)('ignores the picked mode %s in production and asks for the normal answer', (picked) => {
    expect(stubModeFor({ isDev: false, picked })).toBe(DEFAULT_STUB_MODE);
  });

  it('names ok as the normal answer', () => {
    expect(DEFAULT_STUB_MODE).toBe('ok');
  });
});
