// Reads real whiteboard photos from check-photos/ with a model and scores each one against
// src/checks/photos.ts. Usage: npm run photos -- [--reader meta|baseten] [--dir check-photos]
// Each photo costs a model call; keys come from .env or .env.local.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath, URL } from 'node:url';
import { runnerImport } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const load = async (path) => (await runnerImport(`${root}${path}`, { configFile: false, logLevel: 'error' })).module;

const { values } = parseArgs({ options: { reader: { type: 'string', default: 'meta' }, dir: { type: 'string', default: 'check-photos' } } });
const { PHOTO_CHECKS, formatPhotoReport, pickItem, scorePhoto } = await load('src/checks/photos.ts');
const { readerFor } = await load('src/checks/readers.ts');
const { observeFallen, SETTLE_SECONDS } = await load('src/checks/replay.ts');
const { sketchScene } = await load('src/checks/sketch.ts');
const { validateScene } = await load('src/scene/schema.ts');
const { costOf } = await load('server/sceneReader.ts');

// The app sends photos upright, at most 1600 px on the long edge, as JPEG at this quality.
const MAX_LONG_EDGE = 1600;
const JPEG_QUALITY = 88;
const PHOTO_EXTENSIONS = ['.jpg', '.jpeg', '.heic', '.png'];
const BUDGET_DOLLARS = 5;

const photoDir = isAbsolute(values.dir) ? values.dir : `${root}${values.dir}`;
const available = existsSync(photoDir) ? readdirSync(photoDir) : [];
const sourceOf = (name) => available.find((file) => PHOTO_EXTENSIONS.some((extension) => file.toLowerCase() === `${name}${extension}`));
const present = PHOTO_CHECKS.filter((check) => sourceOf(check.name));
const missing = PHOTO_CHECKS.filter((check) => !sourceOf(check.name)).map((check) => check.name);
if (present.length === 0) {
  console.error(`No photos found in ${values.dir}/. Expected names: ${PHOTO_CHECKS.map((check) => check.name).join(', ')} (.jpg, .jpeg, .heic or .png).`);
  process.exit(2);
}

const calls = [];
let read;
try {
  read = readerFor(values.reader, { env: process.env, onCall: (record) => calls.push(record) });
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
if (!read || values.reader === 'http') {
  console.error(`Use a model reader: --reader meta or --reader baseten.`);
  process.exit(2);
}

const runs = `${root}check-runs`;
const runDir = `${runs}/${new Date().toISOString().replace(/[:.]/g, '-')}-photos-${values.reader}`;
mkdirSync(runDir, { recursive: true });

const results = [];
for (const check of present) {
  const prepared = `${runDir}/${check.name}.jpg`;
  execFileSync('magick', [`${photoDir}/${sourceOf(check.name)}`, '-auto-orient', '-resize', `${MAX_LONG_EDGE}x${MAX_LONG_EDGE}>`, '-quality', String(JPEG_QUALITY), prepared]);
  const before = calls.length;
  const started = performance.now();
  let result;
  try {
    const validated = validateScene(await read({ bytes: new Uint8Array(readFileSync(prepared)), contentType: 'image/jpeg' }));
    if (!validated.ok) throw new Error(`invalid scene: ${validated.errors.slice(0, 3).join('; ')}`);
    const scene = validated.scene;
    const picked = check.outcomes.flatMap((outcome) => pickItem(scene, outcome) ?? []);
    const score = scorePhoto(check, scene, observeFallen(scene, picked, SETTLE_SECONDS));
    result = { name: check.name, title: check.title, score, error: null };
    // Photo and read scene side by side, to see where a read went wrong.
    writeFileSync(`${runDir}/${check.name}-read.svg`, sketchScene(scene, 1));
    execFileSync('rsvg-convert', ['-o', `${runDir}/${check.name}-read.png`, `${runDir}/${check.name}-read.svg`]);
    execFileSync('magick', [prepared, '-resize', `x${scene.drawing.height}`, `${runDir}/${check.name}-read.png`, '+append', `${runDir}/${check.name}-compare.png`]);
    writeFileSync(`${runDir}/${check.name}.json`, JSON.stringify({ result, scene, calls: calls.slice(before) }, null, 2));
  } catch (error) {
    result = { name: check.name, title: check.title, score: null, error: error.message.slice(0, 300) };
    writeFileSync(`${runDir}/${check.name}.json`, JSON.stringify({ result, calls: calls.slice(before) }, null, 2));
  }
  results.push(result);
  const cost = calls.slice(before).reduce((sum, call) => sum + costOf(call.provider, call.usage), 0);
  console.error(`${check.name}: ${Math.round(performance.now() - started)} ms, $${cost.toFixed(4)}`);
}

console.log(`Reader: ${values.reader}\n`);
console.log(formatPhotoReport(results));
if (missing.length) console.log(`\nNo photo yet for: ${missing.join(', ')}`);
const cost = calls.reduce((sum, call) => sum + costOf(call.provider, call.usage), 0);
appendFileSync(`${runs}/ledger.jsonl`, `${JSON.stringify({ at: new Date().toISOString(), reader: `photos-${values.reader}`, effort: null, cost })}\n`);
const spent = readFileSync(`${runs}/ledger.jsonl`, 'utf8').trim().split('\n').reduce((sum, line) => sum + JSON.parse(line).cost, 0);
const times = calls.map((call) => call.ms).sort((a, b) => a - b);
console.log(`\nThis run: $${cost.toFixed(4)}, median call ${times[Math.floor(times.length / 2)] ?? 0} ms, slowest ${times.at(-1) ?? 0} ms`);
console.log(`Budget: $${spent.toFixed(4)} of $${BUDGET_DOLLARS.toFixed(2)} spent`);
console.log(`Saved reads and side-by-side images: ${runDir.replace(root, '')}`);
process.exitCode = results.every((result) => result.score?.passed) ? 0 : 1;
