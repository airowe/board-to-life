import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';

export const FALLBACK_CALL_DOLLARS = 0.05;

export const ledgerSpent = (runs) => {
  const path = `${runs}/ledger.jsonl`;
  if (!existsSync(path)) return 0;
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .reduce((sum, line) => sum + JSON.parse(line).cost, 0);
};

export const appendLedger = (runs, entry) => {
  mkdirSync(runs, { recursive: true });
  appendFileSync(`${runs}/ledger.jsonl`, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
};

export const overBudget = ({ before, thisRun, costs, budget }) => {
  const next = costs.length === 0 ? FALLBACK_CALL_DOLLARS : Math.max(...costs);
  return before + thisRun + next > budget;
};
