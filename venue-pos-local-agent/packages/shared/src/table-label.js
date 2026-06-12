export function normalizeTableLabel(value) {
  return String(value ?? '').trim().slice(0, 50);
}

export function normalizedTableKey(label) {
  const base = normalizeTableLabel(label).toLowerCase();
  return base.replace(/^(?:table|tbl|t)\s*/i, '');
}

export function tableLabelsMatch(a, b) {
  const left = normalizeTableLabel(a).toLowerCase();
  const right = normalizeTableLabel(b).toLowerCase();
  if (!left || !right) return false;
  if (left === right) return true;
  return normalizedTableKey(left) === normalizedTableKey(right);
}
