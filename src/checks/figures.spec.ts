import { describe, expect, it } from 'vitest';
import { GEOMETRY_SAMPLES, type FigureSample } from '../geometry/samples';
import type { Figure, Mark, Transformation } from '../geometry/schema';
import { PARALLEL_READ_CASE_5_RUN_1 } from '../geometry/fit.fixtures';
import { FIGURE_DESCRIPTION_CASES, scoreFigure } from './figures';

const sampleById = (id: string): FigureSample => {
  const sample = GEOMETRY_SAMPLES.find((entry) => entry.id === id);
  if (sample === undefined) throw new Error(`no sample ${id}`);
  return sample;
};

const withMarks = (figure: Figure, marks: Mark[]): Figure => ({ ...figure, marks });

const withTransformations = (figure: Figure, transformations: Transformation[]): Figure => ({ ...figure, transformations });

const lowercased = (figure: Figure): Figure => ({
  ...figure,
  points: figure.points.map((entry) => ({ ...entry, id: entry.id.toLowerCase() })),
  segments: figure.segments.map((entry) => ({ ...entry, from: entry.from.toLowerCase(), to: entry.to.toLowerCase() })),
  polygons: figure.polygons.map((entry) => ({ ...entry, vertices: entry.vertices.map((id) => id.toLowerCase()) })),
  marks: figure.marks.map((entry) =>
    entry.kind === 'angle' ? { ...entry, at: entry.at.toLowerCase(), from: entry.from.toLowerCase(), to: entry.to.toLowerCase() } : entry,
  ),
});

const renamedPoints = (figure: Figure, renames: Record<string, string>): Figure => {
  const rename = (id: string): string => renames[id] ?? id;
  return {
    ...figure,
    points: figure.points.map((entry) => ({ ...entry, id: rename(entry.id) })),
    lines: figure.lines.map((entry) => ({ ...entry, from: rename(entry.from), to: rename(entry.to) })),
    marks: figure.marks.map((entry) => {
      if (entry.kind === 'angle') return { ...entry, at: rename(entry.at), from: rename(entry.from), to: rename(entry.to) };
      if (entry.kind === 'parallel') return { ...entry, lines: entry.lines.map(([a, b]): [string, string] => [rename(a), rename(b)]) };
      return entry;
    }),
  };
};

