const STORAGE_KEY = 'pos_cashier_session';

export function readCashierSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.id) return null;
    return {
      id: data.id,
      username: data.username ?? null,
      venueId: data.venueId ?? null,
    };
  } catch {
    return null;
  }
}

export function writeCashierSession(user) {
  sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      id: user.id,
      username: user.username ?? null,
      venueId: user.venueId ?? null,
    }),
  );
}

export function clearCashierSession() {
  sessionStorage.removeItem(STORAGE_KEY);
}
