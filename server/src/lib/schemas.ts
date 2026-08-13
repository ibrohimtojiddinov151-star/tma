import { z } from 'zod';

export const CATEGORIES = [
  'reading', 'listening', 'vocab', 'writing', 'speaking',
  'sat_math', 'sat_rw', 'course', 'commute', 'meal',
  'exercise', 'rest', 'sleep',
] as const;

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time must be in HH:mm format');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in yyyy-MM-dd format');

export const BlockSchema = z.object({
  start: clock,
  end: clock,
  title: z.string().min(2).max(120),
  category: z.enum(CATEGORIES),
  notes: z.string().max(400).optional().default(''),
  notify: z.boolean().default(true),
  locked: z.boolean().default(false),
});

export const ScheduleSchema = z.object({
  date: isoDate,
  blocks: z.array(BlockSchema).min(1).max(40),
  rationale: z.string().min(5).max(1500),
});

export const DiffSchema = z.object({
  date: isoDate,
  remove: z.array(z.object({
    start: clock,
    end: clock,
    title: z.string(),
  })).default([]),
  add: z.array(BlockSchema).default([]),
  rationale: z.string().min(5).max(1000),
});

export const WeeklyReportSchema = z.object({
  summary: z.string().min(10).max(1200),
  wins: z.array(z.string()).max(5).default([]),
  problems: z.array(z.string()).max(5).default([]),
  recommendations: z.array(z.string()).max(5).default([]),
});

export const ErrorPatternSchema = z.object({
  patterns: z.array(z.object({
    section: z.string(),
    question_type: z.string(),
    share_percent: z.number().min(0).max(100),
    advice: z.string(),
  })).max(6).default([]),
  summary: z.string().max(800),
});

export type AiBlock = z.infer<typeof BlockSchema>;
export type AiSchedule = z.infer<typeof ScheduleSchema>;
export type AiDiff = z.infer<typeof DiffSchema>;
export type AiWeeklyReport = z.infer<typeof WeeklyReportSchema>;
export type AiErrorPatterns = z.infer<typeof ErrorPatternSchema>;

/** Non-overlap + ordering validation on top of the shape check. */
export function validateScheduleConsistency(s: AiSchedule): string[] {
  const problems: string[] = [];
  const toMin = (c: string): number => {
    const [h = '0', m = '0'] = c.split(':');
    return Number(h) * 60 + Number(m);
  };
  const sorted = [...s.blocks]
    .filter((b) => b.category !== 'sleep')
    .sort((a, b) => toMin(a.start) - toMin(b.start));

  for (const b of s.blocks) {
    if (b.category !== 'sleep' && toMin(b.end) <= toMin(b.start)) {
      problems.push(`block "${b.title}" must end after it starts`);
    }
  }
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (prev && cur && toMin(cur.start) < toMin(prev.end)) {
      problems.push(`blocks "${prev.title}" and "${cur.title}" overlap`);
    }
  }
  return problems;
}
