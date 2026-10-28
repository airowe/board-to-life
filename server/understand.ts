import { validateScene } from '../src/scene/schema';
import { imageSize } from './imageSize';
import type { ModelPhoto } from './sceneReader';
import type { StubResponse } from './stub';

export type ModelRead = (photo: ModelPhoto) => Promise<unknown>;
export type ModelUnderstandRequest = { contentType: string; bytes: Uint8Array; reader: string; read: ModelRead };

const failure = (status: number, error: string, details: string[] = []): StubResponse => ({ status, body: { error, details } });

export const handleUnderstandWithModel = async (request: ModelUnderstandRequest): Promise<StubResponse> => {
  if (request.bytes.length === 0 || !request.contentType.startsWith('image/')) {
    return failure(400, 'Send a photo of the drawing (an image file).');
  }
  const size = imageSize(request.bytes);
  if (!size) return failure(400, 'Send the photo as a PNG or JPEG.');

  let raw: unknown;
  try {
    raw = await request.read({ bytes: request.bytes, contentType: request.contentType, size });
  } catch (error) {
    return failure(502, `The scene reader failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const result = validateScene(raw);
  if (!result.ok) return failure(502, 'The scene reader returned a scene that failed validation.', result.errors);
  return { status: 200, body: { stub: false, reader: request.reader, scene: result.scene } };
};
