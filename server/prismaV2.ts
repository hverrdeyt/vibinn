import { PrismaClient } from '../generated/prisma-v2-client';

declare global {
  // eslint-disable-next-line no-var
  var __prismaV2__: PrismaClient | undefined;
}

export const prismaV2 = globalThis.__prismaV2__ ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prismaV2__ = prismaV2;
}
