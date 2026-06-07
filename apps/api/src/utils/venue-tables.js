export function parseVenueTables(raw) {
  if (!raw) return [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (typeof entry === 'string') {
        const label = entry.trim();
        return label ? { label } : null;
      }
      if (entry && typeof entry === 'object') {
        const label = String(entry.label ?? '').trim();
        if (!label) return null;
        const section = entry.section ? String(entry.section).trim() : undefined;
        return section ? { label, section } : { label };
      }
      return null;
    })
    .filter(Boolean);
}

export function serializeVenueTableLabels(tables) {
  return parseVenueTables(tables).map((t) => t.label);
}

export function normalizeVenueTablesInput(body) {
  if (body == null) return null;
  if (!Array.isArray(body)) throw new Error('tables must be an array');

  const seen = new Set();
  const out = [];
  for (const entry of body) {
    const label =
      typeof entry === 'string'
        ? entry.trim()
        : String(entry?.label ?? '').trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const section =
      typeof entry === 'object' && entry?.section
        ? String(entry.section).trim()
        : undefined;
    out.push(section ? { label, section } : { label });
  }
  return out;
}
