import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function loadKey(relativePath) {
  const path = resolve(apiRoot, relativePath);
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

let privateKey = loadKey(config.jwt.privateKeyPath);
let publicKey = loadKey(config.jwt.publicKeyPath);

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
