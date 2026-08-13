import { InputFile, type Bot, type Context } from 'grammy';
import { db } from '../lib/supabase.js';
import { requireUser, resetSession } from '../lib/auth.js';
import { startLogin } from './auth-flow.js';
import { appButton, confirmKeyboard, planKeyboard, vocabKeyboard, webAppAvailable } from './keyboards.js';
import { T, progressLine, renderDiff, renderSchedule } from './texts.js';
import { addDaysISO, dayLabel, todayISO } from '../lib/time.js';
import { computeProgress, computeStreak, getSchedule } from '../services/schedules.js';
import { chat, generateSchedule, proposeChange } from '../services/planner.js';
import { analyzeErrors, collectWeeklyStats, weeklyReport } from '../services/reports.js';
import { dueCards } from '../services/vocab.js';
import {
  CATEGORY_LIST, ImportError, TEMPLATE_JSON, importSchedules, parseJsonText,
} from '../services/import.js';
import { scheduleDay } from '../queue/scheduler.js';
import { env } from '../config/env.js';
import { log } from '../lib/logger.js';
import type { User } from '../types/db.js';

const MAX_JSON_BYTES = 1024 * 1024;

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
      await ctx.reply(`⚠️ ${e instanceof Error ? e.message : T.genericError}`);
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

/** Send the blank template as a downloadable file plus the field reference. */
async function sendTemplate(ctx: Context): Promise<void> {
  await ctx.replyWithDocument(
    new InputFile(Buffer.from(TEMPLATE_JSON, 'utf8'), 'schedule-template.json'),
    { caption: 'Edit this file and send it back to me.' },
  );
  await ctx.reply(T.formatHelp(CATEGORY_LIST), { parse_mode: 'Markdown' });
}

/** Shared by the document handler and the pasted-JSON handler. */
async function handleImport(ctx: Context, user: User, jsonText: string): Promise<void> {
  let days;
  try {
    days = parseJsonText(jsonText);
  } catch (e) {
    if (e instanceof ImportError) {
      const detail = e.details.length > 0 ? `\n\n${e.details.map((d) => `• ${d}`).join('\n')}` : '';
      await ctx.reply(`❌ ${e.message}${detail}\n\nSend /format to get a working template.`);
      return;
    }
    throw e;
  }

  const { saved, warnings } = await importSchedules(user, days);

  let armed = 0;
  for (const schedule of saved) {
    armed += await scheduleDay(user, schedule);
  }

  await ctx.reply(
    `✅ Imported ${saved.length} ${saved.length === 1 ? 'day' : 'days'}.\n` +
    (armed > 0
      ? `⏰ ${armed} reminders scheduled.`
      : '⚠️ Reminders are off right now (no Redis connection).'),
  );

  for (const w of warnings) await ctx.reply(`⚠️ ${w}`);

  for (const schedule of saved) {
    const p = computeProgress(schedule.blocks);
    await ctx.reply(
      renderSchedule(
        dayLabel(schedule.date, user.timezone),
        schedule.blocks,
        progressLine(p.doneMinutes, p.plannedMinutes, p.donePercent),
      ),
      { parse_mode: 'Markdown' },
    );
  }
}

