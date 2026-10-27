import { describe, expect, it } from 'vitest';
import type { Scene } from '../scene/schema';
import { DRAWING_CASES, type DrawingCase } from './cases';
import { formatReport, replayCase, type SceneReader } from './replay';
import { stubReader } from './readers';

const PHOTO = { bytes: new Uint8Array([1, 2, 3]), contentType: 'image/png' };
const STUBBY_HEIGHT = 30;

const caseById = (id: string): DrawingCase => {
  const found = DRAWING_CASES.find((drawingCase) => drawingCase.id === id);
  if (!found) throw new Error(`no case ${id}`);
  return found;
};

const readsAs = (scene: unknown): SceneReader => () => Promise.resolve(scene);

const replayAll = (readerFor: (drawingCase: DrawingCase) => SceneReader) =>
  Promise.all(DRAWING_CASES.map((drawingCase) => replayCase(drawingCase, readerFor(drawingCase), PHOTO)));

describe('replayCase', () => {
  it('passes every case for a reader that returns the expected scene (positive control)', async () => {
    const results = await replayAll((drawingCase) => readsAs(drawingCase.scene));
    expect(results.map((result) => [result.caseId, result.passed])).toEqual(DRAWING_CASES.map((c) => [c.id, true]));
  });

  it('passes only the sample drawing and its photo for the stub, which always returns the sample scene', async () => {
    const results = await replayAll(() => stubReader);
    const passed = results.filter((result) => result.passed).map((result) => result.caseId);
    expect(passed).toEqual(['ramp-ball-dominoes', 'ramp-ball-dominoes-photo']);
  });

  it('fails a case whose items all match but whose outcome changes', async () => {
    const sample = caseById('ramp-ball-dominoes');
    const stubby: Scene = {
      ...sample.scene,
      items: sample.scene.items.map((item) => (item.id === 'domino-3' ? { ...item, height: STUBBY_HEIGHT } : item)),
    };
    const result = await replayCase(sample, readsAs(stubby), PHOTO);
    expect(result.comparison?.missing).toEqual([]);
    expect(result.outcomes).toEqual([{ item: 'domino-5', expected: true, actual: false }]);
    expect(result.passed).toBe(false);
  });

  it('fails, without throwing, when the reader returns an invalid scene', async () => {
    const result = await replayCase(caseById('pendulum-knock'), readsAs({ version: 1, items: 'nope' }), PHOTO);
    expect(result.passed).toBe(false);
    expect(result.error).toMatch(/^invalid scene: /);
  });

  it('fails, without throwing, when the reader fails', async () => {
    const broken: SceneReader = () => Promise.reject(new Error('reader offline'));
    const result = await replayCase(caseById('pendulum-knock'), broken, PHOTO);
    expect(result.passed).toBe(false);
    expect(result.error).toBe('reader failed: reader offline');
  });

  it('marks an outcome as unknown when its item was not read', async () => {
    const sample = caseById('ramp-ball-dominoes');
    const withoutLast = { ...sample.scene, items: sample.scene.items.filter((item) => item.id !== 'domino-5') };
    const result = await replayCase(sample, readsAs(withoutLast), PHOTO);
    expect(result.outcomes).toEqual([{ item: 'domino-5', expected: true, actual: null }]);
  });
});

describe('formatReport', () => {
  it('summarises how many drawings were read correctly and says why the others failed', async () => {
    const results = await replayAll(() => stubReader);
    const report = formatReport(results);
    expect(report).toContain(`2 of ${DRAWING_CASES.length} drawings read correctly`);
    expect(report).toMatch(/pendulum-knock\s+FAIL/);
    expect(report).toContain('missing: pulley');
  });
});
