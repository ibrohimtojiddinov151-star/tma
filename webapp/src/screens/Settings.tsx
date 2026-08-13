import { useEffect, useState, type ReactNode } from 'react';
import { CalendarPlus, Check, Fire } from '@phosphor-icons/react';
import { api, apiBase } from '../lib/api';
import type { Exam, Me } from '../lib/types';
import { BlockSkeleton, Button, RetryBox, Screen, ScreenTitle } from '../components/ui';
import { haptic } from '../lib/format';

const GOAL_KEYS = ['reading', 'listening', 'vocab', 'writing', 'speaking', 'sat_math', 'sat_rw'] as const;
const GOAL_LABEL: Record<string, string> = {
  reading: 'Reading', listening: 'Listening', vocab: 'Vocab', writing: 'Writing',
  speaking: 'Speaking', sat_math: 'SAT Math', sat_rw: 'SAT R&W',
};

const TIMEZONES = ['Asia/Tashkent', 'Asia/Almaty', 'Europe/Moscow', 'Asia/Dubai', 'UTC'];

function Group({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="pt-6">
      <h2 className="mb-2 px-1 text-[13px] font-semibold" style={{ color: 'var(--hint)' }}>{title}</h2>
      <div className="overflow-hidden rounded-[var(--r-card)]" style={{ background: 'var(--surface)' }}>
        {children}
      </div>
    </section>
  );
}

