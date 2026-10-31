import type { Positions } from '../src/geometry/derive';
import { factsFor, type FigureFact } from '../src/geometry/focus';
import { markedPoint, polygonName, templateFigureQuestion, TRANSFORMATION_NOUNS, type GeometryQuestion } from '../src/geometry/questions';
import type { Figure, Focus } from '../src/geometry/schema';
import { objectOf } from './questionDrafter';
import { requestModelJson, type CallOptions, type ProviderWithKey } from './sceneReader';

type ModelFigureQuestion = { prompt: string; explanation: string; cites: string[] };
export type FigureDraftResult = { questions: ModelFigureQuestion[] };

const PROMPT_LENGTH = 120;
const EXPLANATION_LENGTH = 400;
const DISPLAY_STEPS = 10;

const formatNumber = (value: number): string => String(Math.round(value * DISPLAY_STEPS) / DISPLAY_STEPS);

const listed = (items: string[]): string => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

export const figureDraftSchema = (figure: Figure): Record<string, unknown> =>
  objectOf({
    questions: {
      type: 'array',
      minItems: 1,
      maxItems: 1,
      items: objectOf({
        prompt: { type: 'string', maxLength: PROMPT_LENGTH },
        explanation: { type: 'string', maxLength: EXPLANATION_LENGTH },
        cites: { type: 'array', minItems: 1, items: { type: 'string', enum: figure.points.map((entry) => entry.id) } },
      }),
    },
  });

const nameOfPolygon = (figure: Figure, id: string): string => {
  const polygon = figure.polygons.find((entry) => entry.id === id);
  return polygon ? polygonName(polygon) : id;
};

const transformedPolygon = (figure: Figure, transformationId: string): { noun: string; name: string } => {
  const transformation = figure.transformations.find((entry) => entry.id === transformationId);
  return transformation
    ? { noun: TRANSFORMATION_NOUNS[transformation.kind], name: nameOfPolygon(figure, transformation.polygon) }
    : { noun: 'transformation', name: transformationId };
};

const placesOf = (image: Positions): string =>
  listed(Object.entries(image).map(([id, at]) => `${id} (${formatNumber(at.x)}, ${formatNumber(at.y)})`));

export const describeFact = (figure: Figure, fact: FigureFact): string => {
  switch (fact.kind) {
    case 'angle-sum':
      return `The angles of ${nameOfPolygon(figure, fact.polygon)} add up to ${formatNumber(fact.degrees)}°.`;
    case 'equal-angles': {
      const [first, second] = fact.marks.map((id) => markedPoint(figure, id));
      return `The marked angles at ${first} and ${second} are equal: both ${formatNumber(fact.degrees)}°.`;
    }
    case 'lands': {
      const { noun, name } = transformedPolygon(figure, fact.transformation);
      return `After the ${noun}, ${name} lands at ${placesOf(fact.image)}.`;
    }
    case 'congruent':
      return `The image is congruent to ${transformedPolygon(figure, fact.transformation).name}: the same side lengths and angles.`;
    case 'area-scale':
      return `The image has ${formatNumber(fact.factor)} times the area of ${transformedPolygon(figure, fact.transformation).name}.`;
  }
};

const pointList = (figure: Figure): string => listed(figure.points.map((entry) => entry.id));

export const figureDraftPrompt = (figure: Figure, focus: Focus, facts: readonly FigureFact[]): string => {
  const template = templateFigureQuestion(figure, focus);
  return [
    'You write a predict question for a maths class. The teacher drew a geometry figure on the whiteboard; the class',
    'watches it move on screen, and before it moves each student predicts what will happen.',
    '',
    `The points on the board: ${pointList(figure)}.`,
    ...figure.polygons.map((entry) => `Shape ${polygonName(entry)} has vertices ${listed(entry.vertices)}.`),
    '',
    'What the figure shows (this is the true answer; never contradict it):',
    ...facts.map((fact) => describeFact(figure, fact)),
    '',
    `The question, as a template: ${template.prompt}`,
    ...(template.choices.length > 0 ? [`The choices are: ${template.choices.join(', ')}.`, `The answer is: ${template.answer ?? ''}`] : ['Students answer by placing the image on the board, so there are no choices.']),
    '',
    'Rewrite the question in your own words, asking exactly the same thing so the same answer stays right.',
    `Keep the prompt under ${PROMPT_LENGTH} characters and plain enough for a 12-year-old.`,
    'The explanation is shown after the reveal: two or three sentences that say why the answer holds, using only the facts above.',
    'Refer to points and shapes by the letters on the board.',
    'cites lists every point the prompt or explanation talks about.',
  ].join('\n');
};

export const toFigureQuestions = (draft: FigureDraftResult, template: GeometryQuestion): GeometryQuestion[] =>
  draft.questions.map((question) => ({
    ...template,
    prompt: question.prompt,
    explanation: question.explanation,
    cites: question.cites.length > 0 ? [...new Set(question.cites)] : template.cites,
  }));

const isDraft = (value: object): value is FigureDraftResult => 'questions' in value && Array.isArray(value.questions);

export const draftFigureQuestionsWithModel = async (
  figure: Figure,
  focus: Focus,
  provider: ProviderWithKey,
  options: CallOptions,
): Promise<GeometryQuestion[]> => {
  const parsed = await requestModelJson(
    [{ type: 'text', text: figureDraftPrompt(figure, focus, factsFor(figure, focus)) }],
    { name: 'predict_questions', schema: figureDraftSchema(figure) },
    provider,
    options,
  );
  if (!isDraft(parsed)) throw new Error(`${provider.name} did not return a list of questions`);
  return toFigureQuestions(parsed, templateFigureQuestion(figure, focus)).slice(0, 1);
};
