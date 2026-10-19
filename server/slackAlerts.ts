import { AsyncLocalStorage } from 'node:async_hooks';
import { inspect } from 'node:util';
import type { NextFunction, Request, Response } from 'express';
import { APP_ENV } from './env';

// Forwards server errors to a Slack incoming webhook. Everything here is a no-op unless
// SLACK_ERROR_WEBHOOK_URL is set, so local dev and any environment without a webhook behave
// exactly as before (console.error is not even patched).

type RequestContext = { req: Request };

const requestContext = new AsyncLocalStorage<RequestContext>();

const DEDUPE_WINDOW_MS = 5 * 60 * 1000;
const MAX_ALERTS_PER_MINUTE = 20;
const MAX_TRACKED_KEYS = 500;
const SEND_TIMEOUT_MS = 3000;
const MAX_BODY_CHARS = 2500;

const originalConsoleError = console.error.bind(console);

const seen = new Map<string, { lastSentAt: number; suppressed: number }>();
let recentSendTimes: number[] = [];
let droppedByRateLimit = 0;
let enabled = false;
let isExiting = false;

function getWebhookUrl() {
  return process.env.SLACK_ERROR_WEBHOOK_URL?.trim() || null;
}

const REDACTIONS: Array<[RegExp, string]> = [
  [/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]'],
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g, '[jwt]'],
  [/\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s"']+/gi, '$1://[redacted]'],
  [/hooks\.slack\.com\/services\/[A-Za-z0-9/]+/g, 'hooks.slack.com/services/[redacted]'],
  [/\+\d[\d\s().-]{7,}\d/g, '[phone]'],
  [
    /((?:api[_-]?key|secret|token|password|authorization|otp|private[_-]?key)["']?\s*[:=]\s*["']?)[^\s"',}]+/gi,
    '$1[redacted]',
  ],
];

function redact(text: string) {
  return REDACTIONS.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), text);
}

function escapeSlack(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/```/g, "'''");
}

function stringifyArg(arg: unknown): string {
  if (arg instanceof Error) {
    const head = `${arg.name}: ${arg.message}`;
    const stackLines = (arg.stack ?? '').split('\n').slice(1, 7).join('\n');
    const cause = arg.cause instanceof Error ? `\nCaused by ${arg.cause.name}: ${arg.cause.message}` : '';
    return `${head}${stackLines ? `\n${stackLines}` : ''}${cause}`;
  }
  if (typeof arg === 'string') return arg;
  return inspect(arg, { depth: 3, breakLength: 120, maxArrayLength: 10 });
}

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max)}\n…(truncated)` : text;
}

function describeRequest(req: Request | undefined) {
  if (!req) return null;
  const routePath = typeof req.route?.path === 'string'
    ? `${req.baseUrl ?? ''}${req.route.path}`
    : req.originalUrl.split('?')[0].replace(/[A-Za-z0-9_-]{20,}/g, ':id');
  const authed = req as Request & { authV2UserId?: string; authUserId?: string };
  return {
    label: `${req.method} ${routePath}`,
    userId: authed.authV2UserId ?? authed.authUserId ?? null,
  };
}

function normalizeForKey(text: string) {
  return text
    .replace(/[A-Za-z0-9_-]{16,}/g, '#')
    .replace(/\d+/g, '#')
    .slice(0, 200);
}

function pruneSeen(now: number) {
  if (seen.size <= MAX_TRACKED_KEYS) return;
  for (const [key, entry] of seen) {
    if (now - entry.lastSentAt >= DEDUPE_WINDOW_MS) seen.delete(key);
  }
}

async function postToSlack(webhookUrl: string, text: string) {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!response.ok) {
      originalConsoleError(`[slackAlerts] Slack webhook responded ${response.status}`);
    }
  } catch (error) {
    originalConsoleError('[slackAlerts] failed to post to Slack:', error instanceof Error ? error.message : error);
  }
}

function buildMessage(input: { emoji: string; headline: string; body: string; footer?: string }) {
  const body = escapeSlack(truncate(redact(input.body), MAX_BODY_CHARS));
  const footer = input.footer ? `\n${input.footer}` : '';
  return `${input.emoji} *[${APP_ENV}]* ${input.headline}\n\`\`\`${body}\`\`\`${footer}`;
}

