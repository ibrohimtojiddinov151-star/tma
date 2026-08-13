import { useCallback, useEffect, useState } from 'react';
import {
  CaretLeft, CaretRight, CheckCircle, Fire, Lock, LockOpen, Play,
  SkipForward, Sparkle, Warning,
} from '@phosphor-icons/react';
import { api } from '../lib/api';
import type { Block, Exam, Progress, Schedule } from '../lib/types';
import {
  CATEGORY_COLOR, CATEGORY_ICON, CATEGORY_LABEL, addDays, dayLabelFor, daysLeft,
  duration, haptic, hhmm, hours, minutesOf, todayISO,
} from '../lib/format';
import {
  BlockSkeleton, Button, Card, EmptyState, Notice, Progress as Bar, RetryBox, Screen,
} from '../components/ui';

function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

const STATUS_TEXT: Record<Block['status'], string> = {
  pending: 'Pending',
  active: 'In progress',
  done: 'Done',
  skipped: 'Skipped',
};

function BlockRow({ b, onChange }: { b: Block; onChange: () => void }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const Glyph = CATEGORY_ICON[b.category];
  const color = CATEGORY_COLOR[b.category];
  const start = minutesOf(hhmm(b.start_time));
  const end = minutesOf(hhmm(b.end_time));
  const nm = nowMinutes();

  const finished = b.status === 'done' || b.status === 'skipped';
  const isCurrent = !finished && start <= nm && nm < end;
  const elapsedPct = isCurrent ? Math.round(((nm - start) / (end - start)) * 100) : 0;

  const patch = async (p: Record<string, unknown>): Promise<void> => {
    setBusy(true);
    haptic('light');
    try {
      await api.patchBlock(b.id, p);
      onChange();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card rail={color} muted={finished} onClick={() => setOpen((v) => !v)}>
      <div className="flex gap-3 pl-2">
        <div className="tabular w-[42px] shrink-0 pt-0.5 text-[13px]" style={{ color: 'var(--hint)' }}>
          <div style={{ color: isCurrent ? 'var(--text)' : undefined, fontWeight: isCurrent ? 600 : 400 }}>
            {hhmm(b.start_time)}
          </div>
          <div className="text-[12px] opacity-70">{hhmm(b.end_time)}</div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Glyph size={15} weight="regular" style={{ color }} className="shrink-0" />
            <span className={`truncate text-[15px] font-medium ${b.status === 'done' ? 'line-through' : ''}`}>
              {b.title}
            </span>
            {b.locked && <Lock size={12} weight="fill" style={{ color: 'var(--hint)' }} className="shrink-0" />}
          </div>

          <div className="mt-0.5 flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--hint)' }}>
            <span>{CATEGORY_LABEL[b.category]}</span>
            <span aria-hidden>·</span>
            <span className="tabular">{duration(end > start ? end - start : 24 * 60 - start + end)}</span>
            {finished && <span className="ml-auto">{STATUS_TEXT[b.status]}</span>}
          </div>

          {isCurrent && (
            <div className="mt-2">
              <Bar percent={elapsedPct} color={color} />
              <p className="tabular mt-1 text-[12px]" style={{ color }}>
                {end - nm} min left
              </p>
            </div>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-3 space-y-3 pl-2 pt-3" style={{ borderTop: '1px solid var(--line)' }}>
          {b.notes && <p className="text-[13px] leading-snug" style={{ color: 'var(--hint)' }}>{b.notes}</p>}

          <div className="flex flex-wrap gap-2">
            {b.status !== 'done' && (
              <Button size="sm" variant="secondary" icon={CheckCircle} disabled={busy}
                onClick={() => void patch({ status: 'done' })}>
                Mark done
              </Button>
            )}
            {b.status === 'pending' && (
              <Button size="sm" variant="secondary" icon={Play} disabled={busy}
                onClick={() => void patch({ status: 'active' })}>
                Start
              </Button>
            )}
            {b.status !== 'skipped' && (
              <Button size="sm" variant="quiet" icon={SkipForward} disabled={busy}
                onClick={() => void patch({ status: 'skipped' })}>
                Skip
              </Button>
            )}
            <Button size="sm" variant="quiet" icon={b.locked ? LockOpen : Lock} disabled={busy}
              onClick={() => void patch({ locked: !b.locked })}>
              {b.locked ? 'Unlock' : 'Lock'}
            </Button>
          </div>

          {b.status === 'done' && (
            <div>
              <p className="mb-1.5 text-[12px]" style={{ color: 'var(--hint)' }}>
                Focus rating
              </p>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => {
                  const on = b.focus_rating === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      disabled={busy}
                      onClick={() => void patch({ status: 'done', focus_rating: n })}
                      className="tabular h-10 w-10 rounded-[var(--r-control)] text-[14px] font-medium"
                      style={{
                        background: on ? 'var(--accent)' : 'var(--fill-strong)',
                        color: on ? 'var(--accent-text)' : 'var(--text)',
                      }}
                      aria-pressed={on}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export function Today(): JSX.Element {
  const [date, setDate] = useState(todayISO());
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [streak, setStreak] = useState(0);
  const [behind, setBehind] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const isToday = date === todayISO();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [s, e, m] = await Promise.all([api.schedule(date), api.exams(), api.me()]);
      setSchedule(s.schedule);
      setProgress(s.progress);
      setExams(e.exams);
      setStreak(m.streak);
      if (date === todayISO()) {
        const r = await api.recovery();
        setBehind(r.minutesBehind);
      } else {
        setBehind(0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { void load(); }, [load]);

  const generate = async (): Promise<void> => {
    setBusy(true);
    haptic('medium');
    try {
      const res = await api.generate(date);
      setSchedule(res.schedule);
      setProgress(res.progress);
      haptic('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build the schedule');
    } finally {
      setBusy(false);
    }
  };

  const rebuild = async (): Promise<void> => {
    setBusy(true);
    try {
      await api.rebuild();
      await load();
    } finally {
      setBusy(false);
    }
  };

  const nextExam = exams
    .filter((e) => e.exam_date)
    .sort((a, b) => (a.exam_date! < b.exam_date! ? -1 : 1))[0];

  return (
    <div className="pb-2">
      <div className="sticky top-0 z-[5]" style={{ background: 'var(--bg)' }}>
        <div className="mx-auto flex max-w-[560px] items-center justify-between gap-2 px-2 pb-3 pt-4">
          <button
            type="button"
            onClick={() => setDate(addDays(date, -1))}
            aria-label="Previous day"
            className="flex h-11 w-11 items-center justify-center"
            style={{ color: 'var(--hint)' }}
          >
            <CaretLeft size={18} weight="bold" />
          </button>

          <div className="min-w-0 text-center">
            <h1 className="truncate text-[17px] font-semibold leading-tight">{dayLabelFor(date)}</h1>
            <p className="tabular mt-0.5 text-[12px]" style={{ color: 'var(--hint)' }}>
              {nextExam?.exam_date
                ? `${daysLeft(nextExam.exam_date)} days to ${nextExam.type}`
                : 'No exam date set'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setDate(addDays(date, 1))}
            aria-label="Next day"
            className="flex h-11 w-11 items-center justify-center"
            style={{ color: 'var(--hint)' }}
          >
            <CaretRight size={18} weight="bold" />
          </button>
        </div>
      </div>

      <Screen>
        {!isToday && (
          <button
            type="button"
            onClick={() => setDate(todayISO())}
            className="mb-3 text-[13px] font-medium"
            style={{ color: 'var(--accent)', minHeight: 0 }}
          >
            Back to today
          </button>
        )}

        {error && <div className="mb-3"><RetryBox message={error} onRetry={() => void load()} /></div>}

        {behind >= 120 && isToday && (
          <div className="mb-3">
            <Notice
              tone="warn"
              action={
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => void rebuild()}>
                  Replan the rest of the day
                </Button>
              }
            >
              <span className="inline-flex items-start gap-2">
                <Warning size={15} weight="fill" className="mt-0.5 shrink-0" style={{ color: 'var(--warn)' }} />
                <span>You are <b className="tabular">{hours(behind)}</b> hours behind schedule.</span>
              </span>
            </Notice>
          </div>
        )}

        {loading ? (
          <BlockSkeleton rows={6} />
        ) : !schedule || schedule.blocks.length === 0 ? (
          <EmptyState
            icon={Sparkle}
            title="No schedule for this day"
            body="The AI builds your day from your profile, exam dates and the last seven days of activity."
            action={
              <Button icon={Sparkle} disabled={busy} onClick={() => void generate()}>
                {busy ? 'Building' : 'Build schedule'}
              </Button>
            }
          />
        ) : (
          <>
            <div className="space-y-2">
              {schedule.blocks.map((b) => (
                <BlockRow key={b.id} b={b} onChange={() => void load()} />
              ))}
            </div>

            {schedule.rationale && (
              <p
                className="mt-4 rounded-[var(--r-card)] p-3 text-[13px] leading-snug"
                style={{ background: 'var(--surface)', color: 'var(--hint)' }}
              >
                {schedule.rationale}
              </p>
            )}
          </>
        )}
      </Screen>

      {progress && schedule && schedule.blocks.length > 0 && (
        <div
          className="sticky bottom-0"
          style={{ background: 'var(--bg)', borderTop: '1px solid var(--line)' }}
        >
          <div className="mx-auto max-w-[560px] px-4 py-2.5">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="tabular text-[13px] font-medium">
                {hours(progress.doneMinutes)} / {hours(progress.plannedMinutes)} h
              </span>
              <span className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--hint)' }}>
                {streak > 1 && (
                  <span className="inline-flex items-center gap-1">
                    <Fire size={13} weight="fill" style={{ color: 'var(--warn)' }} />
                    <span className="tabular">{streak} days</span>
                  </span>
                )}
                <span className="tabular">{progress.donePercent}%</span>
              </span>
            </div>
            <Bar percent={progress.donePercent} />
          </div>
        </div>
      )}
    </div>
  );
}
