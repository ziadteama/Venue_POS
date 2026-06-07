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

const venueManagerPreHandler = requireRoles(ROLES.VENUE_MANAGER);

const createSchema = z.object({
  username: z.string().min(1).max(100),
  role: z.enum(['cashier', 'kitchen_staff']),
  pin: z.string().min(4).max(6),
  cardUid: z.string().max(100).optional(),
});

const updateSchema = z.object({
  username: z.string().min(1).max(100).optional(),
  role: z.enum(['cashier', 'kitchen_staff']).optional(),
  cardUid: z.string().max(100).nullable().optional(),
});

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
    { preHandler: venueManagerPreHandler },
    async (request, reply) => {
      const venueId = request.user.venue_id;
      if (!venueId) throw validationError('Venue is required');

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
    { preHandler: venueManagerPreHandler },
    async (request) => {
      const venueId = request.user.venue_id;
      if (!venueId) throw validationError('Venue is required');
      return getVenueUserDetail(request.params.id, venueId);
    },
  );

  app.post(
    '/api/v1/manager/users',
    { preHandler: venueManagerPreHandler },
    async (request) => {
      const parsed = createSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      const venueId = request.user.venue_id;
      if (!venueId) throw validationError('Venue is required');
      return createVenueUser(await actorFromRequest(request), venueId, parsed.data);
    },
  );

  app.patch(
    '/api/v1/manager/users/:id',
    { preHandler: venueManagerPreHandler },
    async (request) => {
      const parsed = updateSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      const venueId = request.user.venue_id;
      if (!venueId) throw validationError('Venue is required');
      return updateVenueUser(
        await actorFromRequest(request),
        request.params.id,
        venueId,
        parsed.data,
      );
    },
  );

  app.post(
    '/api/v1/manager/users/:id/pin',
    { preHandler: venueManagerPreHandler },
    async (request) => {
      const parsed = z.object({ pin: z.string().min(4).max(6) }).safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      const venueId = request.user.venue_id;
      if (!venueId) throw validationError('Venue is required');
      return resetVenueUserPin(
        await actorFromRequest(request),
        request.params.id,
        venueId,
        parsed.data.pin,
      );
    },
  );

  app.post(
    '/api/v1/manager/users/:id/active',
    { preHandler: venueManagerPreHandler },
    async (request) => {
      const parsed = z.object({ isActive: z.boolean() }).safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      const venueId = request.user.venue_id;
      if (!venueId) throw validationError('Venue is required');
      return setVenueUserActive(
        await actorFromRequest(request),
        request.params.id,
        venueId,
        parsed.data.isActive,
      );
    },
  );

  app.post(
    '/api/v1/manager/users/import',
    { preHandler: venueManagerPreHandler },
    async (request) => {
      const venueId = request.user.venue_id;
      if (!venueId) throw validationError('Venue is required');
      const csvText = request.body?.csv;
      if (!csvText || typeof csvText !== 'string') throw validationError('csv body required');
      return importVenueUsersCsv(await actorFromRequest(request), venueId, csvText);
    },
  );
}
