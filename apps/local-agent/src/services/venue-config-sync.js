let cachedSettings = null;

export function setVenueSettings(settings) {
  cachedSettings = settings;
}

export function getVenueSettings() {
  return cachedSettings;
}

export function resolvePrinterConfig(envDefaults) {
  const settings = cachedSettings;
  const kitchenHost = settings?.kitchenPrinterHost || envDefaults.kitchenPrinterHost || '';
  const kitchenPort = settings?.kitchenPrinterPort || envDefaults.kitchenPrinterPort || 9100;
  const receiptHost =
    settings?.receiptPrinterHost || kitchenHost || envDefaults.kitchenPrinterHost || '';
  const receiptPort = settings?.receiptPrinterPort || kitchenPort;
  return {
    kitchenPrinterHost: kitchenHost,
    kitchenPrinterPort: kitchenPort,
    receiptPrinterHost: receiptHost,
    receiptPrinterPort: receiptPort,
  };
}

export async function syncVenueConfigFromServer({
  apiUrl,
  venueId,
  terminalId,
  terminalSecret,
}) {
  const res = await fetch(`${apiUrl}/api/v1/venues/${venueId}/settings`, {
    headers: {
      'x-terminal-id': terminalId,
      'x-terminal-secret': terminalSecret,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Venue config sync failed (${res.status}): ${text}`);
  }
  const settings = await res.json();
  setVenueSettings(settings);
  return settings;
}
