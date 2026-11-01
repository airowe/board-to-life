import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { ACCESS_HEADER } from '../src/access';
import { hasAccess } from './access';
import { createRateLimit } from './rateLimit';
import { MODEL_REQUEST_TIMEOUT_MS } from '../src/reading';
import { isProviderName, parseEffort, providerFromEnv, readSceneWithModel } from './sceneReader';
import { describeSceneWithModel } from './sceneWriter';
import { readWebWithModel } from './webReader';
import { describeWebWithModel } from './webWriter';
import { readFigureWithModel } from './figureReader';
import { describeFigureWithModel } from './figureWriter';
import { draftFigureQuestionsWithModel } from './figureDrafter';
import { drawPictureWithModel, parsePictureSubject } from './picture';
import { parseSubject, SUBJECT_LABELS, SUBJECTS, type Subject } from '../src/subjects';
import {
  handleDescribe,
  handleDescribeFigure,
  handleDescribeWeb,
  handleDraftFigureQuestions,
  handleDraftQuestions,
  handleDraftWebQuestions,
  handleUnderstand,
  handleUnderstandFigure,
  handleUnderstandWeb,
  parseStubMode,
  pictureResponse,
  stubPictureResponse,
  type StubMode,
  type StubResponse,
} from './stub';
import {
  handleDraftFigureQuestionsWithModel,
  handleDraftQuestionsWithModel,
  handleDraftWebQuestionsWithModel,
  type ModelDraft,
  type ModelFigureDraft,
  type ModelWebDraft,
} from './draft';
import { draftQuestionsWithModel } from './questionDrafter';
import { draftWebQuestionsWithModel } from './webDrafter';
import { handleDescribeFigureWithModel, handleDescribeWebWithModel, handleDescribeWithModel, type ModelDescribe } from './describe';
import { handleUnderstandFigureWithModel, handleUnderstandWebWithModel, handleUnderstandWithModel, type ModelRead } from './understand';

// Vercel turns away function request bodies over 4.5 MB with its own reply; the app sends photos far smaller.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const STUB_LATENCY_MS = 700;
export const STUB_TIMEOUT_DELAY_MS = MODEL_REQUEST_TIMEOUT_MS + 15_000;
// The whole budget for one read or draft, a retry included: the slowest read measured took 71 s.
export const MODEL_TIMEOUT_MS = 120_000;

const delayFor = (mode: StubMode): number => (mode === 'timeout' ? STUB_TIMEOUT_DELAY_MS : STUB_LATENCY_MS);

type Body = { kind: 'read'; bytes: Buffer } | { kind: 'too-large' } | { kind: 'aborted' };

const readBody = (request: IncomingMessage): Promise<Body> =>
  new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const collect = (chunk: Buffer): void => {
      size += chunk.length;
      if (size <= MAX_UPLOAD_BYTES) {
        chunks.push(chunk);
        return;
      }
      request.off('data', collect);
      request.resume();
      resolve({ kind: 'too-large' });
    };
    request.on('data', collect);
    request.on('end', () => resolve({ kind: 'read', bytes: Buffer.concat(chunks) }));
    request.on('error', () => resolve({ kind: 'aborted' }));
  });

const send = (response: ServerResponse, { status, body }: StubResponse): void => {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(body));
};

const parseJson = (buffer: Buffer): unknown => {
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch {
    return null;
  }
};

const header = (request: IncomingMessage, name: string): string | undefined => {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
};

type ApiOptions = { env: Record<string, string | undefined> };

// SCENE_READER=meta or baseten sends photos and question drafts to that model (paid); anything else keeps the stub.
export type ApiModel = {
  name: string;
  read: ModelRead;
  readWeb: ModelRead;
  draft: ModelDraft;
  draftWeb: ModelWebDraft;
  describe: ModelDescribe;
  describeWeb: ModelDescribe;
  readFigure: ModelRead;
  describeFigure: ModelDescribe;
  draftFigure: ModelFigureDraft;
  drawPicture?: (subject: string) => Promise<Buffer>;
};

const STUB_READER = 'stub';

export const modelFrom = (env: ApiOptions['env']): ApiModel | null => {
  const name = env.SCENE_READER || STUB_READER;
  if (name === STUB_READER) return null;
  if (!isProviderName(name)) throw new Error(`SCENE_READER must be meta, baseten or stub, not "${name}".`);
  const provider = providerFromEnv(name, env);
  const effort = parseEffort(env.READER_EFFORT);
  const options = { timeoutMs: MODEL_TIMEOUT_MS, ...(effort ? { effort } : {}) };
  return {
    name,
    read: (photo) => readSceneWithModel(photo, provider, options),
    readWeb: (photo) => readWebWithModel(photo, provider, options),
    draft: (scene) => draftQuestionsWithModel(scene, provider, options),
    draftWeb: (web) => draftWebQuestionsWithModel(web, provider, options),
    describe: (text) => describeSceneWithModel(text, provider, options),
    describeWeb: (text) => describeWebWithModel(text, provider, options),
    readFigure: (photo) => readFigureWithModel(photo, provider, options),
    describeFigure: (text) => describeFigureWithModel(text, provider, options),
    draftFigure: (figure, focus) => draftFigureQuestionsWithModel(figure, focus, provider, options),
    ...(name === 'meta' ? { drawPicture: (subject: string) => drawPictureWithModel(subject, provider.apiKey) } : {}),
  };
};

