import { apiFetch, sendApiError } from '../services/api-fetch.js';

export function registerShiftRoutes(app, { apiUrl, terminalId, terminalSecret }) {
  app.get('/v1/shifts/open-context', async (request, reply) => {
    const cashierId = request.query?.cashierId;
    if (!cashierId) return reply.status(400).send({ error: 'cashierId required' });
    const qs = new URLSearchParams({ cashierId }).toString();
    return apiFetch(apiUrl, terminalId, terminalSecret, `/api/v1/shifts/open-context?${qs}`);
  });

  app.get('/v1/shifts/active', async (request, reply) => {
    const cashierId = request.query?.cashierId;
    if (!cashierId) return reply.status(400).send({ error: 'cashierId required' });
    const qs = new URLSearchParams({ cashierId }).toString();
    return apiFetch(apiUrl, terminalId, terminalSecret, `/api/v1/shifts/active?${qs}`);
  });

  app.post('/v1/shifts/open', async (request, reply) => {
    const { cashierId, openFloat } = request.body ?? {};
    if (!cashierId) return reply.status(400).send({ error: 'cashierId required' });
    try {
      return await apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/shifts/open', {
        method: 'POST',
        body: JSON.stringify({ cashierId, openFloat }),
      });
    } catch (err) {
      return sendApiError(reply, err);
    }
  });

  app.post('/v1/shifts/close', async (request, reply) => {
    const { cashierId, closeFloat, managerPin } = request.body ?? {};
    if (!cashierId) return reply.status(400).send({ error: 'cashierId required' });
    try {
      return await apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/shifts/close', {
        method: 'POST',
        body: JSON.stringify({ cashierId, closeFloat, managerPin }),
      });
    } catch (err) {
      return sendApiError(reply, err);
    }
  });
}
