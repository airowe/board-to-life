import { validateWeb } from '../src/ecosystem/schema';
import { validateFigure } from '../src/geometry/schema';
import { obeyWrittenValues } from './figureReader';
import { validateScene } from '../src/scene/schema';
import { imageSize } from './imageSize';
import { failureReason, type ModelPhoto } from './sceneReader';
import type { StubResponse } from './stub';

export type ModelRead = (photo: ModelPhoto) => Promise<unknown>;
export type ModelUnderstandRequest = { contentType: string; bytes: Uint8Array; reader: string; read: ModelRead };

const failure = (status: number, error: string, details: string[] = []): StubResponse => ({ status, body: { error, details } });

const SCENE_READER = 'scene reader';
const WEB_READER = 'food web reader';
const FIGURE_READER = 'figure reader';

const readPhoto = async (request: ModelUnderstandRequest, reader: string): Promise<{ raw: unknown } | { failed: StubResponse }> => {
  if (request.bytes.length === 0 || !request.contentType.startsWith('image/')) {
    return { failed: failure(400, 'Send a photo of the drawing (an image file).') };
  }
  const size = imageSize(request.bytes);
  if (!size) return { failed: failure(400, 'Send the photo as a PNG or JPEG.') };
  try {
    return { raw: await request.read({ bytes: request.bytes, contentType: request.contentType, size }) };
  } catch (error) {
    return { failed: failure(502, `The ${reader} failed: ${failureReason(error)}`) };
  }
};

export const handleUnderstandWithModel = async (request: ModelUnderstandRequest): Promise<StubResponse> => {
  const read = await readPhoto(request, SCENE_READER);
  if ('failed' in read) return read.failed;
  const result = validateScene(read.raw);
  if (!result.ok) return failure(502, 'The scene reader returned a scene that failed validation.', result.errors);
  return { status: 200, body: { stub: false, reader: request.reader, scene: result.scene } };
};

export const handleUnderstandWebWithModel = async (request: ModelUnderstandRequest): Promise<StubResponse> => {
  const read = await readPhoto(request, WEB_READER);
  if ('failed' in read) return read.failed;
  const result = validateWeb(read.raw);
  if (!result.ok) return failure(502, 'The food web reader returned a web that failed validation.', result.errors);
  return { status: 200, body: { stub: false, reader: request.reader, web: result.web } };
};

export const handleUnderstandFigureWithModel = async (request: ModelUnderstandRequest): Promise<StubResponse> => {
  const read = await readPhoto(request, FIGURE_READER);
  if ('failed' in read) return read.failed;
  const result = validateFigure(read.raw);
  if (!result.ok) return failure(502, 'The figure reader returned a figure that failed validation.', result.errors);
  return { status: 200, body: { stub: false, reader: request.reader, figure: obeyWrittenValues(result.figure) } };
};
