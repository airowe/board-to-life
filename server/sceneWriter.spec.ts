import { describe, expect, it } from 'vitest';
import { createSimulation, SETTLE_SECONDS, STEPS_PER_SECOND } from '../src/physics/simulation';
import { validateScene } from '../src/scene/schema';
import { ITEM_KINDS, PROVIDERS, READER_PROMPT, toScene, type ModelScene } from './sceneReader';
import { describeSceneWithModel, LAYOUT_GUIDE, LayoutError, writerPrompt, WRITER_SIZE } from './sceneWriter';

const TIMEOUT_MS = 1000;
const DESCRIPTION = 'A ball rolls down a ramp and knocks over three dominoes.';
const DRAWING = { width: 1200, height: 800 };
const OFF_BOARD_X = 1200;

const floor = { id: 'floor', kind: 'floor', x: 500, y: 950, width: 1000, height: 50, confidence: 1 };
const dominoes = [600, 680, 760].map((x, index) => ({
  id: `domino-${index + 1}`,
  kind: 'domino',
  x,
  y: 880,
  width: 20,
  height: 120,
  confidence: 1,
}));

const layout: ModelScene = {
  lineWidth: 0,
  items: [
    floor,
    { id: 'ramp', kind: 'ramp', x: 50, y: 400, x2: 400, y2: 900, confidence: 1 },
    { id: 'ball', kind: 'ball', x: 80, y: 380, radius: 25, confidence: 1 },
    ...dominoes,
  ],
  joints: [],
  labels: [],
  unknownMarks: [],
  predictPoints: [{ id: 'pp-1', a: 'ball', b: 'domino-1' }],
};

const invalidLayout: ModelScene = { ...layout, predictPoints: [{ id: 'pp-1', a: 'ghost', b: 'domino-1' }] };
const immovableLayout: ModelScene = {
  ...layout,
  items: [floor, { id: 'wall', kind: 'wall', x: 900, y: 700, width: 40, height: 500, confidence: 1 }],
  predictPoints: [],
};

type Call = { url: string; init: RequestInit };

const completion = (content: string): string => JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] });

const fakeFetch =
  (replies: ModelScene[], calls: Call[] = []): typeof fetch =>
  (input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    const reply = replies[Math.min(calls.length, replies.length) - 1];
    return Promise.resolve(new Response(completion(JSON.stringify(reply)), { status: 200, headers: { 'content-type': 'application/json' } }));
  };

const provider = { ...PROVIDERS.meta, apiKey: 'test-key' };
const describeWith = (replies: ModelScene[], calls: Call[] = []) =>
  describeSceneWithModel(DESCRIPTION, provider, { timeoutMs: TIMEOUT_MS, fetchImpl: fakeFetch(replies, calls) });

const promptOf = (call: Call | undefined): string => {
  const body = JSON.parse(String(call?.init.body)) as { messages: { content: { type: string; text?: string }[] }[] };
  return body.messages[0]?.content[0]?.text ?? '';
};

