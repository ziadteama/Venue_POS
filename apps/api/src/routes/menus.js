import { z } from 'zod';
import { ROLES } from '@venue-pos/shared';
import { prisma } from '../db/prisma.js';
import { requireRoles } from '../middleware/auth.js';
import { appendAuditLog } from '../services/audit-log-service.js';
import { authenticateTerminal } from '../middleware/terminal.js';
import { validationError } from '../utils/errors.js';
import { emitMenuUpdated } from '../plugins/socket.js';
import {
  getVenueMenu,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  createModifierGroup,
  updateModifierGroup,
  deleteModifierGroup,
  addModifierOption,
  updateModifierOption,
  deleteModifierOption,
  setItemModifiers,
  publishVenueMenu,
  getPublishedMenuForVenue,
} from '../services/menu-service.js';

const bilingualName = z.object({
  nameEn: z.string().min(1),
  nameAr: z.string().optional(),
});

const createCategorySchema = bilingualName.extend({
  sortOrder: z.number().int().optional(),
});

const createItemSchema = bilingualName.extend({
  descriptionEn: z.string().optional(),
  descriptionAr: z.string().optional(),
  price: z.number().positive(),
  taxRate: z.number().min(0).optional(),
  imageUrl: z.string().optional(),
  isAvailable: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const modifierGroupSchema = bilingualName.extend({
  minSelection: z.number().int().min(0).optional(),
  maxSelection: z.number().int().min(0).optional(),
  menuItemIds: z.array(z.string().uuid()).optional(),
  options: z
    .array(
      bilingualName.extend({
        priceDelta: z.number().optional(),
      }),
    )
    .optional(),
});

const modifierOptionSchema = bilingualName.extend({
  priceDelta: z.number().optional(),
  sortOrder: z.number().int().optional(),
});

function venueIdParam(request) {
  return request.params.venueId;
}

export async function menuRoutes(app) {
  app.get(
    '/api/v1/manager/venues/:venueId/menu',
    { preHandler: requireRoles(ROLES.HUB_MANAGER) },
    async (request) => getVenueMenu(venueIdParam(request)),
  );

  app.post(
    '/api/v1/manager/venues/:venueId/menu/categories',
    { preHandler: requireRoles(ROLES.HUB_MANAGER) },
    async (request) => {
      const parsed = createCategorySchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      return createCategory(venueIdParam(request), parsed.data);
    },
  );

  app.patch(
    '/api/v1/manager/venues/:venueId/menu/categories/:categoryId',
    { preHandler: requireRoles(ROLES.HUB_MANAGER) },
    async (request) => {
      const parsed = createCategorySchema.partial().safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      return updateCategory(venueIdParam(request), request.params.categoryId, parsed.data);
    },
  );

  app.delete(
    '/api/v1/manager/venues/:venueId/menu/categories/:categoryId',
    { preHandler: requireRoles(ROLES.HUB_MANAGER) },
    async (request) => deleteCategory(venueIdParam(request), request.params.categoryId),
  );

  app.put(
    '/api/v1/manager/venues/:venueId/menu/categories/reorder',
    { preHandler: requireRoles(ROLES.HUB_MANAGER) },
    async (request) => {
      const schema = z.object({ orderedIds: z.array(z.string().uuid()).min(1) });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      return reorderCategories(venueIdParam(request), parsed.data.orderedIds);
    },
  );

  app.post(
    '/api/v1/manager/venues/:venueId/menu/categories/:categoryId/items',
    { preHandler: requireRoles(ROLES.HUB_MANAGER) },
    async (request) => {
      const parsed = createItemSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      return createMenuItem(request.params.categoryId, parsed.data);
    },
  );

  app.patch(
    '/api/v1/manager/venues/:venueId/menu/items/:itemId',
    { preHandler: requireRoles(ROLES.HUB_MANAGER) },
    async (request) => {
      const parsed = createItemSchema.partial().safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      return updateMenuItem(request.params.itemId, parsed.data);
    },
  );

  app.delete(
    '/api/v1/manager/venues/:venueId/menu/items/:itemId',
    { preHandler: requireRoles(ROLES.HUB_MANAGER) },
    async (request) => deleteMenuItem(request.params.itemId),
  );

  app.post(
    '/api/v1/manager/venues/:venueId/menu/modifier-groups',
    { preHandler: requireRoles(ROLES.HUB_MANAGER) },
    async (request) => {
      const parsed = modifierGroupSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      return createModifierGroup(venueIdParam(request), parsed.data);
    },
  );

  app.patch(
    '/api/v1/manager/venues/:venueId/menu/modifier-groups/:groupId',
    { preHandler: requireRoles(ROLES.HUB_MANAGER) },
    async (request) => {
      const parsed = modifierGroupSchema.partial().safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      return updateModifierGroup(venueIdParam(request), request.params.groupId, parsed.data);
    },
  );

  app.delete(
    '/api/v1/manager/venues/:venueId/menu/modifier-groups/:groupId',
    { preHandler: requireRoles(ROLES.HUB_MANAGER) },
    async (request) => deleteModifierGroup(venueIdParam(request), request.params.groupId),
  );

  app.post(
    '/api/v1/manager/venues/:venueId/menu/modifier-groups/:groupId/options',
    { preHandler: requireRoles(ROLES.HUB_MANAGER) },
    async (request) => {
      const parsed = modifierOptionSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      return addModifierOption(venueIdParam(request), request.params.groupId, parsed.data);
    },
  );

  app.patch(
    '/api/v1/manager/venues/:venueId/menu/modifier-options/:optionId',
    { preHandler: requireRoles(ROLES.HUB_MANAGER) },
    async (request) => {
      const parsed = modifierOptionSchema.partial().safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      return updateModifierOption(venueIdParam(request), request.params.optionId, parsed.data);
    },
  );

  app.delete(
    '/api/v1/manager/venues/:venueId/menu/modifier-options/:optionId',
    { preHandler: requireRoles(ROLES.HUB_MANAGER) },
    async (request) => deleteModifierOption(venueIdParam(request), request.params.optionId),
  );

  app.put(
    '/api/v1/manager/venues/:venueId/menu/items/:itemId/modifiers',
    { preHandler: requireRoles(ROLES.HUB_MANAGER) },
    async (request) => {
      const schema = z.object({ modifierGroupIds: z.array(z.string().uuid()) });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      return setItemModifiers(request.params.itemId, parsed.data.modifierGroupIds);
    },
  );

  app.post(
    '/api/v1/manager/venues/:venueId/menu/publish',
    { preHandler: requireRoles(ROLES.HUB_MANAGER) },
    async (request) => {
      const venueId = venueIdParam(request);
      const result = await publishVenueMenu(venueId);
      const actor = await prisma.user.findUnique({
        where: { id: request.user.sub },
        select: { id: true, username: true, venueId: true },
      });
      const venue = await prisma.venue.findUnique({
        where: { id: venueId },
        select: { nameEn: true },
      });
      appendAuditLog({
        venueId,
        actorId: actor?.id ?? request.user.sub,
        actorUsername: actor?.username,
        action: 'menu.published',
        entityType: 'venue_menu',
        entityId: venueId,
        summary: `Menu published: ${venue?.nameEn ?? venueId}`,
        details: {
          venueId,
          versionHash: result.versionHash,
        },
      }).catch(() => {});
      if (request.server.io) {
        emitMenuUpdated(request.server.io, {
          venueId,
          versionHash: result.versionHash,
          publishedAt: result.publishedAt,
        });
      }
      return result;
    },
  );

  app.get('/api/v1/venues/:venueId/menu', { preHandler: authenticateTerminal }, async (request) => {
    if (request.terminal.venueId !== request.params.venueId) {
      throw validationError('Terminal not assigned to this venue');
    }
    return getPublishedMenuForVenue(request.params.venueId);
  });
}
