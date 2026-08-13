import { Bot } from 'grammy';
import { env } from '../config/env.js';

/**
 * Single bot instance. Handlers are registered in bot/index.ts.
 * The queue worker imports this module directly so it can send messages
 * without pulling in the handler graph (avoids an import cycle).
 */
export const bot = new Bot(env.BOT_TOKEN);

export async function sendMd(chatId: number, text: string, extra: Record<string, unknown> = {}): Promise<number | null> {
  try {
    const msg = await bot.api.sendMessage(chatId, text, { parse_mode: 'Markdown', ...extra });
    return msg.message_id;
  } catch {
    // Markdown parse failures should never lose the message.
    const msg = await bot.api.sendMessage(chatId, text.replace(/[*_`]/g, ''), extra);
    return msg.message_id;
  }
}
