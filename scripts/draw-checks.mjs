// Draws the check drawings from their expected scenes, so a drawing and its
// expected scene cannot disagree, and turns each drawing into a photo-style
// JPEG. Needs rsvg-convert (librsvg) and magick (ImageMagick 7).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { runnerImport } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const load = async (path) => (await runnerImport(`${root}${path}`, { configFile: false, logLevel: 'error' })).module;

const { DRAWING_CASES, PHOTO_SIZE, SKETCH_SEED } = await load('src/checks/cases.ts');
const { sketchScene } = await load('src/checks/sketch.ts');

const sceneOf = (id) => DRAWING_CASES.find((each) => each.id === id).scene;

// Uneven classroom light, a glare patch, a warm cast, slight blur, sensor
// noise and phone-grade JPEG compression. Seeded, so reruns give the same file.
const { width, height } = PHOTO_SIZE;
const photoArgs = (output) => [
  'png:-',
  '-resize', `${width}x${height}!`,
  '(', '-size', `${width}x${height}`, '-define', `gradient:center=${width * 0.35},${height * 0.4}`,
  '-define', `gradient:radii=${width * 0.95},${height * 1.05}`, 'radial-gradient:white-gray50', ')',
  '-compose', 'multiply', '-composite',
  '(', '-size', `${width}x${height}`, 'xc:none', '-fill', 'rgba(255,255,255,0.55)',
  '-draw', `ellipse ${width * 0.74},${height * 0.28} ${width * 0.15},${height * 0.14} 0,360`, '-blur', '0x70', ')',
  '-compose', 'over', '-composite',
  '-fill', '#e9dcb8', '-colorize', '10%',
  '-blur', '0x1.1',
  '-seed', '5', '-attenuate', '0.4', '+noise', 'Gaussian',
  '-strip', '-quality', '68', output,
];

for (const drawingCase of DRAWING_CASES) {
  let png;
  if (drawingCase.sketch) {
    const ghost = drawingCase.sketch.ghostOf ? sceneOf(drawingCase.sketch.ghostOf) : undefined;
    const svg = `${root}${drawingCase.sketch.svg}`;
    writeFileSync(svg, sketchScene(drawingCase.scene, SKETCH_SEED, ghost));
    png = execFileSync('rsvg-convert', [svg]);
  } else if (drawingCase.photoSource) {
    png = readFileSync(`${root}${drawingCase.photoSource}`);
  } else {
    continue;
  }
  const output = `${root}${drawingCase.image}`;
  if (drawingCase.photo) execFileSync('magick', photoArgs(output), { input: png });
  else writeFileSync(output, png);
  console.log(`drew ${drawingCase.image}`);
}