describe('scoreFigure', () => {
  it.each(GEOMETRY_SAMPLES.map((sample) => sample.id))('plays the %s sample read back exactly', (id) => {
    const sample = sampleById(id);
    expect(scoreFigure(sample, sample.figure, 'drawn')).toEqual({ played: true, mismatches: [] });
  });

  it('matches point ids case-insensitively', () => {
    const sample = sampleById('triangle');
    expect(scoreFigure(sample, lowercased(sample.figure), 'drawn')).toEqual({ played: true, mismatches: [] });
  });

  it('matches unlabelled points by position when the read invents other ids', () => {
    const sample = sampleById('parallel');
    const read = renamedPoints(sample.figure, { P1: 'X1', P2: 'X2' });
    expect(scoreFigure(sample, read, 'drawn')).toEqual({ played: true, mismatches: [] });
  });

  it('does not play a triangle whose 50° and 60° are both attached to B', () => {
    const sample = sampleById('triangle');
    const misplaced = withMarks(sample.figure, [
      { id: 'mA', kind: 'angle', at: 'B', from: 'C', to: 'A', degrees: 50, confidence: 1 },
      { id: 'mB', kind: 'angle', at: 'B', from: 'A', to: 'C', degrees: 60, confidence: 1 },
    ]);
    const score = scoreFigure(sample, misplaced, 'drawn');
    expect(score.played).toBe(false);
    expect(score.mismatches).toContain('angle at A (BAC): written 50° not read at that corner');
  });

  it('does not play a triangle whose angles are read swapped between A and B', () => {
    const sample = sampleById('triangle');
    const swapped = withMarks(sample.figure, [
      { id: 'mA', kind: 'angle', at: 'A', from: 'B', to: 'C', degrees: 60, confidence: 1 },
      { id: 'mB', kind: 'angle', at: 'B', from: 'C', to: 'A', degrees: 50, confidence: 1 },
    ]);
    const score = scoreFigure(sample, swapped, 'drawn');
    expect(score.played).toBe(false);
    expect(score.mismatches.join(' ')).toMatch(/angle at (A|B)/);
  });

  it('does not play a rotation read as -90°', () => {
    const sample = sampleById('rotation');
    const [turn] = sample.figure.transformations;
    if (turn?.kind !== 'rotate') throw new Error('rotation sample has no rotation');
    const read = withTransformations(sample.figure, [{ ...turn, degrees: -90 }]);
    const score = scoreFigure(sample, read, 'drawn');
    expect(score.played).toBe(false);
    expect(score.mismatches.length).toBeGreaterThan(0);
  });

  it('does not play a reflection read in a mirror moved to x=800', () => {
    const sample = sampleById('reflection');
    const [flip] = sample.figure.transformations;
    if (flip?.kind !== 'reflect') throw new Error('reflection sample has no reflection');
    const moved: Figure = {
      ...sample.figure,
      points: sample.figure.points.map((entry) => (entry.id === 'M' || entry.id === 'N' ? { ...entry, x: 800 } : entry)),
    };
    const score = scoreFigure(sample, moved, 'drawn');
    expect(score.played).toBe(false);
    expect(score.mismatches).toHaveLength(3);
    expect(score.mismatches[0]).toBe('A′ (reflect): expected near (950, 250), got (1350, 250)');
  });

  it('ignores positions in described mode but compares the transformation', () => {
    const sample = sampleById('rotation');
    const shifted: Figure = {
      ...sample.figure,
      points: sample.figure.points.map((entry) => ({ ...entry, x: entry.x * 0.5, y: entry.y * 0.5 })),
    };
    expect(scoreFigure(sample, shifted, 'described')).toEqual({ played: true, mismatches: [] });
    const [turn] = sample.figure.transformations;
    if (turn?.kind !== 'rotate') throw new Error('rotation sample has no rotation');
    const clockwise = withTransformations(shifted, [{ ...turn, degrees: -90 }]);
    const score = scoreFigure(sample, clockwise, 'described');
    expect(score.played).toBe(false);
    expect(score.mismatches.join(' ')).toMatch(/degrees|-90|90/);
  });

  it('names a missing transformation', () => {
    const sample = sampleById('reflection');
    const score = scoreFigure(sample, withTransformations(sample.figure, []), 'described');
    expect(score.played).toBe(false);
    expect(score.mismatches.join(' ')).toMatch(/reflect/);
  });
});

describe('scoreFigure in described mode on a stretched drawing', () => {
  const STRETCH = 1.3333;
  const OFFSET = 40;
  const stretched = (figure: Figure): Figure => ({
    ...figure,
    drawing: { width: 1600, height: 1200 },
    points: figure.points.map((entry) => ({ ...entry, x: entry.x * STRETCH + OFFSET, y: entry.y * STRETCH + OFFSET })),
  });

  it('plays a triangle read onto a 4:3 drawing', () => {
    const sample = sampleById('triangle');
    expect(scoreFigure(sample, stretched(sample.figure), 'described')).toEqual({ played: true, mismatches: [] });
  });

  it('still fails the same stretched read when the angles are swapped', () => {
    const sample = sampleById('triangle');
    const swapped = withMarks(stretched(sample.figure), [
      { id: 'mA', kind: 'angle', at: 'A', from: 'B', to: 'C', degrees: 60, confidence: 1 },
      { id: 'mB', kind: 'angle', at: 'B', from: 'C', to: 'A', degrees: 50, confidence: 1 },
    ]);
    const score = scoreFigure(sample, swapped, 'described');
    expect(score.played).toBe(false);
    expect(score.mismatches).toContain('angle at A (BAC): written 50° not read at that corner');
  });
});

