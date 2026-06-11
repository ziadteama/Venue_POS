import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function loadKey(envVarContent, relativePath) {
  if (envVarContent) {
    // Normalize: handle literal \n (pasted one-liner) or real newlines
    const normalized = envVarContent.replace(/\\n/g, '\n').trim();
    return normalized;
  }
  const path = resolve(apiRoot, relativePath);
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

let privateKey = loadKey(process.env.JWT_PRIVATE_KEY, config.jwt.privateKeyPath);
let publicKey = loadKey(process.env.JWT_PUBLIC_KEY, config.jwt.publicKeyPath);

// Startup diagnostics — helps debug key loading on Render
const privOk = privateKey?.includes('BEGIN PRIVATE KEY');
const pubOk = publicKey?.includes('BEGIN PUBLIC KEY');
console.log(`[jwt] private key loaded: ${privOk} | public key loaded: ${pubOk}`);
if (!privOk) console.error('[jwt] JWT_PRIVATE_KEY missing or malformed — login will fail');
if (!pubOk) console.error('[jwt] JWT_PUBLIC_KEY missing or malformed — token verify will fail');

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
