import { createHash } from 'node:crypto';
import { prisma } from '../db/prisma.js';
import { notFound, validationError } from '../utils/errors.js';
import { serializeVenueMenu } from '../utils/serialize.js';

const itemInclude = {
  modifierGroups: {
    include: {
      modifierGroup: {
        include: {
          options: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        },
      },
    },
  },
};

const menuInclude = {
  modifierGroups: {
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      options: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
    },
  },
  categories: {
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      items: {
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        include: itemInclude,
      },
    },
  },
};

export async function listVenues() {
  return prisma.venue.findMany({
    where: { isActive: true },
    select: { id: true, nameEn: true, nameAr: true, type: true },
    orderBy: { nameEn: 'asc' },
  });
}

export async function ensureVenueMenu(venueId) {
  await ensureVenue(venueId);
  return prisma.venueMenu.upsert({
    where: { venueId },
    update: {},
    create: { venueId, status: 'draft' },
  });
}

export async function getVenueMenu(venueId) {
  await ensureVenueMenu(venueId);
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    include: {
      venueMenu: true,
      categories: {
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        include: {
          items: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
            include: itemInclude,
          },
        },
      },
      modifierGroups: {
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        include: {
          options: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        },
      },
    },
  });
  if (!venue) throw notFound('Venue not found');
  return serializeVenueMenu(venue);
}

export async function createCategory(venueId, data) {
  await ensureVenueMenu(venueId);
  const maxOrder = await prisma.category.aggregate({
    where: { venueId },
    _max: { sortOrder: true },
  });
  await prisma.category.create({
    data: {
      venueId,
      nameEn: data.nameEn,
      nameAr: data.nameAr ?? '',
      sortOrder: data.sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1,
    },
  });
  return getVenueMenu(venueId);
}

export async function updateCategory(venueId, categoryId, data) {
  await assertCategoryInVenue(venueId, categoryId);
  await prisma.category.update({
    where: { id: categoryId },
    data: {
      ...(data.nameEn != null ? { nameEn: data.nameEn } : {}),
      ...(data.nameAr != null ? { nameAr: data.nameAr } : {}),
    },
  });
  return getVenueMenu(venueId);
}

export async function deleteCategory(venueId, categoryId) {
  await assertCategoryInVenue(venueId, categoryId);
  await prisma.category.update({
    where: { id: categoryId },
    data: { isActive: false },
  });
  return getVenueMenu(venueId);
}

export async function reorderCategories(venueId, orderedIds) {
  await ensureVenueMenu(venueId);
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.category.update({ where: { id, venueId }, data: { sortOrder: index } }),
    ),
  );
  return getVenueMenu(venueId);
}

export async function createMenuItem(categoryId, data) {
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category || !category.isActive) throw notFound('Category not found');

  const maxOrder = await prisma.menuItem.aggregate({
    where: { categoryId },
    _max: { sortOrder: true },
  });

  await prisma.menuItem.create({
    data: {
      categoryId,
      nameEn: data.nameEn,
      nameAr: data.nameAr ?? '',
      descriptionEn: data.descriptionEn,
      descriptionAr: data.descriptionAr,
      price: data.price,
      taxRate: data.taxRate ?? 0,
      imageUrl: data.imageUrl,
      isAvailable: data.isAvailable ?? true,
      sortOrder: data.sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1,
    },
  });

  return getVenueMenu(category.venueId);
}

export async function updateMenuItem(itemId, data) {
  const item = await prisma.menuItem.findFirst({
    where: { id: itemId, isActive: true },
    include: { category: true },
  });
  if (!item) throw notFound('Menu item not found');

  await prisma.menuItem.update({
    where: { id: itemId },
    data: {
      ...(data.nameEn != null ? { nameEn: data.nameEn } : {}),
      ...(data.nameAr != null ? { nameAr: data.nameAr } : {}),
      ...(data.descriptionEn != null ? { descriptionEn: data.descriptionEn } : {}),
      ...(data.descriptionAr != null ? { descriptionAr: data.descriptionAr } : {}),
      ...(data.price != null ? { price: data.price } : {}),
      ...(data.isAvailable != null ? { isAvailable: data.isAvailable } : {}),
      ...(data.imageUrl != null ? { imageUrl: data.imageUrl } : {}),
    },
  });

  return getVenueMenu(item.category.venueId);
}

export async function deleteMenuItem(itemId) {
  const item = await prisma.menuItem.findFirst({
    where: { id: itemId, isActive: true },
    include: { category: true },
  });
  if (!item) throw notFound('Menu item not found');

  await prisma.menuItem.update({
    where: { id: itemId },
    data: { isActive: false },
  });

  return getVenueMenu(item.category.venueId);
}

export async function createModifierGroup(venueId, data) {
  await ensureVenueMenu(venueId);
  const maxOrder = await prisma.modifierGroup.aggregate({
    where: { venueId },
    _max: { sortOrder: true },
  });

  const group = await prisma.modifierGroup.create({
    data: {
      venueId,
      nameEn: data.nameEn,
      nameAr: data.nameAr ?? '',
      minSelection: data.minSelection ?? 0,
      maxSelection: data.maxSelection ?? 1,
      sortOrder: data.sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1,
      options: data.options?.length
        ? {
            create: data.options.map((opt, i) => ({
              nameEn: opt.nameEn,
              nameAr: opt.nameAr ?? '',
              priceDelta: opt.priceDelta ?? 0,
              sortOrder: i,
            })),
          }
        : undefined,
    },
    include: { options: true },
  });

  if (data.menuItemIds?.length) {
    await prisma.menuItemModifier.createMany({
      data: data.menuItemIds.map((menuItemId) => ({
        menuItemId,
        modifierGroupId: group.id,
      })),
      skipDuplicates: true,
    });
  }

  return getVenueMenu(venueId);
}

