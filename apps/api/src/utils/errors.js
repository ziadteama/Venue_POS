import { ERROR_CODES } from '@venue-pos/shared';

export function apiError(code, message, statusCode, details = undefined) {
  const err = new Error(message);
  err.code = code;
  err.statusCode = statusCode;
  err.details = details;
  return err;
}

export function notFound(message = 'Resource not found') {
  return apiError(ERROR_CODES.RESOURCE_NOT_FOUND, message, 404);
}

export function unauthorized(message = 'Unauthorized') {
  return apiError(ERROR_CODES.INVALID_CREDENTIALS, message, 401);
}

export function forbidden(message = 'Insufficient permissions') {
  return apiError(ERROR_CODES.INSUFFICIENT_PERMISSIONS, message, 403);
}

export function validationError(message, details) {
  return apiError(ERROR_CODES.VALIDATION_ERROR, message, 400, details);
}

export function conflict(message = 'Resource conflict') {
  return apiError(ERROR_CODES.CONFLICT, message, 409);
}
