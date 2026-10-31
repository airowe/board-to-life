import { angleAt, angleSum, imageOf, IMAGE_SUFFIX, positionsOf, type Positions } from '../geometry/derive';
import { fittedOrDrawn } from '../geometry/fit';
import { suggestedFocus, type FigureFact } from '../geometry/focus';
import { templateFigureQuestion } from '../geometry/questions';
import type { FigureSample } from '../geometry/samples';
import type { Figure, Mark, Polygon, Transformation } from '../geometry/schema';

export type FigureScore = { played: boolean; mismatches: string[] };

export type FigureScoringMode = 'drawn' | 'described';

export type FigureDescriptionCase = { sampleId: string; text: string };

export const ANGLE_TOLERANCE_DEGREES = 2;
export const LANDING_TOLERANCE = 0.05;
export const FACTOR_TOLERANCE = 0.01;

const FULL_TURN = 360;
const HALF_TURN = 180;

type AngleMark = Extract<Mark, { kind: 'angle' }>;
type Pairing = Map<string, string>;

export const FIGURE_DESCRIPTION_CASES: readonly FigureDescriptionCase[] = [
  {
    sampleId: 'triangle',
    text: 'A triangle ABC. The angle at A is written as 50 degrees and the angle at B is written as 60 degrees. The angle at C is not written.',
  },
  {
    sampleId: 'parallel',
    text:
      'Two parallel lines PQ and RS, with a transversal TU crossing both. The transversal crosses PQ at a point P1 and RS at a point P2. ' +
      'The angle at P1 between P1T and P1Q is written as 65 degrees, and the matching angle at P2 between P2T and P2S is marked with no value.',
  },
  {
    sampleId: 'reflection',
    text: 'A triangle ABC on the left of a vertical mirror line MN. Reflect triangle ABC in the mirror line MN.',
  },
  {
    sampleId: 'rotation',
    text: 'A triangle ABC to the right of a point O. Rotate triangle ABC by 90 degrees counterclockwise about O.',
  },
  {
    sampleId: 'triangle-messy',
    text: 'A triangle ABC, drawn a little untidily. The angle at A is written as 50 degrees and the angle at B is written as 60 degrees.',
  },
];

const key = (id: string): string => id.trim().toLowerCase();

const scaledToSample = (positions: Positions, from: Figure['drawing'], to: Figure['drawing']): Positions =>
  Object.fromEntries(
    Object.entries(positions).map(([id, point]) => [id, { x: (point.x * to.width) / from.width, y: (point.y * to.height) / from.height }]),
  );

const nearestUnused = (target: { x: number; y: number }, candidates: Positions, used: Set<string>, within: number): string | undefined => {
  const near = Object.entries(candidates)
    .filter(([id]) => !used.has(id))
    .map(([id, point]) => ({ id, gap: Math.hypot(point.x - target.x, point.y - target.y) }))
    .filter(({ gap }) => gap <= within)
    .sort((a, b) => a.gap - b.gap);
  return near[0]?.id;
};

const pairPoints = (sample: Figure, readPositions: Positions, samplePositions: Positions, mode: FigureScoringMode): Pairing => {
  const readIds = new Map(Object.keys(readPositions).map((id) => [key(id), id]));
  const pairing: Pairing = new Map();
  for (const entry of sample.points) {
    const found = readIds.get(key(entry.id));
    if (found !== undefined) pairing.set(entry.id, found);
  }
  if (mode === 'drawn') {
    const used = new Set(pairing.values());
    const within = LANDING_TOLERANCE * sample.drawing.width;
    for (const entry of sample.points.filter(({ id }) => !pairing.has(id))) {
      const target = samplePositions[entry.id];
      const found = target && nearestUnused(target, readPositions, used, within);
      if (found !== undefined) {
        pairing.set(entry.id, found);
        used.add(found);
      }
    }
  }
  return pairing;
};