type Middleware = (request: IncomingMessage, response: ServerResponse, next: () => void) => Promise<void>;

const listed = (labels: string[]): string => `${labels.slice(0, -1).join(', ')} or ${labels.at(-1)}`;
const UNKNOWN_SUBJECT = `Pick a subject: ${listed(SUBJECTS.map((subject) => SUBJECT_LABELS[subject]))}.`;
const unknownSubject = (): StubResponse => ({ status: 400, body: { error: UNKNOWN_SUBJECT, details: [] } });

const fieldOf = (parsed: unknown, name: string): unknown =>
  typeof parsed === 'object' && parsed !== null && name in parsed ? (parsed as Record<string, unknown>)[name] : undefined;

const fieldOrNull = (parsed: unknown, name: string): unknown => fieldOf(parsed, name) ?? null;

type RouteContext = { model: ApiModel | null; mode: StubMode; delayMs: number };
type UnderstandInput = RouteContext & { contentType: string; body: Buffer };
type JsonInput = RouteContext & { parsed: unknown };
type Handler<Input> = (input: Input) => Promise<StubResponse> | StubResponse;
type SubjectRoute = { understand: Handler<UnderstandInput>; describe: Handler<JsonInput>; draft: Handler<JsonInput> };

export const SUBJECT_ROUTES: Record<Subject, SubjectRoute> = {
  physics: {
    understand: ({ model, mode, delayMs, contentType, body }) =>
      model
        ? handleUnderstandWithModel({ contentType, bytes: new Uint8Array(body), reader: model.name, read: model.read })
        : handleUnderstand({ mode, delayMs, contentType, bytes: body.length }),
    describe: ({ model, mode, delayMs, parsed }) => {
      const text = fieldOrNull(parsed, 'text');
      return model ? handleDescribeWithModel({ text, reader: model.name, describe: model.describe }) : handleDescribe({ mode, delayMs, text });
    },
    draft: ({ model, mode, delayMs, parsed }) => {
      const scene = fieldOrNull(parsed, 'scene');
      return model
        ? handleDraftQuestionsWithModel({ scene, drafter: model.name, draft: model.draft })
        : handleDraftQuestions({ mode, delayMs, scene });
    },
  },
  ecosystem: {
    understand: ({ model, mode, delayMs, contentType, body }) =>
      model
        ? handleUnderstandWebWithModel({ contentType, bytes: new Uint8Array(body), reader: model.name, read: model.readWeb })
        : handleUnderstandWeb({ mode, delayMs, contentType, bytes: body.length }),
    describe: ({ model, mode, delayMs, parsed }) => {
      const text = fieldOrNull(parsed, 'text');
      return model ? handleDescribeWebWithModel({ text, reader: model.name, describe: model.describeWeb }) : handleDescribeWeb({ mode, delayMs, text });
    },
    draft: ({ model, mode, delayMs, parsed }) => {
      const web = fieldOf(parsed, 'web');
      return model
        ? handleDraftWebQuestionsWithModel({ web, drafter: model.name, draft: model.draftWeb })
        : handleDraftWebQuestions({ mode, delayMs, web });
    },
  },
  geometry: {
    understand: ({ model, mode, delayMs, contentType, body }) =>
      model
        ? handleUnderstandFigureWithModel({ contentType, bytes: new Uint8Array(body), reader: model.name, read: model.readFigure })
        : handleUnderstandFigure({ mode, delayMs, contentType, bytes: body.length }),
    describe: ({ model, mode, delayMs, parsed }) => {
      const text = fieldOrNull(parsed, 'text');
      return model
        ? handleDescribeFigureWithModel({ text, reader: model.name, describe: model.describeFigure })
        : handleDescribeFigure({ mode, delayMs, text });
    },
    draft: ({ model, mode, delayMs, parsed }) => {
      const figure = fieldOf(parsed, 'figure');
      return model
        ? handleDraftFigureQuestionsWithModel({ figure, drafter: model.name, draft: model.draftFigure })
        : handleDraftFigureQuestions({ mode, delayMs, figure });
    },
  },
};

const UNDERSTAND_ROUTE = '/api/understand';
const PICTURE_ROUTE = '/api/picture';
const JSON_ROUTES: Record<string, 'describe' | 'draft'> = { '/api/describe': 'describe', '/api/draft-questions': 'draft' };

