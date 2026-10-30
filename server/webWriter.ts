import { validateWeb } from '../src/ecosystem/schema';
import { requestModelJson, type CallOptions, type ProviderWithKey } from './sceneReader';
import { LayoutError, WRITER_SIZE } from './sceneWriter';
import { MODEL_WEB_SCHEMA, toWeb, WEB_FORMAT, type ModelWeb } from './webReader';

const LAYOUT_ATTEMPTS = 2;

export const webWriterPrompt = (description: string, errors: readonly string[]): string =>
  [
    'A teacher has described a food web that a class will watch as a population model. Lay it out as a teacher would draw it on a whiteboard 3 units wide by 2 tall, on a 0-1000 grid.',
    'Give every position and size on a 0-1000 grid: (0,0) is the top-left corner, x grows to the right and y grows downwards.',
    `Description: ${description}`,
    WEB_FORMAT,
    'Draw each arrow from the thing eaten to the thing that eats it: grass → rabbit means the rabbit eats the grass.',
    'When the description names species without saying who eats whom, use what you know about who eats whom.',
    'Put producers along the bottom, then consumers in rows above them, so the arrows run upwards.',
    'Give each species a box about 160 wide and 80 tall, and keep every box on the board with a gap between neighbours.',
    'When the description says something like a drought or that a species is removed, report it as the event: {"kind":"remove","species":id} or {"kind":"drought"}. Otherwise the event is null.',
    'Draw only the species the description mentions. Give no unknownMarks and a confidence of 1 on everything.',
    ...(errors.length > 0 ? ['Your last layout was rejected for these reasons; fix them:', ...errors] : []),
  ].join('\n');

export const describeWebWithModel = async (description: string, provider: ProviderWithKey, options: CallOptions): Promise<unknown> => {
  const deadline = performance.now() + options.timeoutMs;
  let errors: string[] = [];
  for (let attempt = 0; attempt < LAYOUT_ATTEMPTS; attempt += 1) {
    const parsed = await requestModelJson(
      [{ type: 'text', text: webWriterPrompt(description, errors) }],
      { name: 'food_web', schema: MODEL_WEB_SCHEMA },
      provider,
      { ...options, timeoutMs: Math.max(1, deadline - performance.now()) },
    );
    const result = validateWeb(toWeb(parsed as ModelWeb, WRITER_SIZE));
    if (result.ok) return result.web;
    errors = result.errors;
  }
  throw new LayoutError('invalid', 'The layout failed validation.', errors);
};
