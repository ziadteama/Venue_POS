import 'dotenv/config';

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
  databaseUrl: required('DATABASE_URL', 'postgresql://hub_pos:hub_pos_dev@localhost:5432/hub_pos'),
  jwt: {
    privateKeyPath: process.env.JWT_PRIVATE_KEY_PATH ?? '../../ops/secrets/jwt-private.pem',
    publicKeyPath: process.env.JWT_PUBLIC_KEY_PATH ?? '../../ops/secrets/jwt-public.pem',
    accessExpiry: process.env.JWT_ACCESS_EXPIRY ?? '15m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY ?? '30d',
    issuer: process.env.JWT_ISSUER ?? 'hub-pos-system',
    audience: process.env.JWT_AUDIENCE ?? 'hub-pos-clients',
  },
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 12),
  corsOrigins: (process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:5173,http://localhost:5175').split(
    ',',
  ),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  featureKdsEnabled: process.env.FEATURE_KDS_ENABLED !== 'false',
};
