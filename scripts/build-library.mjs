// Draws the picture library with Muse Image, cuts each subject out of its white background,
// and writes public/library/ plus manifest.json. Pictures already drawn are kept; delete one
// from art/library/raw/ to redraw it.
//
//   node --env-file=<path to .env> scripts/build-library.mjs [--only id,id] [--cut-only]
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { SUBJECTS } from './library-subjects.mjs';

const BASE = 'https://api.meta.ai/v1';
const RAW_DIR = 'art/library/raw';
const OUT_DIR = 'public/library';
const PARALLEL = 10;
const ATTEMPTS = 2;
const OBJECT_MAX_PX = 512;
const BACKGROUND_WIDTH_PX = 1536;
const WHITE_FUZZ = '10%';
const HOLE_FUZZ = '6%';
const WEBP_QUALITY = '84';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : undefined;
const chosen = SUBJECTS.filter((entry) => !only || only.has(entry.id));

const draw = async (entry) => {
  const response = await fetch(`${BASE}/images/generations`, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.MODEL_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'muse-image-1.0', prompt: entry.prompt, n: 1, size: entry.size, output_format: 'png', reasoning_strength: 'low' }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${text.slice(0, 200)}`);
  const item = JSON.parse(text).data?.[0];
  return item?.b64_json ? Buffer.from(item.b64_json, 'base64') : Buffer.from(await (await fetch(item.url)).arrayBuffer());
};

const drawWithRetry = async (entry) => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await draw(entry);
    } catch (error) {
      if (attempt >= ATTEMPTS) throw error;
    }
  }
};

const magick = (...params) => execFileSync('magick', params, { encoding: 'utf8' }).trim();

// Flood-fill the white backdrop from every corner, so white inside the subject (a face, a belly) survives.
// Subjects with gaps (leaves, coils) and no white of their own also clear white pockets the fill cannot reach.
const cutOut = (raw, out, entry) => {
  const [width, height] = magick('identify', '-format', '%w %h', raw).split(' ').map(Number);
  const corners = [`0,0`, `${width - 1},0`, `0,${height - 1}`, `${width - 1},${height - 1}`];
  magick(
    raw, '-alpha', 'set', '-fuzz', WHITE_FUZZ, '-fill', 'none',
    ...corners.flatMap((corner) => ['-draw', `color ${corner} floodfill`]),
    ...(entry.holes ? ['-fuzz', HOLE_FUZZ, '-transparent', 'white'] : []),
    '-channel', 'A', '-morphology', 'Erode', 'Disk:1', '+channel',
    '-trim', '+repage', '-resize', `${OBJECT_MAX_PX}x${OBJECT_MAX_PX}>`, '-quality', WEBP_QUALITY, out,
  );
};

const shrink = (raw, out) => magick(raw, '-resize', `${BACKGROUND_WIDTH_PX}x`, '-quality', WEBP_QUALITY, out);

const build = async (entry) => {
  const raw = `${RAW_DIR}/${entry.id}.png`;
  if (!existsSync(raw)) {
    if (flag('--cut-only')) return `${entry.id}: not drawn yet`;
    const started = performance.now();
    writeFileSync(raw, await drawWithRetry(entry));
    console.log(`${entry.id}: drawn in ${((performance.now() - started) / 1000).toFixed(1)} s`);
  }
  const out = `${OUT_DIR}/${entry.id}.webp`;
  (entry.group === 'background' ? shrink : cutOut)(raw, out, entry);
};

const inBatches = async (items, work) => {
  const failures = [];
  const queue = [...items];
  const worker = async () => {
    for (let entry = queue.shift(); entry; entry = queue.shift()) {
      try {
        const note = await work(entry);
        if (note) failures.push(note);
      } catch (error) {
        failures.push(`${entry.id}: ${error.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  return failures;
};

const writeManifest = () => {
  const entries = SUBJECTS.filter((entry) => existsSync(`${OUT_DIR}/${entry.id}.webp`)).map(({ id, subject, pose, group, aliases }) => {
    const [width, height] = magick('identify', '-format', '%w %h', `${OUT_DIR}/${id}.webp`).split(' ').map(Number);
    return { id, subject, pose, group, aliases, file: `${id}.webp`, width, height };
  });
  writeFileSync(`${OUT_DIR}/manifest.json`, `${JSON.stringify({ version: 1, entries }, null, 2)}\n`);
  return entries.length;
};

mkdirSync(RAW_DIR, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });
const started = performance.now();
const failures = await inBatches(chosen, build);
const count = writeManifest();
console.log(`${chosen.length} chosen, ${count} in the manifest, ${((performance.now() - started) / 1000).toFixed(1)} s`);
for (const failure of failures) console.log(`FAILED ${failure}`);
