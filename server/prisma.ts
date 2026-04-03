import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __prisma__: PrismaClient | undefined;
}

export const prisma = globalThis.__prisma__ ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma__ = prisma;
}

export async function withPrismaFallback<T>(action: (client: PrismaClient) => Promise<T>): Promise<T | null> {
  try {
    return await action(prisma);
  } catch {
    return null;
  }
}
