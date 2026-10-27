import { handleUnderstand } from '../../server/stub';
import type { SceneReader } from './replay';

const field = (body: unknown, name: string): unknown =>
  typeof body === 'object' && body !== null && name in body ? (body as Record<string, unknown>)[name] : undefined;

export const stubReader: SceneReader = async (photo) => {
  const response = await handleUnderstand({ mode: 'ok', delayMs: 0, contentType: photo.contentType, bytes: photo.bytes.length });
  if (response.status !== 200) throw new Error(String(field(response.body, 'error') ?? `status ${response.status}`));
  return field(response.body, 'scene');
};

export const READERS: Record<string, SceneReader> = { stub: stubReader };
