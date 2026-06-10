import bcrypt from 'bcrypt';
import { config } from '../config.js';
import { prisma } from './prisma.js';
import { hashSecret } from '../services/auth-service.js';

const DEMO_VENUE_ID = '00000000-0000-4000-8000-000000000010';

async function seed() {
  let venue = await prisma.venue.upsert({
    where: { id: DEMO_VENUE_ID },
    update: {
      nameEn: 'Demo Cafe',
      nameAr: 'مقهى تجريبي',
      type: 'anchor',
      tables: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'Bar1', 'Bar2'],
    },
    create: {
      id: DEMO_VENUE_ID,
      nameEn: 'Demo Cafe',
      nameAr: 'مقهى تجريبي',
      type: 'anchor',
      tables: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'Bar1', 'Bar2'],
    },
  });

  const passwordHash = await bcrypt.hash('admin123', config.bcryptRounds);
  const managerPinHash = await bcrypt.hash('9999', config.bcryptRounds);
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {
      passwordHash,
      pinHash: managerPinHash,
      role: 'hub_manager',
      venueId: venue.id,
    },
    create: {
      username: 'admin',
      passwordHash,
      pinHash: managerPinHash,
      role: 'hub_manager',
      venueId: venue.id,
    },
  });

  const hubManagerPasswordHash = await bcrypt.hash('manager123', config.bcryptRounds);
  await prisma.user.upsert({
    where: { username: 'manager' },
    update: {
      passwordHash: hubManagerPasswordHash,
      pinHash: managerPinHash,
      role: 'hub_manager',
      venueId: venue.id,
      isActive: true,
    },
    create: {
      username: 'manager',
      passwordHash: hubManagerPasswordHash,
      pinHash: managerPinHash,
      role: 'hub_manager',
      venueId: venue.id,
    },
  });

  const ownerPasswordHash = await bcrypt.hash('owner123', config.bcryptRounds);
  await prisma.user.upsert({
    where: { username: 'owner' },
    update: {
      passwordHash: ownerPasswordHash,
      role: 'hub_owner',
      venueId: venue.id,
      isActive: true,
    },
    create: {
      username: 'owner',
      passwordHash: ownerPasswordHash,
      role: 'hub_owner',
      venueId: venue.id,
    },
  });

  const venueManagerPinHash = await bcrypt.hash('7777', config.bcryptRounds);
  await prisma.user.upsert({
    where: { username: 'venue_mgr' },
    update: {
      pinHash: venueManagerPinHash,
      passwordHash: null,
      role: 'venue_manager',
      venueId: venue.id,
      isActive: true,
    },
    create: {
      username: 'venue_mgr',
      pinHash: venueManagerPinHash,
      role: 'venue_manager',
      venueId: venue.id,
    },
  });

  const DEMO_CASHIER_ID = '00000000-0000-4000-8000-000000000011';
  const pinHash = await bcrypt.hash('1234', config.bcryptRounds);
  const staleCashier = await prisma.user.findUnique({ where: { username: 'cashier1' } });
  if (staleCashier && staleCashier.id !== DEMO_CASHIER_ID) {
    await prisma.order.deleteMany({ where: { cashierId: staleCashier.id } });
    await prisma.user.delete({ where: { id: staleCashier.id } });
  }
  const cashier = await prisma.user.upsert({
    where: { id: DEMO_CASHIER_ID },
    update: { username: 'cashier1', pinHash, role: 'cashier', venueId: venue.id, isActive: true },
    create: {
      id: DEMO_CASHIER_ID,
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
    update: {
      secretHash,
      venueId: venue.id,
      name: 'POS-1',
      isActive: true,
      assignedLanHost: '192.168.1.21',
      isCoordinator: true,
    },
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      venueId: venue.id,
      name: 'POS-1',
      secretHash,
      assignedLanHost: '192.168.1.21',
      isCoordinator: true,
    },
  });

  await prisma.venueMenu.upsert({
    where: { venueId: venue.id },
    update: {},
    create: { venueId: venue.id, status: 'draft' },
  });

  const cafeCategoryCount = await prisma.category.count({ where: { venueId: venue.id } });
  if (cafeCategoryCount === 0) {
    await prisma.category.createMany({
      data: [
        { venueId: venue.id, nameEn: 'Hot Drinks', nameAr: 'مشروبات ساخنة', sortOrder: 0 },
        { venueId: venue.id, nameEn: 'Food', nameAr: 'طعام', sortOrder: 1 },
      ],
    });
    const hotDrinks = await prisma.category.findFirst({
      where: { venueId: venue.id, nameEn: 'Hot Drinks' },
    });
    const food = await prisma.category.findFirst({
      where: { venueId: venue.id, nameEn: 'Food' },
    });
    await prisma.menuItem.createMany({
      data: [
        {
          categoryId: hotDrinks.id,
          nameEn: 'Espresso',
          nameAr: 'إسبريسو',
          price: 35,
          sortOrder: 0,
        },
        {
          categoryId: hotDrinks.id,
          nameEn: 'Cappuccino',
          nameAr: 'كابتشينو',
          price: 45,
          sortOrder: 1,
        },
        {
          categoryId: food.id,
          nameEn: 'Club Sandwich',
          nameAr: 'ساندويتش كلوب',
          descriptionEn: 'Chicken, lettuce, tomato',
          descriptionAr: 'دجاج، خس، طماطم',
          price: 85,
          sortOrder: 0,
        },
      ],
    });
  }

  const cappuccino = await prisma.menuItem.findFirst({
    where: { nameEn: 'Cappuccino', category: { venueId: venue.id } },
  });
  if (cappuccino) {
    const existingGroup = await prisma.modifierGroup.findFirst({
      where: { venueId: venue.id, nameEn: 'Size' },
    });
    if (!existingGroup) {
      const group = await prisma.modifierGroup.create({
        data: {
          venueId: venue.id,
          nameEn: 'Size',
          nameAr: 'الحجم',
          minSelection: 1,
          maxSelection: 1,
          options: {
            create: [
              { nameEn: 'Regular', nameAr: 'عادي', priceDelta: 0, sortOrder: 0 },
              { nameEn: 'Large', nameAr: 'كبير', priceDelta: 10, sortOrder: 1 },
            ],
          },
        },
      });
      await prisma.menuItemModifier.create({
        data: { menuItemId: cappuccino.id, modifierGroupId: group.id },
      });
    }
  }

  const { publishVenueMenu } = await import('../services/menu-service.js');
  await publishVenueMenu(venue.id);

  // --- Phase 4: second venue for cross-venue billing -----------------------
  const DEMO_VENUE_2_ID = '00000000-0000-4000-8000-000000000020';
  const restaurant = await prisma.venue.upsert({
    where: { id: DEMO_VENUE_2_ID },
    update: {
      nameEn: 'Demo Restaurant',
      nameAr: 'مطعم تجريبي',
      type: 'standard',
      tables: ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'],
    },
    create: {
      id: DEMO_VENUE_2_ID,
      nameEn: 'Demo Restaurant',
      nameAr: 'مطعم تجريبي',
      type: 'standard',
      tables: ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'],
    },
  });

  const DEMO_CASHIER_2_ID = '00000000-0000-4000-8000-000000000021';
  const cashier2PinHash = await bcrypt.hash('2345', config.bcryptRounds);
  await prisma.user.upsert({
    where: { id: DEMO_CASHIER_2_ID },
    update: {
      username: 'cashier2',
      pinHash: cashier2PinHash,
      role: 'cashier',
      venueId: restaurant.id,
      isActive: true,
    },
    create: {
      id: DEMO_CASHIER_2_ID,
      username: 'cashier2',
      pinHash: cashier2PinHash,
      role: 'cashier',
      venueId: restaurant.id,
    },
  });

  const terminal2 = await prisma.terminal.upsert({
    where: { id: '00000000-0000-4000-8000-000000000002' },
    update: {
      secretHash,
      venueId: restaurant.id,
      name: 'POS-2',
      isActive: true,
      assignedLanHost: '192.168.1.22',
    },
    create: {
      id: '00000000-0000-4000-8000-000000000002',
      venueId: restaurant.id,
      name: 'POS-2',
      secretHash,
      assignedLanHost: '192.168.1.22',
    },
  });

  await prisma.venueMenu.upsert({
    where: { venueId: restaurant.id },
    update: {},
    create: { venueId: restaurant.id, status: 'draft' },
  });

  const restaurantCategoryCount = await prisma.category.count({ where: { venueId: restaurant.id } });
  if (restaurantCategoryCount === 0) {
    await prisma.category.createMany({
      data: [
        { venueId: restaurant.id, nameEn: 'Mains', nameAr: 'أطباق رئيسية', sortOrder: 0 },
        { venueId: restaurant.id, nameEn: 'Sides', nameAr: 'أطباق جانبية', sortOrder: 1 },
      ],
    });
    const mains = await prisma.category.findFirst({
      where: { venueId: restaurant.id, nameEn: 'Mains' },
    });
    const sides = await prisma.category.findFirst({
      where: { venueId: restaurant.id, nameEn: 'Sides' },
    });
    await prisma.menuItem.createMany({
      data: [
        {
          categoryId: mains.id,
          nameEn: 'Grilled Chicken',
          nameAr: 'دجاج مشوي',
          price: 150,
          sortOrder: 0,
        },
        { categoryId: mains.id, nameEn: 'Beef Burger', nameAr: 'برجر لحم', price: 130, sortOrder: 1 },
        { categoryId: sides.id, nameEn: 'Fries', nameAr: 'بطاطس', price: 40, sortOrder: 0 },
      ],
    });
  }
  await publishVenueMenu(restaurant.id);

  // Enable cross-venue billing: Demo Cafe (anchor) may settle Demo Restaurant orders.
  await prisma.venueBillingConfig.upsert({
    where: {
      anchorVenueId_targetVenueId: { anchorVenueId: venue.id, targetVenueId: restaurant.id },
    },
    update: { enabled: true },
    create: { anchorVenueId: venue.id, targetVenueId: restaurant.id, enabled: true },
  });

  console.log('Seed complete');
  console.log('  CEO (monitoring): owner / owner123');
  console.log('  Hub manager: admin / admin123 (PIN 9999 for shift/card policy)');
  console.log('  Venue manager: venue_mgr / venue123 (PIN 7777 for refund/discount/void on POS)');
  console.log('  Cashier PIN: 1234');
  console.log(`  Cashier ID: ${cashier.id}`);
  console.log(`  Venue ID: ${venue.id}`);
  console.log(`  Terminal ID: ${terminal.id}`);
  console.log(`  Terminal secret: ${devTerminalSecret}`);
  console.log('  Menu: per-venue (Demo Cafe + Demo Restaurant published)');
  console.log('  --- Cross-venue (Phase 4) ---');
  console.log(`  Venue 2 (anchor target): Demo Restaurant ${restaurant.id}`);
  console.log(`  Terminal 2 ID: ${terminal2.id} (same secret)`);
  console.log('  Cashier 2 PIN: 2345 (Demo Restaurant)');
  console.log('  Billing: Demo Cafe (anchor) → Demo Restaurant (enabled)');
}

seed()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
