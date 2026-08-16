import type { Context } from 'grammy';
import { getBlock } from '../../services/schedules.js';
import {
  attachMessage, completeSession, focusRoundsToday, getRunning, nextPhase,
  phaseEmoji, phaseLabel, startSession, stopRunning,
} from '../../services/pomodoro.js';
import { pomodoroKeyboard, renderPomodoro } from '../view.js';
import { enqueuePomodoro, cancelPomodoro } from '../../queue/scheduler.js';
import { sendMd } from '../bot.js';
import type { PomodoroPhase, User } from '../../types/db.js';

/**
 * Start a phase, tell the user, and arm the alarm that ends it.
 * The message id is stored so the worker can edit that same message when the
 * phase finishes instead of stacking new ones.
 */
export async function beginPhase(
  user: User,
  phase: PomodoroPhase,
  round: number,
  blockId: string | null,
  reply: (text: string, keyboard: ReturnType<typeof pomodoroKeyboard>) => Promise<number | null>,
): Promise<void> {
  const session = await startSession(user, phase, round, blockId);
  const block = blockId ? await getBlock(blockId) : null;
  const rounds = await focusRoundsToday(user.id);

  const messageId = await reply(
    renderPomodoro(session, block?.title ?? null, rounds),
    pomodoroKeyboard(session.id),
  );
  if (messageId) await attachMessage(session.id, messageId);

  await enqueuePomodoro(user, session.id, new Date(session.ends_at).getTime());
}

/** Called from the "🍅 Pomodoro" button and the menu entry. */
export async function startPomodoro(ctx: Context, user: User, blockId: string | null): Promise<void> {
  const running = await getRunning(user.id);
  if (running) {
    const block = running.block_id ? await getBlock(running.block_id) : null;
    const rounds = await focusRoundsToday(user.id);
    await ctx.reply(
      `A timer is already running.\n\n${renderPomodoro(running, block?.title ?? null, rounds)}`,
      { parse_mode: 'Markdown', reply_markup: pomodoroKeyboard(running.id) },
    );
    return;
  }

  await beginPhase(user, 'focus', (await focusRoundsToday(user.id)) + 1, blockId, async (text, kb) => {
    const msg = await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: kb });
    return msg.message_id;
  });
}

export async function stopPomodoro(ctx: Context, user: User): Promise<void> {
  const running = await stopRunning(user.id);
  if (running) await cancelPomodoro(running.id);

  await ctx.editMessageText('⏹ Timer stopped.', { parse_mode: 'Markdown' }).catch(() => undefined);
}

/** Skip to the next phase without waiting for the current one to run out. */
export async function skipPhase(ctx: Context, user: User): Promise<void> {
  const running = await getRunning(user.id);
  if (!running) {
    await ctx.reply('No timer is running.');
    return;
  }

  await completeSession(running.id);
  await cancelPomodoro(running.id);

  const next = nextPhase(running.phase, running.round);
  await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);

  await beginPhase(user, next.phase, next.round, running.block_id, async (text, kb) => {
    const msg = await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: kb });
    return msg.message_id;
  });
}

/**
 * Runs from the queue when a phase's time is up: close it, announce the next
 * one and start it automatically, so the cycle keeps going hands-free.
 */
export async function finishPhase(user: User, sessionId: string): Promise<void> {
  const running = await getRunning(user.id);
  if (!running || running.id !== sessionId) return;
  if (!user.telegram_id) return;

  await completeSession(sessionId);

  const finished = `${phaseEmoji(running.phase)} *${phaseLabel(running.phase)}* finished.`;
  await sendMd(user.telegram_id, finished);

  const next = nextPhase(running.phase, running.round);
  const chatId = user.telegram_id;
  await beginPhase(user, next.phase, next.round, running.block_id, async (text, kb) =>
    sendMd(chatId, text, { reply_markup: kb }));
}
