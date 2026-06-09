import { ERROR_CODES } from '@venue-pos/shared';
import { randomUUID } from 'node:crypto';

export function registerErrorHandler(app) {
  app.setErrorHandler((error, request, reply) => {
    const requestId = request.id ?? randomUUID();
    const statusCode = error.statusCode ?? 500;
    const code = error.code ?? ERROR_CODES.INTERNAL_ERROR;
    const message = statusCode === 500 ? 'Internal server error' : error.message;

    if (statusCode === 500) {
      request.log.error({ err: error, requestId }, 'Unhandled error');
    }

    const body = {
      error: {
        code,
        message,
        details: error.details,
        timestamp: new Date().toISOString(),
        request_id: requestId,
      },
    };
    if (code === ERROR_CODES.DUPLICATE_SYNC_ID && error.syncResult != null) {
      body.result = error.syncResult;
    }
    reply.status(statusCode).send(body);
  });
}
