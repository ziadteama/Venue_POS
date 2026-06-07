export function countMissingTranslations(template) {
  if (!template) return 0;
  let count = 0;
  if (!template.nameAr?.trim()) count += 1;
  for (const category of template.categories ?? []) {
    if (!category.nameAr?.trim()) count += 1;
    for (const item of category.items ?? []) {
      if (!item.nameAr?.trim()) count += 1;
    }
  }
  return count;
}

export function isMissingTranslation(value) {
  return !value?.trim();
}
