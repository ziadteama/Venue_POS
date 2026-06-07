export function menuLabel(entity, lang) {
  if (!entity) return '';
  if (lang === 'ar' && entity.nameAr?.trim()) return entity.nameAr;
  return entity.nameEn ?? '';
}

export function isMissingTranslation(value) {
  return !value?.trim();
}

export function displayInitial(name) {
  return (name?.trim()?.[0] ?? '?').toUpperCase();
}
