import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { buildApp } from './app.js';
import { prisma } from './db/prisma.js';
import { config } from './config.js';
import { ensureKeys } from './utils/jwt.js';
import {
  buildMenuTranslationsCsv,
  countMissingTranslations,
  suggestMissingTranslations,
} from './services/menu-translations.js';

const VENUE_ID = '00000000-0000-4000-8000-000000000095';
let app;
let managerToken;
let templateId;
let categoryId;
let itemId;

before(async () => {
  ensureKeys();
  app = await buildApp();
  await app.ready();

  const passwordHash = await bcrypt.hash('transmenu', config.bcryptRounds);
  await prisma.venue.upsert({
    where: { id: VENUE_ID },
    update: {},
    create: {
      id: VENUE_ID,
      nameEn: 'Translation Menu Venue',
      nameAr: 'مكان ترجمة',
      type: 'standard',
    },
  });

  await prisma.user.upsert({
    where: { username: 'transmenuadmin' },
    update: { passwordHash, role: 'hub_manager', venueId: VENUE_ID },
    create: {
      username: 'transmenuadmin',
      passwordHash,
      role: 'hub_manager',
      venueId: VENUE_ID,
    },
  });

  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { username: 'transmenuadmin', password: 'transmenu' },
  });
  managerToken = login.json().accessToken;

  const createRes = await app.inject({
    method: 'POST',
    url: '/api/v1/menu-templates',
    headers: { authorization: `Bearer ${managerToken}` },
    payload: {
      nameEn: 'Breakfast',
      nameAr: '',
      venueIds: [VENUE_ID],
    },
  });
  templateId = createRes.json().id;

  const categoryRes = await app.inject({
    method: 'POST',
    url: `/api/v1/menu-templates/${templateId}/categories`,
    headers: { authorization: `Bearer ${managerToken}` },
    payload: { nameEn: 'Pastries', nameAr: '' },
  });
  categoryId = categoryRes.json().categories[0].id;

  const itemRes = await app.inject({
    method: 'POST',
    url: `/api/v1/categories/${categoryId}/items`,
    headers: { authorization: `Bearer ${managerToken}` },
    payload: { nameEn: 'Croissant', nameAr: '', price: 25 },
  });
  itemId = itemRes.json().categories[0].items[0].id;
});

after(async () => {
  await app.close();
  await prisma.$disconnect();
});

test('buildMenuTranslationsCsv includes template, category, and item rows', async () => {
  const template = (
    await app.inject({
      method: 'GET',
      url: `/api/v1/menu-templates/${templateId}`,
      headers: { authorization: `Bearer ${managerToken}` },
    })
  ).json();

  const csv = buildMenuTranslationsCsv(template);
  assert.match(csv, /entity_type,entity_id,name_en,name_ar/);
  assert.match(csv, new RegExp(`template,${templateId}`));
  assert.match(csv, new RegExp(`category,${categoryId}`));
  assert.match(csv, new RegExp(`item,${itemId}`));
});

test('suggestMissingTranslations lists blank Arabic names', async () => {
  const result = await suggestMissingTranslations(templateId);
  assert.equal(result.templateId, templateId);
  assert.equal(result.suggestions.length, 3);
  assert.ok(result.suggestions.some((s) => s.entityType === 'item' && s.entityId === itemId));
});

test('manager can export, import, and apply translation updates', async () => {
  const exportRes = await app.inject({
    method: 'GET',
    url: `/api/v1/menu-templates/${templateId}/translations/export`,
    headers: { authorization: `Bearer ${managerToken}` },
  });
  assert.equal(exportRes.statusCode, 200);
  assert.match(exportRes.headers['content-type'], /text\/csv/);

  const csv = exportRes.body.replace(
    `item,${itemId},Croissant,,,,25`,
    `item,${itemId},Croissant,كرواسون,,,25`,
  );

  const importRes = await app.inject({
    method: 'POST',
    url: `/api/v1/menu-templates/${templateId}/translations/import`,
    headers: { authorization: `Bearer ${managerToken}` },
    payload: { csv },
  });
  assert.equal(importRes.statusCode, 200);
  const importedItem = importRes
    .json()
    .categories.flatMap((c) => c.items)
    .find((i) => i.id === itemId);
  assert.equal(importedItem.nameAr, 'كرواسون');

  const applyRes = await app.inject({
    method: 'POST',
    url: `/api/v1/menu-templates/${templateId}/translations/apply`,
    headers: { authorization: `Bearer ${managerToken}` },
    payload: {
      updates: [
        { entityType: 'template', entityId: templateId, nameAr: 'فطور' },
        { entityType: 'category', entityId: categoryId, nameAr: 'معجنات' },
      ],
    },
  });
  assert.equal(applyRes.statusCode, 200);
  assert.equal(applyRes.json().nameAr, 'فطور');
  assert.equal(countMissingTranslations(applyRes.json()), 0);
});

test('manager can reorder categories', async () => {
  const secondCategory = await app.inject({
    method: 'POST',
    url: `/api/v1/menu-templates/${templateId}/categories`,
    headers: { authorization: `Bearer ${managerToken}` },
    payload: { nameEn: 'Drinks', nameAr: 'مشروبات' },
  });
  const secondId = secondCategory.json().categories.find((c) => c.nameEn === 'Drinks').id;

  const reorderRes = await app.inject({
    method: 'PUT',
    url: `/api/v1/menu-templates/${templateId}/categories/reorder`,
    headers: { authorization: `Bearer ${managerToken}` },
    payload: { orderedIds: [secondId, categoryId] },
  });
  assert.equal(reorderRes.statusCode, 200);
  assert.equal(reorderRes.json().categories[0].id, secondId);
});
