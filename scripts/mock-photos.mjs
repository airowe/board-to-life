// Makes stand-in "phone photos" of the shot-list drawings in check-photos/mock/, until real ones
// are taken: each check scene sketched by hand, on a framed whiteboard against a wall, shot from a
// slight angle (or a strong one) in uneven light, at phone resolution. Needs rsvg-convert and magick.
// Usage: npm run photos:mock, then npm run photos -- --dir check-photos/mock
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { runnerImport } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const load = async (path) => (await runnerImport(`${root}${path}`, { configFile: false, logLevel: 'error' })).module;

const { DRAWING_CASES } = await load('src/checks/cases.ts');
const { PHOTO_CHECKS, pickItem, scorePhoto } = await load('src/checks/photos.ts');
const { observeFallen, SETTLE_SECONDS } = await load('src/checks/replay.ts');
const { sketchScene } = await load('src/checks/sketch.ts');
const { WEB_SAMPLES } = await load('src/ecosystem/samples.ts');
const { sketchWeb } = await load('src/ecosystem/sketch.ts');
const { GEOMETRY_SAMPLES } = await load('src/geometry/samples.ts');
const { sketchFigure } = await load('src/geometry/sketch.ts');

const sceneOf = (id) => DRAWING_CASES.find((each) => each.id === id).scene;

// Which check scene each photo shows; 05-messy also carries the smudged remains of another drawing.
const MOCKS = {
  '01-chain': { scene: 'ramp-ball-dominoes', view: 'straight' },
  '01-chain-angle': { scene: 'ramp-ball-dominoes', view: 'angled' },
  '02-gap': { scene: 'dominoes-wide-gap', view: 'straight' },
  '03-wall': { scene: 'wall-in-the-way', view: 'straight' },
  '04-pendulum': { scene: 'pendulum-knock', view: 'straight' },
  '05-messy': { scene: 'ramp-ball-dominoes', ghost: 'pendulum-knock', view: 'straight' },
  '06-spring': { scene: 'spring-swing', view: 'straight' },
  '07-pulley': { scene: 'table-pulley', view: 'straight' },
  '08-cart': { scene: 'cart-roll', view: 'straight' },
  '09-seesaw': { scene: 'seesaw-masses', view: 'straight' },
};

// A seed per photo, different from the check set's, so the hand-drawn wobble is new.
const SEED_BASE = 41;
const PHONE = { width: 4032, height: 3024 };
const DRAWING_PX = { width: 2800, height: 1867 };
const BOARD_COLOUR = '#f5f5f1';
const BOARD_MARGIN = 180;
const FRAME = 40;
const WALL = 420;

const views = {
  // Hand-held, roughly square-on: a little tilt and keystone.
  straight: (w, h) => [[0, 0, w * 0.015, h * 0.02], [w, 0, w * 0.985, h * 0.005], [w, h, w * 0.99, h * 0.985], [0, h, w * 0.005, h * 0.995]],
  // About 30 degrees off to the left: the far (right) side shrinks.
  angled: (w, h) => [[0, 0, 0, 0], [w, 0, w * 0.86, h * 0.09], [w, h, w * 0.86, h * 0.91], [0, h, 0, h]],
};

