import bcrypt from 'bcrypt';
import { config } from '../config.js';
import { prisma } from './prisma.js';
import { hashSecret } from '../services/auth-service.js';

async function seed() {
  let venue = await prisma.venue.findFirst({ where: { nameEn: 'Demo Cafe' } });
  if (!venue) {
    venue = await prisma.venue.create({
      data: {
        nameEn: 'Demo Cafe',
        nameAr: 'مقهى تجريبي',
        type: 'anchor',
      },
    });
  }

  const passwordHash = await bcrypt.hash('admin123', config.bcryptRounds);
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: { passwordHash, role: 'hub_manager', venueId: venue.id },
    create: {
      username: 'admin',
      passwordHash,
      role: 'hub_manager',
      venueId: venue.id,
    },
  });

  const pinHash = await bcrypt.hash('1234', config.bcryptRounds);
  await prisma.user.upsert({
    where: { username: 'cashier1' },
    update: { pinHash, role: 'cashier', venueId: venue.id },
    create: {
      username: 'cashier1',
      pinHash,
      role: 'cashier',
      venueId: venue.id,
    },
  });

  const devTerminalSecret = 'dev-terminal-secret';
  const secretHash = await hashSecret(devTerminalSecret);
  const terminal = await prisma.terminal.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: { secretHash, venueId: venue.id, name: 'POS-1', isActive: true },
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      venueId: venue.id,
      name: 'POS-1',
      secretHash,
    },
  });

  console.log('Seed complete');
  console.log('  Manager: admin / admin123');
  console.log('  Cashier PIN: 1234');
  console.log(`  Terminal ID: ${terminal.id}`);
  console.log(`  Terminal secret: ${devTerminalSecret}`);
}

seed()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
