import type { Bot, Context } from 'grammy';
import { db } from '../lib/supabase.js';
import { requireUser, resetSession } from '../lib/auth.js';
import { startLogin } from './auth-flow.js';
import { appButton, confirmKeyboard, vocabKeyboard, webAppAvailable } from './keyboards.js';
import { T, progressLine, renderDiff, renderSchedule } from './texts.js';
import { addDaysISO, dayLabel, todayISO } from '../lib/time.js';
import { computeProgress, computeStreak, getSchedule } from '../services/schedules.js';
import { chat, generateSchedule, proposeChange } from '../services/planner.js';
import { analyzeErrors, weeklyReport } from '../services/reports.js';
import { dueCards } from '../services/vocab.js';
import { scheduleDay } from '../queue/scheduler.js';
import { log } from '../lib/logger.js';
import type { User } from '../types/db.js';

/** Wrap a handler so it only runs for an authenticated user. */
function guarded(fn: (ctx: Context, user: User) => Promise<void>) {
  return async (ctx: Context): Promise<void> => {
    const tgId = ctx.from?.id;
    if (!tgId) return;
    const user = await requireUser(tgId);
    if (!user) {
      await ctx.reply(T.needLogin);
      return;
    }
    try {
      await fn(ctx, user);
    } catch (e) {
      log.error('command_failed', { error: e instanceof Error ? e.message : String(e) });
      await ctx.reply(`⚠️ ${e instanceof Error ? e.message : T.aiError}`);
    }
  };
}

function commandArg(ctx: Context): string {
  return ((ctx as unknown as { match?: string }).match ?? '').trim();
}

async function showDay(ctx: Context, user: User, dateISO: string): Promise<void> {
  const s = await getSchedule(user.id, dateISO);
  const label = dayLabel(dateISO, user.timezone);
  if (!s || s.blocks.length === 0) {
    await ctx.reply(T.noSchedule(label));
    return;
  }
  const p = computeProgress(s.blocks);
  const streak = await computeStreak(user);
  const extra = streak > 1 ? `\n🔥 Streak: ${streak} days` : '';
  await ctx.reply(
    renderSchedule(label, s.blocks, progressLine(p.doneMinutes, p.plannedMinutes, p.donePercent) + extra),
    { parse_mode: 'Markdown' },
  );
  if (s.rationale) await ctx.reply(`💡 ${s.rationale}`);
}

