import { existsSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const VALID_APP_ENVS = new Set(['development', 'staging', 'production']);

export function normalizeAppEnv(value?: string) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (VALID_APP_ENVS.has(normalized)) {
    return normalized as 'development' | 'staging' | 'production';
  }
  if (normalized === 'stage') return 'staging';
  if (normalized === 'prod') return 'production';
  return 'development';
}

export function getEnvCandidates(appEnv: 'development' | 'staging' | 'production') {
  return [
    `.env.${appEnv}.local`,
    appEnv === 'development' ? '.env.local' : null,
    `.env.${appEnv}`,
    '.env',
  ].filter((value): value is string => Boolean(value));
}

export function loadAppEnv(appEnv = normalizeAppEnv(process.env.APP_ENV ?? process.env.NODE_ENV)) {
  for (const relativePath of getEnvCandidates(appEnv)) {
    const filePath = path.resolve(process.cwd(), relativePath);
    if (existsSync(filePath)) {
      dotenv.config({ path: filePath });
    }
  }

  process.env.APP_ENV = appEnv;
  return appEnv;
}

export const APP_ENV = loadAppEnv();
