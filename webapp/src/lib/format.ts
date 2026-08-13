import type { Icon } from '@phosphor-icons/react';
import {
  BookOpen, Bus, ChalkboardTeacher, Coffee, ForkKnife, Headphones,
  MathOperations, Microphone, MoonStars, PencilSimple, PersonSimpleRun,
  TextAa, Translate,
} from '@phosphor-icons/react';
import type { Category } from './types';

export const CATEGORY_LABEL: Record<Category, string> = {
  reading: 'Reading', listening: 'Listening', vocab: 'Vocab', writing: 'Writing',
  speaking: 'Speaking', sat_math: 'SAT Math', sat_rw: 'SAT R&W', course: 'Class',
  commute: 'Commute', meal: 'Meal', exercise: 'Exercise', rest: 'Break', sleep: 'Sleep',
};

export const CATEGORY_ICON: Record<Category, Icon> = {
  reading: BookOpen,
  listening: Headphones,
  vocab: Translate,
  writing: PencilSimple,
  speaking: Microphone,
  sat_math: MathOperations,
  sat_rw: TextAa,
  course: ChalkboardTeacher,
  commute: Bus,
  meal: ForkKnife,
  exercise: PersonSimpleRun,
  rest: Coffee,
  sleep: MoonStars,
};

/**
 * Category colors are used only as a thin rail on each block, never as fills.
 * The accent color of the app stays Telegram's button color everywhere else.
 */
export const CATEGORY_COLOR: Record<Category, string> = {
  reading: '#2f6feb', listening: '#7a5af8', vocab: '#c2409a', writing: '#b8791b',
  speaking: '#17936b', sat_math: '#cf4b3f', sat_rw: '#d1741c', course: '#4553c9',
  commute: '#7d8798', meal: '#5f9b23', exercise: '#0f8f8f', rest: '#9aa3af',
  sleep: '#5b6472',
};

/** Study categories count toward the daily hour target; the rest are life admin. */
export const NON_STUDY: ReadonlySet<Category> = new Set<Category>([
  'sleep', 'meal', 'rest', 'commute', 'exercise',
]);

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEK_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function hhmm(t: string): string {
  return t.slice(0, 5);
}

export function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${WEEK[d.getDay()]}`;
}

/** "Today" / "Tomorrow" / "Yesterday" read faster than a date the user has to parse. */
export function dayLabelFor(iso: string): string {
  const today = todayISO();
  if (iso === today) return 'Today';
  if (iso === addDays(today, 1)) return 'Tomorrow';
  if (iso === addDays(today, -1)) return 'Yesterday';
  return formatDate(iso);
}

export function formatDateShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return `${d.getDate()} ${MONTHS[d.getMonth()]?.slice(0, 3)}`;
}

export function weekdayShort(iso: string): string {
  return WEEK_SHORT[new Date(`${iso}T00:00:00`).getDay()] ?? '';
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function minutesOf(t: string): number {
  const [h = '0', m = '0'] = t.split(':');
  return Number(h) * 60 + Number(m);
}

/** "6.5 h" style, or "45 min" when under an hour. */
export function duration(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = mins / 60;
  return `${h % 1 === 0 ? h : h.toFixed(1)} h`;
}

export function hours(mins: number): string {
  return (mins / 60).toFixed(1);
}

export function daysLeft(iso: string): number {
  const target = new Date(`${iso}T00:00:00`).getTime();
  const now = new Date(`${todayISO()}T00:00:00`).getTime();
  return Math.round((target - now) / 86_400_000);
}

export function haptic(kind: 'light' | 'medium' | 'success' | 'error' = 'light'): void {
  const h = window.Telegram?.WebApp?.HapticFeedback;
  if (!h) return;
  if (kind === 'success' || kind === 'error') h.notificationOccurred(kind);
  else h.impactOccurred(kind);
}
