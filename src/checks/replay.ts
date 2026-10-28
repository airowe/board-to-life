import { createSimulation, SETTLE_SECONDS, STEPS_PER_SECOND } from '../physics/simulation';
import { validateScene, type Scene } from '../scene/schema';
import type { DrawingCase } from './cases';
import { compareScenes, type SceneComparison } from './compare';

export { SETTLE_SECONDS };
const ERRORS_SHOWN = 3;

export type Photo = { bytes: Uint8Array; contentType: string };
export type SceneReader = (photo: Photo) => Promise<unknown>;
export type OutcomeResult = { item: string; expected: boolean; actual: boolean | null };
export type CaseResult = {
  caseId: string;
  title: string;
  error: string | null;
  comparison: SceneComparison | null;
  outcomes: OutcomeResult[];
  passed: boolean;
  readScene: Scene | null;
};

export const observeFallen = (scene: Scene, items: string[], seconds: number): Map<string, boolean> => {
  const simulation = createSimulation(scene);
  for (let step = 0; step < seconds * STEPS_PER_SECOND; step += 1) simulation.step();
  return new Map(items.map((item) => [item, simulation.observe({ kind: 'fallen', item })]));
};

const failed = (drawingCase: DrawingCase, error: string): CaseResult => ({
  caseId: drawingCase.id,
  title: drawingCase.title,
  error,
  comparison: null,
  outcomes: drawingCase.outcomes.map((outcome) => ({ item: outcome.item, expected: outcome.fallen, actual: null })),
  passed: false,
  readScene: null,
});

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export const replayCase = async (drawingCase: DrawingCase, read: SceneReader, photo: Photo): Promise<CaseResult> => {
  let raw: unknown;
  try {
    raw = await read(photo);
  } catch (error) {
    return failed(drawingCase, `reader failed: ${messageOf(error)}`);
  }
  const validated = validateScene(raw);
  if (!validated.ok) return failed(drawingCase, `invalid scene: ${validated.errors.slice(0, ERRORS_SHOWN).join('; ')}`);

  const comparison = compareScenes(drawingCase.scene, validated.scene);
  const readIds = drawingCase.outcomes.flatMap((outcome) => comparison.idMap.get(outcome.item) ?? []);
  const fallen = observeFallen(validated.scene, readIds, SETTLE_SECONDS);
  const outcomes = drawingCase.outcomes.map((outcome) => {
    const readId = comparison.idMap.get(outcome.item);
    return { item: outcome.item, expected: outcome.fallen, actual: readId === undefined ? null : (fallen.get(readId) ?? null) };
  });

  const sceneMatches = [comparison.missing, comparison.extra, comparison.unflagged, comparison.invented].every((list) => list.length === 0);
  return {
    caseId: drawingCase.id,
    title: drawingCase.title,
    error: null,
    comparison,
    outcomes,
    passed: sceneMatches && outcomes.every((outcome) => outcome.actual === outcome.expected),
    readScene: validated.scene,
  };
};

const ERROR_SHOWN = 200;
const shorten = (text: string): string =>
  text.length <= ERROR_SHOWN ? text : `${text.slice(0, ERROR_SHOWN)}… [${text.length - ERROR_SHOWN} more characters]`;

const describeFall = (fallen: boolean | null): string => (fallen === null ? 'not read' : fallen ? 'falls' : 'stays up');

const caseDetails = (result: CaseResult): string[] => {
  if (result.error) return [shorten(result.error)];
  const comparison = result.comparison;
  const details: string[] = [];
  if (comparison) {
    const total = comparison.matched.length + comparison.missing.length;
    details.push(`${comparison.matched.length}/${total} items, worst position error ${(comparison.worstError * 100).toFixed(1)}% of the drawing`);
    const lists: [string, string[]][] = [
      ['missing', comparison.missing],
      ['extra', comparison.extra],
      ['unknown marks not flagged', comparison.unflagged],
      ['invented inside an unknown mark', comparison.invented],
    ];
    for (const [name, ids] of lists) if (ids.length > 0) details.push(`${name}: ${ids.join(', ')}`);
  }
  for (const outcome of result.outcomes) {
    const verdict = outcome.actual === outcome.expected ? 'ok' : 'WRONG';
    details.push(`${outcome.item}: expected ${describeFall(outcome.expected)}, read scene ${describeFall(outcome.actual)} (${verdict})`);
  }
  return details;
};

export const formatReport = (results: CaseResult[]): string => {
  const width = Math.max(...results.map((result) => result.caseId.length));
  const passed = results.filter((result) => result.passed).length;
  const lines = results.flatMap((result) => [
    `${result.caseId.padEnd(width)}  ${result.passed ? 'PASS' : 'FAIL'}  ${result.title}`,
    ...caseDetails(result).map((detail) => `${' '.repeat(width + 8)}${detail}`),
  ]);
  return [...lines, '', `${passed} of ${results.length} drawings read correctly`].join('\n');
};
