import type { ApiFailure } from '../api';
import { NOTHING_TO_PREDICT } from '../ecosystem/questions';
import { h } from './dom';

export type QuestionsStatus =
  | { kind: 'drafting' }
  | { kind: 'ready' }
  | { kind: 'nothing-to-predict' }
  | { kind: 'failed'; failure: Pick<ApiFailure, 'message' | 'details'>; retry: () => void };

export type CheckScreen = { setQuestionsStatus: (status: QuestionsStatus) => void };

export type QuestionCardContent = { prompt: string; choices: string[]; explanation: string; cites: string[] };

export const NOTHING_CHANGES_NOTE = 'Nothing changes after this event. Pick another event under What happens.';

type DraftFailure = Pick<ApiFailure, 'message' | 'details'>;

export const questionsFailureStatus = (failure: DraftFailure, retry: () => void): QuestionsStatus =>
  failure.message === NOTHING_TO_PREDICT ? { kind: 'nothing-to-predict' } : { kind: 'failed', failure, retry };

export const questionCard = (question: QuestionCardContent, status: 'draft' | 'approved', modelAnswer?: string): HTMLElement =>
  h(
    'article',
    { class: `question ${status}` },
    h(
      'p',
      { class: 'question-status' },
      status === 'draft' ? 'Draft · not shown to the class' : 'Approved · used in present mode',
    ),
    h('p', { class: 'prompt' }, question.prompt),
    h('p', { class: 'choices' }, question.choices.join(' / ')),
    modelAnswer === undefined ? null : h('p', { class: 'model-answer' }, modelAnswer),
    h('p', { class: 'explanation' }, question.explanation),
    h('p', { class: 'cites' }, 'Cites: ', ...question.cites.map((cited) => h('code', {}, cited))),
  );

export const questionsPlaceholder = (status: QuestionsStatus): HTMLElement | null => {
  if (status.kind === 'drafting') {
    return h('p', { class: 'drafting', role: 'status' }, h('span', { class: 'spinner small' }), 'Drafting predict questions…');
  }
  if (status.kind === 'nothing-to-predict') return h('p', { class: 'inline-note', role: 'status' }, NOTHING_CHANGES_NOTE);
  if (status.kind === 'failed') {
    return h(
      'div',
      { class: 'inline-error', role: 'alert' },
      h('p', {}, status.failure.message),
      status.failure.details && status.failure.details.length > 0
        ? h('ul', { class: 'details' }, ...status.failure.details.map((detail) => h('li', {}, detail)))
        : null,
      h('button', { onclick: status.retry }, 'Draft again'),
    );
  }
  return null;
};