describe('scoreFigure dilation factor in described mode', () => {
  const dilationSample = (): FigureSample => {
    const base = sampleById('rotation');
    const dilate: Transformation = { id: 'turn', kind: 'dilate', centre: 'O', factor: 2, polygon: 'abc', confidence: 1 };
    return { ...base, figure: withTransformations(base.figure, [dilate]), expect: [{ kind: 'lands', transformation: 'turn', image: {} }] };
  };

  it.each([
    { factor: 2.01, played: true },
    { factor: 2.1, played: false },
  ])('factor $factor plays: $played', ({ factor, played }) => {
    const sample = dilationSample();
    const read = withTransformations(sample.figure, [{ id: 'turn', kind: 'dilate', centre: 'O', factor, polygon: 'abc', confidence: 1 }]);
    const score = scoreFigure(sample, read, 'described');
    expect(score.played).toBe(played);
    if (!played) expect(score.mismatches).toEqual(['dilation: expected factor 2, got 2.1']);
  });
});

describe('scoreFigure transformation anchors in described mode', () => {
  it.each([
    { wrong: ['A', 'B'], note: 'a different mirror line' },
    { wrong: ['M', 'A'], note: 'a mirror line with one wrong end' },
  ])('does not play a reflection read with $note', ({ wrong }) => {
    const sample = sampleById('reflection');
    const [flip] = sample.figure.transformations;
    if (flip?.kind !== 'reflect') throw new Error('reflection sample has no reflection');
    const [first, second] = wrong;
    const read = withTransformations(sample.figure, [{ ...flip, mirror: [first ?? 'A', second ?? 'B'] }]);
    const score = scoreFigure(sample, read, 'described');
    expect(score.played).toBe(false);
    expect(score.mismatches).toEqual([`reflection: expected mirror ${flip.mirror.join('')}, got ${wrong.join('')}`]);
  });

  it('plays a reflection whose mirror ends are listed in the other order', () => {
    const sample = sampleById('reflection');
    const [flip] = sample.figure.transformations;
    if (flip?.kind !== 'reflect') throw new Error('reflection sample has no reflection');
    const [first, second] = flip.mirror;
    const read = withTransformations(sample.figure, [{ ...flip, mirror: [second, first] }]);
    expect(scoreFigure(sample, read, 'described')).toEqual({ played: true, mismatches: [] });
  });

  it('does not play a rotation about the wrong centre', () => {
    const sample = sampleById('rotation');
    const [turn] = sample.figure.transformations;
    if (turn?.kind !== 'rotate') throw new Error('rotation sample has no rotation');
    const read = withTransformations(sample.figure, [{ ...turn, centre: 'A' }]);
    const score = scoreFigure(sample, read, 'described');
    expect(score.played).toBe(false);
    expect(score.mismatches).toEqual([`rotation: expected centre ${turn.centre}, got A`]);
  });

  it('does not play a dilation about the wrong centre', () => {
    const base = sampleById('rotation');
    const dilate: Transformation = { id: 'turn', kind: 'dilate', centre: 'O', factor: 2, polygon: 'abc', confidence: 1 };
    const sample: FigureSample = { ...base, figure: withTransformations(base.figure, [dilate]), expect: [{ kind: 'lands', transformation: 'turn', image: {} }] };
    const read = withTransformations(sample.figure, [{ ...dilate, centre: 'A' }]);
    const score = scoreFigure(sample, read, 'described');
    expect(score.played).toBe(false);
    expect(score.mismatches).toEqual(['dilation: expected centre O, got A']);
  });
});

describe('FIGURE_DESCRIPTION_CASES', () => {
  it('has one non-empty description per sample', () => {
    expect(FIGURE_DESCRIPTION_CASES.map((entry) => entry.sampleId).sort()).toEqual(GEOMETRY_SAMPLES.map((entry) => entry.id).sort());
    for (const entry of FIGURE_DESCRIPTION_CASES) expect(entry.text.length).toBeGreaterThan(20);
  });
});

