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
import { blockStartKeyboard, doneKeyboard, wakeKeyboard } from '../bot/keyboards.js';
import { CATEGORY_EMOJI, CATEGORY_LABEL, T } from '../bot/texts.js';
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
      if (await isPaused(data.userId)) {
        log.info('notify_skipped_paused', { userId: data.userId });
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
      const label = CATEGORY_LABEL[block.category] ?? block.category;
      const mins = blockMinutes(hhmm(block.start_time), hhmm(block.end_time));

      if (data.type === 'pre') {
        await sendMd(data.telegramId, `⏰ In 5 minutes: ${emoji} *${block.title}* (${Math.round(mins / 60 * 10) / 10} h)`);
      }

      if (data.type === 'start') {
        await setBlockStatus(block.id, 'active');
        await sendMd(
          data.telegramId,
          `${emoji} *${block.title}* starts now.\n_${label} · ${hhmm(block.start_time)}-${hhmm(block.end_time)}_`,
          { reply_markup: blockStartKeyboard(block.id) },
        );

        // Make commute time useful: push vocab cards automatically.
        if (block.category === 'commute') {
          const owner = await getUserById(data.userId);
          const cards = owner ? await dueCards(owner, 5) : [];
          if (cards.length > 0) {
            const list = cards.map((c) => `• *${c.word}* — ${c.meaning ?? ''}`).join('\n');
            await sendMd(data.telegramId, `🚌 Commute time. Words to review:\n\n${list}\n\nSend /vocab for a full session.`);
          }
        }
      }

      // Asked 5 minutes before the block ends, while the work is still fresh.
      // The buttons stay live until answered; daily-cron closes stale ones.
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

/** Variant A escalation — Telegram-only wake-up, free, up to 5 pings. */
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
      await bot.api.sendVoice(data.telegramId, 'https://raw.githubusercontent.com/anars/blank-audio/master/1-second-of-silence.mp3', {
        caption: '⏰ Time to get up!',
      });
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

