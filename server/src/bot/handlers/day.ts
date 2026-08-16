import type { Context } from 'grammy';
import { getSchedule, setBlockStatus, getBlock } from '../../services/schedules.js';
import { claimNudge } from '../../services/nudges.js';
import { blockListKeyboard, dayKeyboard, renderDay } from '../view.js';
import { mainMenu } from '../keyboards.js';
import { dayLabel } from '../../lib/time.js';
import { sendMd } from '../bot.js';
import type { User } from '../../types/db.js';

/**
 * Send the day as one compact message.
 *
 * Every later interaction edits this same message, so the chat never fills up
 * with stale copies of the schedule.
 */
export async function sendDay(ctx: Context, user: User, dateISO: string): Promise<void> {
  const schedule = await getSchedule(user.id, dateISO);

  if (!schedule || schedule.blocks.length === 0) {
    await ctx.reply(
      `No schedule for ${dayLabel(dateISO, user.timezone)}.\n\nTap ✨ New plan to build one.`,
      { reply_markup: mainMenu },
    );
    return;
  }

  await ctx.reply(renderDay(schedule, user), {
    parse_mode: 'Markdown',
    reply_markup: dayKeyboard(schedule, user),
  });
}

/** Redraw the day in place after any change. */
export async function refreshDay(ctx: Context, user: User, dateISO: string): Promise<void> {
  const schedule = await getSchedule(user.id, dateISO);
  if (!schedule) return;

  await ctx.editMessageText(renderDay(schedule, user), {
    parse_mode: 'Markdown',
    reply_markup: dayKeyboard(schedule, user),
  }).catch(() => undefined);
}

export async function showBlockList(ctx: Context, user: User, dateISO: string): Promise<void> {
  const schedule = await getSchedule(user.id, dateISO);
  if (!schedule) return;

  await ctx.editMessageText(
    `*${dayLabel(dateISO, user.timezone)}*\n\nTap any block to flip it between done and open.`,
    { parse_mode: 'Markdown', reply_markup: blockListKeyboard(schedule) },
  ).catch(() => undefined);
}

/**
 * Mark a block done or skipped and redraw. The first completed block of the
 * day earns a short note; after that the interface stays quiet.
 */
export async function markBlock(
  ctx: Context,
  user: User,
  blockId: string,
  status: 'done' | 'skipped',
): Promise<string | null> {
  const block = await getBlock(blockId);
  if (!block) return null;

  await setBlockStatus(blockId, status);

  const { data } = await import('../../lib/supabase.js').then((m) =>
    m.db.from('schedules').select('date').eq('id', block.schedule_id).maybeSingle());
  const dateISO = (data as { date?: string } | null)?.date ?? null;
  if (!dateISO) return null;

  await refreshDay(ctx, user, dateISO);

  if (status === 'done') {
    const schedule = await getSchedule(user.id, dateISO);
    const doneCount = schedule?.blocks.filter((b) => b.status === 'done').length ?? 0;

    if (doneCount === 1) {
      const line = await claimNudge(user, 'first_done');
      if (line && user.telegram_id) await sendMd(user.telegram_id, line);
    }
  }

  return dateISO;
}
