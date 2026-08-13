import { bot } from './bot.js';
import { registerCommands } from './commands.js';
import { registerCallbacks } from './callbacks.js';
import { handleLoginStep } from './auth-flow.js';
import { getSession } from '../lib/auth.js';
import { log } from '../lib/logger.js';

let wired = false;

export function buildBot(): typeof bot {
  if (wired) return bot;
  wired = true;

  /**
   * Auth gate runs before every other handler.
   * Only /start and /chiqish are allowed through unauthenticated.
   */
  bot.use(async (ctx, next) => {
    const tgId = ctx.from?.id;
    if (!tgId) return next();

    if (ctx.callbackQuery) return next();

    const text = ctx.message?.text ?? '';
    if (text.startsWith('/start') || text.startsWith('/logout')) return next();

    const session = await getSession(tgId);
    if (session.state === 'authenticated') return next();

    const payload = ctx.message?.contact?.phone_number ?? text;
    if (!payload) return next();

    const consumed = await handleLoginStep(ctx, payload);
    if (!consumed) return next();
  });

  registerCommands(bot);
  registerCallbacks(bot);

  bot.catch((err) => {
    log.error('bot_error', { error: err.message });
  });

  return bot;
}

export const COMMANDS = [
  { command: 'start', description: 'Sign in' },
  { command: 'plan', description: 'Upload a schedule (JSON)' },
  { command: 'format', description: 'JSON format and template' },
  { command: 'today', description: "Today's schedule" },
  { command: 'tomorrow', description: "Tomorrow's schedule" },
  { command: 'report', description: 'Weekly report' },
  { command: 'vocab', description: 'Review vocabulary' },
  { command: 'mistake', description: 'Mistake log' },
  { command: 'settings', description: 'Settings' },
  { command: 'pause', description: 'Pause notifications' },
  { command: 'help', description: 'Help' },
];
