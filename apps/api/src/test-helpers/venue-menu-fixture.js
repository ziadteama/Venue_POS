import { publishVenueMenu } from '../services/menu-service.js';

/** Seed a minimal published menu for integration tests. */
export async function seedPublishedVenueMenu(prisma, venueId, { items = [] } = {}) {
  await prisma.venueMenu.upsert({
    where: { venueId },
    create: { venueId, status: 'draft' },
    update: {},
  });

  let category = await prisma.category.findFirst({ where: { venueId, isActive: true } });
  if (!category) {
    category = await prisma.category.create({
      data: { venueId, nameEn: 'Test Category', nameAr: 'فئة', sortOrder: 0 },
    });
  }

  for (const [i, item] of items.entries()) {
    const existing = await prisma.menuItem.findFirst({
      where: { categoryId: category.id, nameEn: item.nameEn },
    });
    if (!existing) {
      await prisma.menuItem.create({
        data: {
          categoryId: category.id,
          nameEn: item.nameEn,
          nameAr: item.nameAr ?? item.nameEn,
          price: item.price ?? 10,
          sortOrder: i,
        },
      });
    }
  }

  if (!items.length) {
    const existing = await prisma.menuItem.findFirst({
      where: { categoryId: category.id, isActive: true },
    });
    if (!existing) {
      await prisma.menuItem.create({
        data: {
          categoryId: category.id,
          nameEn: 'Test Item',
          nameAr: 'صنف',
          price: 10,
          sortOrder: 0,
        },
      });
    }
  }

  await publishVenueMenu(venueId);
  const menuItem = await prisma.menuItem.findFirst({
    where: { categoryId: category.id, isActive: true },
    orderBy: { sortOrder: 'asc' },
  });
  return { categoryId: category.id, menuItemId: menuItem?.id };
}
