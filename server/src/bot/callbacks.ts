import type { Bot } from 'grammy';
import { db } from '../lib/supabase.js';
import { requireUser } from '../lib/auth.js';
import { getBlock, getSchedule, setBlockStatus, setSkipReason } from '../services/schedules.js';
import { acceptPendingChange, rejectPendingChange } from '../services/planner.js';
import { rebuildRestOfDay } from '../services/recovery.js';
import { reviewCard, dueCards } from '../services/vocab.js';
import { scheduleDay, snoozeBlock } from '../queue/scheduler.js';
import { skipReasonKeyboard, vocabKeyboard } from './keyboards.js';
import { progressLine, renderSchedule } from './texts.js';
import { computeProgress } from '../services/schedules.js';
import { dayLabel, todayISO } from '../lib/time.js';
import { log } from '../lib/logger.js';
import type { SkipReason } from '../types/db.js';

export function registerCallbacks(bot: Bot): void {
  bot.on('callback_query:data', async (ctx) => {
    const tgId = ctx.from.id;
    const user = await requireUser(tgId);
    if (!user) {
      await ctx.answerCallbackQuery({ text: 'Please sign in first: /start', show_alert: true });
      return;
    }

    const data = ctx.callbackQuery.data;
    const parts = data.split(':');
    const kind = parts[0];

    try {
      // ---- block lifecycle ----
      if (kind === 'blk') {
        const action = parts[1];
        const blockId = parts[2] as string;

        if (action === 'start') {
          await setBlockStatus(blockId, 'active');
          await ctx.answerCallbackQuery({ text: "Started. You've got this 💪" });
          await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
          return;
        }

        if (action === 'skip') {
          await setBlockStatus(blockId, 'skipped');
          await ctx.answerCallbackQuery({ text: 'Skipped' });
          await ctx.reply('What got in the way?', { reply_markup: skipReasonKeyboard(blockId) });
          return;
        }

        if (action === 'snooze') {
          const block = await getBlock(blockId);
          if (block) {
            await snoozeBlock(
              { type: 'start', userId: user.id, telegramId: tgId, blockId },
              10,
            );
          }
          await ctx.answerCallbackQuery({ text: "I'll remind you in 10 minutes ⏰" });
          return;
        }

        if (action === 'focus') {
          const rating = Number(parts[3]);
          await setBlockStatus(blockId, 'done', { focus_rating: rating });
          await ctx.answerCallbackQuery({ text: `Saved: ${rating}/5 ✅` });
          await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);

          const today = todayISO(user.timezone);
          const s = await getSchedule(user.id, today);
          if (s) {
            const p = computeProgress(s.blocks);
            await ctx.reply(`📊 Today: ${(p.doneMinutes / 60).toFixed(1)} / ${(p.plannedMinutes / 60).toFixed(1)} hours (${p.donePercent}%)`);
          }
          return;
        }
      }

      // ---- skip reason ----
      if (kind === 'skp') {
        const blockId = parts[1] as string;
        await setSkipReason(blockId, parts[2] as SkipReason);
        await ctx.answerCallbackQuery({ text: 'Noted, thanks.' });
        await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
        return;
      }

      // ---- wake escalation ----
      if (kind === 'wake') {
        await db.from('notification_jobs').update({ sent: true })
          .eq('user_id', user.id).eq('type', 'wake').eq('sent', false);
        await ctx.answerCallbackQuery({ text: 'Good morning ☀️' });
        await ctx.reply("☀️ Good morning. Here's your day: /today");
        return;
      }

      // ---- pending change: the ONLY path that writes an AI edit to the DB ----
      if (kind === 'pc') {
        const action = parts[1];
        const pendingId = parts[2] as string;

        if (action === 'accept') {
          const saved = await acceptPendingChange(user, pendingId);
          if (!saved) {
            await ctx.answerCallbackQuery({ text: 'That proposal expired or was not found', show_alert: true });
            return;
          }
          await scheduleDay(user, saved);
          await ctx.answerCallbackQuery({ text: 'Applied ✅' });
          const p = computeProgress(saved.blocks);
          await ctx.reply(
            renderSchedule(dayLabel(saved.date, user.timezone), saved.blocks,
              progressLine(p.doneMinutes, p.plannedMinutes, p.donePercent)),
            { parse_mode: 'Markdown' },
          );
          return;
        }

        if (action === 'reject') {
          await rejectPendingChange(user, pendingId);
          await ctx.answerCallbackQuery({ text: 'Dismissed' });
          await ctx.reply('Fair enough. What did not work? Tell me and I will propose something else.');
          return;
        }
      }

      // ---- recovery mode ----
      if (kind === 'rec') {
        if (parts[1] === 'yes') {
          await ctx.answerCallbackQuery({ text: 'Replanning the rest of the day' });
          const saved = await rebuildRestOfDay(user);
          if (saved) {
            await scheduleDay(user, saved);
            const p = computeProgress(saved.blocks);
            await ctx.reply(
              renderSchedule(dayLabel(saved.date, user.timezone), saved.blocks,
                progressLine(p.doneMinutes, p.plannedMinutes, p.donePercent)),
              { parse_mode: 'Markdown' },
            );
          }
        } else {
          await ctx.answerCallbackQuery({ text: 'Okay' });
        }
        return;
      }

      // ---- vocab SRS ----
      if (kind === 'voc') {
        const cardId = parts[1] as string;
        const quality = Number(parts[2]);
        const updated = await reviewCard(cardId, quality);
        await ctx.answerCallbackQuery({
          text: updated ? `Next review in ${updated.interval_days} day(s)` : 'Saved',
        });
        const next = await dueCards(user, 1);
        const card = next[0];
        if (card && card.id !== cardId) {
          await ctx.reply(`🔤 *${card.word}*\n\n${card.collocation ? `_${card.collocation}_\n\n` : ''}Do you remember what it means?`, {
            parse_mode: 'Markdown',
            reply_markup: vocabKeyboard(card.id),
          });
        } else {
          await ctx.reply('🎉 Session complete.');
        }
        return;
      }

      await ctx.answerCallbackQuery();
    } catch (e) {
      log.error('callback_failed', { data, error: e instanceof Error ? e.message : String(e) });
      await ctx.answerCallbackQuery({ text: 'Something went wrong', show_alert: true }).catch(() => undefined);
    }
  });
}
