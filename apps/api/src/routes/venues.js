import { ROLES } from '@venue-pos/shared';
import { requireRoles } from '../middleware/auth.js';
import { listVenues } from '../services/menu-service.js';

export async function venueRoutes(app) {
  app.get(
    '/api/v1/venues',
    { preHandler: requireRoles(ROLES.HUB_OWNER, ROLES.HUB_MANAGER, ROLES.SYSTEM_ADMIN) },
    async () => listVenues(),
  );
}
