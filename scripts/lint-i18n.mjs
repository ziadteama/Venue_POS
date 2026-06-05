import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const en = JSON.parse(readFileSync(join(root, 'packages/i18n/locales/en.json'), 'utf8'));
const ar = JSON.parse(readFileSync(join(root, 'packages/i18n/locales/ar.json'), 'utf8'));

const enKeys = Object.keys(en).sort();
const arKeys = Object.keys(ar).sort();

const missingInAr = enKeys.filter((k) => !arKeys.includes(k));
const missingInEn = arKeys.filter((k) => !enKeys.includes(k));

if (missingInAr.length || missingInEn.length) {
  console.error('i18n key mismatch:');
  if (missingInAr.length) console.error('  Missing in ar.json:', missingInAr.join(', '));
  if (missingInEn.length) console.error('  Missing in en.json:', missingInEn.join(', '));
  process.exit(1);
}

console.log(`i18n OK — ${enKeys.length} keys in sync`);
