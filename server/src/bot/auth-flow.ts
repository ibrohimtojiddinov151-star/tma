import type { Context } from 'grammy';
import {
  getSession, loginWithPassword, LOCK_MINUTES, normalizePhone, resetSession, setSession,
} from '../lib/auth.js';
import { T } from './texts.js';
import { mainMenu, phoneKeyboard, removeKeyboard } from './keyboards.js';

/**
 * Bot login gate: every chat starts at "awaiting_phone".
 * Nothing else in the bot works until state === 'authenticated'.
 */
export async function startLogin(ctx: Context): Promise<void> {
  const tgId = ctx.from?.id;
  if (!tgId) return;
  await resetSession(tgId);
  await ctx.reply(T.askPhone, { parse_mode: 'Markdown', reply_markup: phoneKeyboard });
}

/** Returns true when the message was consumed by the login flow. */
export async function handleLoginStep(ctx: Context, text: string): Promise<boolean> {
  const tgId = ctx.from?.id;
  if (!tgId) return false;

  const session = await getSession(tgId);

  if (session.state === 'locked') {
    if (session.locked_until && new Date(session.locked_until) > new Date()) {
      const mins = Math.ceil((new Date(session.locked_until).getTime() - Date.now()) / 60000);
      await ctx.reply(T.locked(mins));
      return true;
    }
    await setSession(tgId, { state: 'awaiting_phone', attempts: 0, locked_until: null });
  }

  if (session.state === 'authenticated') return false;

  // Step 1 — phone
  if (session.state === 'awaiting_phone') {
    const contactPhone = ctx.message?.contact?.phone_number;
    const raw = contactPhone ?? text;
    const phone = normalizePhone(raw);

    if (!phone) {
      await ctx.reply(T.badPhoneFormat, { parse_mode: 'Markdown' });
      return true;
    }
    await setSession(tgId, { temp_phone: phone, state: 'awaiting_password' });
    await ctx.reply(T.askPassword, { parse_mode: 'Markdown', reply_markup: removeKeyboard });
    return true;
  }

  // Step 2 — password
  if (session.state === 'awaiting_password') {
    const phone = session.temp_phone;
    if (!phone) {
      await setSession(tgId, { state: 'awaiting_phone' });
      await ctx.reply(T.askPhone, { parse_mode: 'Markdown', reply_markup: phoneKeyboard });
      return true;
    }

    const result = await loginWithPassword(tgId, phone, text.trim());

    // Delete the password message so it does not linger in chat history.
    if (ctx.message?.message_id) {
      await ctx.api.deleteMessage(ctx.chat!.id, ctx.message.message_id).catch(() => undefined);
    }

    if (result.ok && result.user) {
      await ctx.reply(T.loginOk(result.user.first_name), {
        parse_mode: 'Markdown',
        reply_markup: mainMenu,
      });
      await ctx.reply(T.help, { parse_mode: 'Markdown' });
      return true;
    }

    switch (result.reason) {
      case 'no_user':
        await setSession(tgId, { state: 'awaiting_phone', temp_phone: null });
        await ctx.reply(T.noSuchUser, { reply_markup: phoneKeyboard });
        break;
      case 'inactive':
        await ctx.reply(T.inactive);
        break;
      case 'taken':
        await ctx.reply(T.taken);
        break;
      case 'locked':
        await ctx.reply(T.locked(LOCK_MINUTES));
        break;
      default:
        await ctx.reply(T.wrongPassword(result.attemptsLeft ?? 0));
    }
    return true;
  }

  return false;
}
