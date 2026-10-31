import { describe, expect, it } from 'vitest';
import { positionsOf } from './derive';
import { createFigurePlayback, liveReadouts, TRANSFORM_SECONDS } from './playback';
import { suggestedFocus } from './focus';
import { templateFigureQuestion } from './questions';
import { GEOMETRY_SAMPLES } from './samples';
import type { Figure } from './schema';
import type { GeometryLesson } from '../session/store';

const sample = (id: string): Figure => {
  const found = GEOMETRY_SAMPLES.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`missing sample ${id}`);
  return found.figure;
};

const lessonOf = (figure: Figure): GeometryLesson => {
  const focus = suggestedFocus(figure);
  if (focus === null) throw new Error('no focus');
  return { subject: 'geometry', figure, questions: [templateFigureQuestion(figure, focus)] };
};

const TICK = 0.5;
const BIG_TICK = 100;
const MAX_ANGLE_SUM = '180°';
const MIRROR_SHIFT = 100;

describe('transform playback phases', () => {
  it('runs ready, predict, guessing, playing, exploring', () => {
    const playback = createFigurePlayback(lessonOf(sample('reflection')));
    expect(playback.phase()).toEqual({ kind: 'ready' });
    playback.play();
    expect(playback.phase().kind).toBe('predict');
    playback.answer();
    expect(playback.phase()).toEqual({ kind: 'guessing' });
    playback.reveal();
    expect(playback.phase()).toEqual({ kind: 'playing', t: 0 });
    playback.tick(TICK);
    expect(playback.phase()).toEqual({ kind: 'playing', t: TICK / TRANSFORM_SECONDS });
    playback.tick(BIG_TICK);
    expect(playback.phase()).toEqual({ kind: 'exploring' });
  });

  it('starts the ghost on the original and lets it be dragged while guessing', () => {
    const figure = sample('reflection');
    const playback = createFigurePlayback(lessonOf(figure));
    playback.play();
    playback.answer();
    expect(playback.ghostOffset()).toEqual({ x: 0, y: 0 });
    expect(playback.positions()['A′']).toEqual({ x: 250, y: 250 });
    playback.dragGhost({ x: 30, y: -10 });
    expect(playback.ghostOffset()).toEqual({ x: 30, y: -10 });
    expect(playback.positions()['A′']).toEqual({ x: 280, y: 240 });
  });

  it('ignores ghost drags outside guessing', () => {
    const playback = createFigurePlayback(lessonOf(sample('reflection')));
    playback.dragGhost({ x: 30, y: 30 });
    expect(playback.ghostOffset()).toEqual({ x: 0, y: 0 });
  });

  it('lands the image where the figure says once it has played', () => {
    const playback = createFigurePlayback(lessonOf(sample('reflection')));
    playback.play();
    playback.answer();
    playback.reveal();
    playback.tick(BIG_TICK);
    expect(playback.positions()['A′']).toEqual({ x: 950, y: 250 });
    expect(playback.positions()['C′']?.x).toBeCloseTo(900, 6);
  });
});

describe('invariant playback phases', () => {
  it('runs ready, predict, then exploring after the answer', () => {
    const playback = createFigurePlayback(lessonOf(sample('triangle')));
    playback.play();
    expect(playback.phase().kind).toBe('predict');
    playback.answer();
    expect(playback.phase()).toEqual({ kind: 'exploring' });
  });
});