const inSampleIds = (pairing: Pairing, readPositions: Positions): Positions =>
  Object.fromEntries([...pairing].flatMap(([sampleId, readId]) => (readPositions[readId] ? [[sampleId, readPositions[readId]] as const] : [])));

const sameSet = (first: readonly string[], second: readonly string[]): boolean =>
  first.length === second.length && first.every((id) => second.some((other) => key(other) === key(id)));

const readIdsOf = (pairing: Pairing, sampleIds: readonly string[]): string[] | null => {
  const ids = sampleIds.map((id) => pairing.get(id));
  return ids.every((id): id is string => id !== undefined) ? ids : null;
};

const cornerName = (entry: AngleMark): string => `angle at ${entry.at} (${entry.from}${entry.at}${entry.to})`;

const cornerAngle = (positions: Positions, entry: AngleMark): number | null => {
  const [at, from, to] = [positions[entry.at], positions[entry.from], positions[entry.to]];
  return at && from && to ? angleAt(at, from, to) : null;
};

const within = (got: number | null, wanted: number, tolerance: number): boolean => got !== null && Math.abs(got - wanted) <= tolerance;

const turnApart = (first: number, second: number): number => Math.abs((((first - second) % FULL_TURN) + FULL_TURN + HALF_TURN) % FULL_TURN - HALF_TURN);

const sameCorner = (read: AngleMark, wanted: AngleMark, pairing: Pairing): boolean => {
  const [at, ...ends] = [wanted.at, wanted.from, wanted.to].map((id) => pairing.get(id));
  return at !== undefined && key(read.at) === key(at) && sameSet([read.from, read.to], ends.filter((id): id is string => id !== undefined));
};

const cornerMismatches = (sample: FigureSample, expected: Positions, read: Positions, readFigure: Figure, pairing: Pairing): string[] => {
  const angleMarks = sample.figure.marks.filter((entry): entry is AngleMark => entry.kind === 'angle');
  return angleMarks.flatMap((entry) => {
    const name = cornerName(entry);
    const wanted = cornerAngle(expected, entry);
    if (wanted === null) return [];
    const problems: string[] = [];
    if (!within(cornerAngle(read, entry), wanted, ANGLE_TOLERANCE_DEGREES)) {
      const got = cornerAngle(read, entry);
      problems.push(`${name}: expected ${wanted.toFixed(1)}°, got ${got === null ? 'nothing' : `${got.toFixed(1)}°`}`);
    }
    if (entry.degrees !== undefined) {
      const written = readFigure.marks.filter((mark): mark is AngleMark => mark.kind === 'angle' && sameCorner(mark, entry, pairing));
      const matches = written.some((mark) => mark.degrees !== undefined && within(mark.degrees, entry.degrees ?? 0, ANGLE_TOLERANCE_DEGREES));
      if (!matches) problems.push(`${name}: written ${entry.degrees}° not read at that corner`);
    }
    return problems;
  });
};

const polygonOf = (figure: Figure, id: string): Polygon | undefined => figure.polygons.find((entry) => entry.id === id);

const angleSumMismatches = (sample: FigureSample, fact: Extract<FigureFact, { kind: 'angle-sum' }>, readFigure: Figure, pairing: Pairing, read: Positions): string[] => {
  const polygon = polygonOf(sample.figure, fact.polygon);
  const label = `angle sum of ${polygon?.vertices.join('') ?? fact.polygon}`;
  const readIds = polygon && readIdsOf(pairing, polygon.vertices);
  const found = readIds && readFigure.polygons.some((entry) => sameSet(entry.vertices, readIds));
  if (!polygon || !found) return [`${label}: polygon not found in the read figure`];
  const sum = angleSum(read, polygon);
  return within(sum, fact.degrees, ANGLE_TOLERANCE_DEGREES) ? [] : [`${label}: expected ${fact.degrees}°, got ${sum === null ? 'nothing' : `${sum.toFixed(1)}°`}`];
};

