import { existsSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { spawn } from 'node:child_process';

const VALID_APP_ENVS = new Set(['development', 'staging', 'production']);

function normalizeAppEnv(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (VALID_APP_ENVS.has(normalized)) return normalized;
  if (normalized === 'stage') return 'staging';
  if (normalized === 'prod') return 'production';
  return 'development';
}

function getEnvCandidates(appEnv) {
  return [
    `.env.${appEnv}.local`,
    appEnv === 'development' ? '.env.local' : null,
    `.env.${appEnv}`,
    '.env',
  ].filter(Boolean);
}

function loadAppEnv(appEnv) {
  for (const relativePath of getEnvCandidates(appEnv)) {
    const filePath = path.resolve(process.cwd(), relativePath);
    if (existsSync(filePath)) {
      dotenv.config({ path: filePath });
    }
  }

  process.env.APP_ENV = appEnv;
}

const [, , requestedEnv, ...commandParts] = process.argv;

if (!requestedEnv || commandParts.length === 0) {
  console.error('Usage: node scripts/run-with-env.mjs <development|staging|production> <command> [args...]');
  process.exit(1);
}

const appEnv = normalizeAppEnv(requestedEnv);
loadAppEnv(appEnv);

const [command, ...args] = commandParts;
const child = spawn(command, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    APP_ENV: appEnv,
  },
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
