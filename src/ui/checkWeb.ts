import type { Direction } from '../ecosystem/outcomes';
import { CHOICE_FOR, directionsForEvent, eventOf, unfedSpecies, type WebQuestion } from '../ecosystem/questions';
import { backwardArrows, suggestedEvent } from '../ecosystem/trophic';
import type { Eats, Species, Web, WebEvent } from '../ecosystem/schema';
import type { ApprovedEcosystemLesson, ApprovedLesson, Draft, EcosystemDraft, Session } from '../session/store';
import { linkHighlights, LOW_CONFIDENCE, percent } from './check';
import { shortenedArrow } from '../ecosystem/chart';
import { checkLayout, fittedFrame } from './checkLayout';
import { h, s } from './dom';
import { questionCard, questionsPlaceholder, type CheckScreen, type QuestionsStatus } from './questionCards';

export const BACKWARD_NOTE = 'This arrow may point from the eater to the eaten. Flip it?';
export const MODEL_NOTE = 'Populations come from a simple model, not field data.';

type WebCheckHandlers = {
  onPresent: () => void;
  onRestart: () => void;
  onEvent: (event: WebEvent) => void;
  onFlip: (eatsId: string) => void;
};

export type EventOption = { value: string; label: string; event: WebEvent };

const DROUGHT_VALUE = 'drought';
const removeValue = (speciesId: string): string => `remove:${speciesId}`;
const valueOf = (event: WebEvent): string => (event.kind === 'drought' ? DROUGHT_VALUE : removeValue(event.species));

export const eventOptions = (web: Web): EventOption[] => [
  ...web.species.map((entry): EventOption => {
    const event: WebEvent = { kind: 'remove', species: entry.id };
    return { value: valueOf(event), label: `Remove ${entry.name}`, event };
  }),
  { value: DROUGHT_VALUE, label: 'Drought', event: { kind: 'drought' } },
];

export const currentEventValue = (web: Web): string => valueOf(web.event ?? suggestedEvent(web));

export const speciesRowText = (entry: Species): string =>
  `${entry.name} · ${entry.role}${entry.count === undefined ? '' : ` · ${entry.count} written`}`;

const nameOf = (web: Web, speciesId: string): string => web.species.find((entry) => entry.id === speciesId)?.name ?? speciesId;

export const unfedWarnings = (web: Web): string[] =>
  unfedSpecies(web).map((id) => `${nameOf(web, id)} has nothing to eat in this web, so the model has none.`);

export const modelAnswerLine = (question: WebQuestion, directions: Record<string, Direction>): string =>
  `Model answer: ${CHOICE_FOR[directions[question.observe.species] ?? 'steady']}`;

export const arrowRowText = (web: Web, arrow: Eats): string => `${nameOf(web, arrow.from)} → ${nameOf(web, arrow.to)}`;

const ARROWHEAD_SIZE = 18;
const ARROW_ID = 'web-arrowhead';
const BACKWARD_ARROW_ID = 'web-arrowhead-backward';

const arrowheads = (): SVGElement =>
  s(
    'defs',
    {},
    ...[
      [ARROW_ID, 'var(--marker)'],
      [BACKWARD_ARROW_ID, 'var(--red)'],
    ].map(([id, colour]) =>
      s(
        'marker',
        { id: id as string, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: ARROWHEAD_SIZE, markerHeight: ARROWHEAD_SIZE, orient: 'auto', markerUnits: 'userSpaceOnUse' },
        s('path', { d: 'M0 0 L10 5 L0 10 z', fill: colour as string, stroke: 'none' }),
      ),
    ),
  );

const READING_DISC = 72;
const READING_ARROW_GAP = 16;
const READING_MARGIN = 130;
const READING_NAME_BELOW = 42;

const readingSize = ({ drawing }: Web): { width: number; height: number } => ({ width: drawing.width + 2 * READING_MARGIN, height: drawing.height + 2 * READING_MARGIN });

