import { checkDescription, DESCRIPTION_LIMIT } from '../capture/description';
import { DESCRIPTION_EXAMPLES } from '../capture/examples';
import { pickBoardImage } from '../capture/pickImage';
import { WEB_SAMPLES, webSampleUrl } from '../ecosystem/samples';
import { figureSampleUrl, GEOMETRY_SAMPLES } from '../geometry/samples';
import { SAMPLES, sampleUrl } from '../samples/scenes';
import { SUBJECT_LABELS, SUBJECTS, type Subject } from '../subjects';
import { h } from './dom';

type SamplePick = { url: string; title: string };

const SAMPLE_PICKS: Record<Subject, readonly SamplePick[]> = {
  physics: [
    { url: '/samples/ramp-ball-dominoes.png', title: 'Ball down a ramp into dominoes' },
    ...SAMPLES.map((sample) => ({ url: sampleUrl(sample.id), title: sample.title })),
  ],
  ecosystem: WEB_SAMPLES.map((sample) => ({ url: webSampleUrl(sample.id), title: sample.title })),
  geometry: GEOMETRY_SAMPLES.map((sample) => ({ url: figureSampleUrl(sample.id), title: sample.title })),
};

type CaptureHandlers = {
  subject: Subject;
  onSubject: (subject: Subject) => void;
  onPhoto: (photo: Blob, subject: Subject) => void;
  onDescribe: (text: string, subject: Subject) => void;
  description?: string;
};

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

export const renderCapture = (
  root: HTMLElement,
  { subject: initialSubject, onSubject, onPhoto: submitPhoto, onDescribe: submitText, description = '' }: CaptureHandlers,
): (() => void) => {
  let subject = initialSubject;
  const onPhoto = (photo: Blob): void => submitPhoto(photo, subject);
  const onDescribe = (text: string): void => submitText(text, subject);
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

  const descriptionBox = h('textarea', {
    id: 'description-input',
    class: 'description-input',
    rows: '3',
    maxlength: String(DESCRIPTION_LIMIT),
  });
  descriptionBox.value = description;
  const submitDescription = (): void => {
    const checked = checkDescription(descriptionBox.value);
    if (checked.ok) onDescribe(checked.text);
    else status.textContent = checked.error;
  };
  const examplesBox = h('div', { class: 'description-examples' });
  const sampleGrid = h('div', { class: 'sample-grid' });

  const showSubjectContent = (): void => {
    const examples = DESCRIPTION_EXAMPLES[subject];
    descriptionBox.placeholder = examples[0] ?? '';
    examplesBox.replaceChildren(
      ...examples.map((example) =>
        h(
          'button',
          {
            class: 'quiet',
            onclick: () => {
              descriptionBox.value = example;
              status.textContent = '';
              descriptionBox.focus();
            },
          },
          example,
        ),
      ),
    );
    sampleGrid.replaceChildren(
      ...SAMPLE_PICKS[subject].map((pick) =>
        h('button', { class: 'sample', onclick: () => void useSample(pick.url) }, h('img', { src: pick.url, alt: '', loading: 'lazy' }), h('span', {}, pick.title)),
      ),
    );
  };
  showSubjectContent();

  const subjectPicker = h(
    'fieldset',
    { class: 'subject-picker' },
    h('legend', {}, 'Subject'),
    ...SUBJECTS.map((option) =>
      h(
        'label',
        { class: 'subject-option' },
        h('input', {
          type: 'radio',
          name: 'subject',
          value: option,
          checked: option === subject,
          onchange: () => {
            subject = option;
            onSubject(option);
            showSubjectContent();
          },
        }),
        SUBJECT_LABELS[option],
      ),
    ),
  );

  const describeSection = h(
    'section',
    { class: 'describe', 'aria-labelledby': 'describe-heading' },
    h('h2', { id: 'describe-heading' }, 'Or describe it'),
    h('label', { class: 'note', for: 'description-input' }, 'Type the setup in a sentence or two. You check the layout before anything is shown to the class.'),
    descriptionBox,
    h('div', { class: 'capture-actions' }, h('button', { class: 'primary', onclick: submitDescription }, 'Lay it out')),
    examplesBox,
  );

  root.replaceChildren(
    h(
      'section',
      { class: 'capture' },
      h('h1', {}, 'Photograph the board'),
      h('p', { class: 'lede' }, 'Take a photo of your drawing. You check what was read before anything is shown to the class.'),
      subjectPicker,
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
      describeSection,
      h(
        'section',
        { class: 'samples', 'aria-labelledby': 'samples-heading' },
        h('h2', { id: 'samples-heading' }, 'No board to hand? Try a sample drawing'),
        sampleGrid,
      ),
    ),
  );
  return () => {
    stopStream(video);
    onDragEnd();
    for (const [name, listener] of listeners) document.removeEventListener(name, listener as EventListener);
  };
};
