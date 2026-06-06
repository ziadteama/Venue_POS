import { apiFetch } from '../services/api-fetch.js';

export function registerFeatureRoutes(app, { apiUrl, terminalId, terminalSecret }) {
  app.get('/v1/features', async () =>
    apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/features'),
  );
}
