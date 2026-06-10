import { prisma } from '../db/prisma.js';
import { validationError } from '../utils/errors.js';

export const HUB_BILLING_ID = 'hub';

function decimalToNumber(value) {
  if (value == null) return 0;
  return Number(value);
}

export function serializeHubBilling(row) {
  return {
    taxRate: decimalToNumber(row.taxRate),
    taxInclusive: Boolean(row.taxInclusive),
    serviceRate: decimalToNumber(row.serviceRate),
    serviceEnabled: Boolean(row.serviceEnabled),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getHubBilling() {
  let row = await prisma.hubBilling.findUnique({ where: { id: HUB_BILLING_ID } });
  if (!row) {
    row = await prisma.hubBilling.create({
      data: { id: HUB_BILLING_ID },
    });
  }
  return serializeHubBilling(row);
}

export function applyHubBillingToVenue(venue, hub) {
  if (!venue || !hub) return venue;
  return {
    ...venue,
    taxRate: hub.taxRate,
    taxInclusive: hub.taxInclusive,
    serviceRate: hub.serviceRate,
    serviceEnabled: hub.serviceEnabled,
  };
}

export async function overlayHubBillingOnCheque(cheque) {
  if (!cheque?.venue) return cheque;
  const hub = await getHubBilling();
  cheque.venue = applyHubBillingToVenue(cheque.venue, hub);
  return cheque;
}

export async function overlayHubBillingOnCheques(cheques) {
  const hub = await getHubBilling();
  for (const cheque of cheques) {
    if (cheque?.venue) cheque.venue = applyHubBillingToVenue(cheque.venue, hub);
  }
  return cheques;
}

export async function updateHubBilling(body) {
  const data = {};
  if (body.taxRate != null) {
    const taxRate = Number(body.taxRate);
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 1) {
      throw validationError('Tax rate must be between 0 and 1');
    }
    data.taxRate = taxRate;
  }
  if (body.taxInclusive != null) data.taxInclusive = Boolean(body.taxInclusive);
  if (body.serviceRate != null) {
    const serviceRate = Number(body.serviceRate);
    if (!Number.isFinite(serviceRate) || serviceRate < 0 || serviceRate > 1) {
      throw validationError('Service rate must be between 0 and 1');
    }
    data.serviceRate = serviceRate;
  }
  if (body.serviceEnabled != null) data.serviceEnabled = Boolean(body.serviceEnabled);
  if (Object.keys(data).length === 0) throw validationError('No changes provided');

  const row = await prisma.hubBilling.upsert({
    where: { id: HUB_BILLING_ID },
    create: { id: HUB_BILLING_ID, ...data },
    update: data,
  });
  return serializeHubBilling(row);
}
