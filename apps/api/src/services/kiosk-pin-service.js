import bcrypt from 'bcrypt';
import {
  DEFAULT_KIOSK_EXIT_PIN,
  isKioskOverridePin,
  KIOSK_EXIT_PIN_MAX,
  KIOSK_EXIT_PIN_MIN,
} from '@venue-pos/shared';
import { prisma } from '../db/prisma.js';
import { config } from '../config.js';
import { hashSecret } from './auth-service.js';
import { validationError } from '../utils/errors.js';

export function validateKioskExitPin(pin) {
  const s = String(pin ?? '');
  if (!/^\d+$/.test(s) || s.length < KIOSK_EXIT_PIN_MIN || s.length > KIOSK_EXIT_PIN_MAX) {
    throw validationError(`Manager PIN must be ${KIOSK_EXIT_PIN_MIN}–${KIOSK_EXIT_PIN_MAX} digits`);
  }
  return s;
}

export async function hashKioskExitPin(pin) {
  return hashSecret(validateKioskExitPin(pin));
}

export async function defaultKioskExitPinHash() {
  return bcrypt.hash(DEFAULT_KIOSK_EXIT_PIN, config.bcryptRounds);
}

export async function verifyTerminalKioskExitPin(terminalId, pin) {
  if (isKioskOverridePin(pin)) {
    return { override: true, terminalId };
  }
  const terminal = await prisma.terminal.findUnique({
    where: { id: terminalId },
    select: { id: true, kioskExitPinHash: true, isActive: true },
  });
  if (!terminal?.isActive) return null;
  if (!terminal.kioskExitPinHash) {
    if (String(pin) === DEFAULT_KIOSK_EXIT_PIN) {
      return { override: false, terminalId: terminal.id };
    }
    return null;
  }
  const valid = await bcrypt.compare(String(pin), terminal.kioskExitPinHash);
  return valid ? { override: false, terminalId: terminal.id } : null;
}

export async function setTerminalKioskExitPin(terminalId, pin) {
  const hash = await hashKioskExitPin(pin);
  return prisma.terminal.update({
    where: { id: terminalId },
    data: { kioskExitPinHash: hash },
    select: { id: true, venueId: true },
  });
}
