export type Named = { name: string; type: string };
export type Picked<T extends Named> = { ok: true; file: T } | { ok: false; reason: string };

// Pictures the browser can decode into pixels. SVG decodes unreliably across browsers, so it is refused.
const RASTER_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/avif']);
const AS_IMAGE = 'Export the page from the board as a PNG or JPG image, or take a screenshot of it, and bring that in.';

const isPdf = (file: Named): boolean => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
const isSvg = (file: Named): boolean => file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);

export const pickBoardImage = <T extends Named>(files: readonly T[]): Picked<T> => {
  const image = files.find((file) => RASTER_TYPES.has(file.type));
  if (image) return { ok: true, file: image };
  if (files.length === 0) return { ok: false, reason: `No image found. ${AS_IMAGE}` };
  if (files.some(isPdf)) return { ok: false, reason: `A PDF cannot be read yet. ${AS_IMAGE}` };
  if (files.some(isSvg)) return { ok: false, reason: `An SVG cannot be read yet. ${AS_IMAGE}` };
  return { ok: false, reason: `That file is not an image. ${AS_IMAGE}` };
};
