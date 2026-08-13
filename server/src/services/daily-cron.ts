import { db } from '../lib/supabase.js';
import { log } from '../lib/logger.js';
import { addDaysISO, nowIn, todayISO } from '../lib/time.js';
import { getSchedule, scheduleFromTemplate, setScheduleStatus, computeProgress } from './schedules.js';
import { detectBurnout } from './reports.js';
import { minutesBehind } from './recovery.js';
import { scheduleDay } from '../queue/scheduler.js';
import { sendMd } from '../bot/bot.js';
import { recoveryKeyboard } from '../bot/keyboards.js';
import { T } from '../bot/texts.js';
import type { User } from '../types/db.js';

async function activeUsers(): Promise<User[]> {
  const { data } = await db.from('users').select('*').eq('is_active', true).not('telegram_id', 'is', null);
  return (data ?? []) as User[];
}

/**
 * A confirmation that is never answered should not sit "pending" forever.
 * After a full day the block is closed as not done, which keeps the weekly
 * numbers honest instead of quietly optimistic.
 */
async function closeStaleBlocks(user: User): Promise<void> {
  const cutoff = addDaysISO(todayISO(user.timezone), -1, user.timezone);

  const { data } = await db
    .from('blocks')
    .select('id, title, status, schedules!inner(user_id, date)')
    .in('status', ['pending', 'active'])
    .eq('schedules.user_id', user.id)
    .lt('schedules.date', cutoff);

  const stale = (data ?? []) as Array<{ id: string; title: string }>;
  if (stale.length === 0) return;

  for (const b of stale) {
    await db.from('blocks')
      .update({ status: 'skipped', actual_end: new Date().toISOString() })
      .eq('id', b.id);
  }

  log.info('stale_blocks_closed', { userId: user.id, count: stale.length });

  if (user.telegram_id && stale.length <= 3) {
    for (const b of stale) await sendMd(user.telegram_id, T.autoMissed(b.title));
  } else if (user.telegram_id) {
    await sendMd(
      user.telegram_id,
      `❌ ${stale.length} blocks from earlier days were left unanswered, so I marked them as not done.`,
    );
  }
}

/** Runs every 10 minutes: recovery nudge + burnout guard. */
export async function tenMinuteTick(): Promise<void> {
  for (const user of await activeUsers()) {
    if (user.paused_until && new Date(user.paused_until) > new Date()) continue;
    if (!user.telegram_id) continue;

    const behind = await minutesBehind(user);
    if (behind >= 120) {
      const key = `recovery:${user.id}:${todayISO(user.timezone)}`;
      const { data: already } = await db.from('notification_jobs').select('id').eq('job_key', key).maybeSingle();
      if (!already) {
        await db.from('notification_jobs').insert({
          user_id: user.id, fire_at: new Date().toISOString(), type: 'escalation', job_key: key, sent: true,
        });
        await sendMd(
          user.telegram_id,
          `⚠️ You are *${Math.round(behind / 60)} hours* behind schedule.\n\nWant me to replan the rest of the day?`,
          { reply_markup: recoveryKeyboard() },
        );
      }
    }
  }
}

/** Runs once an hour: end-of-day rollover + next-day plan + burnout check. */
export async function hourlyTick(): Promise<void> {
  for (const user of await activeUsers()) {
    if (!user.telegram_id) continue;
    const now = nowIn(user.timezone);
    const today = todayISO(user.timezone);

    // 23:00 — close today, make sure tomorrow has a plan.
    if (now.hour === 23) {
      const s = await getSchedule(user.id, today);
      if (s) {
        await setScheduleStatus(s.id, 'completed');
        const p = computeProgress(s.blocks);
        const msg = p.donePercent >= 80
          ? `🌙 You completed *${p.donePercent}%* today. Strong work.`
          : `🌙 You completed ${p.donePercent}% today. Fresh start tomorrow.`;
        await sendMd(user.telegram_id, msg);
      }

      const tomorrow = addDaysISO(today, 1, user.timezone);
      const next = await getSchedule(user.id, tomorrow);
      if (!next) {
        const created = await scheduleFromTemplate(user, tomorrow);
        if (created) {
          await scheduleDay(user, created);
          await sendMd(user.telegram_id, "📅 Tomorrow's schedule is ready from your template. See it with /tomorrow");
        }
      }

      await closeStaleBlocks(user);

      if (await detectBurnout(user)) {
        await sendMd(
          user.telegram_id,
          '🧘 You have worked 9+ hours for six days straight.\n\nConsider making tomorrow lighter. ' +
          'Over a few weeks that produces more, not less.',
        );
      }
    }
  }
}

export function startCron(): void {
  setInterval(() => { void tenMinuteTick().catch((e) => log.error('cron_10m', { error: String(e) })); }, 10 * 60_000);
  setInterval(() => { void hourlyTick().catch((e) => log.error('cron_hourly', { error: String(e) })); }, 60 * 60_000);
  log.info('cron_started');
}
