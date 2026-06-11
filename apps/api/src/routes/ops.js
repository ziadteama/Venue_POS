import { z } from 'zod';
import { OPS_EVENT_TYPES, OPS_SEVERITY, ROLES } from '@venue-pos/shared';
import { config } from '../config.js';
import { requireRoles } from '../middleware/auth.js';
import { forbidden, validationError } from '../utils/errors.js';
import {
  getOpsDashboard,
  listOpsEvents,
  recordOpsEvent,
} from '../services/ops-alert-service.js';

const opsAdminPreHandler = requireRoles(ROLES.SYSTEM_ADMIN);

const ingestSchema = z.object({
  type: z.string().min(1).max(64),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  source: z.string().max(64).optional(),
  venueId: z.string().uuid().optional(),
  terminalId: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(1000),
  details: z.record(z.unknown()).optional(),
});

function verifyIngestSecret(request) {
  const secret = request.headers['x-ops-ingest-secret'];
  if (!config.opsIngestSecret || secret !== config.opsIngestSecret) {
    throw forbidden('Invalid ops ingest secret');
  }
}

export async function opsRoutes(app) {
  app.get(
    '/api/v1/ops/dashboard',
    { preHandler: opsAdminPreHandler },
    async (request) => getOpsDashboard(request.server.io),
  );

  app.get(
    '/api/v1/ops/events',
    { preHandler: opsAdminPreHandler },
    async (request) =>
      listOpsEvents({
        limit: request.query?.limit ? Number(request.query.limit) : 50,
        since: request.query?.since,
        type: request.query?.type,
      }),
  );

  app.post('/api/v1/ops/events', async (request) => {
    verifyIngestSecret(request);
    const parsed = ingestSchema.safeParse(request.body);
    if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

    const allowedTypes = new Set(Object.values(OPS_EVENT_TYPES));
    if (!allowedTypes.has(parsed.data.type)) {
      throw validationError(`Unknown ops event type: ${parsed.data.type}`);
    }

    return recordOpsEvent(request.server.io, {
      ...parsed.data,
      severity: parsed.data.severity ?? OPS_SEVERITY.WARNING,
    });
  });
}
