import { describe, expect, it, vi } from 'vitest';
import { emptyEdits, toggleRemoved } from './edits';
import { grasslandWeb } from './fixtures';
import * as model from './model';
import { createWebPlayback } from './playback';

vi.mock('./model', async (importOriginal) => {
  const original = await importOriginal<typeof import('./model')>();
  return { ...original, startingPopulations: vi.fn(original.startingPopulations) };
});

describe('createWebPlayback warm-up', () => {
  it('settles the web once for the opening run and every replay', () => {
    const spy = vi.mocked(model.startingPopulations);
    spy.mockClear();
    const playback = createWebPlayback({ subject: 'ecosystem', web: grasslandWeb(), questions: [] });
    let edits = emptyEdits();
    for (const id of ['fox', 'hawk', 'fox']) {
      edits = toggleRemoved(edits, id);
      playback.replay(edits);
    }
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
