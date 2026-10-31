import { accessHeaders, rememberAccessCode } from './access';
import { requestJson, type ApiFailure } from './api';
import { preparePhoto } from './capture/downscale';
import { sketchImage } from './capture/sketchImage';
import { describedNote, describeReading, MODEL_REQUEST_TIMEOUT_MS, readingNote } from './reading';
import { checkWebGrounding } from './ecosystem/questions';
import { validateWeb, type Web } from './ecosystem/schema';
import { flipArrow } from './ecosystem/trophic';
import type { Point } from './geometry/derive';
import { movePoint } from './geometry/edits';
import { fittedOrDrawn } from './geometry/fit';
import { checkFigureGrounding } from './geometry/questions';
import { validateFigure, type Figure } from './geometry/schema';
import { checkGrounding } from './scene/questions';
import { validateScene } from './scene/schema';
import { createEditQueue, samePoints } from './session/edits';
import { createSession, type DraftContent } from './session/store';
import { loadSubject, saveSubject } from './subjectChoice';
import type { Subject } from './subjects';
import { setUpBoardMode } from './ui/boardToggle';
import { renderCapture } from './ui/capture';
import { renderCheck, type CheckScreen, type QuestionsStatus } from './ui/check';
import { questionsFailureStatus } from './ui/questionCards';
import { renderWebCheck } from './ui/checkWeb';
import { figureQuestionsFailureStatus, renderFigureCheck } from './ui/checkFigure';
import { h } from './ui/dom';
import { renderPresent } from './ui/present';
import { renderFigurePresent } from './ui/presentFigure';
import { renderWebPresent } from './ui/presentWeb';

const PROGRESS_TICK_MS = 1000;

const requireElement = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`page is missing ${selector}`);
  return element;
};

const root = requireElement<HTMLElement>('#app');
const stubSelect = requireElement<HTMLSelectElement>('#stub-mode');
const noop = (): void => undefined;
const storage = {
  getItem: (key: string): string | null => localStorage.getItem(key),
  setItem: (key: string, value: string): void => localStorage.setItem(key, value),
};
setUpBoardMode(requireElement<HTMLButtonElement>('#board-mode'), requireElement<HTMLButtonElement>('#fullscreen'), storage);

const session = createSession();
let cleanup: () => void = noop;
let photoUrl: string | null = null;
let photoIsSketch = false;
let photoNote = '';
let checkScreen: CheckScreen | null = null;
let activeDraftId = 0;
let activeRead: AbortController | null = null;
let activeDraftRequest: AbortController | null = null;
let screenEpoch = 0;
let photoSequence = 0;
const edits = createEditQueue();
let lastDescription = '';
let subject: Subject = loadSubject(storage);

const tearDownScreen = (): void => {
  activeRead?.abort();
  activeRead = null;
  cleanup();
  cleanup = noop;
  checkScreen = null;
};

const leaveScreen = (): void => {
  screenEpoch += 1;
  tearDownScreen();
};

const accessCode = rememberAccessCode(location.search, storage);
const requestHeaders = (): Record<string, string> => ({ 'x-stub-mode': stubSelect.value, ...accessHeaders(accessCode) });

const showLoading = (message: string): void => {
  leaveScreen();
  root.replaceChildren(h('section', { class: 'loading', role: 'status' }, h('div', { class: 'spinner' }), h('p', {}, message)));
};

const showReading = (read: AbortController, headlineOverride?: string): void => {
  leaveScreen();
  activeRead = read;
  const startedAt = performance.now();
  const headline = h('p', { class: 'reading-headline' });
  const detail = h('p', { class: 'reading-detail' });
  const section = h(
    'section',
    { class: 'loading reading', role: 'status', 'aria-live': 'polite' },
    h('div', { class: 'spinner' }),
    h('div', {}, headline, detail),
    h('button', { class: 'quiet', onclick: showCapture }, 'Cancel'),
  );
  const tick = (): void => {
    const progress = describeReading(performance.now() - startedAt);
    const text = headlineOverride ?? progress.headline;
    if (headline.textContent !== text) headline.textContent = text;
    detail.textContent = progress.detail;
    section.classList.toggle('late', progress.late);
  };
  tick();
  const timer = setInterval(tick, PROGRESS_TICK_MS);
  cleanup = () => clearInterval(timer);
  root.replaceChildren(section);
};

