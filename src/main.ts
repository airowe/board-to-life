import { requestJson, type ApiFailure } from './api';
import { preparePhoto } from './capture/downscale';
import { describeReading, MODEL_REQUEST_TIMEOUT_MS, readingNote } from './reading';
import { checkGrounding } from './scene/questions';
import { validateScene, type Scene } from './scene/schema';
import { createSession } from './session/store';
import { renderCapture } from './ui/capture';
import { renderCheck, type CheckScreen, type QuestionsStatus } from './ui/check';
import { h } from './ui/dom';
import { renderPresent } from './ui/present';

const PROGRESS_TICK_MS = 1000;

const requireElement = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`page is missing ${selector}`);
  return element;
};

const root = requireElement<HTMLElement>('#app');
const stubSelect = requireElement<HTMLSelectElement>('#stub-mode');
const noop = (): void => undefined;

const session = createSession();
let cleanup: () => void = noop;
let photoUrl: string | null = null;
let photoNote = '';
let checkScreen: CheckScreen | null = null;
let activeDraftId = 0;
let activeRead: AbortController | null = null;

const leaveScreen = (): void => {
  activeRead?.abort();
  activeRead = null;
  cleanup();
  cleanup = noop;
  checkScreen = null;
};

const stubHeaders = (): Record<string, string> => ({ 'x-stub-mode': stubSelect.value });

const showLoading = (message: string): void => {
  leaveScreen();
  root.replaceChildren(h('section', { class: 'loading', role: 'status' }, h('div', { class: 'spinner' }), h('p', {}, message)));
};

const showReading = (read: AbortController): void => {
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
    if (headline.textContent !== progress.headline) headline.textContent = progress.headline;
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

const draftQuestions = async (draftId: number, scene: Scene): Promise<void> => {
  const retry = (): void => void draftQuestions(draftId, scene);
  const report = (status: QuestionsStatus): void => {
    if (draftId === activeDraftId) checkScreen?.setQuestionsStatus(status);
  };
  report({ kind: 'drafting' });
  const drafted = await requestJson(
    '/api/draft-questions',
    { method: 'POST', body: JSON.stringify({ scene }), headers: { 'content-type': 'application/json', ...stubHeaders() } },
    { timeoutMs: MODEL_REQUEST_TIMEOUT_MS },
  );
  if (!drafted.ok) return report({ kind: 'failed', failure: drafted, retry });

  const questions = checkGrounding((drafted.data as { questions?: unknown } | null)?.questions, scene);
  if (!questions.ok) {
    return report({ kind: 'failed', failure: { message: 'A drafted question cited something not in the scene.', details: questions.errors }, retry });
  }
  if (session.setDraftQuestions(draftId, questions.questions)) report({ kind: 'ready' });
};

const readDrawing = async (photo: Blob): Promise<void> => {
  const retry = (): void => void readDrawing(photo);
  const read = new AbortController();
  showReading(read);
  const understood = await requestJson(
    '/api/understand',
    { method: 'POST', body: photo, headers: { 'content-type': photo.type || 'application/octet-stream', ...stubHeaders() } },
    { timeoutMs: MODEL_REQUEST_TIMEOUT_MS, signal: read.signal },
  );
  if (read.signal.aborted) return;
  activeRead = null;
  if (!understood.ok) return showError(understood, retry);

  const scene = validateScene((understood.data as { scene?: unknown } | null)?.scene);
  if (!scene.ok) return showError({ message: 'The scene that came back failed validation.', details: scene.errors }, retry);

  const draftId = session.startDraft(scene.scene);
  activeDraftId = draftId;
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = URL.createObjectURL(photo);
  photoNote = readingNote(understood.data);
  showCheck();
  void draftQuestions(draftId, scene.scene);
};

const receivePhoto = async (photo: Blob): Promise<void> => {
  showLoading('Preparing the photo…');
  await readDrawing(await preparePhoto(photo));
};

function showCheck(): void {
  const url = photoUrl;
  if (!url) return showCapture();
  leaveScreen();
  checkScreen = renderCheck(root, session, url, photoNote, { onPresent: showPresent, onRestart: showCapture });
}

function showPresent(): void {
  const lesson = session.presentable();
  if (!lesson) return showCheck();
  leaveScreen();
  cleanup = renderPresent(root, lesson, showCheck);
}

function showCapture(): void {
  leaveScreen();
  cleanup = renderCapture(root, { onPhoto: (photo) => void receivePhoto(photo) });
}

showCapture();
