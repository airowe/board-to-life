// Generates the hand-drawn-style test drawing used by the stub scene.
// Coordinates match src/scene/fixtures.ts (1200 x 800 drawing space).
import { writeFileSync } from 'node:fs';
import { URL } from 'node:url';

let seed = 7;
const random = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const jitter = (amount) => (random() - 0.5) * amount;

const wobblyLine = (x1, y1, x2, y2, wobble = 3) => {
  const segments = Math.max(4, Math.round(Math.hypot(x2 - x1, y2 - y1) / 40));
  const points = Array.from({ length: segments + 1 }, (_, i) => {
    const t = i / segments;
    const edge = i === 0 || i === segments ? 0.6 : 1;
    return [x1 + (x2 - x1) * t + jitter(wobble * edge), y1 + (y2 - y1) * t + jitter(wobble * edge)];
  });
  return `M${points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')}`;
};

const wobblyCircle = (cx, cy, r) => {
  const steps = 28;
  const points = Array.from({ length: steps + 2 }, (_, i) => {
    const a = (i / steps) * Math.PI * 2 - 0.3;
    const rr = r + jitter(3);
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
  });
  return `M${points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')}`;
};

const wobblyRect = (cx, cy, w, h) => {
  const [l, r, t, b] = [cx - w / 2, cx + w / 2, cy - h / 2, cy + h / 2];
  return [wobblyLine(l, t, r, t, 2), wobblyLine(r, t, r, b, 2), wobblyLine(r, b, l, b, 2), wobblyLine(l, b, l, t + 3, 2)].join(' ');
};

const stroke = (d, colour, width = 6) =>
  `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" opacity="0.92"/>`;

const black = '#1d2433';
const blue = '#1f4fbf';
const red = '#c0392b';

const parts = [
  stroke(wobblyLine(20, 742, 1180, 740, 4), black, 7),
  stroke(wobblyLine(60, 330, 470, 728, 4), black, 7),
  stroke(wobblyCircle(104, 330, 30), blue, 6),
  stroke(wobblyLine(150, 288, 230, 288, 2), red, 5),
  stroke(wobblyLine(212, 276, 232, 288, 1) + ' ' + wobblyLine(212, 300, 232, 288, 1), red, 5),
  ...[640, 712, 784, 856, 928].map((x) => stroke(wobblyRect(x, 685, 18, 110), black, 5)),
  stroke(wobblyRect(1150, 590, 24, 300), black, 6),
  // The board legend: fixed things are hatched.
  ...Array.from({ length: 22 }, (_, i) => {
    const y = 448 + i * 13;
    return stroke(wobblyLine(1140, Math.min(y + 20, 738), 1160, y, 1), black, 3);
  }),
  stroke(wobblyCircle(1060, 145, 32), '#d68910', 5),
  ...Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return stroke(wobblyLine(1060 + Math.cos(a) * 42, 145 + Math.sin(a) * 42, 1060 + Math.cos(a) * 58, 145 + Math.sin(a) * 58, 1), '#d68910', 4);
  }),
];

const text = (x, y, value, colour, rotate = 0) =>
  `<text x="${x}" y="${y}" fill="${colour}" font-family="Marker Felt, Comic Sans MS, cursive" font-size="34" transform="rotate(${rotate} ${x} ${y})">${value}</text>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" width="1200" height="800">
  <defs>
    <radialGradient id="board" cx="45%" cy="40%" r="80%">
      <stop offset="0" stop-color="#fbfbf8"/>
      <stop offset="0.7" stop-color="#eeeeea"/>
      <stop offset="1" stop-color="#d9d9d3"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="800" fill="url(#board)"/>
  ${parts.join('\n  ')}
  ${text(150, 262, 'push', red, -4)}
  ${text(300, 470, 'ramp', black, 44)}
</svg>
`;

writeFileSync(new URL('../public/samples/ramp-ball-dominoes.svg', import.meta.url), svg);
