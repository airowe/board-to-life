export type ImageSize = { width: number; height: number };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];
const JPEG_START = [0xff, 0xd8];
const JPEG_FRAME_MARKERS = new Set([0xc0, 0xc1, 0xc2]);

const startsWith = (bytes: Uint8Array, prefix: number[]): boolean => prefix.every((value, i) => bytes[i] === value);

export const imageSize = (bytes: Uint8Array): ImageSize | null => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (startsWith(bytes, PNG_SIGNATURE)) {
    return bytes.length >= 24 ? { width: view.getUint32(16), height: view.getUint32(20) } : null;
  }
  if (!startsWith(bytes, JPEG_START)) return null;
  let offset = 2;
  while (offset + 9 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1] ?? 0;
    if (JPEG_FRAME_MARKERS.has(marker)) return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) };
    offset += 2 + view.getUint16(offset + 2);
  }
  return null;
};
