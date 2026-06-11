import 'dotenv/config';

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function buildCorsOrigins() {
  const fromEnv = (process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:5173,http://localhost:5175')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const devLan = (process.env.DEV_LAN_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...fromEnv, ...devLan])];
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
  databaseUrl: required('DATABASE_URL', 'postgresql://hub_pos:hub_pos_dev@127.0.0.1:5432/hub_pos'),
  jwt: {
    privateKeyPath: process.env.JWT_PRIVATE_KEY_PATH ?? '../../ops/secrets/jwt-private.pem',
    publicKeyPath: process.env.JWT_PUBLIC_KEY_PATH ?? '../../ops/secrets/jwt-public.pem',
    accessExpiry: process.env.JWT_ACCESS_EXPIRY ?? '15m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY ?? '30d',
    issuer: process.env.JWT_ISSUER ?? 'hub-pos-system',
    audience: process.env.JWT_AUDIENCE ?? 'hub-pos-clients',
  },
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 12),
  corsOrigins: buildCorsOrigins(),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  featureKdsEnabled: process.env.FEATURE_KDS_ENABLED !== 'false',
  /** Provider onboarding — set FEATURE_MANUAL_CARD_PAYMENT=true when deploying card acceptance */
  featureManualCardEnabled: process.env.FEATURE_MANUAL_CARD_PAYMENT === 'true',
  manualCardApprovalThreshold: Number(process.env.MANUAL_CARD_APPROVAL_THRESHOLD ?? 500),
  /** Provider onboarding — set FEATURE_LINE_TRANSFER=true to allow moving lines between tables */
  featureLineTransferEnabled: process.env.FEATURE_LINE_TRANSFER === 'true',
  /** Cheque-level discounts before payment (POS manager PIN; audit for CEO review) */
  featureDiscountsEnabled: process.env.FEATURE_DISCOUNTS_ENABLED !== 'false',
  /** Post-payment refunds (POS manager PIN; CEO approves on dashboard) (US-5.6) */
  featureRefundsEnabled: process.env.FEATURE_REFUNDS_ENABLED !== 'false',
  /** Auto-print customer receipt on checkout via local agent */
  featureAutoReceiptPrint: process.env.FEATURE_AUTO_RECEIPT_PRINT !== 'false',
  /** Cross-venue billing — anchor terminal settles linked venues' orders (US-4.x) */
  featureCrossVenueBilling: process.env.FEATURE_CROSS_VENUE_BILLING === 'true',
  /** How long (ms) an anchor terminal holds a soft lock on a target order during assembly */
  crossVenueLockTtlMs: Number(process.env.CROSS_VENUE_LOCK_TTL_MS ?? 30000),
  /** Shared secret for watchdog/agent → POST /api/v1/ops/events */
  opsIngestSecret: process.env.OPS_INGEST_SECRET ?? 'dev-ops-ingest-secret',
  /** Fallback POS electron-updater feed when hub_settings.deployment is unset */
  posUpdateFeedUrl: (process.env.POS_UPDATE_FEED_URL ?? '').trim().replace(/\/+$/, ''),
};