describe('writerPrompt', () => {
  it('shares the item kinds and legend with the reader prompt', () => {
    expect(writerPrompt(DESCRIPTION, [])).toContain(ITEM_KINDS);
    expect(READER_PROMPT).toContain(ITEM_KINDS);
  });

  it('includes the description', () => {
    expect(writerPrompt(DESCRIPTION, [])).toContain(DESCRIPTION);
  });

  it.each([
    'Lay this setup out as a teacher would draw it on a whiteboard 3 units wide by 2 tall, on the same 0-1000 grid.',
    'Put a floor along the bottom unless the description says otherwise.',
    'Rest everything on a surface.',
    'Space dominoes about half their height apart so each one can knock the next over.',
    'Keep every item on the board.',
    'Add one predict point.',
    'When the description gives weights or says one thing is heavier, write a mass label on every item it weighs or compares, such as 2 kg and 1 kg, attached to that item.',
    'Use the words of the description as labels only when the teacher would write them on the board.',
  ])('tells the model: %s', (instruction) => {
    expect(writerPrompt(DESCRIPTION, [])).toContain(instruction);
  });

  it.each([
    `Draw each domino ${LAYOUT_GUIDE.domino.width} wide and ${LAYOUT_GUIDE.domino.height} tall`,
    `leave ${LAYOUT_GUIDE.domino.gap} between neighbouring dominoes`,
    `Draw a ball with radius ${LAYOUT_GUIDE.ballRadius}`,
    `give it push: dx ${LAYOUT_GUIDE.push}`,
    `put the first domino ${LAYOUT_GUIDE.rampFootGap} to the right of where the ramp meets the floor`,
    'Draw only what the description mentions',
  ])('gives the model the layout guide: %s', (instruction) => {
    expect(writerPrompt(DESCRIPTION, [])).toContain(instruction);
  });

  it('asks for no fix when there are no errors', () => {
    expect(writerPrompt(DESCRIPTION, [])).not.toContain('Your last layout was rejected');
  });

  it('lists each rejection reason on its own line', () => {
    expect(writerPrompt(DESCRIPTION, ['first problem', 'second problem'])).toContain(
      'Your last layout was rejected for these reasons; fix them:\nfirst problem\nsecond problem',
    );
  });
});

describe('LAYOUT_GUIDE', () => {
  const { floorY, domino, ballRadius, push, rampFootGap } = LAYOUT_GUIDE;
  const DOMINO_COUNT = 5;
  const ground = { id: 'floor', kind: 'floor', x: 500, y: floorY, width: 1000, confidence: 1 };
  const row = (firstX: number) =>
    Array.from({ length: DOMINO_COUNT }, (_, index) => ({
      id: `domino-${index + 1}`,
      kind: 'domino',
      x: firstX + index * (domino.width + domino.gap),
      y: floorY - domino.height / 2,
      width: domino.width,
      height: domino.height,
      confidence: 1,
    }));
  const guided = (items: ModelScene['items']): ModelScene => ({
    lineWidth: 0,
    items,
    joints: [],
    labels: [],
    unknownMarks: [],
    predictPoints: [{ id: 'pp-1', a: 'ball', b: 'domino-1' }],
  });
  const fallenAfterSettling = (model: ModelScene): string[] => {
    const scene = validateScene(toScene(model, WRITER_SIZE));
    if (!scene.ok) throw new Error(scene.errors.join('; '));
    const simulation = createSimulation(scene.scene);
    for (let step = 0; step < SETTLE_SECONDS * STEPS_PER_SECOND; step += 1) simulation.step();
    return row(0)
      .map((each) => each.id)
      .filter((id) => !simulation.observe({ kind: 'fallen', item: id }));
  };

  it('knocks over every domino when a pushed ball rolls along the floor into the row', () => {
    const ball = { id: 'ball', kind: 'ball', x: 100, y: floorY - ballRadius, radius: ballRadius, push: { dx: push, dy: 0 }, confidence: 1 };
    expect(fallenAfterSettling(guided([ground, ball, ...row(300)]))).toEqual([]);
  });

  it('sinks the heavier block on a pulley when both blocks carry the written masses the prompt asks for', () => {
    const block = (id: string, x: number) => ({ id, kind: 'block', x, y: 500, width: 80, height: 80, confidence: 1 });
    const model: ModelScene = {
      ...guided([
        ground,
        { id: 'pulley', kind: 'pulley', x: 500, y: 150, radius: 40, confidence: 1 },
        block('block-left', 460),
        block('block-right', 540),
        { id: 'rope', kind: 'rope', from: 'block-left', to: 'block-right', over: 'pulley', confidence: 1 },
      ]),
      labels: [
        { id: 'label-left', text: '2 kg', x: 460, y: 500, attachesTo: 'block-left', confidence: 1 },
        { id: 'label-right', text: '1 kg', x: 540, y: 500, attachesTo: 'block-right', confidence: 1 },
      ],
      predictPoints: [],
    };
    const scene = validateScene(toScene(model, WRITER_SIZE));
    if (!scene.ok) throw new Error(scene.errors.join('; '));
    const simulation = createSimulation(scene.scene);
    const heights = () => new Map(simulation.snapshot().map((body) => [body.id, body.y]));
    const start = heights();
    for (let step = 0; step < STEPS_PER_SECOND; step += 1) simulation.step();
    const end = heights();
    expect((end.get('block-left') ?? 0) - (start.get('block-left') ?? 0)).toBeGreaterThan(0);
    expect((end.get('block-right') ?? 0) - (start.get('block-right') ?? 0)).toBeLessThan(0);
  });

  it('knocks over every domino when a ball rolls down a ramp into the row', () => {
    const RAMP_FOOT_X = 350;
    const ramp = { id: 'ramp', kind: 'ramp', x: 50, y: 450, x2: RAMP_FOOT_X, y2: floorY, confidence: 1 };
    const ball = { id: 'ball', kind: 'ball', x: 80, y: 450 - ballRadius - 20, radius: ballRadius, confidence: 1 };
    expect(fallenAfterSettling(guided([ground, ramp, ball, ...row(RAMP_FOOT_X + rampFootGap)]))).toEqual([]);
  });

});

