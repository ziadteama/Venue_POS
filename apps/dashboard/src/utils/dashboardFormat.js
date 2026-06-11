export function formatMoney(value, locale, currency = 'EGP') {
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
  return `${formatted} ${currency}`;
}

export function formatShortDate(iso, locale) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function formatDateTime(value, locale) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function formatBusinessDate(value, locale) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value));
}

export function formatPercent(value) {
  const num = Number(value ?? 0);
  return `${num > 0 ? '+' : ''}${num}%`;
}

export function venueLabel(venue, language) {
  if (!venue) return '—';
  return language === 'ar' ? venue.nameAr || venue.nameEn : venue.nameEn;
}
