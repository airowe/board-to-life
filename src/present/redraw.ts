export type RedrawGate = { invalidate: () => void; shouldDraw: (animating: boolean) => boolean };

// While the scene moves every frame is drawn; once it stops, one more frame
// shows the exact resting state and then the canvas is left alone until
// something invalidates it.
export const createRedrawGate = (): RedrawGate => {
  let dirty = true;
  return {
    invalidate: () => {
      dirty = true;
    },
    shouldDraw: (animating) => {
      if (animating) {
        dirty = true;
        return true;
      }
      if (!dirty) return false;
      dirty = false;
      return true;
    },
  };
};
