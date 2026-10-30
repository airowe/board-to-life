import { describe, expect, it } from 'vitest';
import { pickBoardImage } from './pickImage';

const file = (name: string, type: string) => ({ name, type });

describe('pickBoardImage', () => {
  it.each([
    ['a PNG export', [file('board.png', 'image/png')], 'board.png'],
    ['a JPEG photo', [file('IMG_0001.jpg', 'image/jpeg')], 'IMG_0001.jpg'],
    ['a WebP screenshot', [file('shot.webp', 'image/webp')], 'shot.webp'],
    ['the first image after a non-image', [file('notes.txt', 'text/plain'), file('board.png', 'image/png')], 'board.png'],
  ])('picks %s', (_case, files, expected) => {
    expect(pickBoardImage(files)).toEqual({ ok: true, file: expect.objectContaining({ name: expected }) });
  });

  it.each([
    ['a PDF export', [file('lesson.pdf', 'application/pdf')], /PDF/],
    ['an SVG export', [file('board.svg', 'image/svg+xml')], /SVG/],
    ['a board file', [file('lesson.notebook', '')], /PNG or JPG/],
    ['nothing at all', [], /No image/],
  ])('refuses %s with a reason the teacher can act on', (_case, files, reason) => {
    const picked = pickBoardImage(files);
    expect(picked.ok).toBe(false);
    expect(picked.ok ? '' : picked.reason).toMatch(reason);
  });
});
