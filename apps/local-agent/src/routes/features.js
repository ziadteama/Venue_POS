import { apiFetch } from '../services/api-fetch.js';
import { isCloudOnline } from '../services/cloud-health.js';
import {
  getCachedFeatures,
  saveFeaturesCache,
  syncTerminalRosterFromServer,
} from '../services/terminal-cache.js';

export function registerFeatureRoutes(app, { db, apiUrl, venueId, terminalId, terminalSecret }) {
  app.get('/v1/features', async () => {
    if (isCloudOnline()) {
      try {
        const data = await apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/features');
        saveFeaturesCache(db, venueId, data);
        return data;
      } catch (err) {
        app.log.warn({ err }, 'Features fetch failed — using cache');
      }
    }
    const cached = getCachedFeatures(db, venueId);
    if (cached) return cached;
    if (isCloudOnline()) {
      return apiFetch(apiUrl, terminalId, terminalSecret, '/api/v1/features');
    }
    return {
      manualCardPayment: true,
      discounts: true,
      refunds: false,
      tables: [],
      crossVenueBilling: false,
      isAnchor: false,
      crossVenueTargets: [],
      anchorVenue: null,
      offline: true,
    };
  });

  app.post('/v1/features/sync', async () =>
    syncTerminalRosterFromServer({ db, apiUrl, venueId, terminalId, terminalSecret }),
  );
}
