export type Rgba = { data: Uint8ClampedArray; width: number; height: number };

export const WHITE_TOLERANCE = 26;
// A cut-out with less than this share of its pixels left showing is blank (a stand-in or a failed drawing), not a subject.
export const MIN_SUBJECT_SHARE = 0.01;
const CHANNELS = 4;
const MAX_CHANNEL = 255;
const COLOUR_CHANNELS = 3;
const CLEAR = 0;

const isNearWhite = (data: Uint8ClampedArray, offset: number): boolean => {
  for (let channel = 0; channel < COLOUR_CHANNELS; channel += 1) {
    if (MAX_CHANNEL - (data[offset + channel] ?? 0) > WHITE_TOLERANCE) return false;
  }
  return true;
};

export const cutOutWhite = (image: Rgba): Rgba => {
  const { width, height } = image;
  const data = Uint8ClampedArray.from(image.data);
  const visited = new Uint8Array(width * height);
  const stack: number[] = [];

  const visit = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = y * width + x;
    if (visited[index] === 1 || !isNearWhite(data, index * CHANNELS)) return;
    visited[index] = 1;
    stack.push(index);
  };

  visit(0, 0);
  visit(width - 1, 0);
  visit(0, height - 1);
  visit(width - 1, height - 1);

  while (stack.length > 0) {
    const index = stack.pop() as number;
    data[index * CHANNELS + COLOUR_CHANNELS] = CLEAR;
    const x = index % width;
    const y = Math.floor(index / width);
    visit(x - 1, y);
    visit(x + 1, y);
    visit(x, y - 1);
    visit(x, y + 1);
  }

  return { data, width, height };
};

export const hasSubject = (image: Rgba): boolean => {
  const pixels = image.width * image.height;
  let showing = 0;
  for (let index = 0; index < pixels; index += 1) if ((image.data[index * CHANNELS + COLOUR_CHANNELS] ?? CLEAR) !== CLEAR) showing += 1;
  return pixels > 0 && showing >= pixels * MIN_SUBJECT_SHARE;
};
