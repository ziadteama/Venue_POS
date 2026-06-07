import { z } from 'zod';
import { ROLES } from '@venue-pos/shared';
import { prisma } from '../db/prisma.js';
import { requireRoles } from '../middleware/auth.js';
import { validationError } from '../utils/errors.js';
import {
  listVenueUsers,
  getVenueUserDetail,
  createVenueUser,
  updateVenueUser,
  resetVenueUserPin,
  setVenueUserActive,
  importVenueUsersCsv,
  usersListToCsv,
} from '../services/manager-user-service.js';

const hubManagerPreHandler = requireRoles(ROLES.HUB_MANAGER);

const createSchema = z.object({
  username: z.string().min(1).max(100),
  role: z.enum(['cashier', 'kitchen_staff', 'venue_manager']),
  pin: z.string().min(4).max(6),
  cardUid: z.string().max(100).optional(),
});

const updateSchema = z.object({
  username: z.string().min(1).max(100).optional(),
  role: z.enum(['cashier', 'kitchen_staff', 'venue_manager']).optional(),
  cardUid: z.string().max(100).nullable().optional(),
});

function requireVenueId(request) {
  const venueId = request.query?.venueId;
  if (!venueId) throw validationError('venueId query parameter is required');
  return venueId;
}

async function actorFromRequest(request) {
  const user = await prisma.user.findUnique({
    where: { id: request.user.sub },
    select: { id: true, username: true, role: true, venueId: true },
  });
  return (
    user ?? {
      id: request.user.sub,
      username: request.user.sub,
      role: request.user.role,
      venueId: request.user.venue_id,
    }
  );
}

export async function managerUsersRoutes(app) {
  app.get(
    '/api/v1/manager/users',
    { preHandler: hubManagerPreHandler },
    async (request, reply) => {
      const venueId = requireVenueId(request);
      const users = await listVenueUsers(venueId, {
        search: request.query?.search,
        includeInactive: request.query?.includeInactive === 'true',
      });

      if (request.query?.format === 'csv') {
        reply.header('Content-Type', 'text/csv; charset=utf-8');
        reply.header('Content-Disposition', 'attachment; filename="venue-users.csv"');
        return usersListToCsv(users);
      }
      return users;
    },
  );

  app.get(
    '/api/v1/manager/users/:id',
    { preHandler: hubManagerPreHandler },
    async (request) => getVenueUserDetail(request.params.id, requireVenueId(request)),
  );

  app.post(
    '/api/v1/manager/users',
    { preHandler: hubManagerPreHandler },
    async (request) => {
      const parsed = createSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      return createVenueUser(await actorFromRequest(request), requireVenueId(request), parsed.data);
    },
  );

  app.patch(
    '/api/v1/manager/users/:id',
    { preHandler: hubManagerPreHandler },
    async (request) => {
      const parsed = updateSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      return updateVenueUser(
        await actorFromRequest(request),
        request.params.id,
        requireVenueId(request),
        parsed.data,
      );
    },
  );

  app.post(
    '/api/v1/manager/users/:id/pin',
    { preHandler: hubManagerPreHandler },
    async (request) => {
      const parsed = z.object({ pin: z.string().min(4).max(6) }).safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      return resetVenueUserPin(
        await actorFromRequest(request),
        request.params.id,
        requireVenueId(request),
        parsed.data.pin,
      );
    },
  );

  app.post(
    '/api/v1/manager/users/:id/active',
    { preHandler: hubManagerPreHandler },
    async (request) => {
      const parsed = z.object({ isActive: z.boolean() }).safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      return setVenueUserActive(
        await actorFromRequest(request),
        request.params.id,
        requireVenueId(request),
        parsed.data.isActive,
      );
    },
  );

  app.post(
    '/api/v1/manager/users/import',
    { preHandler: hubManagerPreHandler },
    async (request) => {
      const csvText = request.body?.csv;
      if (!csvText || typeof csvText !== 'string') throw validationError('csv body required');
      return importVenueUsersCsv(await actorFromRequest(request), requireVenueId(request), csvText);
    },
  );
}
