import { DateTime, Interval } from 'luxon';
import { env } from '../config/env.js';

export function nowIn(tz: string = env.DEFAULT_TIMEZONE): DateTime {
  return DateTime.now().setZone(tz);
}

/** ISO date (yyyy-MM-dd) for "today" in the user's zone. */
export function todayISO(tz: string): string {
  return nowIn(tz).toISODate() as string;
}

export function addDaysISO(dateISO: string, days: number, tz: string): string {
  return DateTime.fromISO(dateISO, { zone: tz }).plus({ days }).toISODate() as string;
}

/** Combine a yyyy-MM-dd date and an HH:mm[:ss] clock time into an absolute instant. */
export function toInstant(dateISO: string, clock: string, tz: string): DateTime {
  const [h = '0', m = '0'] = clock.split(':');
  return DateTime.fromISO(dateISO, { zone: tz }).set({
    hour: Number(h),
    minute: Number(m),
    second: 0,
    millisecond: 0,
  });
}

export function hhmm(clock: string): string {
  return clock.slice(0, 5);
}

/** Duration of a block in minutes; handles blocks that wrap past midnight (e.g. sleep). */
export function blockMinutes(start: string, end: string): number {
  const s = clockToMinutes(start);
  const e = clockToMinutes(end);
  return e >= s ? e - s : 24 * 60 - s + e;
}

export function clockToMinutes(clock: string): number {
  const [h = '0', m = '0'] = clock.split(':');
  return Number(h) * 60 + Number(m);
}

export function minutesToClock(mins: number): string {
  const wrapped = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const as = clockToMinutes(aStart);
  const ae = clockToMinutes(aEnd);
  const bs = clockToMinutes(bStart);
  const be = clockToMinutes(bEnd);
  if (ae <= as || be <= bs) return false; // wrapping blocks (sleep) are ignored here
  return Interval.fromDateTimes(
    DateTime.fromMillis(as * 60000, { zone: 'utc' }),
    DateTime.fromMillis(ae * 60000, { zone: 'utc' }),
  ).overlaps(
    Interval.fromDateTimes(
      DateTime.fromMillis(bs * 60000, { zone: 'utc' }),
      DateTime.fromMillis(be * 60000, { zone: 'utc' }),
    ),
  );
}

export function daysUntil(dateISO: string, tz: string): number {
  const target = DateTime.fromISO(dateISO, { zone: tz }).startOf('day');
  return Math.round(target.diff(nowIn(tz).startOf('day'), 'days').days);
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** "13 August, Thursday" - Luxon weekday is 1..7 starting on Monday. */
export function formatDate(dateISO: string, tz: string): string {
  const d = DateTime.fromISO(dateISO, { zone: tz });
  return `${d.day} ${MONTHS[d.month - 1]}, ${WEEKDAYS[d.weekday - 1]}`;
}

/** "Today" / "Tomorrow" / "Yesterday" read faster than a raw date. */
export function dayLabel(dateISO: string, tz: string): string {
  const today = todayISO(tz);
  if (dateISO === today) return 'Today';
  if (dateISO === addDaysISO(today, 1, tz)) return 'Tomorrow';
  if (dateISO === addDaysISO(today, -1, tz)) return 'Yesterday';
  return formatDate(dateISO, tz);
}

export function isOddDay(dateISO: string, tz: string): boolean {
  return DateTime.fromISO(dateISO, { zone: tz }).day % 2 === 1;
}
