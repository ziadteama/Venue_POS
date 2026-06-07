import { statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;
const require = createRequire(import.meta.url);

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

function resolvePrismaClientMtime() {
  try {
    return statSync(require.resolve('@prisma/client')).mtimeMs;
  } catch {
    return null;
  }
}

function getPrismaClient() {
  const clientMtime = resolvePrismaClientMtime();
  const stale =
    globalForPrisma.prisma &&
    clientMtime != null &&
    globalForPrisma.prismaClientMtime !== clientMtime;

  if (stale) {
    globalForPrisma.prisma.$disconnect().catch(() => {});
    globalForPrisma.prisma = null;
  }

  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
    globalForPrisma.prismaClientMtime = clientMtime;
  }

  return globalForPrisma.prisma;
}

export const prisma =
  process.env.NODE_ENV === 'production' ? createPrismaClient() : getPrismaClient();

export async function disconnectPrisma() {
  await prisma.$disconnect();
}