const transformationIn = (figure: Figure, id: string): Transformation | undefined => figure.transformations.find((entry) => entry.id === id);

const readCounterpart = (sample: Figure, wanted: Transformation, readFigure: Figure, pairing: Pairing): Transformation | undefined => {
  const polygon = polygonOf(sample, wanted.polygon);
  const readIds = polygon && readIdsOf(pairing, polygon.vertices);
  return readIds
    ? readFigure.transformations.find((entry) => {
        const readPolygon = polygonOf(readFigure, entry.polygon);
        return entry.kind === wanted.kind && readPolygon !== undefined && sameSet(readPolygon.vertices, readIds);
      })
    : undefined;
};

const centreMismatch = (label: string, wantedCentre: string, readCentre: string, pairing: Pairing): string[] => {
  const expected = pairing.get(wantedCentre);
  return expected !== undefined && key(expected) === key(readCentre) ? [] : [`${label}: expected centre ${wantedCentre}, got ${readCentre}`];
};

const describedMismatches = (wanted: Transformation, read: Transformation, pairing: Pairing): string[] => {
  if (wanted.kind === 'reflect' && read.kind === 'reflect') {
    const expected = readIdsOf(pairing, wanted.mirror);
    return expected !== null && sameSet(read.mirror, expected) ? [] : [`reflection: expected mirror ${wanted.mirror.join('')}, got ${read.mirror.join('')}`];
  }
  if (wanted.kind === 'rotate' && read.kind === 'rotate') {
    const angle = turnApart(read.degrees, wanted.degrees) <= ANGLE_TOLERANCE_DEGREES ? [] : [`rotation: expected ${wanted.degrees} degrees, got ${read.degrees} degrees`];
    return [...angle, ...centreMismatch('rotation', wanted.centre, read.centre, pairing)];
  }
  if (wanted.kind === 'dilate' && read.kind === 'dilate') {
    const factor = Math.abs(read.factor - wanted.factor) <= FACTOR_TOLERANCE * wanted.factor ? [] : [`dilation: expected factor ${wanted.factor}, got ${read.factor}`];
    return [...factor, ...centreMismatch('dilation', wanted.centre, read.centre, pairing)];
  }
  return [];
};

const landingMismatches = (
  sample: FigureSample,
  fact: Extract<FigureFact, { kind: 'lands' }>,
  readFigure: Figure,
  read: Positions,
  wanted: Transformation,
  counterpart: Transformation,
  pairing: Pairing,
): string[] => {
  const polygon = polygonOf(readFigure, counterpart.polygon);
  if (!polygon) return [];
  const toSampleId = new Map([...pairing].map(([sampleId, readId]) => [readId, sampleId]));
  const landed = Object.fromEntries(
    Object.entries(imageOf(read, counterpart, polygon)).map(([id, point]) => {
      const base = id.slice(0, -IMAGE_SUFFIX.length);
      return [`${toSampleId.get(base) ?? base}${IMAGE_SUFFIX}`, point];
    }),
  );
  const allowed = LANDING_TOLERANCE * sample.figure.drawing.width;
  return Object.entries(fact.image).flatMap(([id, target]) => {
    const point = landed[id];
    const gap = point === undefined ? Number.NaN : Math.hypot(point.x - target.x, point.y - target.y);
    return gap <= allowed ? [] : [`${id} (${wanted.kind}): expected near (${target.x.toFixed(0)}, ${target.y.toFixed(0)}), got ${point ? `(${point.x.toFixed(0)}, ${point.y.toFixed(0)})` : 'nothing'}`];
  });
};