describe('dragPoint', () => {
  const exploring = () => {
    const playback = createFigurePlayback(lessonOf(sample('triangle')));
    playback.play();
    playback.answer();
    return playback;
  };

  it('is ignored until exploring', () => {
    const playback = createFigurePlayback(lessonOf(sample('triangle')));
    playback.dragPoint('C', { x: 10, y: 10 });
    expect(playback.positions().C).toEqual({ x: 585, y: 255 });
  });

  it('clamps to the drawing', () => {
    const playback = exploring();
    playback.dragPoint('C', { x: -500, y: 5000 });
    expect(playback.positions().C).toEqual({ x: 0, y: 800 });
  });

  it('ignores an unknown id', () => {
    const playback = exploring();
    playback.dragPoint('Z', { x: 10, y: 10 });
    expect(playback.positions().Z).toBeUndefined();
  });

  it('changes the angle readouts while the angle sum stays 180', () => {
    const playback = exploring();
    const figure = sample('triangle');
    const before = liveReadouts(figure, playback.positions()).map((entry) => entry.text);
    playback.dragPoint('C', { x: 400, y: 300 });
    const after = liveReadouts(figure, playback.positions()).map((entry) => entry.text);
    expect(after).not.toEqual(before);
    expect(before).toContain(`A + B + C = ${MAX_ANGLE_SUM}`);
    expect(after).toContain(`A + B + C = ${MAX_ANGLE_SUM}`);
  });

  it('moves the unnamed crossings with a dragged transversal end', () => {
    const figure = sample('parallel');
    const playback = createFigurePlayback(lessonOf(figure));
    playback.play();
    playback.answer();
    playback.dragPoint('T', { x: 700, y: 150 });
    const { P1 } = playback.positions();
    expect(P1?.y).toBeCloseTo(300, 6);
  });
});

describe('liveReadouts', () => {
  it('reports whole degrees, centimetre-style lengths and the angle sum', () => {
    const figure: Figure = {
      ...sample('triangle'),
      marks: [
        ...sample('triangle').marks,
        { id: 'len', kind: 'length', from: 'A', to: 'B', value: 5, unit: 'cm', confidence: 1 },
      ],
    };
    const texts = liveReadouts(figure, positionsOf(figure)).map((entry) => entry.text);
    expect(texts).toContain('50°');
    expect(texts).toContain('5.0 cm');
    expect(texts).toContain('A + B + C = 180°');
  });

  it('says when marked-parallel lines are no longer parallel', () => {
    const figure = sample('parallel');
    const moved = { ...positionsOf(figure), S: { x: 850, y: 700 } };
    expect(liveReadouts(figure, moved).map((entry) => entry.text)).toContain('Not parallel now');
    expect(liveReadouts(figure, positionsOf(figure)).map((entry) => entry.text)).not.toContain('Not parallel now');
  });

  it('drops readouts that became null and never prints NaN', () => {
    const figure = sample('triangle');
    const playback = createFigurePlayback(lessonOf(figure));
    playback.play();
    playback.answer();
    const before = liveReadouts(figure, playback.positions()).length;
    playback.dragPoint('B', { x: 300, y: 600 });
    const readouts = liveReadouts(figure, playback.positions());
    expect(readouts.length).toBeLessThan(before);
    expect(readouts.some((entry) => entry.text.includes('NaN'))).toBe(false);
    expect(readouts.map((entry) => entry.text)).not.toContain('A + B + C = 180°');
  });
});

describe('replay', () => {
  it('keeps the old image, re-asks from the template and plays the new image', () => {
    const figure = sample('reflection');
    const playback = createFigurePlayback(lessonOf(figure));
    playback.play();
    playback.answer();
    playback.reveal();
    playback.tick(BIG_TICK);
    const oldImage = { 'A′': playback.positions()['A′'] };
    playback.dragPoint('M', { x: 600 + MIRROR_SHIFT, y: 100 });
    playback.dragPoint('N', { x: 600 + MIRROR_SHIFT, y: 700 });
    playback.replay();
    expect(playback.previousImage()?.['A′']).toEqual(oldImage['A′']);
    expect(playback.phase()).toEqual({ kind: 'ready' });
    playback.play();
    const phase = playback.phase();
    expect(phase.kind === 'predict' && phase.question).toEqual(
      templateFigureQuestion(
        { ...figure, points: figure.points.map((entry) => (entry.id === 'M' || entry.id === 'N' ? { ...entry, x: 600 + MIRROR_SHIFT } : entry)) },
        { kind: 'transform', transformation: 'flip' },
      ),
    );
    playback.answer();
    playback.reveal();
    playback.tick(BIG_TICK);
    expect(playback.positions()['A′']).toEqual({ x: 1150, y: 250 });
  });
});
