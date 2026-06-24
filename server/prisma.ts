import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __prisma__: PrismaClient | undefined;
}

function parseBooleanEnv(value?: string) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export class LegacyDbAccessDisabledError extends Error {
  constructor() {
    super('Legacy database access is disabled');
    this.name = 'LegacyDbAccessDisabledError';
  }
}

export const legacyDbAccessDisabled = parseBooleanEnv(process.env.LEGACY_DB_ACCESS_DISABLED);

function createDisabledPrismaClient() {
  return new Proxy({} as PrismaClient, {
    get(_target, property) {
      if (property === '$disconnect') {
        return async () => {};
      }

      if (property === '$connect') {
        return async () => {
          throw new LegacyDbAccessDisabledError();
        };
      }

      if (property === Symbol.toStringTag) {
        return 'PrismaClient';
      }

      throw new LegacyDbAccessDisabledError();
    },
  });
}

const prismaClient = legacyDbAccessDisabled
  ? createDisabledPrismaClient()
  : globalThis.__prisma__ ?? new PrismaClient();

export const prisma = prismaClient;

if (!legacyDbAccessDisabled && process.env.NODE_ENV !== 'production') {
  globalThis.__prisma__ = prismaClient;
}

export async function withPrismaFallback<T>(action: (client: PrismaClient) => Promise<T>): Promise<T | null> {
  if (legacyDbAccessDisabled) {
    return null;
  }

  try {
    return await action(prisma);
  } catch {
    return null;
  }
}