function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5" style={{ borderBottom: '1px solid var(--line)' }}>
      <div className="min-w-0">
        <div className="text-[14px]">{label}</div>
        {hint && <div className="mt-0.5 text-[12px]" style={{ color: 'var(--hint)' }}>{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function Settings(): JSX.Element {
  const [me, setMe] = useState<Me | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const load = async (): Promise<void> => {
    setLoading(true);
    setError('');
    try {
      const [m, e] = await Promise.all([api.me(), api.exams()]);
      setMe(m.user);
      setStreak(m.streak);
      setExams(e.exams);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const save = async (patch: Record<string, unknown>): Promise<void> => {
    if (!me) return;
    setMe({ ...me, ...patch } as Me);
    try {
      await api.updateMe(patch);
      haptic('success');
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    }
  };

  if (loading) {
    return (
      <Screen>
        <ScreenTitle title="Settings" />
        <BlockSkeleton rows={5} />
      </Screen>
    );
  }

  if (!me) {
    return (
      <Screen>
        <ScreenTitle title="Settings" />
        <RetryBox message={error || 'Could not load'} onRetry={() => void load()} />
      </Screen>
    );
  }

  const goalTotal = GOAL_KEYS.reduce((s, k) => s + (me.goals[k] ?? 0), 0);
  const control = 'h-10 px-2.5 text-[14px]';

  return (
    <Screen>
      <ScreenTitle
        title="Settings"
        subtitle={`${me.first_name} · ${me.phone}`}
        right={streak > 1 ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[12px]"
            style={{ background: 'var(--fill-strong)' }}>
            <Fire size={13} weight="fill" style={{ color: 'var(--warn)' }} />
            <span className="tabular">{streak} days</span>
          </span>
        ) : undefined}
      />

      {error && <RetryBox message={error} onRetry={() => void load()} />}

      <Group title="Daily rhythm">
        <Row label="Wake up">
          <div className="flex items-center gap-1">
            <input
              type="time"
              value={me.wake_time?.slice(0, 5) ?? ''}
              onChange={(e) => void save({ wake_time: e.target.value || null })}
              className={`tabular ${control}`}
              style={{ background: 'var(--fill-strong)' }}
              aria-label="Wake up time"
            />
            {me.wake_time && (
              <button type="button" onClick={() => void save({ wake_time: null })}
                className="px-2 text-[12px]" style={{ color: 'var(--bad)', minHeight: 40 }}>
                clear
              </button>
            )}
          </div>
        </Row>

        <Row label="Sleep">
          <div className="flex items-center gap-1">
            <input
              type="time"
              value={me.sleep_time?.slice(0, 5) ?? ''}
              onChange={(e) => void save({ sleep_time: e.target.value || null })}
              className={`tabular ${control}`}
              style={{ background: 'var(--fill-strong)' }}
              aria-label="Sleep time"
            />
            {me.sleep_time && (
              <button type="button" onClick={() => void save({ sleep_time: null })}
                className="px-2 text-[12px]" style={{ color: 'var(--bad)', minHeight: 40 }}>
                clear
              </button>
            )}
          </div>
        </Row>

        <Row label="Timezone">
          <select value={me.timezone} onChange={(e) => void save({ timezone: e.target.value })}
            className={control} style={{ background: 'var(--fill-strong)' }} aria-label="Timezone">
            {TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Row>

        <Row label="Notifications" hint="Wake-up and task reminders">
          <select value={me.notify_mode} onChange={(e) => void save({ notify_mode: e.target.value })}
            className={control} style={{ background: 'var(--fill-strong)' }} aria-label="Notification type">
            <option value="message">Message</option>
            <option value="voice">Message and voice</option>
            <option value="call">Message and call</option>
          </select>
        </Row>
      </Group>

      <Group title="Exams">
        {exams.map((ex) => (
          <Row key={ex.id} label={ex.type} hint={ex.target_score ? `Target: ${ex.target_score}` : undefined}>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={ex.exam_date ?? ''}
                onChange={(e) => {
                  const v = e.target.value || null;
                  setExams((list) => list.map((x) => (x.id === ex.id ? { ...x, exam_date: v } : x)));
                  void api.patchExam(ex.id, { exam_date: v });
                }}
                className={`tabular ${control}`}
                style={{ background: 'var(--fill-strong)' }}
                aria-label={`${ex.type} date`}
              />
              <input
                value={ex.target_score ?? ''}
                placeholder="score"
                onChange={(e) => {
                  const v = e.target.value;
                  setExams((list) => list.map((x) => (x.id === ex.id ? { ...x, target_score: v } : x)));
                }}
                onBlur={(e) => void api.patchExam(ex.id, { target_score: e.target.value })}
                className={`w-16 ${control}`}
                style={{ background: 'var(--fill-strong)' }}
                aria-label={`${ex.type} target score`}
              />
            </div>
          </Row>
        ))}
      </Group>

      <section className="pt-6">
        <div className="mb-2 flex items-baseline justify-between px-1">
          <h2 className="text-[13px] font-semibold" style={{ color: 'var(--hint)' }}>Target split</h2>
          <span
            className="tabular text-[12px]"
            style={{ color: goalTotal === 100 ? 'var(--hint)' : 'var(--warn)' }}
          >
            {goalTotal}%
          </span>
        </div>
        <div className="rounded-[var(--r-card)] px-3 py-2" style={{ background: 'var(--surface)' }}>
          {GOAL_KEYS.map((k) => (
            <div key={k} className="py-2">
              <div className="mb-1 flex justify-between text-[13px]">
                <span>{GOAL_LABEL[k]}</span>
                <span className="tabular" style={{ color: 'var(--hint)' }}>{me.goals[k] ?? 0}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={60}
                step={5}
                value={me.goals[k] ?? 0}
                onChange={(e) => setMe({ ...me, goals: { ...me.goals, [k]: Number(e.target.value) } })}
                onMouseUp={() => void save({ goals: me.goals })}
                onTouchEnd={() => void save({ goals: me.goals })}
                className="w-full"
                style={{ accentColor: 'var(--accent)', minHeight: 24, background: 'transparent', border: 'none' }}
                aria-label={GOAL_LABEL[k]}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="pt-6">
        <Button
          full
          variant="secondary"
          icon={CalendarPlus}
          onClick={() => window.open(`${apiBase}/api/export.ics`, '_blank')}
        >
          Export to calendar (.ics)
        </Button>
      </section>

      {saved && (
        <p className="flex items-center justify-center gap-1.5 pt-4 text-[12px]" style={{ color: 'var(--ok)' }}>
          <Check size={13} weight="bold" /> Saved
        </p>
      )}
    </Screen>
  );
}
