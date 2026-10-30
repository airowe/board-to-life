import { isLink, type Scene, type SceneItem } from '../scene/schema';
import { cartWheels } from '../scene/cart';
import { linkPoints } from '../scene/linkPoints';
import type { ApprovedLesson, ApprovedPhysicsLesson, Draft, PhysicsDraft, Session } from '../session/store';
import { h, s } from './dom';
import { questionCard, questionsPlaceholder, type CheckScreen, type QuestionsStatus } from './questionCards';

export const LOW_CONFIDENCE = 0.7;

export type { CheckScreen, QuestionsStatus };

type CheckHandlers = { onPresent: () => void; onRestart: () => void };

export const percent = (value: number): string => `${Math.round(value * 100)}%`;

const centre = (item: SceneItem, scene: Scene): { x: number; y: number } => {
  if (item.kind === 'ramp') return { x: (item.x1 + item.x2) / 2, y: (item.y1 + item.y2) / 2 };
  if (isLink(item)) {
    const from = scene.items.find((other) => other.id === item.from);
    return from ? centre(from, scene) : { x: 0, y: 0 };
  }
  return { x: item.x, y: item.y };
};

const shapeFor = (item: SceneItem, scene: Scene): SVGElement => {
  switch (item.kind) {
    case 'ball':
    case 'pulley':
      return s('circle', { cx: item.x, cy: item.y, r: item.radius });
    case 'pivot':
      return s('circle', { cx: item.x, cy: item.y, r: 8 });
    case 'ramp':
      return s('line', { x1: item.x1, y1: item.y1, x2: item.x2, y2: item.y2 });
    case 'rope':
    case 'spring': {
      const at = (id: string) => {
        const found = scene.items.find((other) => other.id === id);
        return found ? centre(found, scene) : null;
      };
      const points = linkPoints(item, at);
      return points.length === 0 ? s('g') : s('polyline', { points: points.map((point) => `${point.x},${point.y}`).join(' ') });
    }
    case 'cart':
      return s(
        'g',
        {},
        s('rect', {
          x: item.x - item.width / 2,
          y: item.y - item.height / 2,
          width: item.width,
          height: item.height,
          transform: `rotate(${(item.angle * 180) / Math.PI} ${item.x} ${item.y})`,
        }),
        ...cartWheels(item).map((wheel) => s('circle', { cx: wheel.x, cy: wheel.y, r: item.wheelRadius })),
      );
    default: {
      const angle = 'angle' in item ? (item.angle * 180) / Math.PI : 0;
      return s('rect', {
        x: item.x - item.width / 2,
        y: item.y - item.height / 2,
        width: item.width,
        height: item.height,
        transform: `rotate(${angle} ${item.x} ${item.y})`,
      });
    }
  }
};

const overlay = (scene: Scene): SVGElement => {
  const { width, height } = scene.drawing;
  const items = scene.items.map((item) => {
    const low = item.confidence < LOW_CONFIDENCE;
    const { x, y } = centre(item, scene);
    return s(
      'g',
      { class: `overlay-item${low ? ' low' : ''}`, 'data-id': item.id },
      shapeFor(item, scene),
      low ? s('text', { x: x + 14, y: y - 70, class: 'badge' }, `? ${percent(item.confidence)}`) : null,
    );
  });
  const unknown = scene.unknownMarks.map((mark) =>
    s(
      'g',
      { class: 'overlay-unknown', 'data-id': mark.id },
      s('rect', { x: mark.x - mark.width / 2, y: mark.y - mark.height / 2, width: mark.width, height: mark.height }),
      s('text', { x: mark.x - mark.width / 2, y: mark.y + mark.height / 2 + 30, class: 'badge' }, 'Not understood'),
    ),
  );
  return s('svg', { class: 'overlay', viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: 'none' }, ...items, ...unknown);
};

const itemRow = (id: string, kind: string, confidence: number, extraClass = ''): HTMLElement => {
  const low = confidence < LOW_CONFIDENCE;
  return h(
    'li',
    { class: `item-row${low ? ' low' : ''} ${extraClass}`.trim(), 'data-id': id },
    h('span', { class: 'kind' }, kind),
    h('span', { class: 'id' }, id),
    h('span', { class: 'confidence' }, low ? `check · ${percent(confidence)}` : percent(confidence)),
  );
};