const photoArgs = (view, seed, output) => {
  const w = DRAWING_PX.width + 2 * (BOARD_MARGIN + FRAME + WALL);
  const h = DRAWING_PX.height + 2 * (BOARD_MARGIN + FRAME + WALL);
  const corners = views[view](w, h).map((corner) => corner.map((value) => value.toFixed(1)).join(',')).join(' ');
  return [
    'png:-',
    '-resize', `${DRAWING_PX.width}x${DRAWING_PX.height}!`,
    '-bordercolor', BOARD_COLOUR, '-border', String(BOARD_MARGIN),
    '-bordercolor', '#a3a7ab', '-border', String(FRAME),
    '-bordercolor', '#7a6f63', '-border', String(WALL),
    '-virtual-pixel', 'edge', '-distort', 'Perspective', corners,
    '-resize', `${PHONE.width}x${PHONE.height}^`, '-gravity', 'center', '-extent', `${PHONE.width}x${PHONE.height}`,
    '(', '-size', `${PHONE.width}x${PHONE.height}`, '-define', `gradient:center=${PHONE.width * 0.3},${PHONE.height * 0.35}`,
    '-define', `gradient:radii=${PHONE.width * 0.9},${PHONE.height * 1.0}`, 'radial-gradient:white-gray45', ')',
    '-compose', 'multiply', '-composite',
    '(', '-size', `${PHONE.width}x${PHONE.height}`, 'xc:none', '-fill', 'rgba(255,255,255,0.5)',
    '-draw', `ellipse ${PHONE.width * 0.68},${PHONE.height * 0.3} ${PHONE.width * 0.12},${PHONE.height * 0.1} 0,360`, '-blur', '0x120', ')',
    '-compose', 'over', '-composite',
    '-fill', '#e6dcc0', '-colorize', '8%',
    '-blur', '0x1.6',
    '-seed', String(seed), '-attenuate', '0.5', '+noise', 'Gaussian',
    '-strip', '-quality', '80', output,
  ];
};

const outputDir = `${root}check-photos/mock`;
mkdirSync(outputDir, { recursive: true });
for (const [index, check] of PHOTO_CHECKS.entries()) {
  const mock = MOCKS[check.name];
  if (!mock) throw new Error(`no mock for ${check.name}`);
  const scene = sceneOf(mock.scene);
  // A mock must show a drawing whose own physics passes its photo check, or the check would be wrong.
  const picked = check.outcomes.flatMap((outcome) => pickItem(scene, outcome) ?? []);
  const score = scorePhoto(check, scene, observeFallen(scene, picked, SETTLE_SECONDS));
  if (!score.passed) throw new Error(`${check.name}: the ${mock.scene} scene does not pass its own photo check`);
  const seed = SEED_BASE + index;
  // Flat board colour instead of the sketch's own shading, so the drawing has no visible edge on the board.
  const svg = sketchScene(scene, seed, mock.ghost ? sceneOf(mock.ghost) : undefined).replace('fill="url(#board)"', `fill="${BOARD_COLOUR}"`);
  const png = execFileSync('rsvg-convert', ['-'], { input: svg });
  execFileSync('magick', photoArgs(mock.view, seed, `${outputDir}/${check.name}.jpg`), { input: png });
  console.log(`mocked check-photos/mock/${check.name}.jpg (${mock.scene}, ${mock.view})`);
}

// The food-web samples get the same treatment, in the same straight view, named web-<id>.jpg.
const WEB_SEED_BASE = 141;
for (const [index, sample] of WEB_SAMPLES.entries()) {
  const seed = WEB_SEED_BASE + index;
  const svg = sketchWeb(sample.web, seed).replace('fill="url(#board)"', `fill="${BOARD_COLOUR}"`);
  const png = execFileSync('rsvg-convert', ['-'], { input: svg });
  execFileSync('magick', photoArgs('straight', seed, `${outputDir}/web-${sample.id}.jpg`), { input: png });
  console.log(`mocked check-photos/mock/web-${sample.id}.jpg (${sample.title}, straight)`);
}

// The geometry samples too, named geo-<id>.jpg.
const FIGURE_SEED_BASE = 241;
for (const [index, sample] of GEOMETRY_SAMPLES.entries()) {
  const seed = FIGURE_SEED_BASE + index;
  const svg = sketchFigure(sample.figure, seed).replace('fill="url(#board)"', `fill="${BOARD_COLOUR}"`);
  const png = execFileSync('rsvg-convert', ['-'], { input: svg });
  execFileSync('magick', photoArgs('straight', seed, `${outputDir}/geo-${sample.id}.jpg`), { input: png });
  console.log(`mocked check-photos/mock/geo-${sample.id}.jpg (${sample.title}, straight)`);
}
