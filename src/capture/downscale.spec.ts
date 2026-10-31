import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_LONG_EDGE, fitWithin, preparePhoto } from './downscale';

describe('fitWithin', () => {
  it.each([
    ['a landscape phone photo', 4032, 3024, { width: 1600, height: 1200 }],
    ['a portrait phone photo', 3024, 4032, { width: 1200, height: 1600 }],
    ['a square photo', 3000, 3000, { width: 1600, height: 1600 }],
    ['an odd ratio that needs rounding', 4000, 2251, { width: 1600, height: 900 }],
  ])('scales %s so the long edge is the maximum', (_case, width, height, expected) => {
    expect(fitWithin(width, height, MAX_LONG_EDGE)).toEqual(expected);
  });

  it.each([
    ['already small', 1200, 800],
    ['exactly the maximum', 1600, 900],
  ])('leaves an image that is %s unchanged', (_case, width, height) => {
    expect(fitWithin(width, height, MAX_LONG_EDGE)).toEqual({ width, height });
  });

  it('never returns a zero dimension', () => {
    expect(fitWithin(10_000, 1, MAX_LONG_EDGE)).toEqual({ width: 1600, height: 1 });
  });
});

describe('preparePhoto when the browser rejects the orientation option', () => {
  const photo = new Blob(['jpeg'], { type: 'image/jpeg' });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('decodes the photo again without options before it gives up', async () => {
    const bitmap = { width: 3024, height: 4032, close: vi.fn() };
    const decode = vi.fn().mockRejectedValueOnce(new TypeError('unsupported option')).mockResolvedValueOnce(bitmap);
    vi.stubGlobal('createImageBitmap', decode);
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) });

    const prepared = await preparePhoto(photo);

    expect(decode.mock.calls).toEqual([[photo, { imageOrientation: 'from-image' }], [photo]]);
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(prepared).toEqual({ photo, inverted: false });
  });

  it('returns the photo as it was when it cannot be decoded at all', async () => {
    const decode = vi.fn().mockRejectedValue(new Error('too large'));
    vi.stubGlobal('createImageBitmap', decode);

    expect(await preparePhoto(photo)).toEqual({ photo, inverted: false });
    expect(decode).toHaveBeenCalledTimes(2);
  });
});