describe('scoreFigure answer key for invariant samples', () => {
  const ANSWER_KEY_SOMETIMES = 'answer key: expected "Yes, always", got "Only sometimes"';
  const ANSWER_KEY_MISSING = 'answer key: expected "Yes, always", got no question';

  it('fails a parallel read whose second marked angle is the supplement, naming the answer key', () => {
    const sample = sampleById('parallel');
    const supplement = withMarks(
      sample.figure,
      sample.figure.marks.map((entry) => (entry.kind === 'angle' && entry.id === 'm2' ? { ...entry, to: 'R' } : entry)),
    );
    expect(scoreFigure(sample, supplement, 'drawn')).toEqual({ played: false, mismatches: [ANSWER_KEY_SOMETIMES] });
  });

  it('fails a parallel read with no parallel mark, because there is no question to ask', () => {
    const sample = sampleById('parallel');
    const unmarked = withMarks(sample.figure, sample.figure.marks.filter((entry) => entry.kind !== 'parallel'));
    expect(scoreFigure(sample, unmarked, 'drawn')).toEqual({ played: false, mismatches: [ANSWER_KEY_MISSING] });
  });

  it('accepts the answer key of a read whose T sits close to PQ', () => {
    const score = scoreFigure(sampleById('parallel'), PARALLEL_READ_CASE_5_RUN_1, 'drawn');
    expect(score.mismatches.filter((entry) => entry.startsWith('answer key'))).toEqual([]);
  });

  it.each(['triangle', 'triangle-messy'])('fails a %s read with no polygon on the answer key', (id) => {
    const sample = sampleById(id);
    const score = scoreFigure(sample, { ...sample.figure, polygons: [] }, 'drawn');
    expect(score.mismatches).toContain(ANSWER_KEY_MISSING);
  });
});

describe('scoreFigure extra image polygons in transformation cases', () => {
  const IMAGE_POINTS = [
    { id: 'P1', x: 500, y: 250 },
    { id: 'P2', x: 550, y: 100 },
    { id: 'P3', x: 700, y: 200 },
  ];
  const withDrawnImage = (figure: Figure): Figure => ({
    ...figure,
    points: [...figure.points, ...IMAGE_POINTS.map((entry) => ({ ...entry, confidence: 1 }))],
    polygons: [...figure.polygons, { id: 'img', vertices: IMAGE_POINTS.map((entry) => entry.id), confidence: 1 }],
  });
  const EXTRA = 'extra polygon P1P2P3: the transformed shape should be animated, not drawn';

  it.each([
    ['rotation', 'drawn'],
    ['rotation', 'described'],
    ['reflection', 'described'],
  ] as const)('fails a %s read (%s) that also draws an image polygon, naming it', (id, mode) => {
    const sample = sampleById(id);
    expect(scoreFigure(sample, withDrawnImage(sample.figure), mode)).toEqual({ played: false, mismatches: [EXTRA] });
  });

  it('does not call the source shape an extra polygon when one of its letters is misread', () => {
    const sample = sampleById('rotation');
    const misread = (id: string): string => (id === 'A' ? 'Q' : id);
    const read: Figure = {
      ...sample.figure,
      points: sample.figure.points.map((entry) => ({ ...entry, id: misread(entry.id) })),
      segments: sample.figure.segments.map((entry) => ({ ...entry, from: misread(entry.from), to: misread(entry.to) })),
      polygons: sample.figure.polygons.map((entry) => ({ ...entry, vertices: entry.vertices.map(misread) })),
    };
    const { played, mismatches } = scoreFigure(sample, read, 'described');
    expect(played).toBe(false);
    expect(mismatches.filter((entry) => entry.startsWith('extra polygon'))).toEqual([]);
  });

  it('still names a drawn image when a source letter is also misread', () => {
    const sample = sampleById('rotation');
    const misread = (id: string): string => (id === 'A' ? 'Q' : id);
    const read = withDrawnImage({
      ...sample.figure,
      points: sample.figure.points.map((entry) => ({ ...entry, id: misread(entry.id) })),
      polygons: sample.figure.polygons.map((entry) => ({ ...entry, vertices: entry.vertices.map(misread) })),
    });
    expect(scoreFigure(sample, read, 'described').mismatches.filter((entry) => entry.startsWith('extra polygon'))).toHaveLength(1);
  });

  it('does not count a second polygon in a sample with no transformation', () => {
    const sample = sampleById('triangle');
    expect(scoreFigure(sample, withDrawnImage(sample.figure), 'described')).toEqual({ played: true, mismatches: [] });
  });
});