function reportConsoleError(args: unknown[]) {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl || args.length === 0) return;

  const body = args.map(stringifyArg).join(' ');
  const req = requestContext.getStore()?.req;
  const request = describeRequest(req);
  const firstError = args.find((arg): arg is Error => arg instanceof Error);
  const keyText = firstError ? `${firstError.name}: ${firstError.message}` : stringifyArg(args[0]);
  const key = `${request?.label ?? 'no-request'}|${normalizeForKey(redact(keyText))}`;

  const now = Date.now();
  pruneSeen(now);

  const previous = seen.get(key);
  if (previous && now - previous.lastSentAt < DEDUPE_WINDOW_MS) {
    previous.suppressed += 1;
    return;
  }

  recentSendTimes = recentSendTimes.filter((time) => now - time < 60_000);
  if (recentSendTimes.length >= MAX_ALERTS_PER_MINUTE) {
    droppedByRateLimit += 1;
    return;
  }

  const notes: string[] = [];
  if (previous && previous.suppressed > 0) {
    notes.push(`_${previous.suppressed} similar error(s) were suppressed during the previous 5 min window_`);
  }
  if (droppedByRateLimit > 0) {
    notes.push(`_${droppedByRateLimit} other alert(s) were dropped by the rate limit_`);
    droppedByRateLimit = 0;
  }

  seen.set(key, { lastSentAt: now, suppressed: 0 });
  recentSendTimes.push(now);

  const headline = request
    ? `\`${request.label}\`${request.userId ? ` · user \`${request.userId}\`` : ''}`
    : '`server (outside a request)`';
  void postToSlack(webhookUrl, buildMessage({
    emoji: ':rotating_light:',
    headline,
    body,
    footer: notes.join('\n') || undefined,
  }));
}

async function handleFatal(kind: 'uncaughtException' | 'unhandledRejection', reason: unknown) {
  // Installing these handlers replaces Node's default print-and-exit, so keep that behaviour:
  // log, give Slack a moment to receive the alert, then exit so Render restarts the process.
  originalConsoleError(`[${kind}]`, reason);
  if (isExiting) return;
  isExiting = true;

  const webhookUrl = getWebhookUrl();
  if (webhookUrl) {
    await postToSlack(webhookUrl, buildMessage({
      emoji: ':skull:',
      headline: `*${kind}* — process is exiting and will be restarted`,
      body: stringifyArg(reason),
    }));
  }
  process.exit(1);
}

export function installSlackErrorAlerts() {
  if (enabled || !getWebhookUrl()) return;
  enabled = true;

  console.error = (...args: unknown[]) => {
    originalConsoleError(...args);
    try {
      reportConsoleError(args);
    } catch {
      // Alerting must never be able to break logging or the request that triggered it.
    }
  };

  process.on('uncaughtException', (error) => {
    void handleFatal('uncaughtException', error);
  });
  process.on('unhandledRejection', (reason) => {
    void handleFatal('unhandledRejection', reason);
  });
}

export function slackRequestContextMiddleware(req: Request, _res: Response, next: NextFunction) {
  if (!enabled) {
    next();
    return;
  }
  requestContext.run({ req }, next);
}

// Last-resort handler for errors that reach Express without a route-level try/catch. Only 5xx
// are reported and answered here; 4xx (bad JSON, payload too large, ...) keep Express's default.
export function slackErrorMiddleware(error: unknown, _req: Request, res: Response, next: NextFunction) {
  if (!enabled || res.headersSent) {
    next(error);
    return;
  }
  const candidate = error as { status?: unknown; statusCode?: unknown } | null;
  const status = Number(candidate?.status ?? candidate?.statusCode);
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    next(error);
    return;
  }
  console.error(error);
  res.status(500).json({ error: 'Internal server error' });
}

export function notifyServerStarted() {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) return;
  const commit = process.env.RENDER_GIT_COMMIT?.slice(0, 7);
  void postToSlack(
    webhookUrl,
    `:white_check_mark: *[${APP_ENV}]* server started${commit ? ` (commit \`${commit}\`)` : ''}`,
  );
}
