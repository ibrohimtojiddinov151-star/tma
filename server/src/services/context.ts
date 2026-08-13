import { db } from '../lib/supabase.js';
import { computeProgress, getSchedule, getSchedulesInRange } from './schedules.js';
import { addDaysISO, daysUntil, formatDate, hhmm, isOddDay, todayISO } from '../lib/time.js';
import type { Exam, MockTest, User } from '../types/db.js';

/** Static half of the system prompt - kept byte-stable so implicit caching hits. */
export const PLANNER_SYSTEM_STATIC = `You are the planner inside TMA (Time Management Assistant).
The user is a student preparing for IELTS and SAT. Your job is to build their daily schedule.

RULES
1. Keep the plan realistic. 8-10 hours of self-study per day is the ceiling, never exceed it.
2. Put a 10-15 minute break after every 90-120 minutes of work.
3. Place cognitively heavy work (Reading, SAT Math, Writing) in the morning hours.
4. Put lighter work (vocab review, listening, speaking) in the evening.
5. NEVER touch locked blocks. Copy them into your answer exactly as given.
6. Respect class and commute times. Nothing may overlap them.
7. Blocks must not overlap. Times are HH:mm on a 24-hour clock.
8. Always include a sleep block.
9. Block titles are in English, specific and short, for example "IELTS Reading - 2 passages".
10. In "rationale", explain in 2-4 English sentences why you split the day this way.

CATEGORIES (use only these)
reading, listening, vocab, writing, speaking, sat_math, sat_rw, course, commute, meal, exercise, rest, sleep`;

export interface UserContext {
  text: string;
  user: User;
}

/** Dynamic half: profile, exams, last-7-day stats, locked blocks. */
export async function buildUserContext(user: User, targetDate: string): Promise<UserContext> {
  const tz = user.timezone;
  const lines: string[] = [];

  lines.push('## USER PROFILE');
  lines.push(`Name: ${user.first_name}`);
  lines.push(`Timezone: ${tz}`);
  lines.push(`Wake up: ${user.wake_time ? hhmm(user.wake_time) : 'not set'}`);
  lines.push(`Sleep: ${user.sleep_time ? hhmm(user.sleep_time) : 'not set'}`);
  lines.push(`Day type: ${isOddDay(targetDate, tz)
    ? 'odd day (class 16:00-18:00, about 1 hour of commuting)'
    : 'even day (no class)'}`);

  const goals = Object.entries(user.goals ?? {});
  if (goals.length > 0) {
    lines.push(`Target split: ${goals.map(([k, v]) => `${k} ${v}%`).join(', ')}`);
  }

  const { data: examRows } = await db.from('exams').select('*').eq('user_id', user.id);
  const exams = (examRows ?? []) as Exam[];
  if (exams.length > 0) {
    lines.push('');
    lines.push('## EXAMS');
    for (const e of exams) {
      const left = e.exam_date ? `${daysUntil(e.exam_date, tz)} days away` : 'date not set';
      lines.push(`- ${e.type}: ${e.exam_date ?? 'n/a'} (${left}); target ${e.target_score ?? 'n/a'}, current ${e.current_score ?? 'n/a'}`);
    }
  }

  const { data: mockRows } = await db.from('mock_tests').select('*')
    .eq('user_id', user.id).order('date', { ascending: false }).limit(3);
  const mocks = (mockRows ?? []) as MockTest[];
  if (mocks.length > 0) {
    lines.push('');
    lines.push('## RECENT MOCK TESTS');
    for (const m of mocks) {
      lines.push(`- ${m.date} ${m.exam_type}: ${JSON.stringify(m.scores)}`);
    }
  }

  const today = todayISO(tz);
  const week = await getSchedulesInRange(user.id, addDaysISO(today, -7, tz), today);
  if (week.length > 0) {
    lines.push('');
    lines.push('## LAST 7 DAYS');
    const skipReasons = new Map<string, number>();
    const focusByHour = new Map<number, number[]>();

    for (const s of week) {
      const p = computeProgress(s.blocks);
      lines.push(`- ${s.date}: ${p.donePercent}% completed (${p.doneCount}/${p.totalCount} blocks, ${(p.doneMinutes / 60).toFixed(1)} h)`);
      for (const b of s.blocks) {
        if (b.status === 'skipped') {
          const key = b.skip_reason ?? 'no_reason_given';
          skipReasons.set(key, (skipReasons.get(key) ?? 0) + 1);
        }
        if (b.focus_rating) {
          const h = Number(b.start_time.slice(0, 2));
          focusByHour.set(h, [...(focusByHour.get(h) ?? []), b.focus_rating]);
        }
      }
    }

    if (skipReasons.size > 0) {
      lines.push(`Skip reasons: ${[...skipReasons].map(([k, v]) => `${k} x${v}`).join(', ')}`);
    }
    if (focusByHour.size > 0) {
      const avg = [...focusByHour.entries()]
        .map(([h, vals]) => `${h}:00 -> ${(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)}`)
        .join(', ');
      lines.push(`Focus rating by hour: ${avg}`);
    }
  }

  const current = await getSchedule(user.id, targetDate);
  const locked = current?.blocks.filter((b) => b.locked) ?? [];
  if (locked.length > 0) {
    lines.push('');
    lines.push('## LOCKED BLOCKS (do not touch, copy them into the plan unchanged)');
    for (const b of locked) {
      lines.push(`- ${hhmm(b.start_time)}-${hhmm(b.end_time)} ${b.title} [${b.category}]`);
    }
  }

  lines.push('');
  lines.push(`## TARGET DATE\n${targetDate} (${formatDate(targetDate, tz)})`);

  return { text: lines.join('\n'), user };
}
