import { h } from './dom';

type Child = Parameters<typeof h>[2];
type Size = { width: number; height: number };

// One screen, with nothing that matters below the fold: the board and the drafted questions on the left, what was
// read on the right, and the actions along the bottom where they can always be reached.
export const checkLayout = ({ board, facts, questions, actions }: { board: Node; facts: Child[]; questions: Child[]; actions: Child[] }): HTMLElement =>
  h(
    'section',
    { class: 'check' },
    h('div', { class: 'check-board' }, board),
    h('aside', { class: 'panel' }, ...facts),
    h('div', { class: 'check-questions' }, ...questions),
    h('div', { class: 'check-actions' }, ...actions),
  );

// A frame that keeps a picture's shape at the largest size that fits, so an overlay stays lined up with the photo.
export const fittedFrame = ({ width, height }: Size, ...children: Child[]): HTMLElement =>
  h('div', { class: 'frame-room' }, h('div', { class: 'photo-frame', style: `--frame-ratio: ${width / height}` }, ...children));
