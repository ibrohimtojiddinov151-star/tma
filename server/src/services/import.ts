import { z } from 'zod';
import { CATEGORIES, validateScheduleConsistency, type AiBlock } from '../lib/schemas.js';
import { saveSchedule, type ScheduleWithBlocks } from './schedules.js';
import { log } from '../lib/logger.js';
import type { User } from '../types/db.js';

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time must be HH:mm, for example 07:30');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be yyyy-MM-dd, for example 2026-08-14');

const ImportBlock = z.object({
  start: clock,
  end: clock,
  title: z.string().min(1).max(120),
  category: z.enum(CATEGORIES),
  notes: z.string().max(400).optional().default(''),
  notify: z.boolean().optional().default(true),
  locked: z.boolean().optional().default(false),
});

const ImportDay = z.object({
  date: isoDate,
  blocks: z.array(ImportBlock).min(1).max(40),
});

/**
 * Three shapes are accepted so a hand-written file is unlikely to be rejected
 * on a technicality:
 *   1. a single day        { "date": ..., "blocks": [...] }
 *   2. a bare array        [ {day}, {day} ]
 *   3. a wrapped array     { "schedules": [ {day}, {day} ] }
 */
const ImportPayload = z.union([
  ImportDay,
  z.array(ImportDay).min(1).max(31),
  z.object({ schedules: z.array(ImportDay).min(1).max(31) }),
]);

export type ImportDayInput = z.infer<typeof ImportDay>;

export interface ImportResult {
  saved: ScheduleWithBlocks[];
  warnings: string[];
}

export class ImportError extends Error {
  constructor(message: string, public readonly details: string[] = []) {
    super(message);
    this.name = 'ImportError';
  }
}

/** Turn Zod's paths into something a person editing JSON can act on. */
function humanizeIssues(error: z.ZodError): string[] {
  return error.issues.slice(0, 12).map((i) => {
    const path = i.path
      .map((p) => (typeof p === 'number' ? `block ${p + 1}` : p))
      .join(' -> ');
    return path ? `${path}: ${i.message}` : i.message;
  });
}

export function parsePayload(raw: unknown): ImportDayInput[] {
  const parsed = ImportPayload.safeParse(raw);
  if (!parsed.success) {
    throw new ImportError('The JSON does not match the expected format.', humanizeIssues(parsed.error));
  }

  const value = parsed.data;
  if (Array.isArray(value)) return value;
  if ('schedules' in value) return value.schedules;
  return [value];
}

export function parseJsonText(text: string): ImportDayInput[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new ImportError(
      'This is not valid JSON.',
      [e instanceof Error ? e.message : String(e)],
    );
  }
  return parsePayload(raw);
}

/**
 * Persist every day in the payload. Overlapping blocks are rejected before
 * anything is written, so a bad file never leaves a half-imported day behind.
 */
export async function importSchedules(user: User, days: ImportDayInput[]): Promise<ImportResult> {
  const warnings: string[] = [];
  const seen = new Set<string>();

  for (const day of days) {
    if (seen.has(day.date)) {
      throw new ImportError(`The date ${day.date} appears more than once in the file.`);
    }
    seen.add(day.date);

    const blocks: AiBlock[] = day.blocks.map((b) => ({ ...b }));
    const problems = validateScheduleConsistency({ date: day.date, blocks, rationale: 'imported' });
    if (problems.length > 0) {
      throw new ImportError(`Problems in ${day.date}:`, problems);
    }
  }

  const saved: ScheduleWithBlocks[] = [];
  for (const day of days) {
    const blocks: AiBlock[] = day.blocks.map((b) => ({ ...b }));
    const hasSleep = blocks.some((b) => b.category === 'sleep');
    if (!hasSleep) warnings.push(`${day.date}: no sleep block, so no wake-up reminder will be set.`);

    saved.push(await saveSchedule(user.id, day.date, blocks, 'manual'));
  }

  log.info('schedule_imported', { userId: user.id, days: saved.length });
  return { saved, warnings };
}

/** The template the bot hands out with /format, kept in sync with the schema. */
export const TEMPLATE_JSON = JSON.stringify(
  {
    date: '2026-08-14',
    blocks: [
      { start: '06:00', end: '07:00', title: 'Breakfast and exercise', category: 'exercise' },
      { start: '07:00', end: '09:00', title: 'IELTS Reading - 2 passages', category: 'reading', notes: 'Use a timer, then review mistakes' },
      { start: '09:00', end: '09:15', title: 'Break', category: 'rest', notify: false },
      { start: '09:15', end: '11:15', title: 'SAT Math', category: 'sat_math' },
      { start: '11:30', end: '12:30', title: 'Vocabulary review', category: 'vocab' },
      { start: '12:30', end: '13:30', title: 'Lunch', category: 'meal', notify: false },
      { start: '13:30', end: '15:00', title: 'IELTS Listening', category: 'listening' },
      { start: '15:00', end: '15:30', title: 'Travel to class', category: 'commute' },
      { start: '16:00', end: '18:00', title: 'Class', category: 'course', locked: true },
      { start: '18:00', end: '18:30', title: 'Travel home', category: 'commute' },
      { start: '19:00', end: '21:00', title: 'SAT Reading and Writing', category: 'sat_rw' },
      { start: '21:00', end: '22:00', title: 'Mistake log and vocab', category: 'vocab' },
      { start: '22:30', end: '06:00', title: 'Sleep', category: 'sleep' },
    ],
  },
  null,
  2,
);

export const CATEGORY_LIST = CATEGORIES.join(', ');
