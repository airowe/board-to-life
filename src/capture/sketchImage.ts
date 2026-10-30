import { sketchScene } from '../checks/sketch';
import { sketchWeb } from '../ecosystem/sketch';
import type { DraftContent } from '../session/store';

const SKETCH_SEED = 7;
const DRAW_FAILURE = 'Could not draw the described setup.';

const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(DRAW_FAILURE));
    image.src = url;
  });

const sketchOf = (content: DraftContent): { svg: string; width: number; height: number } => {
  const drawing = content.subject === 'physics' ? content.scene.drawing : content.web.drawing;
  const svg = content.subject === 'physics' ? sketchScene(content.scene, SKETCH_SEED) : sketchWeb(content.web, SKETCH_SEED);
  return { svg, ...drawing };
};

export const sketchImage = async (content: DraftContent): Promise<Blob> => {
  const { svg, width, height } = sketchOf(content);
  const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')?.drawImage(image, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(DRAW_FAILURE))), 'image/png');
  });
};
