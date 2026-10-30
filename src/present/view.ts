type Size = { width: number; height: number };
type Point = { x: number; y: number };
export type View = { scale: number; offsetX: number; offsetY: number };

// The drawing scaled to fit the screen without distortion, centred along the spare direction.
export const viewOf = (screen: Size, drawing: Size): View => {
  const scale = Math.min(screen.width / drawing.width, screen.height / drawing.height);
  return { scale, offsetX: (screen.width - drawing.width * scale) / 2, offsetY: (screen.height - drawing.height * scale) / 2 };
};

export const toDrawing = (view: View, point: Point): Point => ({
  x: (point.x - view.offsetX) / view.scale,
  y: (point.y - view.offsetY) / view.scale,
});
