/**
 * Production seed — creates only the two platform accounts.
 * Run once after `prisma migrate deploy` on a fresh production DB.
 *
 *   node apps/api/src/db/seed-prod.js
 *
 * Safe to re-run (upsert). Does NOT create demo venues, menus, or terminals.
 */
import bcrypt from 'bcrypt';
import { config } from '../config.js';
import { prisma } from './prisma.js';

// A minimal venue is required because users have a non-null venueId FK.
// Hub-owner and system_admin don't belong to a specific venue operationally,
// but the schema requires one. Use a fixed UUID so re-runs are idempotent.
const PLATFORM_VENUE_ID = '00000000-0000-4000-8000-000000000001';

async function seedProd() {
  // Minimal platform venue (not shown on dashboard; just satisfies FK)
  await prisma.venue.upsert({
    where: { id: PLATFORM_VENUE_ID },
    update: {},
    create: {
      id: PLATFORM_VENUE_ID,
      nameEn: 'Platform',
      nameAr: 'المنصة',
      type: 'anchor',
      tables: [],
    },
  });

  // CEO / owner account
  const ownerHash = await bcrypt.hash('Ziadteama1', config.bcryptRounds);
  await prisma.user.upsert({
    where: { username: 'Teama' },
    update: { passwordHash: ownerHash, role: 'hub_owner', venueId: PLATFORM_VENUE_ID, isActive: true },
    create: {
      username: 'Teama',
      passwordHash: ownerHash,
      role: 'hub_owner',
      venueId: PLATFORM_VENUE_ID,
    },
  });

  // DevOps / system admin account
  const devopsHash = await bcrypt.hash('Plegmo1', config.bcryptRounds);
  await prisma.user.upsert({
    where: { username: 'plegmo' },
    update: { passwordHash: devopsHash, role: 'system_admin', venueId: PLATFORM_VENUE_ID, isActive: true },
    create: {
      username: 'plegmo',
      passwordHash: devopsHash,
      role: 'system_admin',
      venueId: PLATFORM_VENUE_ID,
    },
  });

  console.log('Production seed complete.');
  console.log('  CEO     : Teama / Ziadteama1  (role: hub_owner)');
  console.log('  DevOps  : plegmo / Plegmo1     (role: system_admin)');
}

seedProd()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
