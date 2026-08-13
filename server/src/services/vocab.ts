import { db } from '../lib/supabase.js';
import { todayISO } from '../lib/time.js';
import type { User, VocabCard } from '../types/db.js';

/**
 * SM-2 spaced repetition.
 * quality: 0-5 (0-2 = forgot, 3-5 = recalled)
 */
export function sm2(card: Pick<VocabCard, 'ease' | 'interval_days' | 'repetitions'>, quality: number): {
  ease: number; interval_days: number; repetitions: number;
} {
  const q = Math.max(0, Math.min(5, quality));
  let { ease, interval_days: interval, repetitions } = card;

  if (q < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) interval = 1;
    else if (repetitions === 2) interval = 6;
    else interval = Math.round(interval * ease);
  }

  ease = ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (ease < 1.3) ease = 1.3;

  return { ease: Number(ease.toFixed(2)), interval_days: interval, repetitions };
}

export async function addWord(userId: string, word: string, meaning?: string, collocation?: string, source?: string): Promise<void> {
  await db.from('vocab').insert({
    user_id: userId, word, meaning: meaning ?? null,
    collocation: collocation ?? null, source: source ?? null,
    due_date: new Date().toISOString().slice(0, 10),
  });
}

export async function dueCards(user: User, limit = 20): Promise<VocabCard[]> {
  const { data } = await db.from('vocab').select('*')
    .eq('user_id', user.id)
    .lte('due_date', todayISO(user.timezone))
    .order('due_date', { ascending: true })
    .limit(limit);
  return (data ?? []) as VocabCard[];
}

export async function reviewCard(cardId: string, quality: number): Promise<VocabCard | null> {
  const { data } = await db.from('vocab').select('*').eq('id', cardId).maybeSingle();
  if (!data) return null;
  const card = data as VocabCard;

  const next = sm2(card, quality);
  const due = new Date();
  due.setDate(due.getDate() + next.interval_days);

  const { data: updated } = await db.from('vocab')
    .update({ ...next, due_date: due.toISOString().slice(0, 10) })
    .eq('id', cardId)
    .select('*')
    .single();

  return (updated as VocabCard | null) ?? null;
}

export async function countDue(user: User): Promise<number> {
  const { count } = await db.from('vocab')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .lte('due_date', todayISO(user.timezone));
  return count ?? 0;
}
