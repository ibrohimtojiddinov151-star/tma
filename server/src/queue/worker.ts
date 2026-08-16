import { Worker } from 'bullmq';
import { getConnection, NOTIF_QUEUE, type NotifyJob } from './queue.js';
import { scheduleWakeEscalation } from './scheduler.js';
import { bot, sendMd } from '../bot/bot.js';
import { db } from '../lib/supabase.js';
import { log } from '../lib/logger.js';
import { getBlock, setBlockStatus } from '../services/schedules.js';
import { dueCards } from '../services/vocab.js';
import { getUserById } from '../lib/auth.js';
import { callProvider } from '../services/call-provider.js';
import { claimNudge } from '../services/nudges.js';
import { finishPhase } from '../bot/handlers/pomodoro.js';
import { blockStartedKeyboard, doneKeyboard, wakeKeyboard } from '../bot/keyboards.js';
import { CATEGORY_EMOJI } from '../bot/view.js';
import { T } from '../bot/texts.js';
import { blockMinutes, hhmm, nowIn } from '../lib/time.js';

async function isPaused(userId: string): Promise<boolean> {
  const u = await getUserById(userId);
  if (!u) return true;
  return Boolean(u.paused_until && new Date(u.paused_until) > new Date());
}

async function markSent(jobKey: string | undefined): Promise<void> {
  if (!jobKey) return;
  await db.from('notification_jobs').update({ sent: true }).eq('job_key', jobKey);
}

/**
 * Start the notification worker. Returns null when Redis is unavailable —
 * the bot keeps working, only scheduled reminders are off.
 */
export function startNotificationWorker(): Worker<NotifyJob> | null {
  const connection = getConnection();
  if (!connection) {
    log.warn('worker_not_started_no_redis');
    return null;
  }

  const worker = new Worker<NotifyJob>(
    NOTIF_QUEUE,
    async (job) => {
      const data = job.data;

      // Pomodoro alarms are not schedule reminders, so they ignore /pause.
      if (data.type === 'pomodoro' && data.sessionId) {
        const user = await getUserById(data.userId);
        if (user) await finishPhase(user, data.sessionId);
        await markSent(job.id);
        return;
      }

      if (await isPaused(data.userId)) {
        log.info('notify_skipped_paused', { userId: data.userId });
        return;
      }

      if (data.type === 'nudge' && data.slot) {
        const user = await getUserById(data.userId);
        if (user) {
          const line = await claimNudge(user, data.slot as 'morning' | 'midday' | 'evening');
          if (line) await sendMd(data.telegramId, line);
        }
        await markSent(job.id);
        return;
      }

      if (data.type === 'wake') {
        await handleWake(data);
        await markSent(job.id);
        return;
      }

      if (!data.blockId) return;
      const block = await getBlock(data.blockId);
      if (!block) return;
      if (block.status === 'done' || block.status === 'skipped') return;

      const emoji = CATEGORY_EMOJI[block.category] ?? '•';
      const mins = blockMinutes(hhmm(block.start_time), hhmm(block.end_time));

      if (data.type === 'pre') {
        await sendMd(
          data.telegramId,
          `⏰ In 5 minutes\n\n${emoji} *${block.title}*\n` +
          `🕒 ${hhmm(block.start_time)}-${hhmm(block.end_time)} · ${mins} min`,
        );
      }

      // Every task announces itself the moment it starts, timer one tap away.
      if (data.type === 'start') {
        await setBlockStatus(block.id, 'active');
        await sendMd(
          data.telegramId,
          `▶️ *Starting now*\n\n${emoji} *${block.title}*\n` +
          `🕒 ${hhmm(block.start_time)}-${hhmm(block.end_time)} · ${mins} min` +
          (block.notes ? `\n\n_${block.notes}_` : ''),
          { reply_markup: blockStartedKeyboard(block.id) },
        );

        if (block.category === 'commute') {
          const owner = await getUserById(data.userId);
          const cards = owner ? await dueCards(owner, 5) : [];
          if (cards.length > 0) {
            const list = cards.map((c) => `• *${c.word}* - ${c.meaning ?? ''}`).join('\n');
            await sendMd(data.telegramId, `🚌 Commute time. Words to review:\n\n${list}`);
          }
        }
      }

      // Asked 5 minutes before the block ends, while the work is still fresh.
      if (data.type === 'confirm') {
        const owner = await getUserById(data.userId);
        const tz = owner?.timezone ?? 'Asia/Tashkent';
        const now = nowIn(tz);
        const endMin = Number(block.end_time.slice(0, 2)) * 60 + Number(block.end_time.slice(3, 5));
        const minsLeft = Math.max(0, endMin - (now.hour * 60 + now.minute));

        await sendMd(
          data.telegramId,
          T.confirmAsk(`${emoji} ${block.title}`, minsLeft),
          { reply_markup: doneKeyboard(block.id) },
        );
      }

      await markSent(job.id);
    },
    { connection, concurrency: 5 },
  );

  worker.on('failed', (job, err) => {
    log.error('notify_job_failed', { jobId: job?.id, error: err.message });
  });

  log.info('worker_started', { queue: NOTIF_QUEUE });
  return worker;
}

/** Telegram-only wake-up escalation: up to 5 pings until "I'm up" is tapped. */
async function handleWake(data: NotifyJob): Promise<void> {
  const step = data.step ?? 1;
  const user = await getUserById(data.userId);
  if (!user) return;

  const messages = [
    '⏰ *Time to get up.* Your day is waiting.',
    '⏰ Still in bed? Time to get up.',
    '⏰⏰ Third reminder. Get up!',
    '⏰⏰⏰ Your schedule has already started.',
    '⏰ Last reminder. Get up!',
  ];

  await sendMd(data.telegramId, messages[Math.min(step - 1, 4)] as string, {
    reply_markup: wakeKeyboard(),
    disable_notification: false,
  });

  if (step === 3) {
    try {
      await bot.api.sendVoice(
        data.telegramId,
        'https://raw.githubusercontent.com/anars/blank-audio/master/1-second-of-silence.mp3',
        { caption: '⏰ Time to get up!' },
      );
    } catch (e) {
      log.warn('wake_voice_failed', { error: String(e) });
    }
  }

  if (step === 5 && user.notify_mode === 'call' && user.phone) {
    const res = await callProvider.call(user.phone, 'Time to get up. Have a good day.');
    log.info('wake_call', { ok: res.ok, error: res.error });
  }

  if (step < 5) await scheduleWakeEscalation(data, step + 1);
}