const physicsOnly = <T extends Draft | ApprovedLesson>(lesson: T | null): Extract<T, { subject: 'physics' }> | null => {
  if (lesson && lesson.subject !== 'physics') throw new Error(`the check screen cannot show a ${lesson.subject} lesson yet`);
  return lesson as Extract<T, { subject: 'physics' }> | null;
};

const lessonQuestions = (lesson: PhysicsDraft | ApprovedPhysicsLesson | null): HTMLElement[] =>
  lesson?.questions ? lesson.questions.map((question) => questionCard(question, lesson.status)) : [];

export const linkHighlights = (root: HTMLElement): void => {
  root.querySelectorAll<HTMLElement>('.item-row').forEach((row) => {
    const target = root.querySelector(`.overlay [data-id="${CSS.escape(row.dataset.id ?? '')}"]`);
    row.addEventListener('mouseenter', () => target?.classList.add('hover'));
    row.addEventListener('mouseleave', () => target?.classList.remove('hover'));
  });
};

export const renderCheck = (root: HTMLElement, session: Session, photoUrl: string, note: string, handlers: CheckHandlers): CheckScreen => {
  const draft = physicsOnly(session.draft());
  if (!draft) throw new Error('nothing to check');
  const { scene } = draft;
  const lowItems = scene.items.filter((item) => item.confidence < LOW_CONFIDENCE);

  const draftSlot = h('div', { class: 'draft-slot' });
  const approvedSlot = h('div', { class: 'approved-slot' });
  let questionsStatus: QuestionsStatus = draft.questions ? { kind: 'ready' } : { kind: 'drafting' };
  const presentButton = h('button', { class: 'primary', disabled: true, onclick: handlers.onPresent }, 'Present to the class');
  const approveButton = h('button', {}, 'Approve scene and questions');

  const refreshApproval = (): void => {
    const approved = physicsOnly(session.presentable());
    const ready = questionsStatus.kind === 'ready';
    draftSlot.replaceChildren(...(ready ? lessonQuestions(physicsOnly(session.draft())) : [questionsPlaceholder(questionsStatus) ?? '']));
    approvedSlot.replaceChildren(...lessonQuestions(approved));
    presentButton.disabled = approved === null;
    approveButton.disabled = approved !== null || !ready;
    approveButton.textContent = approved ? 'Approved' : 'Approve scene and questions';
  };
  approveButton.addEventListener('click', () => {
    session.approve();
    refreshApproval();
  });

  const warnings = [
    lowItems.length > 0 &&
      h('li', { class: 'warn' }, `${lowItems.length} item${lowItems.length === 1 ? '' : 's'} below ${percent(LOW_CONFIDENCE)} confidence: ${lowItems.map((item) => item.id).join(', ')}. Check against the photo.`),
    ...scene.unknownMarks.map((mark) =>
      h('li', { class: 'unknown' }, `${mark.note}. Not understood, so it will not be animated.`),
    ),
  ].filter((entry): entry is HTMLLIElement => entry instanceof HTMLLIElement);

  root.replaceChildren(
    h(
      'section',
      { class: 'check' },
      h('div', { class: 'photo-frame' }, h('img', { src: photoUrl, alt: 'Photo of the board drawing' }), overlay(scene)),
      h(
        'aside',
        { class: 'panel' },
        h('h1', {}, 'Check the reading'),
        h('p', { class: 'note' }, note),
        warnings.length > 0 ? h('ul', { class: 'warnings' }, ...warnings) : null,
        h(
          'ul',
          { class: 'items' },
          ...scene.items.map((item) => itemRow(item.id, item.kind, item.confidence)),
          ...scene.unknownMarks.map((mark) => itemRow(mark.id, 'unknown', mark.confidence, 'unknown')),
        ),
        h('h2', {}, 'Predict questions'),
        draftSlot,
        approvedSlot,
        h('div', { class: 'panel-actions' }, approveButton, presentButton),
        h('button', { class: 'quiet', onclick: handlers.onRestart }, 'Start over with a new photo'),
      ),
    ),
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
