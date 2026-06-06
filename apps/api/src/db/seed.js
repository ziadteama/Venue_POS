import bcrypt from 'bcrypt';
import { config } from '../config.js';
import { prisma } from './prisma.js';
import { hashSecret } from '../services/auth-service.js';

const DEMO_VENUE_ID = '00000000-0000-4000-8000-000000000010';

async function seed() {
  let venue = await prisma.venue.upsert({
    where: { id: DEMO_VENUE_ID },
    update: { nameEn: 'Demo Cafe', nameAr: 'مقهى تجريبي', type: 'anchor' },
    create: {
      id: DEMO_VENUE_ID,
      nameEn: 'Demo Cafe',
      nameAr: 'مقهى تجريبي',
      type: 'anchor',
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
    update: { secretHash, venueId: venue.id, name: 'POS-1', isActive: true },
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      venueId: venue.id,
      name: 'POS-1',
      secretHash,
    },
  });

  let menuTemplate = await prisma.menuTemplate.findFirst({
    where: { nameEn: 'Demo Lunch Menu' },
  });

  if (!menuTemplate) {
    menuTemplate = await prisma.menuTemplate.create({
      data: {
        nameEn: 'Demo Lunch Menu',
        nameAr: 'قائمة الغداء التجريبية',
        venues: { create: [{ venueId: venue.id }] },
        categories: {
          create: [
            {
              nameEn: 'Hot Drinks',
              nameAr: 'مشروبات ساخنة',
              sortOrder: 0,
              items: {
                create: [
                  {
                    nameEn: 'Espresso',
                    nameAr: 'إسبريسو',
                    price: 35,
                    sortOrder: 0,
                  },
                  {
                    nameEn: 'Cappuccino',
                    nameAr: 'كابتشينو',
                    price: 45,
                    sortOrder: 1,
                  },
                ],
              },
            },
            {
              nameEn: 'Food',
              nameAr: 'طعام',
              sortOrder: 1,
              items: {
                create: [
                  {
                    nameEn: 'Club Sandwich',
                    nameAr: 'ساندويتش كلوب',
                    descriptionEn: 'Chicken, lettuce, tomato',
                    descriptionAr: 'دجاج، خس، طماطم',
                    price: 85,
                    sortOrder: 0,
                  },
                ],
              },
            },
          ],
        },
      },
    });
  }

  const cappuccino = await prisma.menuItem.findFirst({
    where: { nameEn: 'Cappuccino', category: { menuTemplateId: menuTemplate.id } },
  });
  if (cappuccino) {
    const existingGroup = await prisma.modifierGroup.findFirst({
      where: { menuTemplateId: menuTemplate.id, nameEn: 'Size' },
    });
    if (!existingGroup) {
      const group = await prisma.modifierGroup.create({
        data: {
          menuTemplateId: menuTemplate.id,
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

  const { publishMenuTemplate } = await import('../services/menu-service.js');
  await publishMenuTemplate(menuTemplate.id);

  console.log('Seed complete');
  console.log('  Manager: admin / admin123');
  console.log('  Cashier PIN: 1234');
  console.log(`  Cashier ID: ${cashier.id}`);
  console.log(`  Venue ID: ${venue.id}`);
  console.log(`  Terminal ID: ${terminal.id}`);
  console.log(`  Terminal secret: ${devTerminalSecret}`);
  console.log('  Menu: Demo Lunch Menu (published)');
}

seed()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
