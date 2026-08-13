import type { Block } from '../types/db.js';
import { hhmm } from '../lib/time.js';

export const CATEGORY_LABEL: Record<string, string> = {
  reading: 'Reading', listening: 'Listening', vocab: 'Vocab', writing: 'Writing',
  speaking: 'Speaking', sat_math: 'SAT Math', sat_rw: 'SAT R&W', course: 'Class',
  commute: 'Commute', meal: 'Meal', exercise: 'Exercise', rest: 'Break', sleep: 'Sleep',
};

export const CATEGORY_EMOJI: Record<string, string> = {
  reading: '📖', listening: '🎧', vocab: '🔤', writing: '✍️', speaking: '🗣',
  sat_math: '🔢', sat_rw: '📝', course: '🏫', commute: '🚌', meal: '🍽',
  exercise: '🏃', rest: '☕️', sleep: '😴',
};

export const STATUS_EMOJI: Record<Block['status'], string> = {
  pending: '⏳', active: '▶️', done: '✅', skipped: '⏭',
};

export const T = {
  askPhone:
    'Welcome! 👋\n\n' +
    '*TMA - Time Management Assistant*\n' +
    'Your daily study planner for IELTS and SAT prep.\n\n' +
    'To continue, send your *phone number*.\n' +
    'For example: `+998901234567`\n\n' +
    'Or use the button below to share it.',
  askPassword: 'Phone number accepted ✅\n\nNow enter your *password*.',
  badPhoneFormat:
    'That phone number format is not valid.\n\nSend it like this: `+998901234567`',
  noSuchUser:
    '❌ No account found for that number.\n\nCheck it and send it again.',
  inactive: '❌ Your account is not active. Please contact the administrator.',
  taken: '❌ This account is already linked to a different Telegram account.',
  wrongPassword: (left: number) =>
    `❌ Wrong password. ${left} ${left === 1 ? 'attempt' : 'attempts'} left.`,
  locked: (mins: number) =>
    `🔒 Too many failed attempts. Try again in ${mins} minutes.`,
  loginOk: (name: string) =>
    `Welcome back, *${name}*! ✅\n\nSend /today or /plan to get started.\n` +
    'Open /app for the full experience.',
  needLogin: 'Please sign in first. Send /start.',
  noSchedule: (date: string) =>
    `No schedule for ${date}.\n\nUse /plan to build one.`,
  generating: '⏳ Building your schedule. This can take 10 to 30 seconds.',
  aiError: 'Could not reach the AI. Please try again in a moment.',
  paused: '🔕 Notifications paused. Send /pause again to turn them back on.',
  resumed: '🔔 Notifications are back on.',
  help:
    '*Commands*\n' +
    '/today - today\'s schedule\n' +
    '/tomorrow - tomorrow\'s schedule\n' +
    '/plan - build a new schedule with AI\n' +
    '/report - weekly report\n' +
    '/mistake - add an entry to your mistake log\n' +
    '/vocab - review words that are due\n' +
    '/settings - your settings\n' +
    '/pause - pause notifications\n' +
    '/app - open the Mini App\n' +
    '/logout - sign out\n\n' +
    'You can also just write normally, for example: _"I am tired today, shorten the evening blocks"_',
};

export function renderBlock(b: Block): string {
  const emoji = CATEGORY_EMOJI[b.category] ?? '•';
  const status = STATUS_EMOJI[b.status];
  const lock = b.locked ? ' 🔒' : '';
  return `${status} ${hhmm(b.start_time)}-${hhmm(b.end_time)}  ${emoji} ${b.title}${lock}`;
}

export function renderSchedule(dateLabel: string, blocks: Block[], progressLine: string): string {
  if (blocks.length === 0) return `*${dateLabel}*\n\nNo blocks yet.`;
  return `*${dateLabel}*\n\n${blocks.map(renderBlock).join('\n')}\n\n${progressLine}`;
}

export function renderDiff(diff: {
  remove: Array<{ start: string; end: string; title: string }>;
  add: Array<{ start: string; end: string; title: string }>;
  rationale: string;
}): string {
  const minus = diff.remove.map((r) => `- ${r.start}-${r.end} ${r.title}`).join('\n');
  const plus = diff.add.map((a) => `+ ${a.start}-${a.end} ${a.title}`).join('\n');
  return [
    '*Proposed change*',
    '',
    '```',
    [minus, plus].filter(Boolean).join('\n'),
    '```',
    '',
    `_Why:_ ${diff.rationale}`,
  ].join('\n');
}

export function progressLine(doneMin: number, plannedMin: number, percent: number): string {
  const bars = Math.round(percent / 10);
  const bar = '█'.repeat(bars) + '░'.repeat(10 - bars);
  return `${bar} ${percent}%\n📊 ${(doneMin / 60).toFixed(1)} / ${(plannedMin / 60).toFixed(1)} hours`;
}
