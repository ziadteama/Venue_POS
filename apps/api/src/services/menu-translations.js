import { prisma } from '../db/prisma.js';
import { validationError } from '../utils/errors.js';
import { getMenuTemplate } from './menu-service.js';

const CSV_HEADER = 'entity_type,entity_id,name_en,name_ar,description_en,description_ar,price';

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw validationError('CSV must include a header row and at least one data row');

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const expected = CSV_HEADER.split(',');
  if (header.length !== expected.length || !expected.every((col, i) => header[i] === col)) {
    throw validationError(`CSV header must be: ${CSV_HEADER}`);
  }

  return lines.slice(1).map((line, index) => {
    const cols = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (ch === ',' && !inQuotes) {
        cols.push(current);
        current = '';
        continue;
      }
      current += ch;
    }
    cols.push(current);
    if (cols.length !== expected.length) {
      throw validationError(`Invalid CSV row ${index + 2}`);
    }
    return {
      entityType: cols[0].trim(),
      entityId: cols[1].trim(),
      nameEn: cols[2].trim(),
      nameAr: cols[3].trim(),
      descriptionEn: cols[4].trim(),
      descriptionAr: cols[5].trim(),
      price: cols[6].trim(),
    };
  });
}

export function buildMenuTranslationsCsv(template) {
  const rows = [
    [
      'template',
      template.id,
      template.nameEn,
      template.nameAr ?? '',
      '',
      '',
      '',
    ].map(csvEscape).join(','),
  ];

  for (const category of template.categories ?? []) {
    rows.push(
      ['category', category.id, category.nameEn, category.nameAr ?? '', '', '', '']
        .map(csvEscape)
        .join(','),
    );
    for (const item of category.items ?? []) {
      rows.push(
        [
          'item',
          item.id,
          item.nameEn,
          item.nameAr ?? '',
          item.descriptionEn ?? '',
          item.descriptionAr ?? '',
          item.price ?? '',
        ]
          .map(csvEscape)
          .join(','),
      );
    }
  }

  return `${CSV_HEADER}\n${rows.join('\n')}\n`;
}

function isMissingTranslation(value) {
  return !value?.trim();
}

export async function suggestMissingTranslations(templateId) {
  const template = await getMenuTemplate(templateId);
  const suggestions = [];

  if (isMissingTranslation(template.nameAr)) {
    suggestions.push({
      entityType: 'template',
      entityId: template.id,
      labelEn: template.nameEn,
      suggestedAr: template.nameEn,
    });
  }

  for (const category of template.categories ?? []) {
    if (isMissingTranslation(category.nameAr)) {
      suggestions.push({
        entityType: 'category',
        entityId: category.id,
        labelEn: category.nameEn,
        suggestedAr: category.nameEn,
      });
    }
    for (const item of category.items ?? []) {
      if (isMissingTranslation(item.nameAr)) {
        suggestions.push({
          entityType: 'item',
          entityId: item.id,
          labelEn: item.nameEn,
          suggestedAr: item.nameEn,
        });
      }
    }
  }

  return { templateId, suggestions };
}

async function assertEntityInTemplate(templateId, entityType, entityId) {
  if (entityType === 'template') {
    if (entityId !== templateId) throw validationError('Template id mismatch');
    return;
  }
  if (entityType === 'category') {
    const category = await prisma.category.findFirst({
      where: { id: entityId, menuTemplateId: templateId },
    });
    if (!category) throw validationError('Category not found in template');
    return;
  }
  if (entityType === 'item') {
    const item = await prisma.menuItem.findFirst({
      where: { id: entityId, category: { menuTemplateId: templateId } },
    });
    if (!item) throw validationError('Item not found in template');
    return;
  }
  throw validationError('Invalid entity type');
}

export async function applyTranslationUpdates(templateId, updates) {
  if (!updates?.length) throw validationError('No updates provided');

  await prisma.$transaction(async (tx) => {
    for (const update of updates) {
      await assertEntityInTemplate(templateId, update.entityType, update.entityId);
      if (update.entityType === 'template') {
        await tx.menuTemplate.update({
          where: { id: update.entityId },
          data: {
            ...(update.nameEn != null ? { nameEn: update.nameEn } : {}),
            ...(update.nameAr != null ? { nameAr: update.nameAr } : {}),
          },
        });
      } else if (update.entityType === 'category') {
        await tx.category.update({
          where: { id: update.entityId },
          data: {
            ...(update.nameEn != null ? { nameEn: update.nameEn } : {}),
            ...(update.nameAr != null ? { nameAr: update.nameAr } : {}),
          },
        });
      } else if (update.entityType === 'item') {
        await tx.menuItem.update({
          where: { id: update.entityId },
          data: {
            ...(update.nameEn != null ? { nameEn: update.nameEn } : {}),
            ...(update.nameAr != null ? { nameAr: update.nameAr } : {}),
            ...(update.descriptionEn != null ? { descriptionEn: update.descriptionEn } : {}),
            ...(update.descriptionAr != null ? { descriptionAr: update.descriptionAr } : {}),
          },
        });
      }
    }
  });

  return getMenuTemplate(templateId);
}

export async function importMenuTranslationsCsv(templateId, csvText) {
  const rows = parseCsv(csvText);
  const updates = rows.map((row) => {
    if (!['template', 'category', 'item'].includes(row.entityType)) {
      throw validationError(`Unknown entity type: ${row.entityType}`);
    }
    return {
      entityType: row.entityType,
      entityId: row.entityId,
      nameEn: row.nameEn || undefined,
      nameAr: row.nameAr || undefined,
      descriptionEn: row.descriptionEn || undefined,
      descriptionAr: row.descriptionAr || undefined,
    };
  });

  return applyTranslationUpdates(templateId, updates);
}

export function countMissingTranslations(template) {
  let count = 0;
  if (isMissingTranslation(template.nameAr)) count += 1;
  for (const category of template.categories ?? []) {
    if (isMissingTranslation(category.nameAr)) count += 1;
    for (const item of category.items ?? []) {
      if (isMissingTranslation(item.nameAr)) count += 1;
    }
  }
  return count;
}
