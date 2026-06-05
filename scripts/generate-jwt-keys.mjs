import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'ops', 'secrets');
mkdirSync(dir, { recursive: true });

const privatePath = join(dir, 'jwt-private.pem');
const publicPath = join(dir, 'jwt-public.pem');

if (existsSync(privatePath) || existsSync(publicPath)) {
  console.log('JWT keys already exist — skipping');
  process.exit(0);
}

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

writeFileSync(privatePath, privateKey, { mode: 0o600 });
writeFileSync(publicPath, publicKey);
console.log('Generated JWT keys in ops/secrets/');
