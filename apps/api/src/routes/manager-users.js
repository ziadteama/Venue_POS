import { z } from 'zod';
import { ROLES } from '@venue-pos/shared';
import { prisma } from '../db/prisma.js';
import { requireRoles } from '../middleware/auth.js';
import { validationError } from '../utils/errors.js';
import {
  createManagedUser,
  getVenueUserDetail,
  importVenueUsersCsv,
  listManagedUsers,
  resetManagedUserPassword,
  resetManagedUserPin,
  setManagedUserActive,
  updateManagedUser,
  usersListToCsv,
} from '../services/manager-user-service.js';

const staffAdminPreHandler = requireRoles(ROLES.HUB_MANAGER, ROLES.HUB_OWNER);

const createSchema = z.object({
  username: z.string().min(1).max(100),
  role: z.enum(['cashier', 'hub_owner', 'hub_manager', 'kitchen_staff', 'venue_manager']),
  pin: z.string().min(4).max(6).optional(),
  password: z.string().min(6).max(100).optional(),
  cardUid: z.string().max(100).optional(),
});

const updateSchema = z.object({
  username: z.string().min(1).max(100).optional(),
  role: z.enum(['cashier', 'hub_owner', 'hub_manager', 'kitchen_staff', 'venue_manager']).optional(),
  cardUid: z.string().max(100).nullable().optional(),
});

function optionalVenueId(request) {
  return request.query?.venueId ?? undefined;
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
    { preHandler: staffAdminPreHandler },
    async (request, reply) => {
      const actor = await actorFromRequest(request);
      const venueId = optionalVenueId(request);
      if (request.user.role === ROLES.HUB_MANAGER && !venueId) {
        throw validationError('venueId query parameter is required');
      }

      const users = await listManagedUsers(actor, {
        venueId,
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
    { preHandler: staffAdminPreHandler },
    async (request) =>
      getVenueUserDetail(
        await actorFromRequest(request),
        request.params.id,
        optionalVenueId(request),
      ),
  );

  app.post(
    '/api/v1/manager/users',
    { preHandler: staffAdminPreHandler },
    async (request) => {
      const parsed = createSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      const actor = await actorFromRequest(request);
      const venueId = optionalVenueId(request);
      if (request.user.role === ROLES.HUB_MANAGER && parsed.data.role !== 'cashier') {
        throw validationError('Hub managers can only add cashiers');
      }
      return createManagedUser(actor, venueId, parsed.data);
    },
  );

  app.patch(
    '/api/v1/manager/users/:id',
    { preHandler: staffAdminPreHandler },
    async (request) => {
      const parsed = updateSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      return updateManagedUser(
        await actorFromRequest(request),
        request.params.id,
        optionalVenueId(request),
        parsed.data,
      );
    },
  );

  app.post(
    '/api/v1/manager/users/:id/pin',
    { preHandler: staffAdminPreHandler },
    async (request) => {
      const parsed = z.object({ pin: z.string().min(4).max(6) }).safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      return resetManagedUserPin(
        await actorFromRequest(request),
        request.params.id,
        optionalVenueId(request),
        parsed.data.pin,
      );
    },
  );

  app.post(
    '/api/v1/manager/users/:id/password',
    { preHandler: requireRoles(ROLES.HUB_OWNER) },
    async (request) => {
      const parsed = z.object({ password: z.string().min(6).max(100) }).safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      return resetManagedUserPassword(
        await actorFromRequest(request),
        request.params.id,
        parsed.data.password,
      );
    },
  );

  app.post(
    '/api/v1/manager/users/:id/active',
    { preHandler: staffAdminPreHandler },
    async (request) => {
      const parsed = z.object({ isActive: z.boolean() }).safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      return setManagedUserActive(
        await actorFromRequest(request),
        request.params.id,
        optionalVenueId(request),
        parsed.data.isActive,
      );
    },
  );

  app.post(
    '/api/v1/manager/users/import',
    { preHandler: staffAdminPreHandler },
    async (request) => {
      const csvText = request.body?.csv;
      if (!csvText || typeof csvText !== 'string') throw validationError('csv body required');
      const venueId = optionalVenueId(request);
      if (request.user.role === ROLES.HUB_MANAGER && !venueId) {
        throw validationError('venueId query parameter is required');
      }
      return importVenueUsersCsv(await actorFromRequest(request), venueId, csvText);
    },
  );
}