const showError = (failure: Pick<ApiFailure, 'message' | 'details'>, retry: () => void): void => {
  leaveScreen();
  root.replaceChildren(
      h(
        'section',
        { class: 'error', role: 'alert' },
        h('h1', {}, 'That did not work'),
        h('p', {}, failure.message),
        failure.details && failure.details.length > 0 ? h('ul', { class: 'details' }, ...failure.details.map((detail) => h('li', {}, detail))) : null,
        h('div', { class: 'capture-actions' }, h('button', { class: 'primary', onclick: retry }, 'Try again'), h('button', { class: 'quiet', onclick: showCapture }, 'Start over')),
      ),
  );
};

const SCENE_UNGROUNDED = 'A drafted question cited something not in the scene.';
const WEB_UNGROUNDED = 'A drafted question cited something not in the food web.';
const FIGURE_UNGROUNDED = 'A drafted question cited something not in the figure.';

const groundQuestions = (content: DraftContent, input: unknown) => {
  if (content.subject === 'physics') return { ...checkGrounding(input, content.scene), ungrounded: SCENE_UNGROUNDED };
  if (content.subject === 'ecosystem') return { ...checkWebGrounding(input, content.web), ungrounded: WEB_UNGROUNDED };
  return { ...checkFigureGrounding(input, content.figure), ungrounded: FIGURE_UNGROUNDED };
};

const draftQuestionsBody = (content: DraftContent): string => {
  if (content.subject === 'physics') return JSON.stringify({ scene: content.scene });
  if (content.subject === 'ecosystem') return JSON.stringify({ subject: content.subject, web: content.web });
  return JSON.stringify({ subject: content.subject, figure: content.figure });
};

const draftFailureStatus = (draftSubject: Subject, failure: ApiFailure, retry: () => void): QuestionsStatus => {
  if (draftSubject === 'ecosystem') return questionsFailureStatus(failure, retry);
  if (draftSubject === 'geometry') return figureQuestionsFailureStatus(failure, retry);
  return { kind: 'failed', failure, retry };
};

const draftQuestions = async (draftId: number, content: DraftContent): Promise<void> => {
  const retry = (): void => void draftQuestions(draftId, content);
  const report = (status: QuestionsStatus): void => {
    if (draftId === activeDraftId) checkScreen?.setQuestionsStatus(status);
  };
  activeDraftRequest?.abort();
  const request = new AbortController();
  activeDraftRequest = request;
  report({ kind: 'drafting' });
  const drafted = await requestJson(
    '/api/draft-questions',
    { method: 'POST', body: draftQuestionsBody(content), headers: { 'content-type': 'application/json', ...requestHeaders() } },
    { timeoutMs: MODEL_REQUEST_TIMEOUT_MS, signal: request.signal },
  );
  if (request.signal.aborted) return;
  if (activeDraftRequest === request) activeDraftRequest = null;
  if (!drafted.ok) return report(draftFailureStatus(content.subject, drafted, retry));

  const grounded = groundQuestions(content, (drafted.data as { questions?: unknown } | null)?.questions);
  if (!grounded.ok) return report({ kind: 'failed', failure: { message: grounded.ungrounded, details: grounded.errors }, retry });
  if (session.setDraftQuestions(draftId, grounded.questions)) report({ kind: 'ready' });
};

const VALIDATION_FAILED: Record<Subject, string> = {
  physics: 'The scene that came back failed validation.',
  ecosystem: 'The food web that came back failed validation.',
  geometry: 'The figure that came back failed validation.',
};

