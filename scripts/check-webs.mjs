// Reads each sample food web with the model three ways (the sample drawing, its mock phone photo when
// check-photos/mock/web-<id>.jpg exists, and a typed description), plays what was read in the population
// model and reports how many played out as the sample says. Usage: npm run webs -- [--runs N]
// Calls the model directly and costs money; keys come from .env or .env.local.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { fileURLToPath, URL } from 'node:url';
import { runnerImport } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const load = async (path) => (await runnerImport(`${root}${path}`, { configFile: false, logLevel: 'error' })).module;

const { values } = parseArgs({ options: { runs: { type: 'string', default: '2' } } });
const runsPerCase = Number.parseInt(values.runs, 10);
if (!Number.isInteger(runsPerCase) || runsPerCase < 1) {
  console.error(`--runs must be a positive whole number, got "${values.runs}"`);
  process.exit(2);
}

const { WEB_DESCRIPTION_CASES, nextCallEstimate, scoreWeb } = await load('src/checks/webs.ts');
const { WEB_SAMPLES, webSampleUrl } = await load('src/ecosystem/samples.ts');
const { validateWeb } = await load('src/ecosystem/schema.ts');
const { imageSize } = await load('server/imageSize.ts');
const { costOf, providerFromEnv } = await load('server/sceneReader.ts');
const { readWebWithModel } = await load('server/webReader.ts');
const { describeWebWithModel } = await load('server/webWriter.ts');

const BUDGET_DOLLARS = 3;
const TIMEOUT_MS = 120_000;
const FALLBACK_CALL_DOLLARS = 0.05;
// The app sends photos upright, at most 1600 px on the long edge, as JPEG at this quality.
const MAX_LONG_EDGE = 1600;
const JPEG_QUALITY = 88;
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = `${root}check-runs/${timestamp}-webs`;
const mockPhotoOf = (id) => `${root}check-photos/mock/web-${id}.jpg`;

let provider;
try {
  provider = providerFromEnv('meta', process.env);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

mkdirSync(runDir, { recursive: true });

const pngInput = (sample) => {
  const bytes = new Uint8Array(readFileSync(`${root}public${webSampleUrl(sample.id)}`));
  return { bytes, contentType: 'image/png', size: imageSize(bytes) };
};

const mockPhotoInput = (sample) => {
  const prepared = `${runDir}/${sample.id}-mock.jpg`;
  execFileSync('magick', [mockPhotoOf(sample.id), '-auto-orient', '-resize', `${MAX_LONG_EDGE}x${MAX_LONG_EDGE}>`, '-quality', String(JPEG_QUALITY), prepared]);
  const bytes = new Uint8Array(readFileSync(prepared));
  return { bytes, contentType: 'image/jpeg', size: imageSize(bytes) };
};

const cases = WEB_SAMPLES.flatMap((sample) => {
  const description = WEB_DESCRIPTION_CASES.find((entry) => entry.sampleId === sample.id);
  return [
    { name: `${sample.id} drawing`, sample, read: (options) => readWebWithModel(pngInput(sample), provider, options) },
    ...(existsSync(mockPhotoOf(sample.id))
      ? [{ name: `${sample.id} mock photo`, sample, read: (options) => readWebWithModel(mockPhotoInput(sample), provider, options) }]
      : []),
    ...(description ? [{ name: `${sample.id} description`, sample, read: (options) => describeWebWithModel(description.text, provider, options) }] : []),
  ];
});
const skippedMocks = WEB_SAMPLES.filter((sample) => !existsSync(mockPhotoOf(sample.id))).map((sample) => sample.id);
if (skippedMocks.length > 0) console.error(`No mock photo for: ${skippedMocks.join(', ')} (run npm run photos:mock). Skipping those.`);

let calls = [];
const costOfCalls = () => calls.reduce((sum, call) => sum + costOf(call.provider, call.usage), 0);
let spent = 0;
let stopped = false;
const rows = [];

for (const [caseIndex, testCase] of cases.entries()) {
  for (let run = 1; run <= runsPerCase; run += 1) {
    const expectedNext = nextCallEstimate(rows.map((row) => row.cost), FALLBACK_CALL_DOLLARS);
    if (spent + expectedNext > BUDGET_DOLLARS) {
      console.error(`Stopping: $${spent.toFixed(4)} spent and the next call would pass $${BUDGET_DOLLARS.toFixed(2)}.`);
      stopped = true;
      break;
    }
    calls = [];
    const row = { case: caseIndex + 1, name: testCase.name, run, outcome: 'error', mismatches: [], error: null, web: null };
    try {
      const validated = validateWeb(await testCase.read({ timeoutMs: TIMEOUT_MS, onCall: (record) => calls.push(record) }));
      if (!validated.ok) throw new Error(`invalid web: ${validated.errors.slice(0, 3).join('; ')}`);
      row.web = validated.web;
      const score = scoreWeb(testCase.sample, validated.web);
      row.mismatches = score.mismatches;
      row.outcome = score.played ? 'pass' : 'fail';
    } catch (error) {
      row.error = error.details?.length ? `${error.message} ${error.details.join('; ')}` : error.message;
      row.outcome = error.kind ?? 'error';
    }
    row.cost = costOfCalls();
    spent += row.cost;
    rows.push(row);
    writeFileSync(`${runDir}/case-${row.case}-run-${run}.json`, JSON.stringify({ ...row, calls }, null, 2));
    console.error(`${row.name} run ${run}: ${row.outcome}, $${row.cost.toFixed(4)}${row.mismatches.length ? ` (${row.mismatches.join('; ')})` : ''}${row.error ? ` (${row.error})` : ''}`);
  }
  if (stopped) break;
}

console.log('\ncase | run | result | mismatches | cost');
for (const row of rows) console.log(`${row.name} | ${row.run} | ${row.outcome} | ${[...row.mismatches, row.error].filter(Boolean).join('; ') || '-'} | $${row.cost.toFixed(4)}`);
for (const kind of ['drawing', 'mock photo', 'description']) {
  const mine = rows.filter((row) => row.name.endsWith(` ${kind}`));
  if (mine.length === 0) continue;
  const cost = mine.reduce((sum, row) => sum + row.cost, 0);
  console.log(`\n${kind}: ${mine.filter((row) => row.outcome === 'pass').length} of ${mine.length} played as described, $${cost.toFixed(4)}`);
}
const passes = rows.filter((row) => row.outcome === 'pass').length;
console.log(`\nTotal: ${passes} of ${rows.length} played as described, $${spent.toFixed(4)} of $${BUDGET_DOLLARS.toFixed(2)}`);
console.log(`Saved readings: ${runDir.replace(root, '')}`);
process.exitCode = passes === rows.length && !stopped ? 0 : 1;
