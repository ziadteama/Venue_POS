import bcrypt from 'bcrypt';
import {
  DEFAULT_KIOSK_EXIT_PIN,
  KIOSK_EXIT_PIN_MAX,
  KIOSK_EXIT_PIN_MIN,
} from '@venue-pos/shared';

export function normalizeKioskExitPin(pin) {
  const s = String(pin ?? '').trim();
  if (!/^\d+$/.test(s) || s.length < KIOSK_EXIT_PIN_MIN || s.length > KIOSK_EXIT_PIN_MAX) {
    throw new Error(`Manager PIN must be ${KIOSK_EXIT_PIN_MIN}–${KIOSK_EXIT_PIN_MAX} digits`);
  }
  return s;
}

export async function hashKioskExitPinLocal(pin) {
  return bcrypt.hash(normalizeKioskExitPin(pin || DEFAULT_KIOSK_EXIT_PIN), 10);
}
