import { pickBoardImage } from '../capture/pickImage';
import { SAMPLES, sampleUrl } from '../samples/scenes';
import { h } from './dom';

const SAMPLE_PICKS = [
  { url: '/samples/ramp-ball-dominoes.png', title: 'Ball down a ramp into dominoes' },
  ...SAMPLES.map((sample) => ({ url: sampleUrl(sample.id), title: sample.title })),
];

type CaptureHandlers = { onPhoto: (photo: Blob) => void };

const stopStream = (video: HTMLVideoElement): void => {
  const stream = video.srcObject;
  if (stream instanceof MediaStream) for (const track of stream.getTracks()) track.stop();
  video.srcObject = null;
};

const grabFrame = (video: HTMLVideoElement): Promise<Blob | null> => {
  const canvas = h('canvas', { width: String(video.videoWidth), height: String(video.videoHeight) });
  canvas.getContext('2d')?.drawImage(video, 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
};

export const renderCapture = (root: HTMLElement, { onPhoto }: CaptureHandlers): (() => void) => {
  const status = h('p', { class: 'status', role: 'status' });
  const video = h('video', { class: 'webcam', playsinline: true, muted: true, hidden: true });
  const snap = h('button', { class: 'primary', hidden: true }, 'Take photo');

  const fileInput = h('input', {
    type: 'file',
    accept: 'image/*',
    capture: 'environment',
    id: 'photo-input',
    onchange: () => {
      const file = fileInput.files?.[0];
      if (file) onPhoto(file);
    },
  });

  const startWebcam = async (): Promise<void> => {
    status.textContent = '';
    if (!navigator.mediaDevices?.getUserMedia) {
      status.textContent = 'This browser cannot open a camera here. Upload a photo instead.';
      return;
    }
    try {
      video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      video.hidden = false;
      snap.hidden = false;
      await video.play();
    } catch (cause) {
      const name = cause instanceof DOMException ? cause.name : '';
      status.textContent =
        name === 'NotAllowedError'
          ? 'Camera permission was refused. Allow the camera, or upload a photo instead.'
          : 'No camera could be opened. Upload a photo instead.';
    }
  };

  snap.addEventListener('click', async () => {
    const frame = await grabFrame(video);
    stopStream(video);
    if (frame) onPhoto(frame);
    else status.textContent = 'Could not take a photo from the camera. Try again or upload one.';
  });

  const takeBoardImage = (files: readonly File[]): void => {
    const picked = pickBoardImage(files);
    if (picked.ok) onPhoto(picked.file);
    else status.textContent = picked.reason;
  };
  const boardInput = h('input', {
    type: 'file',
    accept: 'image/png,image/jpeg,image/webp,image/gif,image/bmp',
    id: 'board-input',
    onchange: () => takeBoardImage(Array.from(boardInput.files ?? [])),
  });
  const onPaste = (event: ClipboardEvent): void => {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (files.length === 0) return;
    event.preventDefault();
    takeBoardImage(files);
  };
  const onDragOver = (event: DragEvent): void => {
    event.preventDefault();
    document.body.classList.add('dropping');
  };
  const onDragEnd = (): void => document.body.classList.remove('dropping');
  const onDrop = (event: DragEvent): void => {
    event.preventDefault();
    onDragEnd();
    takeBoardImage(Array.from(event.dataTransfer?.files ?? []));
  };
  const listeners = [
    ['paste', onPaste],
    ['dragover', onDragOver],
    ['dragleave', onDragEnd],
    ['drop', onDrop],
  ] as const;
  for (const [name, listener] of listeners) document.addEventListener(name, listener as EventListener);

  const useSample = async (url: string): Promise<void> => {
    const response = await fetch(url);
    onPhoto(await response.blob());
  };

  root.replaceChildren(
    h(
      'section',
      { class: 'capture' },
      h('h1', {}, 'Photograph the board'),
      h('p', { class: 'lede' }, 'Take a photo of your drawing. You check what was read before anything is shown to the class.'),
      h(
        'div',
        { class: 'capture-actions' },
        h('label', { class: 'primary file', for: 'photo-input' }, 'Upload a photo', fileInput),
        h('button', { onclick: () => void startWebcam() }, 'Use the webcam'),
      ),
      h(
        'div',
        { class: 'board-import' },
        h('label', { class: 'file', for: 'board-input' }, 'Bring in a board image', boardInput),
        h('p', { class: 'note' }, 'From a digital whiteboard: export the page as PNG or JPG, then pick it, drop it here, or paste a screenshot.'),
      ),
      video,
      snap,
      status,
      h(
        'section',
        { class: 'samples', 'aria-labelledby': 'samples-heading' },
        h('h2', { id: 'samples-heading' }, 'No board to hand? Try a sample drawing'),
        h(
          'div',
          { class: 'sample-grid' },
          ...SAMPLE_PICKS.map((pick) =>
            h('button', { class: 'sample', onclick: () => void useSample(pick.url) }, h('img', { src: pick.url, alt: '', loading: 'lazy' }), h('span', {}, pick.title)),
          ),
        ),
      ),
    ),
  );
  return () => {
    stopStream(video);
    onDragEnd();
    for (const [name, listener] of listeners) document.removeEventListener(name, listener as EventListener);
  };
};
