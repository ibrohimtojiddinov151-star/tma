import { db } from '../lib/supabase.js';
import { log } from '../lib/logger.js';
import { blockMinutes, hhmm, isOddDay, todayISO } from '../lib/time.js';
import type { AiBlock } from '../lib/schemas.js';
import type { Block, DayTemplate, Schedule, ScheduleStatus, SkipReason, User } from '../types/db.js';

export interface ScheduleWithBlocks extends Schedule {
  blocks: Block[];
}

export async function getSchedule(userId: string, dateISO: string): Promise<ScheduleWithBlocks | null> {
  const { data } = await db
    .from('schedules')
    .select('*, blocks(*)')
    .eq('user_id', userId)
    .eq('date', dateISO)
    .maybeSingle();

  if (!data) return null;
  const row = data as Schedule & { blocks: Block[] };
  row.blocks.sort((a, b) => a.order_index - b.order_index || a.start_time.localeCompare(b.start_time));
  return row;
}

export async function getSchedulesInRange(
  userId: string,
  fromISO: string,
  toISO: string,
): Promise<ScheduleWithBlocks[]> {
  const { data } = await db
    .from('schedules')
    .select('*, blocks(*)')
    .eq('user_id', userId)
    .gte('date', fromISO)
    .lte('date', toISO)
    .order('date', { ascending: true });

  return ((data ?? []) as Array<Schedule & { blocks: Block[] }>).map((s) => {
    s.blocks.sort((a, b) => a.order_index - b.order_index);
    return s;
  });
}

/** Replace the schedule for a day. Locked blocks are always preserved. */
export async function saveSchedule(
  userId: string,
  dateISO: string,
  blocks: AiBlock[],
  generatedBy: 'ai' | 'manual' | 'template',
  rationale?: string,
): Promise<ScheduleWithBlocks> {
  const existing = await getSchedule(userId, dateISO);
  const lockedBlocks = existing?.blocks.filter((b) => b.locked) ?? [];

  let scheduleId: string;
  if (existing) {
    scheduleId = existing.id;
    await db.from('blocks').delete().eq('schedule_id', scheduleId).eq('locked', false);
    await db.from('schedules')
      .update({ generated_by: generatedBy, rationale: rationale ?? null, status: 'active' })
      .eq('id', scheduleId);
  } else {
    const { data, error } = await db.from('schedules')
      .insert({ user_id: userId, date: dateISO, status: 'active', generated_by: generatedBy, rationale: rationale ?? null })
      .select('id')
      .single();
    if (error || !data) throw new Error(`Could not save the schedule: ${error?.message}`);
    scheduleId = data.id as string;
  }

  const lockedRanges = new Set(lockedBlocks.map((b) => `${hhmm(b.start_time)}-${hhmm(b.end_time)}`));
  const rows = blocks
    .filter((b) => !lockedRanges.has(`${b.start}-${b.end}`))
    .map((b, i) => ({
      schedule_id: scheduleId,
      start_time: b.start,
      end_time: b.end,
      title: b.title,
      category: b.category,
      notes: b.notes || null,
      notify: b.notify,
      locked: b.locked,
      status: 'pending' as const,
      order_index: i,
    }));

  if (rows.length > 0) {
    const { error } = await db.from('blocks').insert(rows);
    if (error) throw new Error(`Could not save the blocks: ${error.message}`);
  }

  log.info('schedule_saved', { userId, dateISO, count: rows.length, generatedBy });
  const saved = await getSchedule(userId, dateISO);
  if (!saved) throw new Error('Could not read the schedule back after saving');
  return saved;
}

export async function scheduleFromTemplate(user: User, dateISO: string): Promise<ScheduleWithBlocks | null> {
  const kind = isOddDay(dateISO, user.timezone) ? 'odd' : 'even';
  const { data } = await db
    .from('day_templates')
    .select('*')
    .eq('user_id', user.id)
    .eq('day_kind', kind)
    .maybeSingle();

  if (!data) return null;
  const tpl = data as DayTemplate;
  const blocks: AiBlock[] = tpl.blocks.map((b) => ({
    start: hhmm(b.start),
    end: hhmm(b.end),
    title: b.title,
    category: b.category,
    notes: b.notes ?? '',
    notify: b.notify ?? true,
    locked: false,
  }));
  return saveSchedule(user.id, dateISO, blocks, 'template', `${tpl.name} shabloni asosida tuzildi.`);
}

export async function setBlockStatus(
  blockId: string,
  status: Block['status'],
  extra: Partial<Pick<Block, 'focus_rating' | 'skip_reason' | 'actual_start' | 'actual_end'>> = {},
): Promise<void> {
  const patch: Record<string, unknown> = { status, ...extra };
  if (status === 'active' && !extra.actual_start) patch.actual_start = new Date().toISOString();
  if ((status === 'done' || status === 'skipped') && !extra.actual_end) patch.actual_end = new Date().toISOString();
  await db.from('blocks').update(patch).eq('id', blockId);
}

export async function setSkipReason(blockId: string, reason: SkipReason): Promise<void> {
  await db.from('blocks').update({ skip_reason: reason }).eq('id', blockId);
}

export async function getBlock(blockId: string): Promise<Block | null> {
  const { data } = await db.from('blocks').select('*').eq('id', blockId).maybeSingle();
  return (data as Block | null) ?? null;
}

export async function setScheduleStatus(scheduleId: string, status: ScheduleStatus): Promise<void> {
  await db.from('schedules').update({ status }).eq('id', scheduleId);
}

export interface DayProgress {
  plannedMinutes: number;
  doneMinutes: number;
  donePercent: number;
  doneCount: number;
  skippedCount: number;
  totalCount: number;
}

const NON_STUDY = new Set(['sleep', 'meal', 'rest', 'commute', 'exercise']);

export function computeProgress(blocks: Block[]): DayProgress {
  const study = blocks.filter((b) => !NON_STUDY.has(b.category));
  const planned = study.reduce((sum, b) => sum + blockMinutes(hhmm(b.start_time), hhmm(b.end_time)), 0);
  const done = study
    .filter((b) => b.status === 'done')
    .reduce((sum, b) => sum + blockMinutes(hhmm(b.start_time), hhmm(b.end_time)), 0);

  return {
    plannedMinutes: planned,
    doneMinutes: done,
    donePercent: planned === 0 ? 0 : Math.round((done / planned) * 100),
    doneCount: study.filter((b) => b.status === 'done').length,
    skippedCount: study.filter((b) => b.status === 'skipped').length,
    totalCount: study.length,
  };
}

/** Consecutive days at >= 80% completion, counting back from yesterday/today. */
export async function computeStreak(user: User): Promise<number> {
  const today = todayISO(user.timezone);
  const schedules = await getSchedulesInRange(user.id, addDays(today, -60), today);
  const byDate = new Map(schedules.map((s) => [s.date, s]));

  let streak = 0;
  for (let i = 0; i < 60; i += 1) {
    const d = addDays(today, -i);
    const s = byDate.get(d);
    if (!s) {
      if (i === 0) continue; // today may not be planned yet
      break;
    }
    const p = computeProgress(s.blocks);
    if (p.totalCount === 0) break;
    if (p.donePercent >= 80) streak += 1;
    else if (i > 0) break;
  }
  return streak;
}

function addDays(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
