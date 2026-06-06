import bcrypt from 'bcrypt';
import { prisma } from '../db/prisma.js';
import { config } from '../config.js';
import { signAccessToken } from '../utils/jwt.js';
import { unauthorized } from '../utils/errors.js';

export async function loginManager(username, password) {
  const user = await prisma.user.findFirst({
    where: { username, isActive: true, passwordHash: { not: null } },
  });
  if (!user?.passwordHash) throw unauthorized('Invalid username or password');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw unauthorized('Invalid username or password');

  const token = signAccessToken({
    sub: user.id,
    role: user.role,
    venue_id: user.venueId,
  });

  return {
    accessToken: token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      venueId: user.venueId,
    },
  };
}

export async function loginCashier(pin, terminalId, terminalSecret) {
  const terminal = await validateTerminal(terminalId, terminalSecret);

  const cashiers = await prisma.user.findMany({
    where: {
      venueId: terminal.venueId,
      role: 'cashier',
      isActive: true,
      pinHash: { not: null },
    },
  });

  let matched = null;
  for (const user of cashiers) {
    if (await bcrypt.compare(pin, user.pinHash)) {
      matched = user;
      break;
    }
  }
  if (!matched) throw unauthorized('Invalid PIN');

  const token = signAccessToken({
    sub: matched.id,
    role: matched.role,
    venue_id: matched.venueId,
    terminal_id: terminalId,
  });

  return {
    accessToken: token,
    user: {
      id: matched.id,
      username: matched.username,
      role: matched.role,
      venueId: matched.venueId,
    },
    terminalId,
  };
}

const MANAGER_ROLES = ['hub_manager', 'venue_manager'];

export async function verifyManagerPin(venueId, pin) {
  const managers = await prisma.user.findMany({
    where: {
      venueId,
      role: { in: MANAGER_ROLES },
      isActive: true,
      pinHash: { not: null },
    },
  });

  for (const user of managers) {
    if (await bcrypt.compare(pin, user.pinHash)) return user;
  }
  throw unauthorized('Invalid manager PIN');
}

async function validateTerminal(terminalId, terminalSecret) {
  if (!terminalId || !terminalSecret) {
    throw unauthorized('Terminal credentials required');
  }

  const terminal = await prisma.terminal.findUnique({ where: { id: terminalId } });
  if (!terminal?.isActive) throw unauthorized('Invalid terminal');

  const valid = await bcrypt.compare(terminalSecret, terminal.secretHash);
  if (!valid) throw unauthorized('Invalid terminal');

  return terminal;
}

export async function hashSecret(plain) {
  return bcrypt.hash(plain, config.bcryptRounds);
}
