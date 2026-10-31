import { z } from 'zod';
import { angleSumOf, SHAPE_NAMES, STRAIGHT_ANGLE } from './derive';
import { invariantHolds, suggestedFocus } from './focus';
import type { Figure, Focus, Mark, Polygon, Transformation } from './schema';

export type GeometryQuestion = {
  id: string;
  prompt: string;
  choices: string[];
  observe: { kind: 'figure'; focus: Focus };
  answer: string | null;
  explanation: string;
  cites: string[];
};

export type FigureGroundingResult = { ok: true; questions: GeometryQuestion[] } | { ok: false; errors: string[] };

export const INVARIANT_CHOICES = ['Yes, always', 'Only sometimes', 'Never'] as const;

export const NO_FIGURE_FOCUS = 'There is nothing in this figure to predict. Draw a shape or a transformation.';

const QUESTION_ID = 'q-1';

export const TRANSFORMATION_NOUNS: Record<Transformation['kind'], string> = {
  reflect: 'reflection',
  rotate: 'rotation',
  translate: 'translation',
  dilate: 'dilation',
};

export const polygonName = (polygon: Polygon): string => polygon.vertices.join('');

const shapeName = (polygon: Polygon): string => SHAPE_NAMES[polygon.vertices.length] ?? 'shape';

const polygonById = (figure: Figure, id: string): Polygon | undefined => figure.polygons.find((entry) => entry.id === id);

const transformationById = (figure: Figure, id: string): Transformation | undefined =>
  figure.transformations.find((entry) => entry.id === id);

const markById = (figure: Figure, id: string): Mark | undefined => figure.marks.find((entry) => entry.id === id);

export const markedPoint = (figure: Figure, id: string): string => {
  const found = markById(figure, id);
  return found?.kind === 'angle' || found?.kind === 'right' ? found.at : id;
};

const transformationPoints = (transformation: Transformation): string[] => {
  switch (transformation.kind) {
    case 'reflect':
      return [...transformation.mirror];
    case 'rotate':
    case 'dilate':
      return [transformation.centre];
    case 'translate':
      return [transformation.from, transformation.to];
  }
};

const transformationPhrase = (transformation: Transformation): string => {
  const noun = TRANSFORMATION_NOUNS[transformation.kind];
  switch (transformation.kind) {
    case 'reflect':
      return `the ${noun} over ${transformation.mirror.join('')}`;
    case 'rotate':
    case 'dilate':
      return `the ${noun} about ${transformation.centre}`;
    case 'translate':
      return `the ${noun} from ${transformation.from} to ${transformation.to}`;
  }
};

const transformationExplanation = (transformation: Transformation, shape: string): string => {
  switch (transformation.kind) {
    case 'reflect':
      return `A reflection flips every point to the same distance on the other side of ${transformation.mirror.join('')}, so the ${shape} keeps its side lengths and angles but faces the other way.`;
    case 'rotate':
      return `A rotation turns every point through the same angle about ${transformation.centre}, so the ${shape} keeps its side lengths and angles.`;
    case 'translate':
      return `A translation slides every point the same distance in the same direction, so the ${shape} keeps its side lengths and angles.`;
    case 'dilate':
      return `A dilation by a factor of ${transformation.factor} stretches every length by ${transformation.factor}, so the ${shape} keeps its angles but changes size.`;
  }
};

const questionFor = (focus: Focus, parts: Omit<GeometryQuestion, 'id' | 'observe'>): GeometryQuestion => ({
  id: QUESTION_ID,
  ...parts,
  observe: { kind: 'figure', focus },
});

const invariantAnswer = (figure: Figure, focus: Focus): string =>
  invariantHolds(figure, focus) ? INVARIANT_CHOICES[0] : INVARIANT_CHOICES[1];

export const templateFigureQuestion = (figure: Figure, focus: Focus): GeometryQuestion => {
  switch (focus.kind) {
    case 'transform': {
      const transformation = transformationById(figure, focus.transformation);
      const polygon = transformation && polygonById(figure, transformation.polygon);
      const shape = polygon ? `${shapeName(polygon)} ${polygonName(polygon)}` : 'the shape';
      return questionFor(focus, {
        prompt: transformation ? `Where will ${shape} land after ${transformationPhrase(transformation)}?` : `Where will ${shape} land?`,
        choices: [],
        answer: null,
        explanation: transformation ? transformationExplanation(transformation, shape) : '',
        cites: [...(polygon?.vertices ?? []), ...(transformation ? transformationPoints(transformation) : [])],
      });
    }
    case 'angle-sum': {
      const polygon = polygonById(figure, focus.polygon);
      const name = polygon ? polygonName(polygon) : focus.polygon;
      const total = polygon ? angleSumOf(polygon) : STRAIGHT_ANGLE;
      const shape = polygon ? shapeName(polygon) : 'shape';
      return questionFor(focus, {
        prompt: `Drag ${focus.drag} anywhere. Will the angles of ${name} still add up to ${total}°?`,
        choices: [...INVARIANT_CHOICES],
        answer: invariantAnswer(figure, focus),
        explanation: `The angles of a ${shape} always add up to ${total}°, wherever ${focus.drag} goes.`,
        cites: polygon?.vertices ?? [focus.drag],
      });
    }
    case 'equal-angles': {
      const [first, second] = focus.marks.map((id) => markedPoint(figure, id));
      return questionFor(focus, {
        prompt: `Drag ${focus.drag} anywhere. Will the marked angles at ${first} and ${second} still be equal?`,
        choices: [...INVARIANT_CHOICES],
        answer: invariantAnswer(figure, focus),
        explanation: 'Where a line crosses two parallel lines, the matching angles it makes are always equal.',
        cites: [...new Set([focus.drag, first ?? '', second ?? ''])].filter((id) => id !== ''),
      });
    }
  }
};

const questionSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  choices: z.array(z.string().min(1)),
  observe: z.object({ kind: z.literal('figure'), focus: z.unknown() }),
  answer: z.string().nullable(),
  explanation: z.string(),
  cites: z.array(z.string().min(1)),
});

type ParsedQuestion = z.infer<typeof questionSchema>;

const fieldsOf = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

const sameFocus = (input: unknown, focus: Focus): boolean => {
  const fields = fieldsOf(input);
  const expected: Record<string, unknown> = focus;
  const keys = Object.keys(expected);
  return (
    Object.keys(fields).length === keys.length &&
    keys.every((key) => JSON.stringify(fields[key]) === JSON.stringify(expected[key]))
  );
};

const groundingErrors = (question: ParsedQuestion, figure: Figure, focus: Focus): string[] => {
  const pointIds = new Set(figure.points.map((entry) => entry.id));
  const missing = question.cites
    .filter((cited) => !pointIds.has(cited))
    .map((cited) => `${question.id} cites missing point "${cited}"`);
  const wrongFocus = sameFocus(question.observe.focus, focus) ? [] : [`${question.id} observes a focus other than the figure’s chosen focus`];
  return [...missing, ...wrongFocus];
};

export const checkFigureGrounding = (input: unknown, figure: Figure): FigureGroundingResult => {
  const parsed = z.array(questionSchema).safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) };
  }
  const focus = suggestedFocus(figure);
  if (focus === null) return { ok: false, errors: [NO_FIGURE_FOCUS] };
  const errors = parsed.data.flatMap((question) => groundingErrors(question, figure, focus));
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, questions: parsed.data.map((question) => ({ ...question, observe: { kind: 'figure', focus } })) };
};
