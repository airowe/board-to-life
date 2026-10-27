// Draws the check drawings from their expected scenes, so a drawing and its
// expected scene cannot disagree. Needs rsvg-convert (librsvg) for the PNGs.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { runnerImport } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const load = async (path) => (await runnerImport(`${root}${path}`, { configFile: false, logLevel: 'error' })).module;

const { DRAWING_CASES, SKETCH_SEED } = await load('src/checks/cases.ts');
const { sketchScene } = await load('src/checks/sketch.ts');

for (const drawingCase of DRAWING_CASES.filter((each) => each.sketched)) {
  const png = `${root}${drawingCase.image}`;
  const svg = png.replace(/\.png$/, '.svg');
  writeFileSync(svg, sketchScene(drawingCase.scene, SKETCH_SEED));
  execFileSync('rsvg-convert', ['-o', png, svg]);
  console.log(`drew ${drawingCase.image}`);
}
