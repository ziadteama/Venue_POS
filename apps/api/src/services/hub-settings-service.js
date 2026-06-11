import { prisma } from '../db/prisma.js';
import { config } from '../config.js';

const SETTINGS_ID = 'singleton';

export function envFeatureDefaults() {
  return {
    manualCardPayment: config.featureManualCardEnabled,
    manualCardApprovalThreshold: config.manualCardApprovalThreshold,
    kdsEnabled: config.featureKdsEnabled,
    lineTransfer: config.featureLineTransferEnabled,
    discounts: config.featureDiscountsEnabled,
    refunds: config.featureRefundsEnabled,
    autoReceiptPrint: config.featureAutoReceiptPrint,
    crossVenueBilling: config.featureCrossVenueBilling,
  };
}

export async function getHubFeatureOverrides() {
  const row = await prisma.hubSettings.findUnique({ where: { id: SETTINGS_ID } });
  const stored = row?.features;
  return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
}

export async function resolveHubFeatures() {
  const defaults = envFeatureDefaults();
  const overrides = await getHubFeatureOverrides();
  return {
    manualCardPayment:
      overrides.manualCardPayment ?? defaults.manualCardPayment,
    manualCardApprovalThreshold:
      overrides.manualCardApprovalThreshold ?? defaults.manualCardApprovalThreshold,
    kdsEnabled: overrides.kdsEnabled ?? defaults.kdsEnabled,
    lineTransfer: overrides.lineTransfer ?? defaults.lineTransfer,
    discounts: overrides.discounts ?? defaults.discounts,
    refunds: overrides.refunds ?? defaults.refunds,
    autoReceiptPrint: overrides.autoReceiptPrint ?? defaults.autoReceiptPrint,
    crossVenueBilling: overrides.crossVenueBilling ?? defaults.crossVenueBilling,
  };
}

export async function updateHubFeatures(patch) {
  const current = await getHubFeatureOverrides();
  const next = { ...current };
  const allowed = [
    'manualCardPayment',
    'manualCardApprovalThreshold',
    'kdsEnabled',
    'lineTransfer',
    'discounts',
    'refunds',
    'autoReceiptPrint',
    'crossVenueBilling',
  ];
  for (const key of allowed) {
    if (patch[key] !== undefined) next[key] = patch[key];
  }
  await prisma.hubSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, features: next },
    update: { features: next },
  });
  return resolveHubFeatures();
}
