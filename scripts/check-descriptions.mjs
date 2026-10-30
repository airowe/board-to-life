// Lays out each typed description with the model, plays the layout in the simulation and reports how many
// played out as described. Usage: npm run descriptions -- [--runs N]
// Calls the model directly and costs money; keys come from .env or .env.local.
import { mkdirSync, writeFileSync } from 'node:fs';
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

const { DESCRIPTION_CASES, scoreLayout } = await load('src/checks/descriptions.ts');
const { describeSceneWithModel } = await load('server/sceneWriter.ts');
const { costOf, providerFromEnv } = await load('server/sceneReader.ts');

const BUDGET_DOLLARS = 2;
const TIMEOUT_MS = 120_000;
const FALLBACK_CALL_DOLLARS = 0.05;
const runDir = `${root}check-runs/${new Date().toISOString().replace(/[:.]/g, '-')}-descriptions`;

let provider;
try {
  provider = providerFromEnv('meta', process.env);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

let calls = [];
const costOfCalls = () => calls.reduce((sum, call) => sum + costOf(call.provider, call.usage), 0);
let spent = 0;
let attempts = 0;
let stopped = false;
const rows = [];

mkdirSync(runDir, { recursive: true });
for (const [caseIndex, testCase] of DESCRIPTION_CASES.entries()) {
  for (let run = 1; run <= runsPerCase; run += 1) {
    const expectedNext = attempts === 0 ? FALLBACK_CALL_DOLLARS : spent / attempts;
    if (spent + expectedNext > BUDGET_DOLLARS) {
      console.error(`Stopping: $${spent.toFixed(4)} spent and the next call would pass $${BUDGET_DOLLARS.toFixed(2)}.`);
      stopped = true;
      break;
    }
    calls = [];
    attempts += 1;
    const row = { case: caseIndex + 1, text: testCase.text, run, outcome: 'error', problems: [], error: null, scene: null };
    try {
      const scene = await describeSceneWithModel(testCase.text, provider, { timeoutMs: TIMEOUT_MS, onCall: (record) => calls.push(record) });
      row.scene = scene;
      row.problems = scoreLayout(scene, testCase);
      row.outcome = row.problems.length === 0 ? 'pass' : 'fail';
    } catch (error) {
      row.error = error.details?.length ? `${error.message} ${error.details.join('; ')}` : error.message;
      row.outcome = error.kind ?? 'error';
    }
    row.cost = costOfCalls();
    spent += row.cost;
    rows.push(row);
    writeFileSync(`${runDir}/case-${row.case}-run-${run}.json`, JSON.stringify({ ...row, calls }, null, 2));
    console.error(`case ${row.case} run ${run}: ${row.outcome}, $${row.cost.toFixed(4)}${row.problems.length ? ` (${row.problems.join('; ')})` : ''}${row.error ? ` (${row.error})` : ''}`);
  }
  if (stopped) break;
}

console.log('\ncase | run | result | problems | cost');
for (const row of rows) console.log(`${row.case} | ${row.run} | ${row.outcome} | ${[...row.problems, row.error].filter(Boolean).join('; ') || '-'} | $${row.cost.toFixed(4)}`);
for (const [caseIndex, testCase] of DESCRIPTION_CASES.entries()) {
  const mine = rows.filter((row) => row.case === caseIndex + 1);
  const cost = mine.reduce((sum, row) => sum + row.cost, 0);
  console.log(`\nCase ${caseIndex + 1}: ${mine.filter((row) => row.outcome === 'pass').length} of ${mine.length} played as described, $${cost.toFixed(4)}: ${testCase.text}`);
}
const passes = rows.filter((row) => row.outcome === 'pass').length;
console.log(`\nTotal: ${passes} of ${rows.length} played as described, $${spent.toFixed(4)} of $${BUDGET_DOLLARS.toFixed(2)}`);
console.log(`Saved layouts: ${runDir.replace(root, '')}`);
process.exitCode = passes === rows.length && !stopped ? 0 : 1;
