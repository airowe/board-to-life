import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { imageSize } from './imageSize';

const repoFile = (path: string): Uint8Array => new Uint8Array(readFileSync(new URL(`../${path}`, import.meta.url)));

describe('imageSize', () => {
  it.each([
    ['public/samples/ramp-ball-dominoes.png', { width: 1200, height: 800 }],
    ['src/checks/drawings/pendulum-knock-photo.jpg', { width: 1600, height: 1067 }],
  ])('reads the size of %s', (path, size) => {
    expect(imageSize(repoFile(path))).toEqual(size);
  });

  it('returns null for bytes that are not a PNG or JPEG', () => {
    expect(imageSize(new TextEncoder().encode('GIF89a not supported'))).toBeNull();
  });

  it('returns null for a truncated JPEG', () => {
    expect(imageSize(repoFile('src/checks/drawings/pendulum-knock-photo.jpg').slice(0, 40))).toBeNull();
  });
});
