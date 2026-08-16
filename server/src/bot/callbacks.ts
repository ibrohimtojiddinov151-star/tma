import type { Bot } from 'grammy';
import { db } from '../lib/supabase.js';
import { requireUser } from '../lib/auth.js';
import { getBlock, setBlockStatus, setSkipReason } from '../services/schedules.js';
import { acceptPendingChange, rejectPendingChange } from '../services/planner.js';
import { rebuildRestOfDay } from '../services/recovery.js';
import { reviewCard, dueCards } from '../services/vocab.js';
import { scheduleDay, snoozeConfirm } from '../queue/scheduler.js';
import { skipReasonKeyboard, vocabKeyboard } from './keyboards.js';
import { T, progressLine, renderSchedule } from './texts.js';
import { markBlock, refreshDay, showBlockList } from './handlers/day.js';
import { skipPhase, startPomodoro, stopPomodoro } from './handlers/pomodoro.js';
import { computeProgress } from '../services/schedules.js';
import { dayLabel } from '../lib/time.js';
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
      // ---- day view: the three buttons under the schedule ----
      if (kind === 't') {
        const action = parts[1];
        const arg = parts[2] as string;

        if (action === 'refresh') {
          await ctx.answerCallbackQuery();
          await refreshDay(ctx, user, arg);
          return;
        }

        if (action === 'list') {
          await ctx.answerCallbackQuery();
          await showBlockList(ctx, user, arg);
          return;
        }

        if (action === 'toggle') {
          const block = await getBlock(arg);
          if (!block) {
            await ctx.answerCallbackQuery({ text: 'That block is gone', show_alert: true });
            return;
          }
          const next = block.status === 'done' ? 'pending' : 'done';
          await setBlockStatus(arg, next);
          await ctx.answerCallbackQuery({ text: next === 'done' ? 'Done' : 'Reopened' });

          const { data } = await db.from('schedules').select('date')
            .eq('id', block.schedule_id).maybeSingle();
          const dateISO = (data as { date?: string } | null)?.date;
          if (dateISO) await showBlockList(ctx, user, dateISO);
          return;
        }

        if (action === 'done' || action === 'skip') {
          await ctx.answerCallbackQuery({ text: action === 'done' ? 'Done ✅' : 'Skipped' });
          await markBlock(ctx, user, arg, action === 'done' ? 'done' : 'skipped');
          if (action === 'skip') {
            await ctx.reply('What got in the way?', { reply_markup: skipReasonKeyboard(arg) });
          }
          return;
        }
      }

      // ---- pomodoro ----
      if (kind === 'pom') {
        const action = parts[1];
        const arg = parts[2] as string;

        if (action === 'start') {
          await ctx.answerCallbackQuery({ text: 'Timer started 🍅' });
          await startPomodoro(ctx, user, arg || null);
          return;
        }
        if (action === 'stop') {
          await ctx.answerCallbackQuery({ text: 'Stopped' });
          await stopPomodoro(ctx, user);
          return;
        }
        if (action === 'skip') {
          await ctx.answerCallbackQuery({ text: 'Next phase' });
          await skipPhase(ctx, user);
          return;
        }
      }

      // ---- "did you do it?" answered ----
      if (kind === 'cfm') {
        const action = parts[1];
        const blockId = parts[2] as string;

        if (action === 'later') {
          await snoozeConfirm({ type: 'confirm', userId: user.id, telegramId: tgId, blockId }, 15);
          await ctx.answerCallbackQuery({ text: T.confirmLater });
          return;
        }

        const done = action === 'done';
        await setBlockStatus(blockId, done ? 'done' : 'skipped');
        await ctx.answerCallbackQuery({ text: done ? T.confirmDone : T.confirmMiss });
        await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);

        if (!done) {
          await ctx.reply('What got in the way?', { reply_markup: skipReasonKeyboard(blockId) });
        }
        return;
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
