import { DateTime } from 'luxon';
import type { ScheduleWithBlocks } from './schedules.js';
import { hhmm } from '../lib/time.js';

function esc(s: string): string {
  return s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
}

function stamp(dt: DateTime): string {
  return dt.toUTC().toFormat("yyyyLLdd'T'HHmmss'Z'");
}

/** Export schedules as an .ics file for Google Calendar / Apple Calendar. */
export function toIcs(schedules: ScheduleWithBlocks[], tz: string): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TMA//Time Management Assistant//UZ',
    'CALSCALE:GREGORIAN',
    `X-WR-TIMEZONE:${tz}`,
  ];

  for (const s of schedules) {
    for (const b of s.blocks) {
      if (b.category === 'sleep') continue;
      const start = DateTime.fromISO(`${s.date}T${hhmm(b.start_time)}`, { zone: tz });
      let end = DateTime.fromISO(`${s.date}T${hhmm(b.end_time)}`, { zone: tz });
      if (end <= start) end = end.plus({ days: 1 });

      lines.push(
        'BEGIN:VEVENT',
        `UID:${b.id}@tma`,
        `DTSTAMP:${stamp(DateTime.utc())}`,
        `DTSTART:${stamp(start)}`,
        `DTEND:${stamp(end)}`,
        `SUMMARY:${esc(b.title)}`,
        `CATEGORIES:${b.category}`,
        ...(b.notes ? [`DESCRIPTION:${esc(b.notes)}`] : []),
        'END:VEVENT',
      );
    }
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
