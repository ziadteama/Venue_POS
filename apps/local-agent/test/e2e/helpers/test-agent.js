import { buildAgentApp } from '../../../src/server.js';
import { setCloudOnline } from '../../../src/services/cloud-health.js';

export async function startTestAgent({
  db,
  port,
  host = '127.0.0.1',
  terminalId,
  venueId,
  isCoordinator = false,
  coordinatorLanHost = '',
  coordinatorLanPort = null,
  coordinatorFallback = false,
  lanSecret = 'test-lan-secret',
}) {
  setCloudOnline(false);
  const lanPort = coordinatorLanPort ?? port;
  const app = await buildAgentApp({
    db,
    config: {
      port,
      host,
      apiUrl: 'http://127.0.0.1:9',
      venueId,
      terminalId,
      terminalSecret: 'test-secret',
      corsOrigins: ['*'],
      getPrinterConfig: () => ({}),
      autoReceiptPrint: false,
      isCoordinator,
      coordinatorFallback,
      getCoordinatorLanHost: () => coordinatorLanHost,
      coordinatorLanHost,
      getClusterState: () => ({}),
      lanPort,
      lanSecret,
    },
  });
  await app.listen({ port, host });
  return app;
}

export function seedMenuCache(db, venueId, items = [{ id: 'item-1', nameEn: 'Burger', nameAr: 'برجر', price: 50 }]) {
  const menu = {
    versionHash: 'test-v1',
    categories: [{ nameEn: 'All', nameAr: 'الكل', items }],
  };
  db.prepare(
    `INSERT INTO menu_cache (venue_id, version_hash, menu_json, synced_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(venue_id) DO UPDATE SET version_hash = excluded.version_hash, menu_json = excluded.menu_json`,
  ).run(venueId, menu.versionHash, JSON.stringify(menu));
  return menu;
}
