import { db } from '../lib/supabase.js';
import { log } from '../lib/logger.js';
import { addDaysISO, nowIn, todayISO } from '../lib/time.js';
import { getSchedule, scheduleFromTemplate, setScheduleStatus, computeProgress } from './schedules.js';
import { detectBurnout } from './reports.js';
import { minutesBehind } from './recovery.js';
import { scheduleDay } from '../queue/scheduler.js';
import { sendMd } from '../bot/bot.js';
import { recoveryKeyboard } from '../bot/keyboards.js';
import type { User } from '../types/db.js';

async function activeUsers(): Promise<User[]> {
  const { data } = await db.from('users').select('*').eq('is_active', true).not('telegram_id', 'is', null);
  return (data ?? []) as User[];
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
