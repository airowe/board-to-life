import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ACCESS_HEADER } from '../src/access';
import { grasslandWeb } from '../src/ecosystem/fixtures';
import { templateQuestion } from '../src/ecosystem/questions';
import { WEB_SAMPLES } from '../src/ecosystem/samples';
import type { Web, WebEvent } from '../src/ecosystem/schema';
import { templateFigureQuestion } from '../src/geometry/questions';
import { GEOMETRY_SAMPLES } from '../src/geometry/samples';
import { validateFigure, type Figure, type Focus } from '../src/geometry/schema';
import { rampBallDominoes } from '../src/scene/fixtures';
import { obeyWrittenValues } from './figureReader';
import { apiMiddleware, type ApiModel } from './plugin';

const CODE = 'class-demo-42';
const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let server: Server | null = null;

const serve = async (env: Record<string, string | undefined>, model?: ApiModel | null): Promise<string> => {
  const handle = model === undefined ? apiMiddleware({ env }) : apiMiddleware({ env }, model);
  server = createServer((request, response) =>
    handle(request, response, () => {
      response.statusCode = 404;
      response.end();
    }),
  );
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

afterEach(async () => {
  const running = server;
  server = null;
  if (running) await new Promise((resolve) => running.close(resolve));
});

const postPhoto = (base: string, headers: Record<string, string> = {}): Promise<Response> =>
  fetch(`${base}/api/understand`, { method: 'POST', headers: { 'content-type': 'image/png', ...headers }, body: PNG_SIGNATURE });

describe('apiMiddleware', () => {
  it('reads with the stub when no access code is configured', async () => {
    const response = await postPhoto(await serve({}));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ stub: true });
  });

  it.each([
    ['without a code', {}],
    ['with the wrong code', { [ACCESS_HEADER]: 'guess' }],
  ])('turns a request away %s when a code is configured', async (_case, headers) => {
    const response = await postPhoto(await serve({ ACCESS_CODE: CODE }), headers);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: expect.stringContaining('access link'), details: [] });
  });

  it('turns away a drafting request without the code too', async () => {
    const base = await serve({ ACCESS_CODE: CODE });
    const response = await fetch(`${base}/api/draft-questions`, { method: 'POST', body: '{}' });
    expect(response.status).toBe(401);
  });

  it('describes with the stub when no reader is set', async () => {
    const response = await fetch(`${await serve({})}/api/describe`, { method: 'POST', body: JSON.stringify({ text: 'a ball rolls into dominoes' }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ stub: true, scene: { items: expect.any(Array) } });
  });

  it('turns away a describe request without the code', async () => {
    const base = await serve({ ACCESS_CODE: CODE });
    const response = await fetch(`${base}/api/describe`, { method: 'POST', body: JSON.stringify({ text: 'a ball' }) });
    expect(response.status).toBe(401);
  });

  it('lets a request with the right code through', async () => {
    const response = await postPhoto(await serve({ ACCESS_CODE: CODE }), { [ACCESS_HEADER]: CODE });
    expect(response.status).toBe(200);
  });

  it('passes other routes on', async () => {
    const response = await fetch(`${await serve({ ACCESS_CODE: CODE })}/index.html`);
    expect(response.status).toBe(404);
  });
});

