import { backingSize } from '../present/view';

export type SizedCanvas = { ctx: CanvasRenderingContext2D; width: number; height: number; ratio: number };

// Matches the canvas's pixel buffer to its CSS box, clears it, and leaves the context drawing in CSS pixels.
export const sizeCanvas = (canvas: HTMLCanvasElement): SizedCanvas | null => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const ratio = window.devicePixelRatio || 1;
  const { width, height } = canvas.getBoundingClientRect();
  const backing = backingSize({ width, height }, ratio);
  if (canvas.width !== backing.width || canvas.height !== backing.height) {
    canvas.width = backing.width;
    canvas.height = backing.height;
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height, ratio };
};
