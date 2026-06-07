export function formatMoney(value, locale) {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

export function formatDateTime(value, locale) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function itemLabel(item, language) {
  return language === 'ar' ? item.nameAr || item.nameEn : item.nameEn;
}

export function lineItemTotal(item) {
  if (item.isComped) return 0;
  const mods =
    item.modifiersSnapshot?.reduce((s, m) => s + Number(m.priceDelta ?? 0), 0) ?? 0;
  return (item.unitPrice + mods) * item.quantity;
}