describe('apiMiddleware subjects', () => {
  const web = WEB_SAMPLES[0]?.web;
  const drafted: Web = { ...grasslandWeb(), event: { kind: 'remove', species: 'fox' } };
  const UNKNOWN_SUBJECT = 'Pick a subject: Physics, Ecosystem or Geometry.';
  const figure = GEOMETRY_SAMPLES[0]?.figure as Figure;
  const FIGURE_FOCUS: Focus = { kind: 'angle-sum', polygon: 'abc', drag: 'C' };
  const calls: string[] = [];
  const fake: ApiModel = {
    name: 'fake',
    read: () => {
      calls.push('read');
      return Promise.resolve(rampBallDominoes);
    },
    readWeb: () => {
      calls.push('readWeb');
      return Promise.resolve(web);
    },
    draft: () => Promise.resolve([]),
    draftWeb: () => {
      calls.push('draftWeb');
      return Promise.resolve([templateQuestion(drafted, drafted.event as WebEvent, 'grass')]);
    },
    describe: () => {
      calls.push('describe');
      return Promise.resolve(rampBallDominoes);
    },
    describeWeb: () => {
      calls.push('describeWeb');
      return Promise.resolve(web);
    },
    readFigure: () => {
      calls.push('readFigure');
      return Promise.resolve(figure);
    },
    describeFigure: () => {
      calls.push('describeFigure');
      return Promise.resolve(figure);
    },
    draftFigure: (drafting, focus) => {
      calls.push('draftFigure');
      return Promise.resolve([templateFigureQuestion(drafting, focus)]);
    },
  };
  const post = (base: string, path: string, body: unknown) => fetch(`${base}${path}`, { method: 'POST', body: JSON.stringify(body) });
  const samplePng = readFileSync(new URL('../public/samples/ramp-ball-dominoes.png', import.meta.url));
  const photo = (base: string, query: string) =>
    fetch(`${base}/api/understand${query}`, { method: 'POST', headers: { 'content-type': 'image/png' }, body: samplePng });

  beforeEach(() => {
    calls.length = 0;
  });

  it('reads a photo with the web reader when the query names the ecosystem subject', async () => {
    const response = await photo(await serve({}, fake), '?subject=ecosystem');
    expect(await response.json()).toMatchObject({ stub: false, reader: 'fake', web: { version: 1 } });
    expect(calls).toEqual(['readWeb']);
  });

  it('still reads a photo into a scene with no subject, or with physics', async () => {
    const base = await serve({}, fake);
    for (const query of ['', '?subject=physics']) {
      const body = await (await photo(base, query)).json();
      expect(body).toMatchObject({ scene: { version: 1 } });
      expect(body).not.toHaveProperty('web');
    }
    expect(calls).toEqual(['read', 'read']);
  });

  it('describes with the web writer when the body names the ecosystem subject', async () => {
    const response = await post(await serve({}, fake), '/api/describe', { text: 'grass and rabbits', subject: 'ecosystem' });
    expect(await response.json()).toMatchObject({ stub: false, web: { version: 1 } });
    expect(calls).toEqual(['describeWeb']);
  });

  it('still describes a scene with no subject', async () => {
    const body = await (await post(await serve({}, fake), '/api/describe', { text: 'a ball rolls' })).json();
    expect(body).toMatchObject({ scene: { version: 1 } });
    expect(calls).toEqual(['describe']);
  });

  it('serves the stub web for the ecosystem subject with no reader set', async () => {
    const base = await serve({});
    expect(await (await photo(base, '?subject=ecosystem')).json()).toEqual({ stub: true, web });
    expect(await (await post(base, '/api/describe', { text: 'grass and rabbits', subject: 'ecosystem' })).json()).toEqual({ stub: true, web });
  });

  it('answers 400 for an unknown subject on every route, without calling the model', async () => {
    const base = await serve({}, fake);
    const responses = [
      await photo(base, '?subject=chemistry'),
      await post(base, '/api/describe', { text: 'a ball', subject: 'chemistry' }),
      await post(base, '/api/draft-questions', { scene: {}, subject: 'chemistry' }),
    ];
    for (const response of responses) {
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: UNKNOWN_SUBJECT, details: [] });
    }
    expect(calls).toEqual([]);
  });

  it('drafts ecosystem questions with the web drafter when the body names the ecosystem subject', async () => {
    const response = await post(await serve({}, fake), '/api/draft-questions', { web: drafted, subject: 'ecosystem' });
    expect(await response.json()).toMatchObject({ stub: false, drafter: 'fake', questions: [{ id: 'q-1', observe: { kind: 'direction', species: 'grass' } }] });
    expect(calls).toEqual(['draftWeb']);
  });

  it('serves a template question for the ecosystem subject with no drafter set', async () => {
    const response = await post(await serve({}), '/api/draft-questions', { web: drafted, subject: 'ecosystem' });
    expect(await response.json()).toEqual({ stub: true, questions: [templateQuestion(drafted, drafted.event as WebEvent, 'grass')] });
  });

  it('still drafts physics questions with the scene drafter when no subject is named', async () => {
    const response = await post(await serve({}, fake), '/api/draft-questions', { scene: rampBallDominoes });
    expect(await response.json()).toMatchObject({ stub: false, questions: [] });
    expect(calls).toEqual([]);
  });

  it('serves the stub figure for the geometry subject, which validates', async () => {
    const base = await serve({});
    const read = await photo(base, '?subject=geometry');
    const body = (await read.json()) as { stub: boolean; figure: unknown };
    expect(read.status).toBe(200);
    expect(body).toEqual({ stub: true, figure: GEOMETRY_SAMPLES[0]?.figure });
    expect(validateFigure(body.figure).ok).toBe(true);
    const described = await post(base, '/api/describe', { text: 'Triangle ABC with a 50° angle at A.', subject: 'geometry' });
    expect(await described.json()).toEqual({ stub: true, figure: GEOMETRY_SAMPLES[0]?.figure });
  });

  it('reads and describes geometry with the figure reader and writer when a model is set', async () => {
    const base = await serve({}, fake);
    expect(await (await photo(base, '?subject=geometry')).json()).toEqual({ stub: false, reader: 'fake', figure: obeyWrittenValues(figure) });
    expect(await (await post(base, '/api/describe', { text: 'Triangle ABC.', subject: 'geometry' })).json()).toEqual({ stub: false, reader: 'fake', figure });
    expect(calls).toEqual(['readFigure', 'describeFigure']);
  });

  it('drafts geometry questions with the figure drafter when a model is set', async () => {
    const response = await post(await serve({}, fake), '/api/draft-questions', { figure, subject: 'geometry' });
    expect(await response.json()).toEqual({ stub: false, drafter: 'fake', questions: [templateFigureQuestion(figure, FIGURE_FOCUS)] });
    expect(calls).toEqual(['draftFigure']);
  });

  it('serves the template question for geometry with no drafter set', async () => {
    const response = await post(await serve({}), '/api/draft-questions', { figure, subject: 'geometry' });
    expect(await response.json()).toEqual({ stub: true, questions: [templateFigureQuestion(figure, FIGURE_FOCUS)] });
  });
});