export async function updateModifierGroup(venueId, groupId, data) {
  await assertModifierGroupInVenue(venueId, groupId);
  await prisma.modifierGroup.update({
    where: { id: groupId },
    data: {
      ...(data.nameEn != null ? { nameEn: data.nameEn } : {}),
      ...(data.nameAr != null ? { nameAr: data.nameAr } : {}),
      ...(data.minSelection != null ? { minSelection: data.minSelection } : {}),
      ...(data.maxSelection != null ? { maxSelection: data.maxSelection } : {}),
    },
  });
  return getVenueMenu(venueId);
}

export async function deleteModifierGroup(venueId, groupId) {
  await assertModifierGroupInVenue(venueId, groupId);
  await prisma.modifierGroup.update({
    where: { id: groupId },
    data: { isActive: false },
  });
  return getVenueMenu(venueId);
}

export async function addModifierOption(venueId, groupId, data) {
  await assertModifierGroupInVenue(venueId, groupId);
  const maxOrder = await prisma.modifierOption.aggregate({
    where: { modifierGroupId: groupId },
    _max: { sortOrder: true },
  });
  await prisma.modifierOption.create({
    data: {
      modifierGroupId: groupId,
      nameEn: data.nameEn,
      nameAr: data.nameAr ?? '',
      priceDelta: data.priceDelta ?? 0,
      sortOrder: data.sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1,
    },
  });
  return getVenueMenu(venueId);
}

export async function updateModifierOption(venueId, optionId, data) {
  const option = await prisma.modifierOption.findFirst({
    where: { id: optionId, isActive: true, modifierGroup: { venueId, isActive: true } },
  });
  if (!option) throw notFound('Modifier option not found');

  await prisma.modifierOption.update({
    where: { id: optionId },
    data: {
      ...(data.nameEn != null ? { nameEn: data.nameEn } : {}),
      ...(data.nameAr != null ? { nameAr: data.nameAr } : {}),
      ...(data.priceDelta != null ? { priceDelta: data.priceDelta } : {}),
    },
  });
  return getVenueMenu(venueId);
}

export async function deleteModifierOption(venueId, optionId) {
  const option = await prisma.modifierOption.findFirst({
    where: { id: optionId, isActive: true, modifierGroup: { venueId, isActive: true } },
  });
  if (!option) throw notFound('Modifier option not found');

  await prisma.modifierOption.update({
    where: { id: optionId },
    data: { isActive: false },
  });
  return getVenueMenu(venueId);
}

export async function setItemModifiers(itemId, modifierGroupIds) {
  const item = await prisma.menuItem.findFirst({
    where: { id: itemId, isActive: true },
    include: { category: true },
  });
  if (!item) throw notFound('Menu item not found');

  const venueId = item.category.venueId;
  if (modifierGroupIds?.length) {
    const groups = await prisma.modifierGroup.findMany({
      where: { id: { in: modifierGroupIds }, venueId, isActive: true },
    });
    if (groups.length !== modifierGroupIds.length) {
      throw validationError('One or more modifier groups are invalid for this venue');
    }
  }

  await prisma.$transaction([
    prisma.menuItemModifier.deleteMany({ where: { menuItemId: itemId } }),
    ...(modifierGroupIds?.length
      ? [
          prisma.menuItemModifier.createMany({
            data: modifierGroupIds.map((modifierGroupId) => ({ menuItemId: itemId, modifierGroupId })),
          }),
        ]
      : []),
  ]);

  return getVenueMenu(venueId);
}

export async function publishVenueMenu(venueId) {
  await ensureVenueMenu(venueId);
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    include: menuInclude,
  });
  if (!venue) throw notFound('Venue not found');
  if (!venue.categories.length) {
    throw validationError('Cannot publish an empty menu');
  }

  const serialized = serializeVenueMenu(venue);
  const versionHash = createHash('sha256').update(JSON.stringify(serialized)).digest('hex');

  await prisma.venueMenu.update({
    where: { venueId },
    data: {
      status: 'published',
      publishedAt: new Date(),
      versionHash,
    },
  });

  return getVenueMenu(venueId);
}

export async function getPublishedMenuForVenue(venueId) {
  const venueMenu = await prisma.venueMenu.findUnique({
    where: { venueId },
  });
  if (!venueMenu || venueMenu.status !== 'published') {
    throw notFound('No published menu for this venue');
  }

  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    include: menuInclude,
  });
  if (!venue) throw notFound('Venue not found');

  const menu = serializeVenueMenu({ ...venue, venueMenu });
  return {
    venueId,
    versionHash: venueMenu.versionHash,
    publishedAt: venueMenu.publishedAt?.toISOString?.() ?? venueMenu.publishedAt ?? null,
    categories: menu.categories.map((category) => ({
      ...category,
      items: category.items
        .filter((item) => item.isAvailable)
        .map((item) => ({
          ...item,
          modifierGroups: item.modifierGroups ?? [],
        })),
    })),
  };
}

async function ensureVenue(venueId) {
  const venue = await prisma.venue.findUnique({ where: { id: venueId, isActive: true } });
  if (!venue) throw notFound('Venue not found');
  return venue;
}

async function assertCategoryInVenue(venueId, categoryId) {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, venueId, isActive: true },
  });
  if (!category) throw notFound('Category not found');
  return category;
}

async function assertModifierGroupInVenue(venueId, groupId) {
  const group = await prisma.modifierGroup.findFirst({
    where: { id: groupId, venueId, isActive: true },
  });
  if (!group) throw notFound('Modifier group not found');
  return group;
}
