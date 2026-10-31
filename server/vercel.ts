import type { IncomingMessage, ServerResponse } from 'node:http';
import { apiMiddleware, modelFrom } from './plugin';

type Handler = (request: IncomingMessage, response: ServerResponse) => Promise<void>;

const NOT_SET_UP = JSON.stringify({ error: 'This demo is not set up yet.', details: [] });

const notSetUp: Handler = async (_request, response) => {
  response.statusCode = 503;
  response.setHeader('content-type', 'application/json');
  response.end(NOT_SET_UP);
};

const notFound = (response: ServerResponse) => () => {
  response.statusCode = 404;
  response.end();
};

// A deployed demo with a paid reader must sit behind an access code, so a missing code or key refuses every request.
export const vercelHandler = (env: Record<string, string | undefined>): Handler => {
  let model;
  try {
    model = modelFrom(env);
  } catch (error) {
    console.error(error);
    return notSetUp;
  }
  if (model && !env.ACCESS_CODE) {
    console.error('A paid reader is set without ACCESS_CODE; refusing every request.');
    return notSetUp;
  }
  const handle = apiMiddleware({ env }, model);
  return (request, response) => handle(request, response, notFound(response));
};

// Entry for the deployed API functions; keys and SCENE_READER come from the Vercel project's environment.
export default vercelHandler(process.env);
