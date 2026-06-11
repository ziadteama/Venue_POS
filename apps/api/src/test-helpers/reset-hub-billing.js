import { prisma } from '../db/prisma.js';
import { HUB_BILLING_ID } from '../services/hub-billing-service.js';

/** Reset singleton hub billing so totals are not polluted across integration tests. */
export async function resetHubBilling() {
  await prisma.hubBilling.upsert({
    where: { id: HUB_BILLING_ID },
    create: {
      id: HUB_BILLING_ID,
      taxRate: 0,
      taxInclusive: false,
      serviceRate: 0,
      serviceEnabled: false,
    },
    update: {
      taxRate: 0,
      taxInclusive: false,
      serviceRate: 0,
      serviceEnabled: false,
    },
  });
}
