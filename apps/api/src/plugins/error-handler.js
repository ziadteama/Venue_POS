import { ERROR_CODES } from '@venue-pos/shared';
import { randomUUID } from 'node:crypto';

function isDatabaseUnavailable(error) {
  return (
    error?.name === 'PrismaClientInitializationError'
    || (error?.name === 'PrismaClientKnownRequestError' && error.code === 'P1001')
  );
}

export function registerErrorHandler(app) {
  app.setErrorHandler((error, request, reply) => {
    const requestId = request.id ?? randomUUID();
    const dbUnavailable = isDatabaseUnavailable(error);
    const statusCode = error.statusCode ?? (dbUnavailable ? 503 : 500);
    const code = error.code ?? (dbUnavailable ? ERROR_CODES.SERVICE_UNAVAILABLE : ERROR_CODES.INTERNAL_ERROR);
    const message = dbUnavailable
      ? 'Database unavailable — ensure PostgreSQL is running and DATABASE_URL uses 127.0.0.1 on Windows'
      : statusCode === 500
        ? 'Internal server error'
        : error.message;

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
