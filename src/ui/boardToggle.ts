import { BOARD_MODE_KEY, BOARD_MODE_OFF, BOARD_MODE_ON, wantsBoardMode } from '../display/boardMode';

type Storage = { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void };

const BOARD_CLASS = 'board-mode';

const remembered = (storage: Storage): string | null => {
  try {
    return storage.getItem(BOARD_MODE_KEY);
  } catch {
    return null;
  }
};

const remember = (storage: Storage, on: boolean): void => {
  try {
    storage.setItem(BOARD_MODE_KEY, on ? BOARD_MODE_ON : BOARD_MODE_OFF);
  } catch {
    // Board mode still works for this visit when the browser will not store the choice.
  }
};

const enterFullscreen = (): void => {
  if (document.fullscreenEnabled && !document.fullscreenElement) void document.documentElement.requestFullscreen().catch(() => undefined);
};

const leaveFullscreen = (): void => {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
};

// Board mode is a layout for a large classroom touchscreen: bigger type and controls, and no stray zoom, pull to
// refresh or text selection. Turning it on also asks for full screen, which a browser only grants on a tap.
export const setUpBoardMode = (toggle: HTMLButtonElement, fullscreen: HTMLButtonElement, storage: Storage): void => {
  const render = (): void => {
    const on = document.body.classList.contains(BOARD_CLASS);
    toggle.setAttribute('aria-pressed', String(on));
    toggle.textContent = on ? 'Leave board mode' : 'Board mode';
    fullscreen.hidden = !on || !document.fullscreenEnabled || document.fullscreenElement !== null;
  };
  const apply = (on: boolean): void => {
    document.body.classList.toggle(BOARD_CLASS, on);
    render();
  };

  toggle.addEventListener('click', () => {
    const on = !document.body.classList.contains(BOARD_CLASS);
    remember(storage, on);
    apply(on);
    if (on) enterFullscreen();
    else leaveFullscreen();
  });
  fullscreen.addEventListener('click', enterFullscreen);
  document.addEventListener('fullscreenchange', render);
  apply(wantsBoardMode(location.search, remembered(storage)));
};
