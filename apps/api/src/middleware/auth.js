import { verifyAccessToken } from '../utils/jwt.js';
import { unauthorized, forbidden } from '../utils/errors.js';

export async function authenticate(request) {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw unauthorized('Missing token');
  try {
    request.user = verifyAccessToken(header.slice(7));
  } catch {
    throw unauthorized('Invalid or expired token');
  }
}

export function requireRoles(...roles) {
  return async (request) => {
    await authenticate(request);
    if (!roles.includes(request.user.role)) {
      throw forbidden();
    }
  };
}
