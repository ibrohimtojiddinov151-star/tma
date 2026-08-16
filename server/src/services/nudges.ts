import { db } from '../lib/supabase.js';
import { todayISO } from '../lib/time.js';
import type { User } from '../types/db.js';

/**
 * Short encouragements sent at a few natural moments in the day.
 *
 * Deliberately plain: no guilt, no hype, no exclamation marks stacked three
 * deep. A line that reads as honest once is better than a line that reads as
 * cheerleading every day. Each key is sent at most once per day.
 */
type Slot = 'morning' | 'midday' | 'evening' | 'behind' | 'strong_day' | 'first_done' | 'streak';

const LINES: Record<Slot, string[]> = {
  morning: [
    'Morning. The first block is the only one you have to think about right now.',
    'New day, clean slate. Start with the block in front of you.',
    'You do not need motivation for all ten hours. Just the next one.',
    'Begin badly if you have to. Starting is the hard part, not continuing.',
  ],
  midday: [
    'Halfway. Whatever is left is smaller than what you already did.',
    'Good point to stretch, drink water, and look away from the screen for a minute.',
    'If the morning went sideways, the afternoon does not have to.',
  ],
  evening: [
    'Evening blocks are where most days are won or lost. Yours is still open.',
    'Tired is normal at this hour. Tired and finished beats fresh and postponed.',
    'One more block, then close the day properly.',
  ],
  behind: [
    'Behind schedule is information, not a verdict. Pick the most important block and do that one.',
    'Cut, do not cram. Finishing two blocks properly beats rushing five.',
    'The plan serves you, not the other way around. Adjust it and keep moving.',
  ],
  strong_day: [
    'Strong day. That is what the graph is going to remember.',
    'You finished what you set out to do. Rest without guilt.',
    'Days like this compound. Same again tomorrow, no heroics needed.',
  ],
  first_done: [
    'First block done. The rest of the day is now easier than it looked.',
    'One down. Momentum is real and you just built some.',
  ],
  streak: [
    'That is another day in a row. Consistency is doing more work here than intensity.',
    'The streak is not the point, but it is a fair sign you are showing up.',
  ],
};

/** Rotate deterministically per day so the same line is not repeated. */
function pick(slot: Slot, seed: number): string {
  const lines = LINES[slot];
  return lines[seed % lines.length] as string;
}

async function alreadySent(userId: string, key: string): Promise<boolean> {
  const since = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
  const { count } = await db
    .from('nudges_sent')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('key', key)
    .gte('sent_at', since);
  return (count ?? 0) > 0;
}

/**
 * Returns the line to send, or null when this nudge already went out today or
 * the user turned nudges off. The caller does the actual sending.
 */
export async function claimNudge(user: User, slot: Slot): Promise<string | null> {
  if (!user.nudges_enabled) return null;

  const key = `${slot}:${todayISO(user.timezone)}`;
  if (await alreadySent(user.id, key)) return null;

  await db.from('nudges_sent').insert({ user_id: user.id, key });

  // Day of month gives a stable but changing rotation.
  const seed = Number(todayISO(user.timezone).slice(8));
  return pick(slot, seed);
}

export async function setNudges(userId: string, enabled: boolean): Promise<void> {
  await db.from('users').update({ nudges_enabled: enabled }).eq('id', userId);
}
