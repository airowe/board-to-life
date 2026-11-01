import { requestJson } from '../api';
import { cutOutWhite, hasSubject } from './cutOut';
import type { Library } from './manifest';
import { liveCandidates, type LiveState } from './source';

export const LIVE_PICTURE_CAP = 4;
// Longer than all of the server's attempts together (server/picture.ts), so the browser never abandons a retry the server is paying for.
export const PICTURE_REQUEST_TIMEOUT_MS = 130_000;
const CACHE_NAME = 'board-to-life-pictures';
const CACHE_URL_PREFIX = '/__pictures__/';
const PICTURE_ENDPOINT = '/api/picture';

export type PictureCache = {
  get: (key: string) => Promise<Blob | null>;
  put: (key: string, blob: Blob) => Promise<void>;
  delete: (key: string) => Promise<void>;
};
// `keep` is false for a stand-in (the stub, or a server with no picture model), which must never be cached.
export type DrawnPicture = { blob: Blob; keep: boolean };

export type LivePictures = {
  request: (names: string[]) => void;
  state: LiveState;
  image: (key: string) => CanvasImageSource | null;
  onChange: (listener: () => void) => () => void;
};

type Deps = {
  library: Library;
  draw: (subject: string) => Promise<DrawnPicture>;
  cache: PictureCache;
  decode: (blob: Blob) => Promise<CanvasImageSource>;
};

type Entry = { state: 'pending' | 'failed' } | { state: 'ready'; image: CanvasImageSource };

const quietly = async <T>(attempt: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await attempt();
  } catch {
    return fallback;
  }
};

export const createLivePictures = ({ library, draw, cache, decode }: Deps): LivePictures => {
  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  const notify = (): void => listeners.forEach((listener) => listener());

  const drawFresh = async (key: string): Promise<CanvasImageSource> => {
    const drawn = await draw(key);
    const image = await decode(drawn.blob);
    if (drawn.keep) void quietly(() => cache.put(key, drawn.blob), undefined);
    return image;
  };

  // A cached picture that no longer decodes (blank, or kept by an older build) is dropped and drawn fresh, once.
  const obtain = async (key: string): Promise<CanvasImageSource> => {
    const cached = await quietly(() => cache.get(key), null);
    if (!cached) return drawFresh(key);
    try {
      return await decode(cached);
    } catch {
      await quietly(() => cache.delete(key), undefined);
      return drawFresh(key);
    }
  };

  const start = async (key: string): Promise<void> => {
    entries.set(key, { state: 'pending' });
    try {
      entries.set(key, { state: 'ready', image: await obtain(key) });
    } catch {
      entries.set(key, { state: 'failed' });
    }
    notify();
  };

  return {
    request: (names) => {
      for (const key of liveCandidates(names, library, LIVE_PICTURE_CAP)) {
        if (!entries.has(key)) void start(key);
      }
    },
    state: (key) => entries.get(key)?.state ?? 'none',
    image: (key) => {
      const entry = entries.get(key);
      return entry?.state === 'ready' ? entry.image : null;
    },
    onChange: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
};

export const browserCache = (): PictureCache => {
  const open = (): Promise<Cache> => caches.open(CACHE_NAME);
  const urlFor = (key: string): string => `${CACHE_URL_PREFIX}${encodeURIComponent(key)}`;
  return {
    get: (key) =>
      quietly(async () => {
        const hit = await (await open()).match(urlFor(key));
        return hit ? await hit.blob() : null;
      }, null),
    put: (key, blob) =>
      quietly(async () => {
        await (await open()).put(urlFor(key), new Response(blob, { headers: { 'content-type': blob.type || 'image/png' } }));
      }, undefined),
    delete: (key) =>
      quietly(async () => {
        await (await open()).delete(urlFor(key));
      }, undefined),
  };
};

const base64ToBlob = (base64: string): Blob => {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: 'image/png' });
};

export const drawPicture =
  (headers: () => Record<string, string>, fetchImpl?: typeof fetch) =>
  async (subject: string): Promise<DrawnPicture> => {
    const result = await requestJson(
      PICTURE_ENDPOINT,
      { method: 'POST', body: JSON.stringify({ subject }), headers: { 'content-type': 'application/json', ...headers() } },
      { timeoutMs: PICTURE_REQUEST_TIMEOUT_MS, ...(fetchImpl ? { fetchImpl } : {}) },
    );
    if (!result.ok) throw new Error(result.message);
    const data = result.data as { image?: unknown; stub?: unknown } | null;
    const image = data?.image;
    if (typeof image !== 'string' || image === '') throw new Error('The picture response had no image.');
    return { blob: base64ToBlob(image), keep: data?.stub !== true };
  };

const scratchCanvas = (width: number, height: number): OffscreenCanvas | HTMLCanvasElement => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

export const decodeCutOut = async (blob: Blob): Promise<CanvasImageSource> => {
  const bitmap = await createImageBitmap(blob);
  const canvas = scratchCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (!context) throw new Error('No canvas available to cut the picture out.');
  context.drawImage(bitmap, 0, 0);
  const source = context.getImageData(0, 0, bitmap.width, bitmap.height);
  const cut = cutOutWhite({ data: source.data, width: source.width, height: source.height });
  bitmap.close();
  if (!hasSubject(cut)) throw new Error('The picture came out blank.');
  context.putImageData(new ImageData(new Uint8ClampedArray(cut.data), cut.width, cut.height), 0, 0);
  return canvas;
};