describe('describeSceneWithModel', () => {
  it('sends the description as text with no image', async () => {
    const calls: Call[] = [];
    await describeWith([layout], calls);
    const body = JSON.parse(String(calls[0]?.init.body)) as { messages: { role: string; content: { type: string; text?: string }[] }[] };
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]?.role).toBe('user');
    expect(body.messages[0]?.content).toHaveLength(1);
    expect(body.messages[0]?.content[0]?.type).toBe('text');
    expect(body.messages[0]?.content[0]?.text).toContain(DESCRIPTION);
  });

  it('returns a valid 1200 by 800 scene', async () => {
    const scene = await describeWith([layout]);
    const result = validateScene(scene);
    expect(result.ok ? [] : result.errors).toEqual([]);
    expect((scene as { drawing: unknown }).drawing).toEqual(DRAWING);
  });

  it('clamps an item placed off the board', async () => {
    const offBoard = { ...layout, items: layout.items.map((item) => (item.id === 'ball' ? { ...item, x: OFF_BOARD_X } : item)) };
    const scene = (await describeWith([offBoard])) as { items: { id: string; x: number }[] };
    const ball = scene.items.find((item) => item.id === 'ball');
    expect(ball?.x).toBe(DRAWING.width);
  });

  it('retries once with the validation errors when the first layout is invalid', async () => {
    const calls: Call[] = [];
    const scene = await describeWith([invalidLayout, layout], calls);
    expect(calls).toHaveLength(2);
    const firstError = validateScene(toScene(invalidLayout, WRITER_SIZE));
    const reasons = firstError.ok ? [] : firstError.errors;
    expect(reasons.length).toBeGreaterThan(0);
    expect(promptOf(calls[0])).not.toContain('Your last layout was rejected');
    expect(promptOf(calls[1])).toContain('Your last layout was rejected');
    expect(promptOf(calls[1])).toContain(reasons[0]);
    expect(validateScene(scene).ok).toBe(true);
  });

  it('gives up after the second invalid layout', async () => {
    const calls: Call[] = [];
    const failure = await describeWith([invalidLayout, invalidLayout], calls).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(LayoutError);
    expect((failure as LayoutError).kind).toBe('invalid');
    expect((failure as LayoutError).message).toBe('The layout failed validation.');
    expect((failure as LayoutError).details.length).toBeGreaterThan(0);
    expect(calls).toHaveLength(2);
  });

  it('refuses a scene where nothing can move', async () => {
    const calls: Call[] = [];
    const failure = await describeWith([immovableLayout], calls).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(LayoutError);
    expect((failure as LayoutError).kind).toBe('nothing-moves');
    expect((failure as LayoutError).message).toBe('Nothing in that description can move. Describe objects such as balls, ramps, blocks or dominoes.');
    expect(calls).toHaveLength(1);
  });
});
