import { askJson } from '../lib/ai.js';
import { db } from '../lib/supabase.js';
import { ErrorPatternSchema, WeeklyReportSchema, type AiErrorPatterns, type AiWeeklyReport } from '../lib/schemas.js';
import { computeProgress, getSchedulesInRange } from './schedules.js';
import { addDaysISO, blockMinutes, hhmm, todayISO } from '../lib/time.js';
import type { ErrorLogEntry, User } from '../types/db.js';

export interface WeeklyStats {
  from: string;
  to: string;
  byCategory: Record<string, number>;   // minutes
  dailyPercent: Array<{ date: string; percent: number }>;
  focusByHour: Array<{ hour: number; avg: number }>;
  totalPlannedHours: number;
  totalDoneHours: number;
  skipReasons: Record<string, number>;
}

export async function collectWeeklyStats(user: User, endISO?: string): Promise<WeeklyStats> {
  const to = endISO ?? todayISO(user.timezone);
  const from = addDaysISO(to, -6, user.timezone);
  const schedules = await getSchedulesInRange(user.id, from, to);

  const byCategory: Record<string, number> = {};
  const dailyPercent: Array<{ date: string; percent: number }> = [];
  const focusAcc = new Map<number, number[]>();
  const skipReasons: Record<string, number> = {};
  let planned = 0;
  let done = 0;

  for (const s of schedules) {
    const p = computeProgress(s.blocks);
    planned += p.plannedMinutes;
    done += p.doneMinutes;
    dailyPercent.push({ date: s.date, percent: p.donePercent });

    for (const b of s.blocks) {
      if (b.status === 'done') {
        const mins = blockMinutes(hhmm(b.start_time), hhmm(b.end_time));
        byCategory[b.category] = (byCategory[b.category] ?? 0) + mins;
      }
      if (b.status === 'skipped') {
        const key = b.skip_reason ?? 'noma’lum';
        skipReasons[key] = (skipReasons[key] ?? 0) + 1;
      }
      if (b.focus_rating) {
        const h = Number(b.start_time.slice(0, 2));
        focusAcc.set(h, [...(focusAcc.get(h) ?? []), b.focus_rating]);
      }
    }
  }

  const focusByHour = [...focusAcc.entries()]
    .map(([hour, vals]) => ({ hour, avg: Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) }))
    .sort((a, b) => a.hour - b.hour);

  return {
    from, to, byCategory, dailyPercent, focusByHour, skipReasons,
    totalPlannedHours: Number((planned / 60).toFixed(1)),
    totalDoneHours: Number((done / 60).toFixed(1)),
  };
}

export async function weeklyReport(user: User): Promise<{ stats: WeeklyStats; ai: AiWeeklyReport }> {
  const stats = await collectWeeklyStats(user);

  const { value } = await askJson<AiWeeklyReport>(WeeklyReportSchema, {
    role: 'analyst',
    system: `You are the analyst inside TMA. Read the student's weekly stats and write a short report in English.
Do not scold or moralise. Stay factual and useful. Every recommendation must be specific and doable.`,
    userId: user.id,
    messages: [{
      role: 'user',
      content: `Weekly stats (${stats.from} to ${stats.to}):\n${JSON.stringify(stats, null, 2)}\n\nJSON schema:\n{"summary":"...","wins":["..."],"problems":["..."],"recommendations":["..."]}`,
    }],
  });

  return { stats, ai: value };
}

/** Weekly pass over the error log to surface repeating question types. */
export async function analyzeErrors(user: User): Promise<AiErrorPatterns | null> {
  const since = addDaysISO(todayISO(user.timezone), -14, user.timezone);
  const { data } = await db.from('error_log').select('*')
    .eq('user_id', user.id).gte('created_at', since).order('created_at', { ascending: false }).limit(200);

  const rows = (data ?? []) as ErrorLogEntry[];
  if (rows.length < 3) return null;

  const { value } = await askJson<AiErrorPatterns>(ErrorPatternSchema, {
    role: 'analyst',
    system: `You analyse IELTS and SAT mistakes. Find repeating patterns in the student's mistake log.
Write in English. Only report patterns that genuinely repeat.`,
    userId: user.id,
    messages: [{
      role: 'user',
      content: `Mistakes (last 14 days, ${rows.length} entries):\n${JSON.stringify(
        rows.map((r) => ({ section: r.section, type: r.question_type, wrong: r.what_went_wrong })), null, 2,
      )}\n\nJSON schema:\n{"patterns":[{"section":"reading","question_type":"True/False/Not Given","share_percent":60,"advice":"..."}],"summary":"..."}`,
    }],
  });

  return value;
}

/** Overwork guard: 6+ consecutive days of 9h or more. */
export async function detectBurnout(user: User): Promise<boolean> {
  const to = todayISO(user.timezone);
  const schedules = await getSchedulesInRange(user.id, addDaysISO(to, -6, user.timezone), to);
  if (schedules.length < 6) return false;
  const heavy = schedules.filter((s) => computeProgress(s.blocks).doneMinutes >= 9 * 60);
  return heavy.length >= 6;
}
