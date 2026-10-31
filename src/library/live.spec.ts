import { describe, expect, it, vi } from 'vitest';
import { createLivePictures, LIVE_PICTURE_CAP, type PictureCache } from './live';
import type { Library } from './manifest';

const library: Library = {
  entries: [
    { id: 'fox-rest', subject: 'fox', pose: 'rest', group: 'organism', aliases: [], habitat: null, zone: null, file: 'fox.png', width: 10, height: 10 },
  ],
};

const PNG = new Blob(['png'], { type: 'image/png' });
const IMAGE = { tag: 'cut-out' } as unknown as CanvasImageSource;
const NAMES = ['axolotl', 'quokka', 'pangolin', 'narwhal', 'okapi', 'tapir'];

const emptyCache = (): PictureCache => ({ get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(undefined) });
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const setUp = (overrides: { draw?: (s: string) => Promise<Blob>; cache?: PictureCache } = {}) => {
  const draw = vi.fn(overrides.draw ?? (() => Promise.resolve(PNG)));
  const cache = overrides.cache ?? emptyCache();
  const decode = vi.fn().mockResolvedValue(IMAGE);
  const pictures = createLivePictures({ library, draw, cache, decode });
  return { pictures, draw, cache, decode };
};

describe('createLivePictures', () => {
  it('requests at most 4 draws', async () => {
    const { pictures, draw } = setUp();
    pictures.request(NAMES);
    await settle();
    expect(LIVE_PICTURE_CAP).toBe(4);
    expect(draw.mock.calls.map((call) => call[0])).toEqual(NAMES.slice(0, LIVE_PICTURE_CAP));
  });

  it('does not draw a name twice across calls', async () => {
    const { pictures, draw } = setUp();
    pictures.request(['axolotl']);
    await settle();
    pictures.request(['Axolotl', 'quokka']);
    await settle();
    expect(draw.mock.calls.map((call) => call[0])).toEqual(['axolotl', 'quokka']);
  });

  it('does not draw a subject the library already has', async () => {
    const { pictures, draw } = setUp();
    pictures.request(['fox']);
    await settle();
    expect(draw).not.toHaveBeenCalled();
    expect(pictures.state('fox')).toBe('none');
  });

  it('uses the cached blob without drawing', async () => {
    const cache = { get: vi.fn().mockResolvedValue(PNG), put: vi.fn() };
    const { pictures, draw, decode } = setUp({ cache });
    pictures.request(['axolotl']);
    await settle();
    expect(draw).not.toHaveBeenCalled();
    expect(decode).toHaveBeenCalledWith(PNG);
    expect(pictures.state('axolotl')).toBe('ready');
    expect(pictures.image('axolotl')).toBe(IMAGE);
  });

  it('keeps a drawn picture in the cache', async () => {
    const { pictures, cache } = setUp();
    pictures.request(['axolotl']);
    await settle();
    expect(cache.put).toHaveBeenCalledWith('axolotl', PNG);
  });

  it('a throwing cache still draws and becomes ready', async () => {
    const cache: PictureCache = {
      get: vi.fn().mockRejectedValue(new Error('no cache')),
      put: vi.fn().mockRejectedValue(new Error('no cache')),
    };
    const { pictures, draw } = setUp({ cache });
    pictures.request(['axolotl']);
    await settle();
    expect(draw).toHaveBeenCalledTimes(1);
    expect(pictures.state('axolotl')).toBe('ready');
  });

  it('a failed draw marks the key failed and notifies', async () => {
    const { pictures } = setUp({ draw: () => Promise.reject(new Error('boom')) });
    const listener = vi.fn();
    pictures.onChange(listener);
    pictures.request(['axolotl']);
    await settle();
    expect(pictures.state('axolotl')).toBe('failed');
    expect(pictures.image('axolotl')).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('state is pending while drawing, then ready with a notification', async () => {
    let finish: (blob: Blob) => void = () => undefined;
    const { pictures } = setUp({ draw: () => new Promise<Blob>((resolve) => (finish = resolve)) });
    const listener = vi.fn();
    pictures.onChange(listener);
    expect(pictures.state('axolotl')).toBe('none');
    pictures.request(['axolotl']);
    await settle();
    expect(pictures.state('axolotl')).toBe('pending');
    expect(pictures.image('axolotl')).toBeNull();
    finish(PNG);
    await settle();
    expect(pictures.state('axolotl')).toBe('ready');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('stops notifying a listener once it unsubscribes', async () => {
    const { pictures } = setUp();
    const listener = vi.fn();
    pictures.onChange(listener)();
    pictures.request(['axolotl']);
    await settle();
    expect(listener).not.toHaveBeenCalled();
  });
});
