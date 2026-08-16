import { InlineKeyboard } from 'grammy';
import type { Block, PomodoroSession, User } from '../types/db.js';
import { clockToMinutes, dayLabel, hhmm, nowIn } from '../lib/time.js';
import { blockMinutes } from '../lib/time.js';
import { phaseEmoji, phaseLabel } from '../services/pomodoro.js';
import type { ScheduleWithBlocks } from '../services/schedules.js';

export const CATEGORY_EMOJI: Record<string, string> = {
  reading: '📖', listening: '🎧', vocab: '🔤', writing: '✍️', speaking: '🗣',
  sat_math: '🔢', sat_rw: '📝', course: '🏫', commute: '🚌', meal: '🍽',
  exercise: '🏃', rest: '☕️', sleep: '😴',
};

/**
 * Which block the day is currently on: the one in progress, or the next one
 * that has not been dealt with yet. Everything on screen is built around it.
 */
export function currentBlock(blocks: Block[], tz: string): Block | null {
  const now = nowIn(tz);
  const nowMin = now.hour * 60 + now.minute;

  const open = blocks.filter(
    (b) => b.status !== 'done' && b.status !== 'skipped' && b.category !== 'sleep',
  );
  if (open.length === 0) return null;

  const running = open.find((b) => {
    const s = clockToMinutes(hhmm(b.start_time));
    const e = clockToMinutes(hhmm(b.end_time));
    return s <= nowMin && nowMin < e;
  });
  if (running) return running;

  const upcoming = open
    .filter((b) => clockToMinutes(hhmm(b.start_time)) >= nowMin)
    .sort((a, b) => clockToMinutes(hhmm(a.start_time)) - clockToMinutes(hhmm(b.start_time)));

  return upcoming[0] ?? open[0] ?? null;
}

function mark(b: Block, isCurrent: boolean): string {
  if (b.status === 'done') return '✅';
  if (b.status === 'skipped') return '✖️';
  if (isCurrent) return '▶️';
  return '·';
}

/**
 * The day as one compact, readable message.
 *
 * Finished blocks are dimmed to a single line, the current block is called out
 * with its own section, and nothing is repeated on a button. Long days stay
 * inside one screen.
 */
export function renderDay(schedule: ScheduleWithBlocks, user: User): string {
  const tz = user.timezone;
  const blocks = schedule.blocks.filter((b) => b.category !== 'sleep');
  const current = currentBlock(schedule.blocks, tz);

  const study = blocks.filter((b) => !['meal', 'rest', 'commute', 'exercise'].includes(b.category));
  const doneMin = study
    .filter((b) => b.status === 'done')
    .reduce((sum, b) => sum + blockMinutes(hhmm(b.start_time), hhmm(b.end_time)), 0);
  const planMin = study.reduce((sum, b) => sum + blockMinutes(hhmm(b.start_time), hhmm(b.end_time)), 0);
  const doneCount = blocks.filter((b) => b.status === 'done').length;
  const percent = blocks.length === 0 ? 0 : Math.round((doneCount / blocks.length) * 100);

  const lines: string[] = [];
  lines.push(`*${dayLabel(schedule.date, tz)}*`);
  lines.push(`${'▰'.repeat(Math.round(percent / 10))}${'▱'.repeat(10 - Math.round(percent / 10))}  ${percent}%`);
  lines.push(`${doneCount}/${blocks.length} blocks · ${(doneMin / 60).toFixed(1)}h of ${(planMin / 60).toFixed(1)}h`);
  lines.push('');

  for (const b of blocks) {
    const isCurrent = current?.id === b.id;
    const emoji = CATEGORY_EMOJI[b.category] ?? '•';
    const title = b.status === 'done' || b.status === 'skipped' ? b.title : `*${b.title}*`;
    lines.push(`${mark(b, isCurrent)} \`${hhmm(b.start_time)}\` ${emoji} ${title}`);
  }

  if (current) {
    const start = clockToMinutes(hhmm(current.start_time));
    const end = clockToMinutes(hhmm(current.end_time));
    const now = nowIn(tz);
    const nowMin = now.hour * 60 + now.minute;

    lines.push('');
    lines.push('───────────');
    lines.push(
      nowMin >= start && nowMin < end
        ? `▶️ *Now:* ${current.title}\n⏳ ${end - nowMin} min left`
        : `⏭ *Next:* ${current.title}\n🕒 starts at ${hhmm(current.start_time)}`,
    );
    if (current.notes) lines.push(`_${current.notes}_`);
  } else if (blocks.length > 0) {
    lines.push('');
    lines.push('───────────');
    lines.push('🎉 Nothing left open today.');
  }

  return lines.join('\n');
}

/**
 * Three buttons, never twenty. They always act on the current block, so the
 * user never has to hunt for the right row.
 */
export function dayKeyboard(schedule: ScheduleWithBlocks, user: User): InlineKeyboard | undefined {
  const current = currentBlock(schedule.blocks, user.timezone);
  const kb = new InlineKeyboard();

  if (current) {
    kb.text('✅ Done', `t:done:${current.id}`)
      .text('⏭ Skip', `t:skip:${current.id}`)
      .row()
      .text('🍅 Pomodoro', `pom:start:${current.id}`)
      .text('📋 All blocks', `t:list:${schedule.date}`);
  } else {
    kb.text('📋 All blocks', `t:list:${schedule.date}`);
  }

  kb.row().text('🔄 Refresh', `t:refresh:${schedule.date}`);
  return kb;
}

/** Full list with a button per block, opened on demand from "All blocks". */
export function blockListKeyboard(schedule: ScheduleWithBlocks): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const b of schedule.blocks.filter((x) => x.category !== 'sleep').slice(0, 30)) {
    const icon = b.status === 'done' ? '✅' : b.status === 'skipped' ? '✖️' : '⬜';
    kb.text(`${icon} ${hhmm(b.start_time)} ${b.title}`.slice(0, 58), `t:toggle:${b.id}`).row();
  }
  kb.text('◀️ Back to day', `t:refresh:${schedule.date}`);
  return kb;
}

/** Message shown while a pomodoro phase is running. */
export function renderPomodoro(
  session: PomodoroSession,
  blockTitle: string | null,
  roundsToday: number,
): string {
  const endsAt = new Date(session.ends_at);
  const left = Math.max(0, Math.round((endsAt.getTime() - Date.now()) / 60_000));

  return [
    `${phaseEmoji(session.phase)} *${phaseLabel(session.phase)}* · ${session.minutes} min`,
    blockTitle ? `_${blockTitle}_` : '',
    '',
    `⏳ ${left} min left`,
    `🍅 ${roundsToday} focus rounds today`,
  ].filter(Boolean).join('\n');
}

export function pomodoroKeyboard(sessionId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('⏹ Stop', `pom:stop:${sessionId}`)
    .text('⏭ Skip phase', `pom:skip:${sessionId}`);
}
