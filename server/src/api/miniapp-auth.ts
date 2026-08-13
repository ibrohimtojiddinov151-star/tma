import crypto from 'node:crypto';
import { env } from '../config/env.js';

export interface TelegramInitUser {
  id: number;
  first_name?: string;
  username?: string;
}

/**
 * Verify Telegram Mini App initData per the official algorithm.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function verifyInitData(initData: string): TelegramInitUser | null {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const checkString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secret = crypto.createHmac('sha256', 'WebAppData').update(env.BOT_TOKEN).digest();
  const computed = crypto.createHmac('sha256', secret).update(checkString).digest('hex');

  if (computed.length !== hash.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hash))) return null;

  const authDate = Number(params.get('auth_date') ?? 0);
  if (Date.now() / 1000 - authDate > 24 * 60 * 60) return null;

  const rawUser = params.get('user');
  if (!rawUser) return null;
  return JSON.parse(rawUser) as TelegramInitUser;
}
