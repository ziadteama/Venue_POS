import { parseApiError, isTechnicalErrorMessage } from '@venue-pos/shared';

export { parseApiError, isTechnicalErrorMessage };

/** Normalize caught errors for UI display (API, network, or raw strings). */
export function friendlyError(err, fallback = 'Something went wrong. Please try again.') {
  return parseApiError(err?.message ?? err, fallback);
}
