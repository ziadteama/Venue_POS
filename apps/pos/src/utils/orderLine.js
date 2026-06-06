export function itemName(item, language) {
  return language === 'ar' ? item.nameAr : item.nameEn;
}

export function lineTotal(line) {
  const mods = (line.modifiersSnapshot ?? []).reduce(
    (s, m) => s + Number(m.priceDelta ?? 0) * line.quantity,
    0,
  );
  return line.unitPrice * line.quantity + mods;
}

export function displayInitial(value) {
  const text = value ?? '?';
  return String(text).charAt(0) || '?';
}

export function modifierLabel(line, language) {
  const mods = line.modifiersSnapshot ?? [];
  if (!mods.length) return null;
  return mods.map((m) => (language === 'ar' ? m.nameAr : m.nameEn)).join(', ');
}
