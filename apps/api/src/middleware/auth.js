import { canSeeFinancials } from '@venue-pos/shared';
import { prisma } from '../db/prisma.js';
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

async function resolveRequestUsername(request) {
  if (request.user?.username) return request.user.username;
  if (!request.user?.sub) return null;
  const user = await prisma.user.findUnique({
    where: { id: request.user.sub },
    select: { username: true },
  });
  if (user?.username) request.user.username = user.username;
  return user?.username ?? null;
}

export function requireRoles(...roles) {
  return async (request) => {
    await authenticate(request);
    if (!roles.includes(request.user.role)) {
      throw forbidden();
    }
  };
}

/** Revenue / P&L endpoints — only the `owner` dashboard account. */
export function requireFinancialOwner() {
  return async (request) => {
    await authenticate(request);
    const username = await resolveRequestUsername(request);
    if (!canSeeFinancials({ username })) {
      throw forbidden();
    }
  };
}

export async function requestCanSeeFinancials(request) {
  await authenticate(request);
  const username = await resolveRequestUsername(request);
  return canSeeFinancials({ username });
}