export function registerCommands(bot: Bot): void {
  bot.command('start', async (ctx) => {
    const tgId = ctx.from?.id;
    if (!tgId) return;
    const user = await requireUser(tgId);
    if (user) {
      await ctx.reply(T.loginOk(user.first_name), { parse_mode: 'Markdown', reply_markup: appButton() });
      return;
    }
    await startLogin(ctx);
  });

  bot.command('help', guarded(async (ctx) => {
    await ctx.reply(T.help, { parse_mode: 'Markdown' });
  }));

  bot.command('app', guarded(async (ctx) => {
    if (!webAppAvailable()) {
      await ctx.reply(
        'ℹ️ The Mini App is not connected yet.\n\n' +
        'Telegram only accepts *HTTPS* urls for Web App buttons, and the local server runs on ' +
        '`http://localhost:5173`.\n\n' +
        'To connect it: run `npx localtunnel --port 5173`, put the HTTPS url into `WEBAPP_URL` ' +
        'in `.env`, then restart the server.\n\n' +
        'Until then everything works through the bot: /today, /plan, /report',
        { parse_mode: 'Markdown' },
      );
      return;
    }
    await ctx.reply('Open TMA:', { reply_markup: appButton() });
  }));

  bot.command('today', guarded(async (ctx, user) => {
    await showDay(ctx, user, todayISO(user.timezone));
  }));

  bot.command('tomorrow', guarded(async (ctx, user) => {
    await showDay(ctx, user, addDaysISO(todayISO(user.timezone), 1, user.timezone));
  }));

  bot.command('plan', guarded(async (ctx, user) => {
    const arg = commandArg(ctx).toLowerCase();
    const today = todayISO(user.timezone);
    let target = today;
    if (arg === 'tomorrow') target = addDaysISO(today, 1, user.timezone);
    else if (arg === 'overmorrow' || arg === 'day-after') target = addDaysISO(today, 2, user.timezone);
    else if (/^\d{4}-\d{2}-\d{2}$/.test(arg)) target = arg;

    await ctx.reply(T.generating);
    const schedule = await generateSchedule(user, target);
    await scheduleDay(user, schedule);
    await showDay(ctx, user, target);
  }));

  bot.command('report', guarded(async (ctx, user) => {
    await ctx.reply('⏳ Putting your weekly report together.');
    const { stats, ai } = await weeklyReport(user);

    const cats = Object.entries(stats.byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `• ${k}: ${(v / 60).toFixed(1)} h`)
      .join('\n');

    const body = [
      `*Weekly report* (${stats.from} to ${stats.to})`,
      '',
      `Completed: *${stats.totalDoneHours}* of ${stats.totalPlannedHours} hours`,
      '',
      cats ? `*By category*\n${cats}` : '',
      '',
      ai.summary,
      ai.wins.length ? `\n✅ *Going well*\n${ai.wins.map((w) => `• ${w}`).join('\n')}` : '',
      ai.problems.length ? `\n⚠️ *Problems*\n${ai.problems.map((w) => `• ${w}`).join('\n')}` : '',
      ai.recommendations.length ? `\n🎯 *Recommendations*\n${ai.recommendations.map((w) => `• ${w}`).join('\n')}` : '',
    ].filter(Boolean).join('\n');

    await ctx.reply(body, { parse_mode: 'Markdown' });

    const patterns = await analyzeErrors(user);
    if (patterns && patterns.patterns.length > 0) {
      const txt = patterns.patterns
        .map((p) => `• *${p.section}* - ${p.question_type} (${p.share_percent}%)\n  ${p.advice}`)
        .join('\n');
      await ctx.reply(`📕 *Mistake patterns*\n\n${txt}\n\n${patterns.summary}`, { parse_mode: 'Markdown' });
    }
  }));

  bot.command('mistake', guarded(async (ctx, user) => {
    const arg = commandArg(ctx);
    if (!arg) {
      await ctx.reply(
        'Add an entry to your mistake log:\n\n' +
        '`/mistake reading | True-False-Not Given | read the passage too fast | mark keywords and reread`\n\n' +
        'Format: section | question type | what went wrong | the right approach',
        { parse_mode: 'Markdown' },
      );
      return;
    }
    const [section = 'general', qtype = '', wrong = '', correct = ''] = arg.split('|').map((s) => s.trim());
    await db.from('error_log').insert({
      user_id: user.id, section, question_type: qtype || null,
      what_went_wrong: wrong || null, correct_approach: correct || null,
    });
    await ctx.reply('✅ Added to your mistake log.');
  }));

  bot.command('vocab', guarded(async (ctx, user) => {
    const cards = await dueCards(user, 1);
    const card = cards[0];
    if (!card) {
      await ctx.reply('🎉 Nothing due for review. Add new words from the Mini App.');
      return;
    }
    await ctx.reply(
      `🔤 *${card.word}*\n\n${card.collocation ? `_${card.collocation}_\n\n` : ''}Do you remember what it means?`,
      { parse_mode: 'Markdown', reply_markup: vocabKeyboard(card.id) },
    );
  }));

  bot.command('settings', guarded(async (ctx, user) => {
    const goals = Object.entries(user.goals ?? {}).map(([k, v]) => `  ${k}: ${v}%`).join('\n') || '  not set';
    await ctx.reply(
      '*Settings*\n\n' +
      `Name: ${user.first_name}\n` +
      `Phone: ${user.phone}\n` +
      `Timezone: ${user.timezone}\n` +
      `Wake up: ${user.wake_time ?? 'not set'}\n` +
      `Sleep: ${user.sleep_time ?? 'not set'}\n` +
      `Notifications: ${user.notify_mode}\n` +
      `Goals:\n${goals}\n\n` +
      'Open the app to edit these:',
      { parse_mode: 'Markdown', reply_markup: appButton() },
    );
  }));

  bot.command('pause', guarded(async (ctx, user) => {
    const paused = Boolean(user.paused_until && new Date(user.paused_until) > new Date());
    if (paused) {
      await db.from('users').update({ paused_until: null }).eq('id', user.id);
      await ctx.reply(T.resumed);
    } else {
      const until = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
      await db.from('users').update({ paused_until: until }).eq('id', user.id);
      await ctx.reply(T.paused);
    }
  }));

  bot.command('logout', async (ctx) => {
    const tgId = ctx.from?.id;
    if (!tgId) return;
    await resetSession(tgId);
    await ctx.reply('Signed out. Send /start to sign in again.');
  });

  /** Free text goes straight to the AI. Schedule edits come back as proposals. */
  bot.on('message:text', guarded(async (ctx, user) => {
    const text = (ctx.message?.text ?? '').trim();
    if (!text || text.startsWith('/')) return;

    const editHint = /(shorten|move|swap|replace|add|remove|reschedule|shift|earlier|later|shrink|cut)/i;
    const today = todayISO(user.timezone);

    await ctx.replyWithChatAction('typing');

    if (editHint.test(text)) {
      const result = await proposeChange(user, today, text);
      if (result) {
        await ctx.reply(renderDiff({ ...result.diff, rationale: result.diff.rationale }), {
          parse_mode: 'Markdown',
          reply_markup: confirmKeyboard(result.pending.id),
        });
        return;
      }
    }

    const { data: history } = await db.from('ai_messages').select('role, content')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(10);

    const past = ((history ?? []) as Array<{ role: 'user' | 'assistant'; content: string }>).reverse();
    const answer = await chat(user, text, past);

    await db.from('ai_messages').insert([
      { user_id: user.id, role: 'user', content: text },
      { user_id: user.id, role: 'assistant', content: answer },
    ]);

    await ctx.reply(answer);
  }));

  /** Contact share during login. */
  bot.on('message:contact', async (ctx) => {
    const { handleLoginStep } = await import('./auth-flow.js');
    await handleLoginStep(ctx, ctx.message?.contact?.phone_number ?? '');
  });
}