export function registerCommands(bot: Bot): void {
  bot.command('start', async (ctx) => {
    const tgId = ctx.from?.id;
    if (!tgId) return;
    const user = await requireUser(tgId);
    if (user) {
      await ctx.reply(T.loginOk(user.first_name), { parse_mode: 'Markdown' });
      await ctx.reply(T.help, { parse_mode: 'Markdown' });
      return;
    }
    await startLogin(ctx);
  });

  bot.command('help', guarded(async (ctx) => {
    await ctx.reply(T.help, { parse_mode: 'Markdown' });
  }));

  /** Two ways to get a schedule: let the AI draft it, or upload JSON. */
  bot.command('plan', guarded(async (ctx) => {
    if (!env.AI_ENABLED) {
      await ctx.reply(T.planIntroJsonOnly, { parse_mode: 'Markdown' });
      await sendTemplate(ctx);
      return;
    }
    await ctx.reply(T.planIntro, { parse_mode: 'Markdown', reply_markup: planKeyboard() });
  }));

  /** Registered before the catch-all in callbacks.ts, so it wins for `plan:*`. */
  bot.callbackQuery(/^plan:/, async (ctx) => {
    const tgId = ctx.from.id;
    const user = await requireUser(tgId);
    if (!user) {
      await ctx.answerCallbackQuery({ text: 'Please sign in first: /start', show_alert: true });
      return;
    }

    const action = ctx.callbackQuery.data.slice('plan:'.length);

    if (action === 'json') {
      await ctx.answerCallbackQuery();
      await sendTemplate(ctx);
      return;
    }

    const today = todayISO(user.timezone);
    const target = action === 'ai:tomorrow' ? addDaysISO(today, 1, user.timezone) : today;

    await ctx.answerCallbackQuery({ text: 'Building your schedule' });
    await ctx.reply('⏳ Building your schedule. This can take 10 to 30 seconds.');

    try {
      const schedule = await generateSchedule(user, target);
      await scheduleDay(user, schedule);
      await showDay(ctx, user, target);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error('ai_plan_failed', { error: msg });
      if (/429|quota|RESOURCE_EXHAUSTED/i.test(msg)) {
        await ctx.reply(T.quotaHint, { parse_mode: 'Markdown' });
      } else {
        await ctx.reply(`⚠️ ${msg}`);
      }
    }
  });

  bot.command('format', guarded(async (ctx) => {
    await sendTemplate(ctx);
  }));

  bot.command('today', guarded(async (ctx, user) => {
    await showDay(ctx, user, todayISO(user.timezone));
  }));

  bot.command('tomorrow', guarded(async (ctx, user) => {
    await showDay(ctx, user, addDaysISO(todayISO(user.timezone), 1, user.timezone));
  }));

  bot.command('day', guarded(async (ctx, user) => {
    const arg = commandArg(ctx);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(arg)) {
      await ctx.reply('Usage: `/day 2026-08-20`', { parse_mode: 'Markdown' });
      return;
    }
    await showDay(ctx, user, arg);
  }));

  bot.command('report', guarded(async (ctx, user) => {
    const stats = await collectWeeklyStats(user);

    const cats = Object.entries(stats.byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `• ${k}: ${(v / 60).toFixed(1)} h`)
      .join('\n');

    const daily = stats.dailyPercent
      .map((d) => `• ${d.date}: ${d.percent}%`)
      .join('\n');

    const skips = Object.entries(stats.skipReasons)
      .map(([k, v]) => `• ${k}: ${v}`)
      .join('\n');

    await ctx.reply(
      [
        `*Weekly report* (${stats.from} to ${stats.to})`,
        '',
        `Completed: *${stats.totalDoneHours}* of ${stats.totalPlannedHours} hours`,
        cats ? `\n*By category*\n${cats}` : '',
        daily ? `\n*Daily completion*\n${daily}` : '',
        skips ? `\n*Skip reasons*\n${skips}` : '',
      ].filter(Boolean).join('\n'),
      { parse_mode: 'Markdown' },
    );

    if (!env.AI_ENABLED) return;

    const { ai } = await weeklyReport(user);
    await ctx.reply(
      [
        ai.summary,
        ai.wins.length ? `\n✅ *Going well*\n${ai.wins.map((w) => `• ${w}`).join('\n')}` : '',
        ai.problems.length ? `\n⚠️ *Problems*\n${ai.problems.map((w) => `• ${w}`).join('\n')}` : '',
        ai.recommendations.length ? `\n🎯 *Recommendations*\n${ai.recommendations.map((w) => `• ${w}`).join('\n')}` : '',
      ].filter(Boolean).join('\n'),
      { parse_mode: 'Markdown' },
    );

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
      await ctx.reply('🎉 Nothing due for review.');
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
      'To change your timezone: `/timezone Asia/Tashkent`',
      { parse_mode: 'Markdown' },
    );
  }));

  bot.command('timezone', guarded(async (ctx, user) => {
    const tz = commandArg(ctx);
    if (!tz) {
      await ctx.reply(`Current timezone: \`${user.timezone}\`\n\nTo change it: \`/timezone Asia/Tashkent\``,
        { parse_mode: 'Markdown' });
      return;
    }
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
    } catch {
      await ctx.reply('That is not a valid timezone. Use a name like `Asia/Tashkent`.', { parse_mode: 'Markdown' });
      return;
    }
    await db.from('users').update({ timezone: tz }).eq('id', user.id);
    await ctx.reply(`✅ Timezone set to \`${tz}\`.`, { parse_mode: 'Markdown' });
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

  bot.command('app', guarded(async (ctx) => {
    if (!env.MINIAPP_ENABLED) {
      await ctx.reply(T.miniAppOff);
      return;
    }
    if (!webAppAvailable()) {
      await ctx.reply('The Mini App url must be HTTPS. Set `WEBAPP_URL` and restart.', { parse_mode: 'Markdown' });
      return;
    }
    await ctx.reply('Open TMA:', { reply_markup: appButton() });
  }));

  bot.command('logout', async (ctx) => {
    const tgId = ctx.from?.id;
    if (!tgId) return;
    await resetSession(tgId);
    await ctx.reply('Signed out. Send /start to sign in again.');
  });

  /** A .json document is a schedule import. */
  bot.on('message:document', guarded(async (ctx, user) => {
    const doc = ctx.message?.document;
    if (!doc) return;

    const name = doc.file_name ?? 'file';
    if (!name.toLowerCase().endsWith('.json')) {
      await ctx.reply('Please send a `.json` file. Use /format to get the template.', { parse_mode: 'Markdown' });
      return;
    }
    if ((doc.file_size ?? 0) > MAX_JSON_BYTES) {
      await ctx.reply('That file is too large. A schedule file should be a few kilobytes.');
      return;
    }

    await ctx.replyWithChatAction('typing');

    const file = await ctx.getFile();
    if (!file.file_path) {
      await ctx.reply('Could not download the file from Telegram. Please try again.');
      return;
    }

    const url = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${file.file_path}`;
    const res = await fetch(url);
    if (!res.ok) {
      await ctx.reply('Could not download the file from Telegram. Please try again.');
      return;
    }

    await handleImport(ctx, user, await res.text());
  }));

  /** Free text: pasted JSON is imported, anything else gets a short hint. */
  bot.on('message:text', guarded(async (ctx, user) => {
    const text = (ctx.message?.text ?? '').trim();
    if (!text || text.startsWith('/')) return;

    if (text.startsWith('{') || text.startsWith('[')) {
      await ctx.replyWithChatAction('typing');
      await handleImport(ctx, user, text);
      return;
    }

    if (!env.AI_ENABLED) {
      await ctx.reply(T.aiOff, { parse_mode: 'Markdown' });
      return;
    }

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

  /** The AI planner stays available behind the flag, but /plan is the JSON path. */
  bot.command('aiplan', guarded(async (ctx, user) => {
    if (!env.AI_ENABLED) {
      await ctx.reply(T.aiOff, { parse_mode: 'Markdown' });
      return;
    }
    const arg = commandArg(ctx).toLowerCase();
    const today = todayISO(user.timezone);
    let target = today;
    if (arg === 'tomorrow') target = addDaysISO(today, 1, user.timezone);
    else if (/^\d{4}-\d{2}-\d{2}$/.test(arg)) target = arg;

    await ctx.reply('⏳ Building your schedule. This can take 10 to 30 seconds.');
    const schedule = await generateSchedule(user, target);
    await scheduleDay(user, schedule);
    await showDay(ctx, user, target);
  }));

  /** Contact share during login. */
  bot.on('message:contact', async (ctx) => {
    const { handleLoginStep } = await import('./auth-flow.js');
    await handleLoginStep(ctx, ctx.message?.contact?.phone_number ?? '');
  });
}