// What was read, drawn cleanly on its own: read positions are only approximate, so over the photo they looked doubled.
const reading = (web: Web, backward: Set<string>, pictureUrl: (name: string) => string | null): SVGElement => {
  const bySpecies = new Map(web.species.map((entry) => [entry.id, entry]));
  const discs = web.species.map((entry) => {
    const low = entry.confidence < LOW_CONFIDENCE;
    const url = pictureUrl(entry.name);
    const fit = READING_DISC * 1.5;
    return s(
      'g',
      { class: `overlay-item${low ? ' low' : ''}`, 'data-id': entry.id },
      s('circle', { cx: entry.x, cy: entry.y, r: READING_DISC }),
      url ? s('image', { href: url, x: entry.x - fit / 2, y: entry.y - fit / 2, width: fit, height: fit }) : null,
      s('text', { x: entry.x, y: entry.y + READING_DISC + READING_NAME_BELOW, class: 'reading-name' }, entry.name),
      low ? s('text', { x: entry.x - READING_DISC, y: entry.y - READING_DISC - 10, class: 'badge' }, `? ${percent(entry.confidence)}`) : null,
    );
  });
  const lines = web.eats.flatMap((arrow) => {
    const [from, to] = [bySpecies.get(arrow.from), bySpecies.get(arrow.to)];
    const line = from && to ? shortenedArrow(from, to, READING_DISC, READING_DISC + READING_ARROW_GAP) : null;
    if (!line) return [];
    const low = arrow.confidence < LOW_CONFIDENCE;
    const reversed = backward.has(arrow.id);
    return [
      s(
        'g',
        { class: `overlay-item web-arrow${low ? ' low' : ''}${reversed ? ' backward' : ''}`, 'data-id': arrow.id },
        s('line', { x1: line.from.x, y1: line.from.y, x2: line.to.x, y2: line.to.y, 'marker-end': `url(#${reversed ? BACKWARD_ARROW_ID : ARROW_ID})` }),
      ),
    ];
  });
  const unknown = web.unknownMarks.map((mark) =>
    s(
      'g',
      { class: 'overlay-unknown', 'data-id': mark.id },
      s('rect', { x: mark.x - mark.width / 2, y: mark.y - mark.height / 2, width: mark.width, height: mark.height }),
      s('text', { x: mark.x - mark.width / 2, y: mark.y + mark.height / 2 + 30, class: 'badge' }, 'Not understood'),
    ),
  );
  const box = `${-READING_MARGIN} ${-READING_MARGIN} ${web.drawing.width + 2 * READING_MARGIN} ${web.drawing.height + 2 * READING_MARGIN}`;
  return s('svg', { class: 'overlay', viewBox: box, role: 'img', 'aria-label': 'The food web as it was read' }, arrowheads(), ...lines, ...discs, ...unknown);
};

const row = (id: string, text: string, confidence: number, extraClass = ''): HTMLElement => {
  const low = confidence < LOW_CONFIDENCE;
  return h(
    'li',
    { class: `item-row web-row${low ? ' low' : ''} ${extraClass}`.trim(), 'data-id': id },
    h('span', { class: 'kind' }, text),
    h('span', { class: 'confidence' }, low ? `check · ${percent(confidence)}` : percent(confidence)),
  );
};

const arrowRow = (web: Web, arrow: Eats, backward: boolean, onFlip: (eatsId: string) => void): HTMLElement => {
  const base = row(arrow.id, arrowRowText(web, arrow), arrow.confidence, backward ? 'backward' : '');
  if (!backward) return base;
  base.append(
    h('p', { class: 'backward-note' }, BACKWARD_NOTE),
    h('button', { class: 'flip', onclick: () => onFlip(arrow.id) }, 'Flip'),
  );
  return base;
};

const ecosystemOnly = <T extends Draft | ApprovedLesson>(lesson: T | null): Extract<T, { subject: 'ecosystem' }> | null => {
  if (lesson && lesson.subject !== 'ecosystem') throw new Error(`the food web check screen cannot show a ${lesson.subject} lesson`);
  return lesson as Extract<T, { subject: 'ecosystem' }> | null;
};

const lessonQuestions = (lesson: EcosystemDraft | ApprovedEcosystemLesson | null): HTMLElement[] => {
  if (!lesson?.questions) return [];
  const directions = directionsForEvent(lesson.web, eventOf(lesson.web));
  return lesson.questions.map((question) => questionCard(question, lesson.status, modelAnswerLine(question, directions)));
};

