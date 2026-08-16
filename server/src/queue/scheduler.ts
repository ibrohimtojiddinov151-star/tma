import { getQueue, queueEnabled, type NotifyJob } from './queue.js';
import { db } from '../lib/supabase.js';
import { log } from '../lib/logger.js';
import { hhmm, toInstant } from '../lib/time.js';
import type { ScheduleWithBlocks } from '../services/schedules.js';
import type { User } from '../types/db.js';

/** Deterministic job id => a block can never be notified twice (idempotency). */
function jobId(kind: string, blockId: string, extra = ''): string {
  return `${kind}:${blockId}${extra ? `:${extra}` : ''}`;
}

export async function cancelJobsForSchedule(scheduleId: string): Promise<void> {
  const { data: blocks } = await db.from('blocks').select('id').eq('schedule_id', scheduleId);
  for (const b of (blocks ?? []) as Array<{ id: string }>) {
    await cancelJobsForBlock(b.id);
  }
}

export async function cancelJobsForBlock(blockId: string): Promise<void> {
  const q = getQueue();
  if (q) {
    for (const k of [
      jobId('pre', blockId), jobId('start', blockId),
      jobId('confirm', blockId), jobId('end', blockId),
    ]) {
      const job = await q.getJob(k);
      if (job) await job.remove().catch(() => undefined);
    }
  }
  await db.from('notification_jobs').delete().eq('block_id', blockId);
}

/**
 * Re-arm every notification for a day. Called after any schedule write.
 * Old jobs are removed first so a rescheduled day never double-fires.
 *
 * Without Redis this is a no-op — the schedule still saves, only the reminders
 * are skipped.
 */
export async function scheduleDay(user: User, schedule: ScheduleWithBlocks): Promise<number> {
  if (!user.telegram_id) return 0;
  if (!queueEnabled()) {
    log.warn('schedule_day_skipped_no_redis', { userId: user.id, date: schedule.date });
    return 0;
  }

  const tz = user.timezone;
  let armed = 0;

  for (const b of schedule.blocks) {
    await cancelJobsForBlock(b.id);
    if (!b.notify || b.status === 'done' || b.status === 'skipped') continue;

    const start = toInstant(schedule.date, hhmm(b.start_time), tz);
    let end = toInstant(schedule.date, hhmm(b.end_time), tz);
    if (end <= start) end = end.plus({ days: 1 });

    const base: NotifyJob = {
      userId: user.id,
      telegramId: user.telegram_id,
      blockId: b.id,
      dateISO: schedule.date,
      type: 'pre',
    };

    // Sleep block => wake-up escalation the next morning instead of normal pings.
    if (b.category === 'sleep') {
      await enqueue({ ...base, type: 'wake', step: 1 }, end.toMillis(), jobId('wake', b.id));
      armed += 1;
      continue;
    }

    await enqueue({ ...base, type: 'pre' }, start.minus({ minutes: 5 }).toMillis(), jobId('pre', b.id));
    await enqueue({ ...base, type: 'start' }, start.toMillis(), jobId('start', b.id));

    // "Did you do it?" lands 5 minutes before the block ends, so the answer is
    // given while the work is still fresh. Very short blocks get it at the end.
    const lengthMin = end.diff(start, 'minutes').minutes;
    const confirmAt = lengthMin > 10 ? end.minus({ minutes: 5 }) : end;
    await enqueue({ ...base, type: 'confirm' }, confirmAt.toMillis(), jobId('confirm', b.id));
    armed += 3;
  }

  log.info('day_scheduled', { userId: user.id, date: schedule.date, armed });
  return armed;
}

export async function enqueue(job: NotifyJob, fireAtMs: number, id: string): Promise<void> {
  const q = getQueue();
  if (!q) return;

  const delay = fireAtMs - Date.now();
  if (delay < -60_000) return; // more than a minute in the past — skip

  await q.add(job.type, job, { delay: Math.max(0, delay), jobId: id });

  await db.from('notification_jobs').upsert({
    user_id: job.userId,
    block_id: job.blockId ?? null,
    fire_at: new Date(fireAtMs).toISOString(),
    type: job.type,
    payload: job as unknown as Record<string, unknown>,
    job_key: id,
  }, { onConflict: 'job_key' });
}

/** Escalating wake-up: 0, 2, 4, 6, 8 minutes until "Turdim" is pressed. */
export async function scheduleWakeEscalation(job: NotifyJob, step: number): Promise<void> {
  if (step > 5) return;
  const fireAt = Date.now() + 2 * 60_000;
  await enqueue({ ...job, type: 'wake', step }, fireAt, `wake:${job.userId}:${job.dateISO}:${step}`);
}

/** Pomodoro phases are queue jobs too, so a restart does not lose the timer. */
export async function enqueuePomodoro(user: User, sessionId: string, endsAtMs: number): Promise<void> {
  if (!user.telegram_id) return;
  await enqueue(
    { type: 'pomodoro', userId: user.id, telegramId: user.telegram_id, sessionId },
    endsAtMs,
    `pom:${sessionId}`,
  );
}

export async function cancelPomodoro(sessionId: string): Promise<void> {
  const q = getQueue();
  if (!q) return;
  const job = await q.getJob(`pom:${sessionId}`);
  if (job) await job.remove().catch(() => undefined);
}

/** "Still working" pushes the confirmation question back by a few minutes. */
export async function snoozeConfirm(job: NotifyJob, minutes: number): Promise<void> {
  await enqueue(
    { ...job, type: 'confirm' },
    Date.now() + minutes * 60_000,
    `confirm:${job.blockId}:snz:${Date.now()}`,
  );
}

export async function snoozeBlock(job: NotifyJob, minutes: number): Promise<void> {
  await enqueue({ ...job, type: 'start' }, Date.now() + minutes * 60_000, `start:${job.blockId}:snz:${Date.now()}`);
}
