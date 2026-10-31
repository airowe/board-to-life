import { validateScene } from '../src/scene/schema';
import { ITEM_KINDS, MODEL_SCENE_SCHEMA, requestModelJson, toScene, type CallOptions, type ModelScene, type ProviderWithKey } from './sceneReader';

// The pretend photo the layout is read through: 3 by 2, so the drawing comes out 1200 by 800.
export const WRITER_SIZE = { width: 1500, height: 1000 };

// Sizes on the 0-1000 grid that play: the grid is stretched to 1200 by 800, so a gap of a
// third of a domino's height on x comes out at half its height on the board.
export const LAYOUT_GUIDE = {
  floorY: 900,
  domino: { width: 12, height: 140, gap: 46 },
  ballRadius: 30,
  push: 250,
  rampFootGap: 50,
};
const { floorY, domino, ballRadius, push, rampFootGap } = LAYOUT_GUIDE;

const MOVABLE_KINDS = new Set(['ball', 'block', 'domino', 'cart', 'lever']);
const LAYOUT_ATTEMPTS = 2;
// A second layout is only worth starting with this much of the budget left; the fastest layouts measured took about 10 s.
export const MIN_RETRY_MS = 10_000;
const NOTHING_MOVES = 'Nothing in that description can move. Describe objects such as balls, ramps, blocks or dominoes.';

export class LayoutError extends Error {
  constructor(
    readonly kind: 'invalid' | 'nothing-moves',
    message: string,
    readonly details: string[] = [],
  ) {
    super(message);
  }
}

export const writerPrompt = (description: string, errors: readonly string[]): string =>
  [
    'A teacher has described a physics setup that a class will watch play out. Lay this setup out as a teacher would draw it on a whiteboard 3 units wide by 2 tall, on the same 0-1000 grid.',
    'Read it into the JSON format you are given. Give every position and size on a 0-1000 grid: (0,0) is the top-left corner, x grows to the right and y grows downwards.',
    `Description: ${description}`,
    ITEM_KINDS,
    'Put a floor along the bottom unless the description says otherwise.',
    'Rest everything on a surface.',
    'Space dominoes about half their height apart so each one can knock the next over.',
    `Draw the floor line at y ${floorY}. Draw each domino ${domino.width} wide and ${domino.height} tall, standing on the floor, and leave ${domino.gap} between neighbouring dominoes.`,
    `Draw a ball with radius ${ballRadius}. When the description says something is pushed, rolling or moving at the start, give it push: dx ${push}, dy 0 (negative dx if it moves to the left).`,
    `When a ramp leads into a row, bring the ramp's low end down to the floor and put the first domino ${rampFootGap} to the right of where the ramp meets the floor.`,
    'Draw only what the description mentions, plus the floor.',
    'Keep every item on the board.',
    'Add one predict point. It is the first contact between two items that the motion leads to; use a and b for the two item ids.',
    'When the description gives weights or says one thing is heavier, write a mass label on every item it weighs or compares, such as 2 kg and 1 kg, attached to that item.',
    'Use the words of the description as labels only when the teacher would write them on the board.',
    'Give lineWidth 0 and no unknownMarks. Use short ids such as ball, ramp, domino-1, domino-2 (numbered left to right), and give every item, label and mark a confidence of 1.',
    ...(errors.length > 0 ? ['Your last layout was rejected for these reasons; fix them:', ...errors] : []),
  ].join('\n');

export const describeSceneWithModel = async (description: string, provider: ProviderWithKey, options: CallOptions): Promise<unknown> => {
  const deadline = performance.now() + options.timeoutMs;
  let errors: string[] = [];
  for (let attempt = 0; attempt < LAYOUT_ATTEMPTS && (attempt === 0 || deadline - performance.now() >= MIN_RETRY_MS); attempt += 1) {
    const parsed = await requestModelJson(
      [{ type: 'text', text: writerPrompt(description, errors) }],
      { name: 'whiteboard_scene', schema: MODEL_SCENE_SCHEMA },
      provider,
      { ...options, timeoutMs: Math.max(1, deadline - performance.now()) },
    );
    const result = validateScene(toScene(parsed as ModelScene, WRITER_SIZE));
    if (result.ok) {
      if (!result.scene.items.some((item) => MOVABLE_KINDS.has(item.kind))) throw new LayoutError('nothing-moves', NOTHING_MOVES);
      return result.scene;
    }
    errors = result.errors;
  }
  throw new LayoutError('invalid', 'The layout failed validation.', errors);
};
