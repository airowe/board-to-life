import { INK, LABEL_FONT, MARKER, RED, boardBackground, corners, escapeText, seededJitter, stroke, wobblyLine, wobblyPolygon, type Jitter, type Point } from '../checks/ink';
import type { Eats, Species, Web } from './schema';

const NAME_SIZE = 26;
const NAME_BASELINE_SHIFT = 9;
const LABEL_SIZE = 34;
const BOX_WIDTH = 4;
const ARROW_WIDTH = 5;
const ARROWHEAD_LENGTH = 24;
const ARROWHEAD_SPREAD = 13;
const MARK_WIDTH = 5;
const MARK_MARGIN = 10;
const CROSS_REACH = 0.3;

// Where the line from a box's centre to another point leaves the box.
const edgePoint = (box: Species, target: Point): Point => {
  const [dx, dy] = [target.x - box.x, target.y - box.y];
  const scale = Math.min(dx === 0 ? Infinity : box.width / 2 / Math.abs(dx), dy === 0 ? Infinity : box.height / 2 / Math.abs(dy));
  return { x: box.x + dx * scale, y: box.y + dy * scale };
};

const arrowhead = (jitter: Jitter, from: Point, tip: Point): string => {
  const length = Math.hypot(tip.x - from.x, tip.y - from.y) || 1;
  const [ux, uy] = [(tip.x - from.x) / length, (tip.y - from.y) / length];
  const barb = (side: number): Point => ({ x: tip.x - ux * ARROWHEAD_LENGTH - uy * ARROWHEAD_SPREAD * side, y: tip.y - uy * ARROWHEAD_LENGTH + ux * ARROWHEAD_SPREAD * side });
  return [wobblyLine(jitter, barb(1), tip, 1), wobblyLine(jitter, barb(-1), tip, 1)].join(' ');
};

const arrow = (jitter: Jitter, bySpecies: Map<string, Species>, entry: Eats): string[] => {
  const [eaten, eater] = [bySpecies.get(entry.from), bySpecies.get(entry.to)];
  if (!eaten || !eater) return [];
  const [start, tip] = [edgePoint(eaten, eater), edgePoint(eater, eaten)];
  return [
    stroke(wobblyLine(jitter, start, tip, 3), RED, ARROW_WIDTH, `data-arrow="${entry.id}"`),
    stroke(arrowhead(jitter, start, tip), RED, ARROW_WIDTH, `data-arrowhead="${entry.id}"`),
  ];
};

const box = (jitter: Jitter, member: Species): string =>
  stroke(wobblyPolygon(jitter, corners(member, member.width, member.height, 0)), MARKER, BOX_WIDTH, `data-box="${member.id}"`);

const text = (x: number, y: number, size: number, content: string, anchor = 'start'): string =>
  `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${INK}" font-family="${LABEL_FONT}" font-size="${size}">${escapeText(content)}</text>`;

const name = (member: Species): string => text(member.x, member.y + NAME_BASELINE_SHIFT, NAME_SIZE, member.name, 'middle');

// What a teacher crosses out: a short arrow across the mark's box with an X through its middle.
const crossedOutArrow = (jitter: Jitter, mark: Web['unknownMarks'][number]): string[] => {
  const [start, tip] = [{ x: mark.x - mark.width / 2 + MARK_MARGIN, y: mark.y }, { x: mark.x + mark.width / 2 - MARK_MARGIN, y: mark.y }];
  const reach = Math.min(mark.width, mark.height) * CROSS_REACH;
  const stroked = (d: string, data: string): string => stroke(d, INK, MARK_WIDTH, data);
  return [
    stroked(`${wobblyLine(jitter, start, tip, 3)} ${arrowhead(jitter, start, tip)}`, `data-mark="${mark.id}"`),
    stroked(wobblyLine(jitter, { x: mark.x - reach, y: mark.y - reach }, { x: mark.x + reach, y: mark.y + reach }, 2), `data-mark-cross="${mark.id}"`),
    stroked(wobblyLine(jitter, { x: mark.x + reach, y: mark.y - reach }, { x: mark.x - reach, y: mark.y + reach }, 2), `data-mark-cross="${mark.id}"`),
  ];
};

export const sketchWeb = (web: Web, seed: number): string => {
  const jitter = seededJitter(seed);
  const bySpecies = new Map(web.species.map((member) => [member.id, member]));
  const { width, height } = web.drawing;
  const parts = [
    ...web.species.map((member) => box(jitter, member)),
    ...web.eats.flatMap((entry) => arrow(jitter, bySpecies, entry)),
    ...web.unknownMarks.flatMap((mark) => crossedOutArrow(jitter, mark)),
    ...web.species.map(name),
    ...web.labels.map((entry) => text(entry.x, entry.y, LABEL_SIZE, entry.text)),
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  ${boardBackground(width, height)}
  ${parts.join('\n  ')}
</svg>
`;
};
