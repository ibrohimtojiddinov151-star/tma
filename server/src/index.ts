import Fastify from 'fastify';
import cors from '@fastify/cors';
import { webhookCallback } from 'grammy';
import { env, isProd } from './config/env.js';
import { log } from './lib/logger.js';
import { buildBot, COMMANDS } from './bot/index.js';
import { registerRoutes } from './api/routes.js';
import { startCron } from './services/daily-cron.js';
import { closeQueue, initQueue } from './queue/queue.js';
import { startNotificationWorker } from './queue/worker.js';

async function main(): Promise<void> {
  const bot = buildBot();

  // Redis is optional: without it the bot, API and Mini App run normally,
  // only scheduled notifications are disabled.
  const redisOk = await initQueue();
  const worker = redisOk ? startNotificationWorker() : null;
  const app = Fastify({ logger: false, bodyLimit: 2 * 1024 * 1024 });

  await app.register(cors, {
    origin: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Telegram-Init-Data'],
  });

  await registerRoutes(app);

  await bot.api.setMyCommands(COMMANDS).catch((e) => log.warn('set_commands_failed', { error: String(e) }));

  if (env.PUBLIC_URL) {
    // Production: webhook mode, protected by a secret token.
    const path = `/telegram/${env.BOT_WEBHOOK_SECRET}`;
    app.post(path, webhookCallback(bot, 'fastify', {
      secretToken: env.BOT_WEBHOOK_SECRET,
    }) as never);

    await bot.api.setWebhook(`${env.PUBLIC_URL}${path}`, {
      secret_token: env.BOT_WEBHOOK_SECRET,
      drop_pending_updates: true,
    });
    log.info('webhook_set', { url: `${env.PUBLIC_URL}${path}` });
  } else {
    // Local development: long polling.
    await bot.api.deleteWebhook({ drop_pending_updates: true }).catch(() => undefined);
    void bot.start({ onStart: () => log.info('bot_polling_started') });
  }

  startCron();

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  log.info('server_started', {
    port: env.PORT,
    mode: isProd ? 'production' : 'development',
    notifications: redisOk ? 'on' : 'off (no Redis)',
  });

  if (!redisOk) {
    log.warn('notifications_disabled',
      { hint: 'Bot and app work, but no scheduled reminders will be sent. Start Redis to enable them.' });
  }

  const shutdown = async (): Promise<void> => {
    log.info('shutting_down');
    await bot.stop().catch(() => undefined);
    await worker?.close().catch(() => undefined);
    await closeQueue();
    await app.close().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((e) => {
  log.error('fatal', { error: e instanceof Error ? e.stack ?? e.message : String(e) });
  process.exit(1);
});
