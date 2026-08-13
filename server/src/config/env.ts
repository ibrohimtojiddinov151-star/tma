import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/**
 * Load .env by absolute path, not by cwd.
 *
 * `npm run dev` runs the server workspace with cwd = server/, so a bare
 * `dotenv/config` would look for server/.env and silently miss the .env at the
 * repo root. Resolving from this module's own location works in both tsx
 * (server/src/config) and the compiled build (server/dist/config).
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const candidates = [
  path.resolve(here, '../../.env'),      // server/.env      (workspace-local override)
  path.resolve(here, '../../../.env'),   // <repo root>/.env (asosiy)
  path.resolve(process.cwd(), '.env'),   // cwd fallback
];

const loaded: string[] = [];
for (const file of candidates) {
  if (fs.existsSync(file)) {
    // First value wins — dotenv does not override already-set vars.
    dotenv.config({ path: file });
    loaded.push(file);
  }
}

// In production (Railway, Docker, a VPS) config comes from real environment
// variables, so a missing .env file is expected and not worth warning about.
if (loaded.length === 0 && process.env.NODE_ENV !== 'production') {
  // eslint-disable-next-line no-console
  console.error(
    '❌ No .env file found. Looked in:\n' +
    candidates.map((c) => `  - ${c}`).join('\n'),
  );
}

/**
 * Env booleans arrive as strings. z.coerce.boolean() would turn "false" into
 * true, so parse explicitly.
 */
const envBool = (fallback: boolean) =>
  z.string().optional().transform((v) => (v === undefined ? fallback : v.trim().toLowerCase() === 'true'));

const schema = z.object({
  BOT_TOKEN: z.string().min(10, 'BOT_TOKEN must be set in .env'),
  BOT_WEBHOOK_SECRET: z.string().default('tma-secret'),
  PUBLIC_URL: z.string().optional().default(''),
  WEBAPP_URL: z.string().default('http://localhost:5173'),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10),
  SUPABASE_ANON_KEY: z.string().optional().default(''),

  GEMINI_API_KEY: z.string().optional().default(''),
  AI_DAILY_CALL_LIMIT: z.coerce.number().int().positive().default(60),

  // Feature flags.
  // AI is on by default: /plan offers both the AI draft and the JSON upload.
  // The Mini App stays off; the bot is the only interface for now.
  AI_ENABLED: envBool(true),
  MINIAPP_ENABLED: envBool(false),

  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),

  PORT: z.coerce.number().int().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DEFAULT_TIMEZONE: z.string().default('Asia/Tashkent'),
  SESSION_SECRET: z.string().default('tma-session-secret'),

  CALL_PROVIDER: z.enum(['none', 'twilio']).default('none'),
  TWILIO_ACCOUNT_SID: z.string().optional().default(''),
  TWILIO_AUTH_TOKEN: z.string().optional().default(''),
  TWILIO_FROM_NUMBER: z.string().optional().default(''),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  /* eslint-disable no-console */
  console.error(
    '❌ .env is not configured correctly:\n' +
    parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n') +
    '\n\nLoaded .env files:\n' +
    (loaded.length > 0 ? loaded.map((f) => `  ✓ ${f}`).join('\n') : '  (none found)'),
  );
  /* eslint-enable no-console */
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
