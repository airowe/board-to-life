import type { IncomingMessage, ServerResponse } from 'node:http';
import { apiMiddleware } from './plugin';

// Entry for the deployed API functions; keys and SCENE_READER come from the Vercel project's environment.
const handle = apiMiddleware({ env: process.env });

export default (request: IncomingMessage, response: ServerResponse): Promise<void> =>
  handle(request, response, () => {
    response.statusCode = 404;
    response.end();
  });