const validateContent = (subject: Subject, data: unknown): { ok: true; content: DraftContent } | { ok: false; errors: string[] } => {
  if (subject === 'physics') {
    const scene = validateScene((data as { scene?: unknown } | null)?.scene);
    return scene.ok ? { ok: true, content: { subject, scene: scene.scene } } : scene;
  }
  if (subject === 'geometry') {
    const figure = validateFigure((data as { figure?: unknown } | null)?.figure);
    return figure.ok ? { ok: true, content: { subject, figure: fittedOrDrawn(figure.figure) } } : figure;
  }
  const web = validateWeb((data as { web?: unknown } | null)?.web);
  return web.ok ? { ok: true, content: { subject, web: web.web } } : web;
};

const understandUrl = (subject: Subject): string => (subject === 'physics' ? '/api/understand' : `/api/understand?subject=${subject}`);

const describeBody = (text: string, subject: Subject): string => JSON.stringify(subject === 'physics' ? { text } : { text, subject });

const readDrawing = async (photo: Blob, readSubject: Subject, preparedNote: string): Promise<void> => {
  const retry = (): void => void readDrawing(photo, readSubject, preparedNote);
  const read = new AbortController();
  showReading(read);
  const understood = await requestJson(
    understandUrl(readSubject),
    { method: 'POST', body: photo, headers: { 'content-type': photo.type || 'application/octet-stream', ...requestHeaders() } },
    { timeoutMs: MODEL_REQUEST_TIMEOUT_MS, signal: read.signal },
  );
  if (read.signal.aborted) return;
  activeRead = null;
  if (!understood.ok) return showError(understood, retry);

  const validated = validateContent(readSubject, understood.data);
  if (!validated.ok) return showError({ message: VALIDATION_FAILED[readSubject], details: validated.errors }, retry);

  const draftId = session.startDraft(validated.content);
  activeDraftId = draftId;
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = URL.createObjectURL(photo);
  photoIsSketch = false;
  photoNote = `${preparedNote}${readingNote(understood.data, readSubject)}`;
  showCheck();
  void draftQuestions(draftId, validated.content);
};

const describeSetup = async (text: string, describeSubject: Subject): Promise<void> => {
  lastDescription = text;
  const retry = (): void => void describeSetup(text, describeSubject);
  const read = new AbortController();
  showReading(read, 'Laying out your description…');
  const described = await requestJson(
    '/api/describe',
    { method: 'POST', body: describeBody(text, describeSubject), headers: { 'content-type': 'application/json', ...requestHeaders() } },
    { timeoutMs: MODEL_REQUEST_TIMEOUT_MS, signal: read.signal },
  );
  if (read.signal.aborted) return;
  if (!described.ok) return showError(described, retry);

  const validated = validateContent(describeSubject, described.data);
  if (!validated.ok) return showError({ message: VALIDATION_FAILED[describeSubject], details: validated.errors }, retry);

  let sketch: Blob;
  try {
    sketch = await sketchImage(validated.content);
  } catch (cause) {
    return showError({ message: cause instanceof Error ? cause.message : 'Could not draw the described setup.' }, retry);
  }
  if (read.signal.aborted) return;
  activeRead = null;

  const draftId = session.startDraft(validated.content);
  activeDraftId = draftId;
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = URL.createObjectURL(sketch);
  photoIsSketch = true;
  photoNote = describedNote(described.data, describeSubject);
  showCheck();
  void draftQuestions(draftId, validated.content);
};

const INVERTED_NOTE = 'Light ink on a dark or see-through background: the image was flipped to dark ink on white so it reads like a whiteboard. ';

const receivePhoto = async (photo: Blob, photoSubject: Subject): Promise<void> => {
  photoSequence += 1;
  const mine = photoSequence;
  const retry = (): void => void receivePhoto(photo, photoSubject);
  showLoading('Preparing the photo…');
  try {
    const prepared = await preparePhoto(photo);
    if (mine !== photoSequence) return;
    await readDrawing(prepared.photo, photoSubject, prepared.inverted ? INVERTED_NOTE : '');
  } catch (cause) {
    if (mine !== photoSequence) return;
    showError({ message: cause instanceof Error ? cause.message : 'The photo could not be prepared.' }, retry);
  }
};

