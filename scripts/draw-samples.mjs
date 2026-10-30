// Draws the sample drawings offered on the capture screen from their scenes in src/samples/scenes.ts,
// so a sample and what it does cannot disagree. Needs rsvg-convert (librsvg).
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { runnerImport } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const load = async (path) => (await runnerImport(`${root}${path}`, { configFile: false, logLevel: 'error' })).module;

const { SAMPLES, sampleUrl } = await load('src/samples/scenes.ts');
const { sketchScene } = await load('src/checks/sketch.ts');

// A seed of its own per sample, apart from the check set's, so the hand-drawn wobble differs.
const SEED_BASE = 61;

for (const [index, sample] of SAMPLES.entries()) {
  const png = execFileSync('rsvg-convert', [], { input: sketchScene(sample.scene, SEED_BASE + index) });
  const output = `${root}public${sampleUrl(sample.id)}`;
  writeFileSync(output, png);
  console.log(`drew ${output.slice(root.length)}`);
}
