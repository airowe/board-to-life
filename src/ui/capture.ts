import { h } from './dom';

const SAMPLE_URL = '/samples/ramp-ball-dominoes.png';

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

  const useSample = async (): Promise<void> => {
    const response = await fetch(SAMPLE_URL);
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
        h('button', { class: 'quiet', onclick: () => void useSample() }, 'Use the sample drawing'),
      ),
      video,
      snap,
      status,
    ),
  );
  return () => stopStream(video);
};
