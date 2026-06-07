import { ROLES } from '@venue-pos/shared';
import { requireRoles } from '../middleware/auth.js';
import { validationError } from '../utils/errors.js';
import { listManagerActivity } from '../services/manager-action-service.js';

const hubManagerPreHandler = requireRoles(ROLES.HUB_MANAGER);

function resolveVenueId(request) {
  const queryVenue = request.query?.venueId;
  if (queryVenue && request.user.role === ROLES.HUB_MANAGER) return queryVenue;
  return request.user.venue_id;
}

export async function managerActivityRoutes(app) {
  app.get(
    '/api/v1/manager/activity',
    { preHandler: hubManagerPreHandler },
    async (request) => {
      const venueId = resolveVenueId(request);
      if (!venueId) throw validationError('Venue is required');
      const limit = Number(request.query?.limit ?? 100);
      return listManagerActivity(venueId, { limit });
    },
  );
}
