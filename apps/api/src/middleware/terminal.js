import bcrypt from 'bcrypt';
import { prisma } from '../db/prisma.js';
import { unauthorized } from '../utils/errors.js';

export async function authenticateTerminal(request) {
  const terminalId = request.headers['x-terminal-id'];
  const terminalSecret = request.headers['x-terminal-secret'];
  if (!terminalId || !terminalSecret) {
    throw unauthorized('Terminal credentials required');
  }

  const terminal = await prisma.terminal.findUnique({ where: { id: terminalId } });
  if (!terminal?.isActive) throw unauthorized('Invalid terminal');

  const valid = await bcrypt.compare(terminalSecret, terminal.secretHash);
  if (!valid) throw unauthorized('Invalid terminal');

  request.terminal = terminal;
}
