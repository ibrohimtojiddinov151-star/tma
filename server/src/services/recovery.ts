import { askJson } from '../lib/ai.js';
import { ScheduleSchema, validateScheduleConsistency, type AiSchedule } from '../lib/schemas.js';
import { buildUserContext, PLANNER_SYSTEM_STATIC } from './context.js';
import { getSchedule, saveSchedule, type ScheduleWithBlocks } from './schedules.js';
import { blockMinutes, clockToMinutes, hhmm, nowIn, todayISO } from '../lib/time.js';
import type { User } from '../types/db.js';

/** How many minutes behind plan the user currently is. */
export async function minutesBehind(user: User): Promise<number> {
  const today = todayISO(user.timezone);
  const s = await getSchedule(user.id, today);
  if (!s) return 0;

  const now = nowIn(user.timezone);
  const nowMin = now.hour * 60 + now.minute;

  let shouldBeDone = 0;
  let actuallyDone = 0;
  for (const b of s.blocks) {
    if (b.category === 'sleep') continue;
    const start = clockToMinutes(hhmm(b.start_time));
    const end = clockToMinutes(hhmm(b.end_time));
    if (end <= nowMin) {
      shouldBeDone += blockMinutes(hhmm(b.start_time), hhmm(b.end_time));
      if (b.status === 'done') actuallyDone += blockMinutes(hhmm(b.start_time), hhmm(b.end_time));
    } else if (start < nowMin && nowMin < end) {
      shouldBeDone += nowMin - start;
      if (b.status === 'done' || b.status === 'active') actuallyDone += nowMin - start;
    }
  }
  return Math.max(0, shouldBeDone - actuallyDone);
}

/** Recovery mode: squeeze the remainder of the day while keeping priorities. */
export async function rebuildRestOfDay(user: User): Promise<ScheduleWithBlocks | null> {
  const today = todayISO(user.timezone);
  const current = await getSchedule(user.id, today);
  if (!current) return null;

  const now = nowIn(user.timezone);
  const nowClock = `${String(now.hour).padStart(2, '0')}:${String(now.minute).padStart(2, '0')}`;
  const ctx = await buildUserContext(user, today);

  const past = current.blocks.filter((b) => clockToMinutes(hhmm(b.end_time)) <= clockToMinutes(nowClock));
  const remaining = current.blocks.filter((b) => clockToMinutes(hhmm(b.end_time)) > clockToMinutes(nowClock));

  const { value } = await askJson<AiSchedule>(
    ScheduleSchema,
    {
      role: 'planner',
      system: `${PLANNER_SYSTEM_STATIC}

RECOVERY MODE: the user has fallen behind. Replan the REMAINDER of the day.
- Do not touch blocks that end before ${nowClock}; copy them into your answer unchanged.
- Fit the highest-priority work into the time that is left. Do not cram everything in; keep priorities.
- Do not push the sleep block later.`,
      userId: user.id,
      messages: [{
        role: 'user',
        content: `${ctx.text}\n\nCurrent time: ${nowClock}\n\nPast blocks:\n${past.map((b) => `${hhmm(b.start_time)}-${hhmm(b.end_time)} ${b.title} [${b.status}]`).join('\n') || 'none'}\n\nRemaining blocks:\n${remaining.map((b) => `${hhmm(b.start_time)}-${hhmm(b.end_time)} ${b.title} [${b.category}]${b.locked ? ' 🔒' : ''}`).join('\n')}\n\nReturn the full day (past blocks plus the replanned remainder).`,
      }],
    },
    (s) => validateScheduleConsistency(s),
  );

  return saveSchedule(user.id, today, value.blocks, 'ai', value.rationale);
}
