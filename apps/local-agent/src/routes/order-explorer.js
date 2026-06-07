import { apiFetch } from '../services/api-fetch.js';

function queryString(params) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null && String(value).trim() !== '') qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export function registerOrderExplorerRoutes(app, { apiUrl, terminalId, terminalSecret }) {
  app.get('/v1/order-explorer', async (request) => {
    const q = request.query ?? {};
    return apiFetch(
      apiUrl,
      terminalId,
      terminalSecret,
      `/api/v1/terminal/order-explorer${queryString(q)}`,
    );
  });

  app.get('/v1/order-explorer/by-cheque/:chequeId', async (request) =>
    apiFetch(
      apiUrl,
      terminalId,
      terminalSecret,
      `/api/v1/terminal/order-explorer/by-cheque/${request.params.chequeId}`,
    ),
  );

  app.get('/v1/order-explorer/orders/:orderId/receipt', async (request) =>
    apiFetch(
      apiUrl,
      terminalId,
      terminalSecret,
      `/api/v1/terminal/order-explorer/${request.params.orderId}/receipt`,
    ),
  );

  app.get('/v1/order-explorer/orders/:orderId', async (request) =>
    apiFetch(
      apiUrl,
      terminalId,
      terminalSecret,
      `/api/v1/terminal/order-explorer/${request.params.orderId}`,
    ),
  );
}