const transformationMismatches = (
  sample: FigureSample,
  fact: Extract<FigureFact, { kind: 'lands' | 'congruent' | 'area-scale' }>,
  readFigure: Figure,
  read: Positions,
  pairing: Pairing,
  mode: FigureScoringMode,
): string[] => {
  const wanted = transformationIn(sample.figure, fact.transformation);
  if (!wanted) return [];
  const counterpart = readCounterpart(sample.figure, wanted, readFigure, pairing);
  if (!counterpart) return fact.kind === 'lands' ? [`${wanted.kind} of ${wanted.polygon}: not found in the read figure`] : [];
  if (mode === 'described') return fact.kind === 'lands' ? describedMismatches(wanted, counterpart, pairing) : [];
  return fact.kind === 'lands' ? landingMismatches(sample, fact, readFigure, read, wanted, counterpart, pairing) : [];
};

const factMismatches = (
  sample: FigureSample,
  fact: FigureFact,
  readFigure: Figure,
  read: Positions,
  pairing: Pairing,
  mode: FigureScoringMode,
): string[] => {
  switch (fact.kind) {
    case 'angle-sum':
      return angleSumMismatches(sample, fact, readFigure, pairing, inSampleIds(pairing, read));
    case 'equal-angles':
      return [];
    default:
      return transformationMismatches(sample, fact, readFigure, read, pairing, mode);
  }
};

const extraPolygonMismatches = (sample: Figure, readFigure: Figure, pairing: Pairing): string[] => {
  if (sample.transformations.length === 0) return [];
  const known = sample.polygons.map((entry) => readIdsOf(pairing, entry.vertices));
  const unmatched = readFigure.polygons.filter((entry) => !known.some((ids) => ids !== null && sameSet(entry.vertices, ids)));
  const unpaired = sample.polygons.filter((_, index) => {
    const ids = known[index];
    return ids === null || !readFigure.polygons.some((entry) => sameSet(entry.vertices, ids ?? []));
  });
  const pairedReadIds = new Set([...pairing.values()].map(key));
  const sharedWithSample = (polygon: Polygon): number => polygon.vertices.filter((id) => pairedReadIds.has(key(id))).length;
  const misreadSources = new Set(
    [...unmatched].sort((first, second) => sharedWithSample(second) - sharedWithSample(first)).slice(0, unpaired.length),
  );
  return unmatched
    .filter((entry) => !misreadSources.has(entry))
    .map((entry) => `extra polygon ${entry.vertices.join('')}: the transformed shape should be animated, not drawn`);
};

const answerKeyOf = (figure: Figure): string | null => {
  const focus = suggestedFocus(figure);
  return focus === null ? null : templateFigureQuestion(figure, focus).answer;
};

const answerKeyMismatches = (sampleFigure: Figure, readFigure: Figure): string[] => {
  const wanted = answerKeyOf(sampleFigure);
  if (wanted === null) return [];
  const got = answerKeyOf(readFigure);
  if (got === wanted) return [];
  return [`answer key: expected "${wanted}", got ${got === null ? 'no question' : `"${got}"`}`];
};

export const scoreFigure = (sample: FigureSample, read: Figure, mode: FigureScoringMode): FigureScore => {
  const readFigure = fittedOrDrawn(read);
  const sampleFigure = fittedOrDrawn(sample.figure);
  const expected = positionsOf(sampleFigure);
  const ownPositions = positionsOf(readFigure);
  const readPositions = mode === 'drawn' ? scaledToSample(ownPositions, readFigure.drawing, sample.figure.drawing) : ownPositions;
  const pairing = pairPoints(sample.figure, readPositions, expected, mode);
  const inSample = inSampleIds(pairing, readPositions);
  const mismatches = [
    ...cornerMismatches(sample, expected, inSample, readFigure, pairing),
    ...sample.expect.flatMap((fact) => factMismatches(sample, fact, readFigure, readPositions, pairing, mode)),
    ...extraPolygonMismatches(sample.figure, readFigure, pairing),
    ...answerKeyMismatches(sampleFigure, readFigure),
  ];
  return { played: mismatches.length === 0, mismatches };
};
