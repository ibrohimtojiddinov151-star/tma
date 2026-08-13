import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env.js';
import { log } from '../lib/logger.js';

export const NOTIF_QUEUE = 'tma-notifications';

export interface NotifyJob {
  type: 'pre' | 'start' | 'confirm' | 'end' | 'wake' | 'escalation';
  userId: string;
  telegramId: number;
  blockId?: string;
  /** escalation step 1..5 */
  step?: number;
  dateISO?: string;
}

let connection: IORedis | null = null;
let queue: Queue<NotifyJob> | null = null;

/** Null when Redis is unreachable — callers must handle the degraded mode. */
export function getQueue(): Queue<NotifyJob> | null {
  return queue;
}

export function getConnection(): IORedis | null {
  return connection;
}

export function queueEnabled(): boolean {
  return queue !== null;
}

/**
 * Try to reach Redis once at startup.
 *
 * Redis is only needed for scheduled notifications. If it is not running the
 * bot, API and Mini App must still work — notifications are simply skipped
 * rather than crashing the whole process. Set REDIS_URL='' to disable on purpose.
 */
export async function initQueue(): Promise<boolean> {
  if (!env.REDIS_URL) {
    log.warn('redis_disabled_by_config', { hint: 'REDIS_URL is empty, notifications are disabled' });
    return false;
  }

  const client = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
    enableOfflineQueue: false,
    connectTimeout: 5000,
    // Railway's private network resolves only over IPv6, while Node prefers
    // IPv4 by default and would fail with ENOTFOUND on *.railway.internal.
    // family 0 lets the resolver use whichever the host actually has.
    family: 0,
    // A few quick retries, then give up instead of reconnecting forever.
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
  });

  // ioredis emits 'error' asynchronously; without a listener Node would crash.
  client.on('error', (err) => {
    log.warn('redis_error', { error: err.message });
  });

  try {
    await client.connect();
    await client.ping();
  } catch (e) {
    log.warn('redis_unavailable', {
      url: env.REDIS_URL,
      error: e instanceof Error ? e.message : String(e),
      hint: 'Running with notifications disabled. Start Redis and restart the server to enable them.',
    });
    client.disconnect();
    return false;
  }

  connection = client;
  queue = new Queue<NotifyJob>(NOTIF_QUEUE, {
    connection: client,
    defaultJobOptions: {
      removeOnComplete: 200,
      removeOnFail: 500,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    },
  });

  log.info('redis_connected', { queue: NOTIF_QUEUE });
  return true;
}

export async function closeQueue(): Promise<void> {
  await queue?.close().catch(() => undefined);
  connection?.disconnect();
  queue = null;
  connection = null;
}
