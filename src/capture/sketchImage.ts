import { sketchScene } from '../checks/sketch';
import type { Scene } from '../scene/schema';

const SKETCH_SEED = 7;
const DRAW_FAILURE = 'Could not draw the described setup.';

const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(DRAW_FAILURE));
    image.src = url;
  });

export const sketchImage = async (scene: Scene): Promise<Blob> => {
  const { width, height } = scene.drawing;
  const svg = sketchScene(scene, SKETCH_SEED);
  const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')?.drawImage(image, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(DRAW_FAILURE))), 'image/png');
  });
};
