type Size = { width: number; height: number };
export type Point = { x: number; y: number };
export type View = { scale: number; offsetX: number; offsetY: number };

// How far from a piece a finger may land and still pick it up, in screen pixels: about a fingertip either side.
export const TOUCH_REACH_PX = 32;

// The drawing scaled to fit the screen without distortion, centred along the spare direction.
export const viewOf = (screen: Size, drawing: Size): View => {
  const scale = Math.min(screen.width / drawing.width, screen.height / drawing.height);
  return { scale, offsetX: (screen.width - drawing.width * scale) / 2, offsetY: (screen.height - drawing.height * scale) / 2 };
};

export const toDrawing = (view: View, point: Point): Point => ({
  x: (point.x - view.offsetX) / view.scale,
  y: (point.y - view.offsetY) / view.scale,
});

// A canvas's pixel buffer for a CSS box: whole pixels, at least one, so the drawing is never stretched one way.
export const backingSize = (box: Size, ratio: number): Size => ({
  width: Math.max(1, Math.round(box.width * ratio)),
  height: Math.max(1, Math.round(box.height * ratio)),
});
