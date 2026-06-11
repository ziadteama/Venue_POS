import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function loadKey(envVarContent, relativePath) {
  // Prefer inline env var content (production / Render) over file path
  if (envVarContent) return envVarContent.replace(/\\n/g, '\n');
  const path = resolve(apiRoot, relativePath);
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

let privateKey = loadKey(process.env.JWT_PRIVATE_KEY, config.jwt.privateKeyPath);
let publicKey = loadKey(process.env.JWT_PUBLIC_KEY, config.jwt.publicKeyPath);

export function ensureKeys() {
  if (!privateKey || !publicKey) {
    throw new Error('JWT keys missing — run: npm run generate:jwt-keys');
  }
}

export function signAccessToken(payload) {
  ensureKeys();
  return jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    expiresIn: config.jwt.accessExpiry,
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
  });
}

export function verifyAccessToken(token) {
  ensureKeys();
  return jwt.verify(token, publicKey, {
    algorithms: ['RS256'],
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
  });
}