function showCheck(): void {
  const url = photoUrl;
  if (!url) return showCapture();
  const current = session.draft();
  tearDownScreen();
  if (current?.subject === 'ecosystem') {
    checkScreen = renderWebCheck(root, session, url, photoNote, {
      onPresent: showPresent,
      onRestart: showCapture,
      onEvent: (event) => changeWeb({ ...current.web, event }),
      onFlip: (eatsId) => flipWebArrow(eatsId),
    });
    return;
  }
  if (current?.subject === 'geometry') {
    checkScreen = renderFigureCheck(root, session, url, photoNote, {
      onPresent: showPresent,
      onRestart: showCapture,
      onFocus: (focus) => changeFigure(current.figure, focus),
      onMovePoint: (id, to) => moveFigurePoint(id, to),
    });
    return;
  }
  checkScreen = renderCheck(root, session, url, photoNote, { onPresent: showPresent, onRestart: showCapture });
}

function changeFigure(figure: Figure, focus: Figure['focus']): void {
  const content: DraftContent = { subject: 'geometry', figure: { ...figure, focus } };
  const draftId = session.startDraft(content);
  activeDraftId = draftId;
  showCheck();
  void draftQuestions(draftId, content);
}

const redrawnSketch = (content: DraftContent): Promise<Blob | null> =>
  photoIsSketch ? sketchImage(content).catch(() => null) : Promise.resolve(null);

const useSketch = (sketch: Blob | null): void => {
  if (!sketch) return;
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = URL.createObjectURL(sketch);
};

function moveFigurePoint(id: string, to: Point): void {
  const epoch = screenEpoch;
  edits.add(async () => {
    const current = session.draft();
    if (epoch !== screenEpoch || current?.subject !== 'geometry') return;
    const moved = movePoint(current.figure, id, to);
    if (samePoints(moved.points, current.figure.points)) return;
    const sketch = await redrawnSketch({ subject: 'geometry', figure: moved });
    if (epoch !== screenEpoch) return;
    useSketch(sketch);
    changeFigure(moved, moved.focus);
  });
}

function flipWebArrow(eatsId: string): void {
  const epoch = screenEpoch;
  edits.add(async () => {
    const current = session.draft();
    if (epoch !== screenEpoch || current?.subject !== 'ecosystem') return;
    const flipped = flipArrow(current.web, eatsId);
    const sketch = await redrawnSketch({ subject: 'ecosystem', web: flipped });
    if (epoch !== screenEpoch) return;
    useSketch(sketch);
    changeWeb(flipped);
  });
}

function changeWeb(web: Web): void {
  const content: DraftContent = { subject: 'ecosystem', web };
  const draftId = session.startDraft(content);
  activeDraftId = draftId;
  showCheck();
  void draftQuestions(draftId, content);
}

function showPresent(): void {
  const lesson = session.presentable();
  if (!lesson) return showCheck();
  leaveScreen();
  if (lesson.subject === 'ecosystem') cleanup = renderWebPresent(root, lesson, photoUrl, showCheck);
  else if (lesson.subject === 'geometry') cleanup = renderFigurePresent(root, lesson, photoUrl, showCheck);
  else cleanup = renderPresent(root, lesson, photoUrl, showCheck);
}

function showCapture(): void {
  photoSequence += 1;
  leaveScreen();
  cleanup = renderCapture(root, {
    subject,
    onSubject: (picked) => {
      subject = picked;
      saveSubject(storage, picked);
    },
    onPhoto: (photo, photoSubject) => void receivePhoto(photo, photoSubject),
    onDescribe: (text, describeSubject) => void describeSetup(text, describeSubject),
    description: lastDescription,
  });
}

showCapture();
