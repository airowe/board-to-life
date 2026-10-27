// Replays every check drawing through a scene reader and reports how well it
// read each one. Usage: npm run drawings -- [--reader stub]
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { fileURLToPath, URL } from 'node:url';
import { runnerImport } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const load = async (path) => (await runnerImport(`${root}${path}`, { configFile: false, logLevel: 'error' })).module;

const { values } = parseArgs({ options: { reader: { type: 'string', default: 'stub' } } });
const { DRAWING_CASES } = await load('src/checks/cases.ts');
const { READERS } = await load('src/checks/readers.ts');
const { formatReport, replayCase } = await load('src/checks/replay.ts');

const read = READERS[values.reader];
if (!read) {
  console.error(`Unknown reader "${values.reader}". Readers: ${Object.keys(READERS).join(', ')}`);
  process.exit(2);
}

const results = [];
for (const drawingCase of DRAWING_CASES) {
  const bytes = new Uint8Array(readFileSync(`${root}${drawingCase.image}`));
  results.push(await replayCase(drawingCase, read, { bytes, contentType: 'image/png' }));
}
console.log(`Reader: ${values.reader}\n`);
console.log(formatReport(results));
process.exitCode = results.every((result) => result.passed) ? 0 : 1;
