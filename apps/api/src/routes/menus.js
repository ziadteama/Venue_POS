import { z } from 'zod';
import { ROLES } from '@venue-pos/shared';
import { requireRoles } from '../middleware/auth.js';
import { authenticateTerminal } from '../middleware/terminal.js';
import { validationError } from '../utils/errors.js';
import { emitMenuUpdated } from '../plugins/socket.js';
import {
  listMenuTemplates,
  getMenuTemplate,
  createMenuTemplate,
  updateMenuTemplate,
  createCategory,
  reorderCategories,
  createMenuItem,
  updateMenuItem,
  createModifierGroup,
  publishMenuTemplate,
  getPublishedMenuForVenue,
} from '../services/menu-service.js';

const bilingualName = z.object({
  nameEn: z.string().min(1),
  nameAr: z.string().min(1),
});

const createTemplateSchema = bilingualName.extend({
  venueIds: z.array(z.string().uuid()).optional(),
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

export async function menuRoutes(app) {
  app.get(
    '/api/v1/menu-templates',
    { preHandler: requireRoles(ROLES.HUB_MANAGER, ROLES.VENUE_MANAGER) },
    async () => listMenuTemplates(),
  );

  app.post(
    '/api/v1/menu-templates',
    { preHandler: requireRoles(ROLES.HUB_MANAGER) },
    async (request) => {
      const parsed = createTemplateSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      return createMenuTemplate(parsed.data);
    },
  );

  app.get(
    '/api/v1/menu-templates/:id',
    { preHandler: requireRoles(ROLES.HUB_MANAGER, ROLES.VENUE_MANAGER) },
    async (request) => getMenuTemplate(request.params.id),
  );

  app.patch(
    '/api/v1/menu-templates/:id',
    { preHandler: requireRoles(ROLES.HUB_MANAGER) },
    async (request) => {
      const parsed = createTemplateSchema.partial().safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      return updateMenuTemplate(request.params.id, parsed.data);
    },
  );

  app.post(
    '/api/v1/menu-templates/:id/categories',
    { preHandler: requireRoles(ROLES.HUB_MANAGER) },
    async (request) => {
      const parsed = createCategorySchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      return createCategory(request.params.id, parsed.data);
    },
  );

  app.put(
    '/api/v1/menu-templates/:id/categories/reorder',
    { preHandler: requireRoles(ROLES.HUB_MANAGER) },
    async (request) => {
      const schema = z.object({ orderedIds: z.array(z.string().uuid()).min(1) });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      return reorderCategories(request.params.id, parsed.data.orderedIds);
    },
  );

  app.post(
    '/api/v1/menu-templates/:id/modifier-groups',
    { preHandler: requireRoles(ROLES.HUB_MANAGER) },
    async (request) => {
      const parsed = modifierGroupSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      return createModifierGroup(request.params.id, parsed.data);
    },
  );

  app.post(
    '/api/v1/menu-templates/:id/publish',
    { preHandler: requireRoles(ROLES.HUB_MANAGER) },
    async (request) => {
      const result = await publishMenuTemplate(request.params.id);
      if (request.server.io) {
        emitMenuUpdated(request.server.io, {
          templateId: result.id,
          venueIds: result.venueIds,
          versionHash: result.versionHash,
          publishedAt: result.publishedAt,
        });
      }
      return result;
    },
  );

  app.post(
    '/api/v1/categories/:categoryId/items',
    { preHandler: requireRoles(ROLES.HUB_MANAGER) },
    async (request) => {
      const parsed = createItemSchema.safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      return createMenuItem(request.params.categoryId, parsed.data);
    },
  );

  app.patch(
    '/api/v1/menu-items/:itemId',
    { preHandler: requireRoles(ROLES.HUB_MANAGER) },
    async (request) => {
      const parsed = createItemSchema.partial().safeParse(request.body);
      if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());
      return updateMenuItem(request.params.itemId, parsed.data);
    },
  );

  app.get('/api/v1/venues/:venueId/menu', { preHandler: authenticateTerminal }, async (request) => {
    if (request.terminal.venueId !== request.params.venueId) {
      throw validationError('Terminal not assigned to this venue');
    }
    return getPublishedMenuForVenue(request.params.venueId);
  });
}
