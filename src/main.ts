import { requestJson, type ApiFailure } from './api';
import { checkGrounding } from './scene/questions';
import { validateScene } from './scene/schema';
import { createSession } from './session/store';
import { renderCapture } from './ui/capture';
import { renderCheck } from './ui/check';
import { h } from './ui/dom';
import { renderPresent } from './ui/present';

const REQUEST_TIMEOUT_MS = 8000;

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

const leaveScreen = (): void => {
  cleanup();
  cleanup = noop;
};

const stubHeaders = (): Record<string, string> => ({ 'x-stub-mode': stubSelect.value });

const showLoading = (message: string): void => {
  leaveScreen();
  root.replaceChildren(h('section', { class: 'loading', role: 'status' }, h('div', { class: 'spinner' }), h('p', {}, message)));
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

const readDrawing = async (photo: Blob): Promise<void> => {
  const retry = (): void => void readDrawing(photo);
  showLoading('Reading the drawing…');
  const understood = await requestJson(
    '/api/understand',
    { method: 'POST', body: photo, headers: { 'content-type': photo.type || 'application/octet-stream', ...stubHeaders() } },
    { timeoutMs: REQUEST_TIMEOUT_MS },
  );
  if (!understood.ok) return showError(understood, retry);

  const scene = validateScene((understood.data as { scene?: unknown } | null)?.scene);
  if (!scene.ok) return showError({ message: 'The scene that came back failed validation.', details: scene.errors }, retry);

  showLoading('Drafting predict questions…');
  const drafted = await requestJson(
    '/api/draft-questions',
    { method: 'POST', body: JSON.stringify({ scene: scene.scene }), headers: { 'content-type': 'application/json', ...stubHeaders() } },
    { timeoutMs: REQUEST_TIMEOUT_MS },
  );
  if (!drafted.ok) return showError(drafted, retry);

  const questions = checkGrounding((drafted.data as { questions?: unknown } | null)?.questions, scene.scene);
  if (!questions.ok) return showError({ message: 'A drafted question cited something not in the scene.', details: questions.errors }, retry);

  session.setDraft({ scene: scene.scene, questions: questions.questions });
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = URL.createObjectURL(photo);
  showCheck();
};

function showCheck(): void {
  const url = photoUrl;
  if (!url) return showCapture();
  leaveScreen();
  renderCheck(root, session, url, { onPresent: showPresent, onRestart: showCapture });
}

function showPresent(): void {
  const lesson = session.presentable();
  if (!lesson) return showCheck();
  leaveScreen();
  cleanup = renderPresent(root, lesson, showCheck);
}

function showCapture(): void {
  leaveScreen();
  cleanup = renderCapture(root, { onPhoto: (photo) => void readDrawing(photo) });
}

showCapture();
