import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { ACCESS_HEADER } from '../src/access';
import { hasAccess } from './access';
import { MODEL_REQUEST_TIMEOUT_MS } from '../src/reading';
import { isProviderName, parseEffort, providerFromEnv, readSceneWithModel } from './sceneReader';
import { describeSceneWithModel } from './sceneWriter';
import { readWebWithModel } from './webReader';
import { describeWebWithModel } from './webWriter';
import { parseSubject } from '../src/subjects';
import { handleDescribe, handleDescribeWeb, handleDraftQuestions, handleDraftWebQuestions, handleUnderstand, handleUnderstandWeb, parseStubMode, type StubMode, type StubResponse } from './stub';
import { handleDraftQuestionsWithModel, handleDraftWebQuestionsWithModel, type ModelDraft, type ModelWebDraft } from './draft';
import { draftQuestionsWithModel } from './questionDrafter';
import { draftWebQuestionsWithModel } from './webDrafter';
import { handleDescribeWebWithModel, handleDescribeWithModel, type ModelDescribe } from './describe';
import { handleUnderstandWebWithModel, handleUnderstandWithModel, type ModelRead } from './understand';

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const STUB_LATENCY_MS = 700;
export const STUB_TIMEOUT_DELAY_MS = MODEL_REQUEST_TIMEOUT_MS + 15_000;
// The whole budget for one read or draft, a retry included: the slowest read measured took 71 s.
export const MODEL_TIMEOUT_MS = 120_000;

const delayFor = (mode: StubMode): number => (mode === 'timeout' ? STUB_TIMEOUT_DELAY_MS : STUB_LATENCY_MS);

const readBody = (request: IncomingMessage): Promise<Buffer | null> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_UPLOAD_BYTES) {
        resolve(null);
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
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
};

const modelFrom = (env: ApiOptions['env']): ApiModel | null => {
  const name = env.SCENE_READER ?? 'stub';
  if (!isProviderName(name)) return null;
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
  };
};

const API_ROUTES = new Set(['/api/understand', '/api/draft-questions', '/api/describe']);

type Middleware = (request: IncomingMessage, response: ServerResponse, next: () => void) => Promise<void>;

const UNKNOWN_SUBJECT = 'Pick a subject: Physics or Ecosystem.';
const unknownSubject = (): StubResponse => ({ status: 400, body: { error: UNKNOWN_SUBJECT, details: [] } });

const fieldOf = (parsed: unknown, name: string): unknown =>
  typeof parsed === 'object' && parsed !== null && name in parsed ? (parsed as Record<string, unknown>)[name] : undefined;

const NO_ACCESS = 'This demo needs its access link. Open the link from the submission page, then try again.';

// The API routes as plain Node middleware, so the dev server and the deployed functions share them.
export const apiMiddleware = ({ env }: ApiOptions, model = modelFrom(env)): Middleware => async (request, response, next) => {
  const route = request.url?.split('?')[0];
  if (request.method !== 'POST' || !API_ROUTES.has(route ?? '')) {
    next();
    return;
  }
  if (!hasAccess(env.ACCESS_CODE, header(request, ACCESS_HEADER))) {
    send(response, { status: 401, body: { error: NO_ACCESS, details: [] } });
    return;
  }
  const mode = parseStubMode(header(request, 'x-stub-mode'));
  const body = await readBody(request);
  if (body === null) {
    send(response, { status: 413, body: { error: 'That photo is too large (15 MB maximum).' } });
    return;
  }
  if (route === '/api/understand') {
    const contentType = header(request, 'content-type') ?? '';
    const subject = parseSubject(new URL(request.url ?? '', 'http://localhost').searchParams.get('subject') ?? undefined);
    if (subject === null) {
      send(response, unknownSubject());
      return;
    }
    if (subject === 'ecosystem') {
      send(
        response,
        model
          ? await handleUnderstandWebWithModel({ contentType, bytes: new Uint8Array(body), reader: model.name, read: model.readWeb })
          : await handleUnderstandWeb({ mode, delayMs: delayFor(mode), contentType, bytes: body.length }),
      );
      return;
    }
    send(
      response,
      model
        ? await handleUnderstandWithModel({ contentType, bytes: new Uint8Array(body), reader: model.name, read: model.read })
        : await handleUnderstand({ mode, delayMs: delayFor(mode), contentType, bytes: body.length }),
    );
    return;
  }
  const parsed = parseJson(body);
  const subject = parseSubject(fieldOf(parsed, 'subject'));
  if (subject === null) {
    send(response, unknownSubject());
    return;
  }
  if (route === '/api/describe') {
    const text = typeof parsed === 'object' && parsed !== null && 'text' in parsed ? parsed.text : null;
    if (subject === 'ecosystem') {
      send(
        response,
        model
          ? await handleDescribeWebWithModel({ text, reader: model.name, describe: model.describeWeb })
          : await handleDescribeWeb({ mode, delayMs: delayFor(mode), text }),
      );
      return;
    }
    send(
      response,
      model
        ? await handleDescribeWithModel({ text, reader: model.name, describe: model.describe })
        : await handleDescribe({ mode, delayMs: delayFor(mode), text }),
    );
    return;
  }
  if (subject === 'ecosystem') {
    const web = fieldOf(parsed, 'web');
    send(
      response,
      model
        ? await handleDraftWebQuestionsWithModel({ web, drafter: model.name, draft: model.draftWeb })
        : await handleDraftWebQuestions({ mode, delayMs: delayFor(mode), web }),
    );
    return;
  }
  const scene = typeof parsed === 'object' && parsed !== null && 'scene' in parsed ? parsed.scene : null;
  send(
    response,
    model
      ? await handleDraftQuestionsWithModel({ scene, drafter: model.name, draft: model.draft })
      : await handleDraftQuestions({ mode, delayMs: delayFor(mode), scene }),
  );
};

export const stubApi = ({ env }: ApiOptions): Plugin => ({
  name: 'board-to-life-stub-api',
  configureServer(server) {
    const model = modelFrom(env);
    server.config.logger.info(`scene reader and question drafter: ${model ? `${model.name} (paid model calls)` : 'stub'}`);
    server.middlewares.use(apiMiddleware({ env }, model));
  },
});
