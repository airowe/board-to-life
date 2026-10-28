// Drafts predict questions for each check drawing's expected scene with a model and
// reports whether they are grounded, with the physics answer next to each one.
// Usage: npm run questions -- [--drafter meta|baseten]. Calls cost money; keys come from .env or .env.local.
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { fileURLToPath, URL } from 'node:url';
import { runnerImport } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const load = async (path) => (await runnerImport(`${root}${path}`, { configFile: false, logLevel: 'error' })).module;

const { values } = parseArgs({ options: { drafter: { type: 'string', default: 'meta' } } });
const { DRAWING_CASES } = await load('src/checks/cases.ts');
const { costOf, isProviderName, providerFromEnv } = await load('server/sceneReader.ts');
const { draftQuestionsWithModel, outcomesOf } = await load('server/questionDrafter.ts');
const { handleDraftQuestionsWithModel } = await load('server/draft.ts');

if (!isProviderName(values.drafter)) {
  console.error(`Unknown drafter "${values.drafter}". Drafters: meta, baseten`);
  process.exit(2);
}
let provider;
try {
  provider = providerFromEnv(values.drafter, process.env);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

const BUDGET_DOLLARS = 5;
const TIMEOUT_MS = 60_000;
const runs = `${root}check-runs`;
const runDir = `${runs}/${new Date().toISOString().replace(/[:.]/g, '-')}-questions-${values.drafter}`;
mkdirSync(runDir, { recursive: true });

const calls = [];
let grounded = 0;
const cases = DRAWING_CASES.filter((drawingCase) => !drawingCase.id.endsWith('-photo'));
for (const drawingCase of cases) {
  const before = calls.length;
  const response = await handleDraftQuestionsWithModel({
    scene: drawingCase.scene,
    drafter: values.drafter,
    draft: (scene) => draftQuestionsWithModel(scene, provider, { timeoutMs: TIMEOUT_MS, onCall: (record) => calls.push(record) }),
  });
  const outcomes = new Map(outcomesOf(drawingCase.scene).map((outcome) => [outcome.item, outcome.fallen]));
  const caseCalls = calls.slice(before);
  writeFileSync(`${runDir}/${drawingCase.id}.json`, JSON.stringify({ response, calls: caseCalls }, null, 2));
  const ms = caseCalls.map((call) => call.ms).join(', ');
  if (response.status !== 200) {
    console.log(`${drawingCase.id}  FAIL  ${response.body.error} ${(response.body.details ?? []).join('; ')} (${ms} ms)\n`);
    continue;
  }
  grounded += 1;
  console.log(`${drawingCase.id}  grounded  (${ms} ms)`);
  for (const question of response.body.questions) {
    console.log(`  Q: ${question.prompt}`);
    console.log(`  Observes ${question.observe.item}, which ${outcomes.get(question.observe.item) ? 'falls' : 'stays standing'} in the physics`);
    console.log(`  Explanation: ${question.explanation}\n`);
  }
}

const cost = calls.reduce((sum, call) => sum + costOf(call.provider, call.usage), 0);
appendFileSync(`${runs}/ledger.jsonl`, `${JSON.stringify({ at: new Date().toISOString(), reader: `questions-${values.drafter}`, effort: null, cost })}\n`);
const spent = readFileSync(`${runs}/ledger.jsonl`, 'utf8').trim().split('\n').reduce((sum, line) => sum + JSON.parse(line).cost, 0);
console.log(`${grounded} of ${cases.length} drafts grounded`);
console.log(`This run: $${cost.toFixed(4)}; budget: $${spent.toFixed(4)} of $${BUDGET_DOLLARS.toFixed(2)} spent`);
console.log(`Saved drafts: ${runDir.replace(root, '')}`);
process.exitCode = grounded === cases.length ? 0 : 1;
