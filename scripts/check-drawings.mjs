// Replays every check drawing through a scene reader and reports how well it
// read each one. Usage: npm run drawings -- [--reader stub|http] [--url <understand endpoint>]
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { fileURLToPath, URL } from 'node:url';
import { runnerImport } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const load = async (path) => (await runnerImport(`${root}${path}`, { configFile: false, logLevel: 'error' })).module;

const { values } = parseArgs({ options: { reader: { type: 'string', default: 'stub' }, url: { type: 'string' } } });
const { DRAWING_CASES } = await load('src/checks/cases.ts');
const { READER_NAMES, readerFor } = await load('src/checks/readers.ts');
const { formatReport, replayCase } = await load('src/checks/replay.ts');

let read;
try {
  read = readerFor(values.reader, { url: values.url });
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
if (!read) {
  console.error(`Unknown reader "${values.reader}". Readers: ${READER_NAMES.join(', ')}`);
  process.exit(2);
}

const results = [];
for (const drawingCase of DRAWING_CASES) {
  const bytes = new Uint8Array(readFileSync(`${root}${drawingCase.image}`));
  results.push(await replayCase(drawingCase, read, { bytes, contentType: drawingCase.contentType }));
}
console.log(`Reader: ${values.reader}${values.url ? ` (${values.url})` : ''}\n`);
console.log(formatReport(results));
process.exitCode = results.every((result) => result.passed) ? 0 : 1;
