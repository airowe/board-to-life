import { describe, expect, it } from 'vitest';
import { NOTHING_TO_PREDICT } from '../ecosystem/questions';
import { NOTHING_CHANGES_NOTE, questionsFailureStatus } from './questionCards';

const retry = (): void => undefined;

describe('questionsFailureStatus', () => {
  it('turns the nothing-to-predict answer into a prompt to pick another event, with no retry', () => {
    expect(questionsFailureStatus({ message: NOTHING_TO_PREDICT }, retry)).toEqual({ kind: 'nothing-to-predict' });
    expect(NOTHING_CHANGES_NOTE).toBe('Nothing changes after this event. Pick another event under What happens.');
  });

  it('keeps any other failure retryable', () => {
    const failure = { message: 'The food web reader is unavailable (stub error mode).' };
    expect(questionsFailureStatus(failure, retry)).toEqual({ kind: 'failed', failure, retry });
  });
});