const isApiRoute = (route: string | undefined): route is string => route === UNDERSTAND_ROUTE || route === PICTURE_ROUTE || (route !== undefined && Object.hasOwn(JSON_ROUTES, route));

const UNREADABLE = 'That request could not be read.';
const unreadable = (): StubResponse => ({ status: 400, body: { error: UNREADABLE, details: [] } });
const UNDRAWABLE = 'That subject cannot be drawn.';
const SERVER_FAILURE: StubResponse = { status: 500, body: { error: 'Something went wrong on the server. Try again.', details: [] } };
const TOO_LARGE: StubResponse = { status: 413, body: { error: `That photo is too large (${MAX_UPLOAD_BYTES / 1024 / 1024} MB maximum).`, details: [] } };

// A board is about 6 calls: its reading, its questions and up to 4 pictures. Each is around a cent.
export const PUBLIC_DEMO_LIMITS = { perVisitor: 60, overall: 400, windowMs: 60 * 60 * 1000 };
const TOO_MANY: StubResponse = { status: 429, body: { error: 'This demo has had a lot of use. Try again in a little while.', details: [] } };
const PUBLIC_DEMO_ON = '1';

export const isPublicDemo = (env: Record<string, string | undefined>): boolean => env.PUBLIC_DEMO === PUBLIC_DEMO_ON;

// The first address is the visitor's; the host adds the rest.
const visitorOf = (request: IncomingMessage): string => header(request, 'x-forwarded-for')?.split(',')[0]?.trim() || request.socket.remoteAddress || 'unknown';

const NO_ACCESS = 'This demo needs its access link. Open the link from the submission page, then try again.';
const WRONG_CODE = 'That access code did not match. Open the full link from the submission page, including everything after ?code=, then try again.';

const drawPicture = async ({ model }: RouteContext, value: unknown): Promise<StubResponse> => {
  const subject = parsePictureSubject(value);
  if (subject === null) return { status: 400, body: { error: UNDRAWABLE, details: [] } };
  if (!model?.drawPicture) return stubPictureResponse();
  return pictureResponse((await model.drawPicture(subject)).toString('base64'));
};

const answer = async (request: IncomingMessage, route: string, context: RouteContext, body: Buffer): Promise<StubResponse> => {
  if (route === UNDERSTAND_ROUTE) {
    const contentType = header(request, 'content-type') ?? '';
    const subject = parseSubject(new URL(request.url ?? '', 'http://localhost').searchParams.get('subject') ?? undefined);
    return subject === null ? unknownSubject() : SUBJECT_ROUTES[subject].understand({ ...context, contentType, body });
  }
  const parsed = parseJson(body);
  if (parsed === null) return unreadable();
  if (route === PICTURE_ROUTE) return drawPicture(context, fieldOf(parsed, 'subject'));
  const subject = parseSubject(fieldOf(parsed, 'subject'));
  const handle = JSON_ROUTES[route];
  return subject === null || handle === undefined ? unknownSubject() : SUBJECT_ROUTES[subject][handle]({ ...context, parsed });
};

// The API routes as plain Node middleware, so the dev server and the deployed functions share them.
export const apiMiddleware = ({ env }: ApiOptions, model = modelFrom(env)): Middleware => {
  const publicDemo = isPublicDemo(env);
  const allow = createRateLimit(PUBLIC_DEMO_LIMITS);
    return async (request, response, next) => {
    const route = request.url?.split('?')[0];
    if (request.method !== 'POST' || !isApiRoute(route)) {
      next();
      return;
    }
    if (publicDemo) {
      if (!allow(visitorOf(request))) {
        send(response, TOO_MANY);
        return;
      }
    } else {
      const code = header(request, ACCESS_HEADER);
      if (!hasAccess(env.ACCESS_CODE, code)) {
        send(response, { status: 401, body: { error: code === undefined ? NO_ACCESS : WRONG_CODE, details: [] } });
        return;
      }
    }
    const body = await readBody(request);
    if (body.kind === 'aborted') return;
    if (body.kind === 'too-large') {
      response.setHeader('connection', 'close');
      send(response, TOO_LARGE);
      return;
    }
    const mode = parseStubMode(header(request, 'x-stub-mode'));
    try {
      send(response, await answer(request, route, { model, mode, delayMs: delayFor(mode) }, body.bytes));
    } catch (error) {
      console.error(error);
      if (!response.headersSent) send(response, SERVER_FAILURE);
    }
  };
};

export const stubApi = ({ env }: ApiOptions): Plugin => ({
  name: 'board-to-life-stub-api',
  configureServer(server) {
    const model = modelFrom(env);
    server.config.logger.info(`scene reader and question drafter: ${model ? `${model.name} (paid model calls)` : 'stub'}`);
    server.middlewares.use(apiMiddleware({ env }, model));
  },
});
