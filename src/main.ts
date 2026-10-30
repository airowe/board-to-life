import { accessHeaders, rememberAccessCode } from './access';
import { requestJson, type ApiFailure } from './api';
import { preparePhoto } from './capture/downscale';
import { sketchImage } from './capture/sketchImage';
import { describedNote, describeReading, MODEL_REQUEST_TIMEOUT_MS, readingNote } from './reading';
import { checkWebGrounding } from './ecosystem/questions';
import { validateWeb, type Web } from './ecosystem/schema';
import { flipArrow } from './ecosystem/trophic';
import { checkGrounding } from './scene/questions';
import { validateScene } from './scene/schema';
import { createSession, type DraftContent } from './session/store';
import { loadSubject, saveSubject } from './subjectChoice';
import type { Subject } from './subjects';
import { setUpBoardMode } from './ui/boardToggle';
import { renderCapture } from './ui/capture';
import { renderCheck, type CheckScreen, type QuestionsStatus } from './ui/check';
import { questionsFailureStatus } from './ui/questionCards';
import { renderWebCheck } from './ui/checkWeb';
import { h } from './ui/dom';
import { renderPresent } from './ui/present';
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
setUpBoardMode(requireElement<HTMLButtonElement>('#board-mode'), requireElement<HTMLButtonElement>('#fullscreen'), localStorage);

const session = createSession();
let cleanup: () => void = noop;
let photoUrl: string | null = null;
let photoIsSketch = false;
let photoNote = '';
let preparedNote = '';
let checkScreen: CheckScreen | null = null;
let activeDraftId = 0;
let activeRead: AbortController | null = null;
let lastDescription = '';
let subject: Subject = loadSubject(localStorage);

const leaveScreen = (): void => {
  activeRead?.abort();
  activeRead = null;
  cleanup();
  cleanup = noop;
  checkScreen = null;
};

const accessCode = rememberAccessCode(location.search, {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
});
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

const groundQuestions = (content: DraftContent, input: unknown) =>
  content.subject === 'physics'
    ? { ...checkGrounding(input, content.scene), ungrounded: SCENE_UNGROUNDED }
    : { ...checkWebGrounding(input, content.web), ungrounded: WEB_UNGROUNDED };

const draftQuestionsBody = (content: DraftContent): string =>
  JSON.stringify(content.subject === 'physics' ? { scene: content.scene } : { subject: content.subject, web: content.web });

const draftQuestions = async (draftId: number, content: DraftContent): Promise<void> => {
  const retry = (): void => void draftQuestions(draftId, content);
  const report = (status: QuestionsStatus): void => {
    if (draftId === activeDraftId) checkScreen?.setQuestionsStatus(status);
  };
  report({ kind: 'drafting' });
  const drafted = await requestJson(
    '/api/draft-questions',
    { method: 'POST', body: draftQuestionsBody(content), headers: { 'content-type': 'application/json', ...requestHeaders() } },
    { timeoutMs: MODEL_REQUEST_TIMEOUT_MS },
  );
  if (!drafted.ok) return report(content.subject === 'ecosystem' ? questionsFailureStatus(drafted, retry) : { kind: 'failed', failure: drafted, retry });

  const grounded = groundQuestions(content, (drafted.data as { questions?: unknown } | null)?.questions);
  if (!grounded.ok) return report({ kind: 'failed', failure: { message: grounded.ungrounded, details: grounded.errors }, retry });
  if (session.setDraftQuestions(draftId, grounded.questions)) report({ kind: 'ready' });
};

const VALIDATION_FAILED: Record<Subject, string> = {
  physics: 'The scene that came back failed validation.',
  ecosystem: 'The food web that came back failed validation.',
};

const validateContent = (subject: Subject, data: unknown): { ok: true; content: DraftContent } | { ok: false; errors: string[] } => {
  if (subject === 'physics') {
    const scene = validateScene((data as { scene?: unknown } | null)?.scene);
    return scene.ok ? { ok: true, content: { subject, scene: scene.scene } } : scene;
  }
  const web = validateWeb((data as { web?: unknown } | null)?.web);
  return web.ok ? { ok: true, content: { subject, web: web.web } } : web;
};

const understandUrl = (subject: Subject): string => (subject === 'physics' ? '/api/understand' : `/api/understand?subject=${subject}`);

const describeBody = (text: string, subject: Subject): string => JSON.stringify(subject === 'physics' ? { text } : { text, subject });

const readDrawing = async (photo: Blob, readSubject: Subject): Promise<void> => {
  const retry = (): void => void readDrawing(photo, readSubject);
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

const receivePhoto = async (photo: Blob, photoSubject: Subject): Promise<void> => {
  showLoading('Preparing the photo…');
  const prepared = await preparePhoto(photo);
  preparedNote = prepared.inverted ? 'Light ink on a dark or see-through background: the image was flipped to dark ink on white so it reads like a whiteboard. ' : '';
  await readDrawing(prepared.photo, photoSubject);
};

function showCheck(): void {
  const url = photoUrl;
  if (!url) return showCapture();
  const current = session.draft();
  leaveScreen();
  if (current?.subject === 'ecosystem') {
    checkScreen = renderWebCheck(root, session, url, photoNote, {
      onPresent: showPresent,
      onRestart: showCapture,
      onEvent: (event) => changeWeb({ ...current.web, event }),
      onFlip: (eatsId) => void flipWebArrow(current.web, eatsId),
    });
    return;
  }
  checkScreen = renderCheck(root, session, url, photoNote, { onPresent: showPresent, onRestart: showCapture });
}

async function flipWebArrow(web: Web, eatsId: string): Promise<void> {
  const flipped = flipArrow(web, eatsId);
  if (photoIsSketch) {
    const draftId = activeDraftId;
    const sketch = await sketchImage({ subject: 'ecosystem', web: flipped }).catch(() => null);
    if (draftId !== activeDraftId) return;
    if (sketch) {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      photoUrl = URL.createObjectURL(sketch);
    }
  }
  changeWeb(flipped);
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
  cleanup = lesson.subject === 'ecosystem' ? renderWebPresent(root, lesson, photoUrl, showCheck) : renderPresent(root, lesson, photoUrl, showCheck);
}

function showCapture(): void {
  leaveScreen();
  cleanup = renderCapture(root, {
    subject,
    onSubject: (picked) => {
      subject = picked;
      saveSubject(localStorage, picked);
    },
    onPhoto: (photo, photoSubject) => void receivePhoto(photo, photoSubject),
    onDescribe: (text, describeSubject) => void describeSetup(text, describeSubject),
    description: lastDescription,
  });
}

showCapture();
