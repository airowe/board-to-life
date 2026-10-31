// Replays every check drawing through a scene reader and reports how well it
// read each one. Usage: npm run drawings -- [--reader stub|http|meta|baseten] [--url <understand endpoint>]
// The meta and baseten readers call the model directly and cost money; keys come from .env.local.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { fileURLToPath, URL } from 'node:url';
import { runnerImport } from 'vite';
import { appendLedger, ledgerSpent, overBudget } from './ledger.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const load = async (path) => (await runnerImport(`${root}${path}`, { configFile: false, logLevel: 'error' })).module;

const { values } = parseArgs({ options: { reader: { type: 'string', default: 'stub' }, url: { type: 'string' }, effort: { type: 'string' } } });
const { DRAWING_CASES } = await load('src/checks/cases.ts');
const { READER_NAMES, readerFor } = await load('src/checks/readers.ts');
const { formatReport, replayCase } = await load('src/checks/replay.ts');
const { costOf, EFFORTS, parseEffort } = await load('server/sceneReader.ts');
const effort = parseEffort(values.effort);
if (values.effort && !effort) {
  console.error(`Unknown effort "${values.effort}". Efforts: ${EFFORTS.join(', ')}`);
  process.exit(2);
}

// Each run of a paid reader is saved under check-runs/ (ignored by git) and added to a
// ledger, so every read can be inspected and the spend checked against the budget.
const BUDGET_DOLLARS = 5;
const runs = `${root}check-runs`;
const runDir = `${runs}/${new Date().toISOString().replace(/[:.]/g, '-')}-${values.reader}${effort ? `-${effort}` : ''}`;
let calls = [];

let read;
try {
  read = readerFor(values.reader, { url: values.url, env: process.env, onCall: (record) => calls.push(record), ...(effort ? { effort } : {}) });
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
if (!read) {
  console.error(`Unknown reader "${values.reader}". Readers: ${READER_NAMES.join(', ')}`);
  process.exit(2);
}

const results = [];
const allCalls = [];
const caseCosts = [];
const costOfCalls = (list) => list.reduce((sum, call) => sum + costOf(call.provider, call.usage), 0);
const spentBefore = ledgerSpent(runs);
let stopped = false;
try {
  for (const drawingCase of DRAWING_CASES) {
    if (overBudget({ before: spentBefore, thisRun: costOfCalls(allCalls), costs: caseCosts, budget: BUDGET_DOLLARS })) {
      console.error(`Stopping before ${drawingCase.id}: the next read would pass $${BUDGET_DOLLARS.toFixed(2)}.`);
      stopped = true;
      break;
    }
    const bytes = new Uint8Array(readFileSync(`${root}${drawingCase.image}`));
    const started = performance.now();
    calls = [];
    let result;
    try {
      result = await replayCase(drawingCase, read, { bytes, contentType: drawingCase.contentType });
    } catch (error) {
      // Keep going: a crash on one drawing must not lose the other reads or their cost.
      const outcomes = drawingCase.outcomes.map((outcome) => ({ item: outcome.item, expected: outcome.fallen, actual: null }));
      result = { caseId: drawingCase.id, title: drawingCase.title, error: `crashed: ${error.message}`, comparison: null, outcomes, passed: false, readScene: null };
    }
    results.push(result);
    allCalls.push(...calls);
    const cost = costOfCalls(calls);
    if (calls.length) caseCosts.push(cost);
    console.error(`${drawingCase.id}: ${Math.round(performance.now() - started)} ms${calls.length ? `, $${cost.toFixed(4)}` : ''}`);
    if (calls.length) {
      mkdirSync(runDir, { recursive: true });
      writeFileSync(`${runDir}/${drawingCase.id}.json`, JSON.stringify({ result, calls, cost }, null, 2));
    }
  }
} finally {
  if (allCalls.length) appendLedger(runs, { reader: values.reader, effort: effort ?? null, cost: costOfCalls(allCalls) });
}
console.log(`Reader: ${values.reader}${values.url ? ` (${values.url})` : ''}${effort ? `, reasoning effort ${effort}` : ''}\n`);
console.log(formatReport(results));

if (allCalls.length) {
  const cost = costOfCalls(allCalls);
  const tokens = (key) => allCalls.reduce((sum, call) => sum + (call.usage?.[key] ?? 0), 0);
  const times = allCalls.map((call) => call.ms).sort((a, b) => a - b);
  console.log(`\nThis run: $${cost.toFixed(4)} (${tokens('prompt_tokens')} tokens in, ${tokens('completion_tokens')} out), median call ${times[Math.floor(times.length / 2)]} ms, slowest ${times.at(-1)} ms`);
  console.log(`Budget: $${ledgerSpent(runs).toFixed(4)} of $${BUDGET_DOLLARS.toFixed(2)} spent across ${runs.replace(root, '')}/ledger.jsonl`);
  console.log(`Saved reads: ${runDir.replace(root, '')}`);
}
process.exitCode = results.every((result) => result.passed) && !stopped ? 0 : 1;
