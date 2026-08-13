import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db } from './supabase.js';
import { log } from './logger.js';
import { env } from '../config/env.js';
import type { BotSession, User } from '../types/db.js';

export const MAX_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

/**
 * Normalize an Uzbek phone number to E.164 (+998XXXXXXXXX).
 * Accepts: +998935733108, 998935733108, 935733108, 93 573 31 08, (93) 573-31-08
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('998')) return `+${digits}`;
  if (digits.length === 9) return `+998${digits}`;
  if (digits.length === 13 && digits.startsWith('8998')) return `+${digits.slice(1)}`;
  return null;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  // The seed row was hashed by Postgres pgcrypto (bf) — bcryptjs reads $2a$/$2b$ alike.
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

export async function findUserByPhone(phone: string): Promise<User | null> {
  const { data, error } = await db.from('users').select('*').eq('phone', phone).maybeSingle();
  if (error) {
    log.error('find_user_failed', { error: error.message });
    return null;
  }
  return (data as User | null) ?? null;
}

export async function getUserById(id: string): Promise<User | null> {
  const { data } = await db.from('users').select('*').eq('id', id).maybeSingle();
  return (data as User | null) ?? null;
}

export async function getSession(telegramId: number): Promise<BotSession> {
  const { data } = await db.from('bot_sessions').select('*').eq('telegram_id', telegramId).maybeSingle();
  if (data) return data as BotSession;

  const fresh: BotSession = {
    telegram_id: telegramId,
    user_id: null,
    state: 'awaiting_phone',
    temp_phone: null,
    attempts: 0,
    locked_until: null,
    data: {},
  };
  await db.from('bot_sessions').insert(fresh);
  return fresh;
}

export async function setSession(telegramId: number, patch: Partial<BotSession>): Promise<void> {
  await db.from('bot_sessions').update(patch).eq('telegram_id', telegramId);
}

export async function resetSession(telegramId: number): Promise<void> {
  await setSession(telegramId, {
    user_id: null,
    state: 'awaiting_phone',
    temp_phone: null,
    attempts: 0,
    locked_until: null,
    data: {},
  });
}

export interface LoginOutcome {
  ok: boolean;
  user?: User;
  reason?: 'no_user' | 'inactive' | 'bad_password' | 'locked' | 'taken';
  attemptsLeft?: number;
}

/**
 * Second step of the bot login: phone is already known, verify the password.
 * Binds the Telegram account to the user row on success.
 */
export async function loginWithPassword(
  telegramId: number,
  phone: string,
  password: string,
): Promise<LoginOutcome> {
  const session = await getSession(telegramId);

  if (session.locked_until && new Date(session.locked_until) > new Date()) {
    return { ok: false, reason: 'locked' };
  }

  const user = await findUserByPhone(phone);
  if (!user) return { ok: false, reason: 'no_user' };
  if (!user.is_active) return { ok: false, reason: 'inactive' };

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    const attempts = session.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      const until = new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString();
      await setSession(telegramId, { attempts, state: 'locked', locked_until: until });
      return { ok: false, reason: 'locked' };
    }
    await setSession(telegramId, { attempts });
    return { ok: false, reason: 'bad_password', attemptsLeft: MAX_ATTEMPTS - attempts };
  }

  // Single-user product: a different Telegram account cannot hijack the row.
  if (user.telegram_id !== null && user.telegram_id !== telegramId) {
    return { ok: false, reason: 'taken' };
  }

  await db.from('users')
    .update({ telegram_id: telegramId, last_login_at: new Date().toISOString() })
    .eq('id', user.id);

  await setSession(telegramId, {
    user_id: user.id,
    state: 'authenticated',
    attempts: 0,
    temp_phone: null,
    locked_until: null,
  });

  log.info('login_success', { userId: user.id, telegramId });
  return { ok: true, user: { ...user, telegram_id: telegramId } };
}

/** Resolve the logged-in user for a Telegram chat, or null if not authenticated. */
export async function requireUser(telegramId: number): Promise<User | null> {
  const session = await getSession(telegramId);
  if (session.state !== 'authenticated' || !session.user_id) return null;
  return getUserById(session.user_id);
}

/** Short-lived token so the Mini App can call the API without re-entering the password. */
export function issueAppToken(userId: string): string {
  const exp = Date.now() + 12 * 60 * 60 * 1000;
  const payload = `${userId}.${exp}`;
  const sig = crypto.createHmac('sha256', env.SESSION_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function verifyAppToken(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts as [string, string, string];
  const expected = crypto.createHmac('sha256', env.SESSION_SECRET).update(`${userId}.${exp}`).digest('hex');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (Number(exp) < Date.now()) return null;
  return userId;
}
