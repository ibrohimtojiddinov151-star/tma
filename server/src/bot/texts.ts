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
    `Welcome back, *${name}*! ✅\n\nSend /plan to upload a schedule, or /today to see the current one.`,
  needLogin: 'Please sign in first. Send /start.',
  noSchedule: (date: string) =>
    `No schedule for ${date}.\n\nUse /plan to build one.`,
  genericError: 'Something went wrong. Please try again.',

  planIntro:
    '*New schedule*\n\n' +
    'Two ways to build one:\n\n' +
    '✨ *AI* - I draft the day from your profile, exam dates and the last 7 days.\n' +
    '📄 *JSON* - you send the exact day you want, block by block.\n\n' +
    'Either way I save it and set reminders for every block.',

  planIntroJsonOnly:
    '*Upload a schedule*\n\n' +
    'Send me a `.json` file with your day and I will save it, then send reminders ' +
    'before, at the start of, and after every block.\n\n' +
    'You can also paste the JSON straight into the chat.\n\n' +
    'A template is on its way.',

  quotaHint:
    'The model your key has access to is out of quota.\n\n' +
    'Your Gemini key is on the free tier, and `gemini-3.1-pro-preview` has no free tier. ' +
    'Set `MODEL_PLANNER=gemini-3.6-flash` or enable billing in Google AI Studio.\n\n' +
    'You can still upload a schedule as JSON: /format',

  formatHelp: (categories: string) =>
    '*JSON format*\n\n' +
    'One day:\n' +
    '```\n{\n  "date": "2026-08-14",\n  "blocks": [\n    {\n      "start": "07:00",\n      "end": "09:00",\n      "title": "IELTS Reading",\n      "category": "reading"\n    }\n  ]\n}\n```\n' +
    'Several days at once:\n' +
    '```\n{ "schedules": [ { "date": "...", "blocks": [...] }, { "date": "...", "blocks": [...] } ] }\n```\n' +
    '*Required in every block*\n' +
    '• `start`, `end` - `HH:mm`, 24-hour clock\n' +
    '• `title` - any text\n' +
    '• `category` - one from the list below\n\n' +
    '*Optional*\n' +
    '• `notes` - shown when you open the block\n' +
    '• `notify` - `true` by default, set `false` for silent blocks\n' +
    '• `locked` - `true` marks a block as fixed\n\n' +
    `*Categories*\n\`${categories}\`\n\n` +
    '*Rules*\n' +
    '• Blocks must not overlap\n' +
    '• `end` must come after `start`, except the `sleep` block, which may cross midnight\n' +
    '• A `sleep` block gives you a wake-up reminder next morning\n' +
    '• Re-uploading the same date replaces that day, but `locked` blocks stay',

  aiOff:
    'The AI assistant is off right now.\n\n' +
    'Send /plan to upload a schedule as a JSON file, or /today to see the current one.',

  miniAppOff:
    'The Mini App is disabled right now. Everything works through the bot: ' +
    '/plan, /today, /report.',
  paused: '🔕 Notifications paused. Send /pause again to turn them back on.',
  resumed: '🔔 Notifications are back on.',
  help:
    '*Commands*\n' +
    '/plan - upload a schedule as a JSON file\n' +
    '/format - JSON format and a template file\n' +
    '/today - today\'s schedule\n' +
    '/tomorrow - tomorrow\'s schedule\n' +
    '/day 2026-08-20 - any date\n' +
    '/report - weekly report\n' +
    '/mistake - add an entry to your mistake log\n' +
    '/vocab - review words that are due\n' +
    '/settings - your settings\n' +
    '/timezone - change your timezone\n' +
    '/pause - pause notifications\n' +
    '/logout - sign out\n\n' +
    'You can also paste JSON directly into the chat instead of sending a file.',
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
