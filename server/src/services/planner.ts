import { askJson, ask } from '../lib/ai.js';
import { DiffSchema, ScheduleSchema, validateScheduleConsistency, type AiDiff, type AiSchedule } from '../lib/schemas.js';
import { buildUserContext, PLANNER_SYSTEM_STATIC } from './context.js';
import { getSchedule, saveSchedule, type ScheduleWithBlocks } from './schedules.js';
import { db } from '../lib/supabase.js';
import { hhmm } from '../lib/time.js';
import type { PendingChange, User } from '../types/db.js';

/** Generate a fresh AI schedule for a given day and persist it. */
export async function generateSchedule(user: User, dateISO: string): Promise<ScheduleWithBlocks> {
  const ctx = await buildUserContext(user, dateISO);

  const { value } = await askJson<AiSchedule>(
    ScheduleSchema,
    {
      role: 'planner',
      system: PLANNER_SYSTEM_STATIC,
      userId: user.id,
      messages: [{
        role: 'user',
        content: `${ctx.text}\n\nUsing the information above, build a full daily schedule for ${dateISO}.\n\nJSON schema:\n{"date":"${dateISO}","blocks":[{"start":"HH:mm","end":"HH:mm","title":"...","category":"reading","notes":"...","notify":true,"locked":false}],"rationale":"..."}`,
      }],
    },
    (s) => validateScheduleConsistency(s),
  );

  return saveSchedule(user.id, dateISO, value.blocks, 'ai', value.rationale);
}

/**
 * Ask the AI for a *proposal* — nothing is written to the schedule until the
 * user taps "Roziman". This is a hard rule of the product.
 */
export async function proposeChange(
  user: User,
  dateISO: string,
  request: string,
): Promise<{ pending: PendingChange; diff: AiDiff } | null> {
  const current = await getSchedule(user.id, dateISO);
  if (!current) return null;

  const ctx = await buildUserContext(user, dateISO);
  const currentText = current.blocks
    .map((b) => `${hhmm(b.start_time)}-${hhmm(b.end_time)} ${b.title} [${b.category}]${b.locked ? ' 🔒' : ''}`)
    .join('\n');

  const { value } = await askJson<AiDiff>(DiffSchema, {
    role: 'edit',
    system: `${PLANNER_SYSTEM_STATIC}

You are now proposing a SMALL EDIT to an existing schedule. Do not rewrite the whole day.
List only the blocks to remove and the blocks to add. Never touch locked (🔒) blocks.`,
    userId: user.id,
    messages: [{
      role: 'user',
      content: `${ctx.text}\n\n## CURRENT SCHEDULE (${dateISO})\n${currentText}\n\n## USER REQUEST\n${request}\n\nJSON schema:\n{"date":"${dateISO}","remove":[{"start":"HH:mm","end":"HH:mm","title":"..."}],"add":[{"start":"HH:mm","end":"HH:mm","title":"...","category":"vocab","notes":"","notify":true,"locked":false}],"rationale":"..."}`,
    }],
  });

  const { data, error } = await db.from('pending_changes').insert({
    user_id: user.id,
    schedule_id: current.id,
    diff: value,
    rationale: value.rationale,
    status: 'pending',
  }).select('*').single();

  if (error || !data) throw new Error(`Could not save the proposal: ${error?.message}`);
  return { pending: data as PendingChange, diff: value };
}

/** Apply a proposal after the user confirmed it. */
export async function acceptPendingChange(user: User, pendingId: string): Promise<ScheduleWithBlocks | null> {
  const { data } = await db.from('pending_changes').select('*').eq('id', pendingId).eq('user_id', user.id).maybeSingle();
  if (!data) return null;
  const pc = data as PendingChange & { diff: AiDiff };
  if (pc.status !== 'pending') return null;
  if (new Date(pc.expires_at) < new Date()) {
    await db.from('pending_changes').update({ status: 'expired' }).eq('id', pendingId);
    return null;
  }

  const current = await getSchedule(user.id, pc.diff.date);
  if (!current) return null;

  const removeKeys = new Set(pc.diff.remove.map((r) => `${r.start}-${r.end}`));
  const kept = current.blocks
    .filter((b) => b.locked || !removeKeys.has(`${hhmm(b.start_time)}-${hhmm(b.end_time)}`))
    .map((b) => ({
      start: hhmm(b.start_time),
      end: hhmm(b.end_time),
      title: b.title,
      category: b.category,
      notes: b.notes ?? '',
      notify: b.notify,
      locked: b.locked,
    }));

  const merged = [...kept, ...pc.diff.add].sort((a, b) => a.start.localeCompare(b.start));
  const saved = await saveSchedule(user.id, pc.diff.date, merged, 'ai', pc.rationale ?? undefined);
  await db.from('pending_changes').update({ status: 'accepted' }).eq('id', pendingId);
  return saved;
}

export async function rejectPendingChange(user: User, pendingId: string): Promise<void> {
  await db.from('pending_changes').update({ status: 'rejected' }).eq('id', pendingId).eq('user_id', user.id);
}

/** Plain chat turn — cheap model, no schedule writes. */
export async function chat(user: User, message: string, history: Array<{ role: 'user' | 'assistant'; content: string }>): Promise<string> {
  const ctx = await buildUserContext(user, new Date().toISOString().slice(0, 10));
  const res = await ask({
    role: 'chat',
    system: `You are TMA, the student's daily planning assistant. Answer in English, short and concrete.
If the user asks to change the schedule, do not change it yourself; another part of the system handles that.
Context:\n${ctx.text}`,
    userId: user.id,
    messages: [...history.slice(-10), { role: 'user', content: message }],
  });
  return res.text;
}
