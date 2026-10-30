import { normaliseBoard } from './boardInk';

export const MAX_LONG_EDGE = 1600;
const JPEG_QUALITY = 0.88;

export type Size = { width: number; height: number };
// inverted: the image was light ink on a dark board and has been turned into dark ink on a light one.
export type PreparedPhoto = { photo: Blob; inverted: boolean };

export const fitWithin = (width: number, height: number, maxLongEdge: number): Size => {
  const scale = Math.min(1, maxLongEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
};

// Decoding with imageOrientation 'from-image' applies the EXIF rotation, so the
// pixels sent to the reader and shown on the check screen are upright.
export const preparePhoto = async (photo: Blob): Promise<PreparedPhoto> => {
  const unchanged = { photo, inverted: false };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(photo, { imageOrientation: 'from-image' });
  } catch {
    return unchanged;
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_LONG_EDGE);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    return unchanged;
  }
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const pixels = context.getImageData(0, 0, width, height);
  const board = normaliseBoard(pixels.data);
  context.putImageData(new ImageData(new Uint8ClampedArray(board.data), width, height), 0, 0);
  const encoded = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  return encoded ? { photo: encoded, inverted: board.inverted } : unchanged;
};
