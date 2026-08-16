import { db } from '../lib/supabase.js';
import { log } from '../lib/logger.js';
import type { PomodoroPhase, PomodoroSession, User } from '../types/db.js';

/**
 * Classic pomodoro: focus, short break, focus, ... and a long break after
 * every fourth focus round. Lengths come from the user row so they can be
 * tuned without a deploy.
 */
export const ROUNDS_BEFORE_LONG_BREAK = 4;

export function phaseMinutes(user: User, phase: PomodoroPhase): number {
  if (phase === 'focus') return user.pomodoro_focus;
  if (phase === 'short_break') return user.pomodoro_short;
  return user.pomodoro_long;
}

export function nextPhase(phase: PomodoroPhase, round: number): { phase: PomodoroPhase; round: number } {
  if (phase !== 'focus') return { phase: 'focus', round: round + 1 };
  return round % ROUNDS_BEFORE_LONG_BREAK === 0
    ? { phase: 'long_break', round }
    : { phase: 'short_break', round };
}

export async function getRunning(userId: string): Promise<PomodoroSession | null> {
  const { data } = await db
    .from('pomodoro_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'running')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as PomodoroSession | null) ?? null;
}

/** Only one session may run at a time; starting a new one closes the old. */
export async function startSession(
  user: User,
  phase: PomodoroPhase,
  round: number,
  blockId: string | null,
): Promise<PomodoroSession> {
  await stopRunning(user.id);

  const minutes = phaseMinutes(user, phase);
  const endsAt = new Date(Date.now() + minutes * 60_000).toISOString();

  const { data, error } = await db.from('pomodoro_sessions').insert({
    user_id: user.id,
    block_id: blockId,
    phase,
    round,
    minutes,
    ends_at: endsAt,
    status: 'running',
  }).select('*').single();

  if (error || !data) throw new Error(`Could not start the timer: ${error?.message}`);
  log.info('pomodoro_started', { userId: user.id, phase, round, minutes });
  return data as PomodoroSession;
}

export async function stopRunning(userId: string): Promise<PomodoroSession | null> {
  const running = await getRunning(userId);
  if (!running) return null;
  await db.from('pomodoro_sessions').update({ status: 'stopped' }).eq('id', running.id);
  return running;
}

export async function completeSession(sessionId: string): Promise<void> {
  await db.from('pomodoro_sessions').update({ status: 'done' }).eq('id', sessionId);
}

export async function attachMessage(sessionId: string, messageId: number): Promise<void> {
  await db.from('pomodoro_sessions').update({ message_id: messageId }).eq('id', sessionId);
}

/** Focus rounds completed today, used for the "3 of 4" line in the message. */
export async function focusRoundsToday(userId: string): Promise<number> {
  const since = new Date();
  since.setHours(0, 0, 0, 0);

  const { count } = await db
    .from('pomodoro_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('phase', 'focus')
    .eq('status', 'done')
    .gte('started_at', since.toISOString());

  return count ?? 0;
}

export function phaseLabel(phase: PomodoroPhase): string {
  if (phase === 'focus') return 'Focus';
  if (phase === 'short_break') return 'Short break';
  return 'Long break';
}

export function phaseEmoji(phase: PomodoroPhase): string {
  if (phase === 'focus') return '🍅';
  return '☕️';
}
