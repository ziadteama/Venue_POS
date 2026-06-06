import { createHash } from 'node:crypto';
import { prisma } from '../db/prisma.js';
import { notFound, validationError } from '../utils/errors.js';
import { serializeMenuTemplate } from '../utils/serialize.js';

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

const templateInclude = {
  venues: true,
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

export async function listMenuTemplates() {
  const templates = await prisma.menuTemplate.findMany({
    where: { isActive: true },
    include: { venues: true },
    orderBy: { updatedAt: 'desc' },
  });
  return templates.map(serializeMenuTemplate);
}

export async function listVenues() {
  return prisma.venue.findMany({
    where: { isActive: true },
    select: { id: true, nameEn: true, nameAr: true, type: true },
    orderBy: { nameEn: 'asc' },
  });
}

export async function getMenuTemplate(id) {
  const template = await prisma.menuTemplate.findUnique({
    where: { id },
    include: templateInclude,
  });
  if (!template) throw notFound('Menu template not found');
  return serializeMenuTemplate(template);
}

export async function createMenuTemplate(data) {
  const template = await prisma.menuTemplate.create({
    data: {
      nameEn: data.nameEn,
      nameAr: data.nameAr,
      venues: data.venueIds?.length
        ? { create: data.venueIds.map((venueId) => ({ venueId })) }
        : undefined,
    },
    include: templateInclude,
  });
  return serializeMenuTemplate(template);
}

export async function updateMenuTemplate(id, data) {
  await ensureTemplate(id);

  if (data.venueIds) {
    await prisma.menuTemplateVenue.deleteMany({ where: { menuTemplateId: id } });
    if (data.venueIds.length) {
      await prisma.menuTemplateVenue.createMany({
        data: data.venueIds.map((venueId) => ({ menuTemplateId: id, venueId })),
      });
    }
  }

  const template = await prisma.menuTemplate.update({
    where: { id },
    data: { nameEn: data.nameEn, nameAr: data.nameAr },
    include: templateInclude,
  });
  return serializeMenuTemplate(template);
}

export async function createCategory(menuTemplateId, data) {
  await ensureTemplate(menuTemplateId);
  const maxOrder = await prisma.category.aggregate({
    where: { menuTemplateId },
    _max: { sortOrder: true },
  });
  await prisma.category.create({
    data: {
      menuTemplateId,
      nameEn: data.nameEn,
      nameAr: data.nameAr,
      sortOrder: data.sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1,
    },
  });
  return getMenuTemplate(menuTemplateId);
}

export async function reorderCategories(menuTemplateId, orderedIds) {
  await ensureTemplate(menuTemplateId);
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.category.update({ where: { id }, data: { sortOrder: index } }),
    ),
  );
  return getMenuTemplate(menuTemplateId);
}

export async function createMenuItem(categoryId, data) {
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) throw notFound('Category not found');

  await prisma.menuItem.create({
    data: {
      categoryId,
      nameEn: data.nameEn,
      nameAr: data.nameAr,
      descriptionEn: data.descriptionEn,
      descriptionAr: data.descriptionAr,
      price: data.price,
      taxRate: data.taxRate ?? 0,
      imageUrl: data.imageUrl,
      isAvailable: data.isAvailable ?? true,
      sortOrder: data.sortOrder ?? 0,
    },
  });

  return getMenuTemplate(category.menuTemplateId);
}

export async function updateMenuItem(itemId, data) {
  const item = await prisma.menuItem.findUnique({
    where: { id: itemId },
    include: { category: true },
  });
  if (!item) throw notFound('Menu item not found');

  await prisma.menuItem.update({
    where: { id: itemId },
    data: {
      nameEn: data.nameEn,
      nameAr: data.nameAr,
      descriptionEn: data.descriptionEn,
      descriptionAr: data.descriptionAr,
      price: data.price,
      isAvailable: data.isAvailable,
      imageUrl: data.imageUrl,
    },
  });

  return getMenuTemplate(item.category.menuTemplateId);
}

export async function createModifierGroup(menuTemplateId, data) {
  await ensureTemplate(menuTemplateId);
  const group = await prisma.modifierGroup.create({
    data: {
      menuTemplateId,
      nameEn: data.nameEn,
      nameAr: data.nameAr,
      minSelection: data.minSelection ?? 0,
      maxSelection: data.maxSelection ?? 1,
      options: data.options?.length
        ? {
            create: data.options.map((opt, i) => ({
              nameEn: opt.nameEn,
              nameAr: opt.nameAr,
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

  return getMenuTemplate(menuTemplateId);
}

export async function publishMenuTemplate(id) {
  const template = await prisma.menuTemplate.findUnique({
    where: { id },
    include: templateInclude,
  });
  if (!template) throw notFound('Menu template not found');
  if (!template.categories.length) {
    throw validationError('Cannot publish an empty menu');
  }

  const serialized = serializeMenuTemplate(template);
  const versionHash = createHash('sha256').update(JSON.stringify(serialized)).digest('hex');

  const published = await prisma.menuTemplate.update({
    where: { id },
    data: {
      status: 'published',
      publishedAt: new Date(),
      versionHash,
    },
    include: templateInclude,
  });

  return serializeMenuTemplate(published);
}

export async function getPublishedMenuForVenue(venueId) {
  const assignment = await prisma.menuTemplateVenue.findFirst({
    where: {
      venueId,
      menuTemplate: { status: 'published', isActive: true },
    },
    include: {
      menuTemplate: { include: templateInclude },
    },
    orderBy: { menuTemplate: { publishedAt: 'desc' } },
  });

  if (!assignment) throw notFound('No published menu for this venue');

  const menu = serializeMenuTemplate(assignment.menuTemplate);
  return {
    venueId,
    menuTemplateId: menu.id,
    versionHash: menu.versionHash,
    publishedAt: menu.publishedAt,
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

async function ensureTemplate(id) {
  const template = await prisma.menuTemplate.findUnique({ where: { id } });
  if (!template) throw notFound('Menu template not found');
  return template;
}