const warningsFor = (web: Web): HTMLElement[] => {
  const low = [...web.species, ...web.eats].filter((entry) => entry.confidence < LOW_CONFIDENCE);
  return [
    low.length > 0 &&
      h('li', { class: 'warn' }, `${low.length} reading${low.length === 1 ? '' : 's'} below ${percent(LOW_CONFIDENCE)} confidence: ${low.map((entry) => entry.id).join(', ')}. Check against the photo.`),
    ...unfedWarnings(web).map((warning) => h('li', { class: 'warn' }, warning)),
    ...web.unknownMarks.map((mark) => h('li', { class: 'unknown' }, `${mark.note}. Not understood, so it will not be used.`)),
  ].filter((entry): entry is HTMLLIElement => entry instanceof HTMLLIElement);
};

const eventSelect = (web: Web, onEvent: (event: WebEvent) => void): HTMLElement => {
  const options = eventOptions(web);
  const choose = (): void => {
    const picked = options.find((option) => option.value === select.value);
    if (picked) onEvent(picked.event);
  };
  const select = h(
    'select',
    { id: 'web-event', title: 'What happens', onchange: choose },
    ...options.map((option) => h('option', { value: option.value }, option.label)),
  );
  select.value = currentEventValue(web);
  return h('label', { class: 'event-picker' }, h('span', {}, 'What happens'), select);
};

export const renderWebCheck = (root: HTMLElement, session: Session, photoUrl: string, note: string, handlers: WebCheckHandlers, pictureUrl: (name: string) => string | null = () => null): CheckScreen => {
  const draft = ecosystemOnly(session.draft());
  if (!draft) throw new Error('nothing to check');
  const { web } = draft;
  const backward = new Set(backwardArrows(web));

  const draftSlot = h('div', { class: 'draft-slot' });
  const approvedSlot = h('div', { class: 'approved-slot' });
  let questionsStatus: QuestionsStatus = draft.questions ? { kind: 'ready' } : { kind: 'drafting' };
  const presentButton = h('button', { class: 'primary', disabled: true, onclick: handlers.onPresent }, 'Present to the class');
  const approveButton = h('button', {}, 'Approve web and questions');

  const refreshApproval = (): void => {
    const approved = ecosystemOnly(session.presentable());
    const ready = questionsStatus.kind === 'ready';
    // Once approved, its card replaces the draft's rather than repeating it.
    draftSlot.replaceChildren(...(approved ? [] : ready ? lessonQuestions(ecosystemOnly(session.draft())) : [questionsPlaceholder(questionsStatus) ?? '']));
    approvedSlot.replaceChildren(...lessonQuestions(approved));
    presentButton.disabled = approved === null;
    approveButton.disabled = approved !== null || !ready;
    approveButton.textContent = approved ? 'Approved' : 'Approve web and questions';
  };
  approveButton.addEventListener('click', () => {
    session.approve();
    refreshApproval();
  });

  const warnings = warningsFor(web);

  root.replaceChildren(
    checkLayout({
      board: h(
        'div',
        { class: 'reading-pair' },
        h('figure', {}, h('figcaption', {}, 'Your board'), fittedFrame(web.drawing, h('img', { src: photoUrl, alt: 'Photo of the board drawing' }))),
        h('figure', { class: 'reading' }, h('figcaption', {}, 'What was read'), fittedFrame(readingSize(web), reading(web, backward, pictureUrl))),
      ),
      facts: [
        h('h1', {}, 'Check the reading'),
        h('p', { class: 'note' }, note),
        warnings.length > 0 ? h('ul', { class: 'warnings' }, ...warnings) : null,
        h('h2', {}, 'Species'),
        h('ul', { class: 'items' }, ...web.species.map((entry) => row(entry.id, speciesRowText(entry), entry.confidence))),
        h('h2', {}, 'Who eats whom'),
        h('ul', { class: 'items' }, ...web.eats.map((arrow) => arrowRow(web, arrow, backward.has(arrow.id), handlers.onFlip))),
        web.unknownMarks.length > 0 ? h('ul', { class: 'items' }, ...web.unknownMarks.map((mark) => row(mark.id, mark.note, mark.confidence, 'unknown'))) : null,
        eventSelect(web, handlers.onEvent),
        h('p', { class: 'note' }, MODEL_NOTE),
      ],
      questions: [h('h2', {}, 'Predict questions'), draftSlot, approvedSlot],
      actions: [h('button', { class: 'quiet', onclick: handlers.onRestart }, 'Start over with a new photo'), approveButton, presentButton],
    }),
  );
  linkHighlights(root);
  refreshApproval();
  return {
    setQuestionsStatus: (status) => {
      questionsStatus = status;
      refreshApproval();
    },
  };
};
