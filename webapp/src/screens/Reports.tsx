import { useEffect, useState } from 'react';
import {
  Bar, BarChart, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { ChartBar, Sparkle } from '@phosphor-icons/react';
import { api, type AiSummary } from '../lib/api';
import type { Category, WeeklyStats } from '../lib/types';
import { CATEGORY_COLOR, CATEGORY_LABEL } from '../lib/format';
import {
  BlockSkeleton, Button, ChartSkeleton, EmptyState, RetryBox, Screen, ScreenTitle,
} from '../components/ui';

const SKIP_LABEL: Record<string, string> = {
  tired: 'Too tired',
  distracted: 'Distracted',
  other_task: 'Something came up',
  too_long: 'Block too long',
};

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <section className="pt-7">
      <h2 className="mb-3 text-[14px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

const axis = { fontSize: 11, fill: 'var(--hint)' } as const;

export function Reports(): JSX.Element {
  const [stats, setStats] = useState<WeeklyStats | null>(null);
  const [ai, setAi] = useState<AiSummary | null>(null);
  const [mocks, setMocks] = useState<Array<{ date: string; scores: Record<string, number> }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const load = async (): Promise<void> => {
    setLoading(true);
    setError('');
    try {
      const [w, m] = await Promise.all([api.weekly(false), api.mockTests()]);
      setStats(w.stats);
      setMocks(m.tests);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const loadAi = async (): Promise<void> => {
    setAiLoading(true);
    try {
      const res = await api.weekly(true);
      setStats(res.stats);
      if (res.ai) setAi(res.ai);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not get the analysis');
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) {
    return (
      <Screen>
        <ScreenTitle title="Report" subtitle="Last 7 days" />
        <ChartSkeleton />
        <div className="mt-6"><BlockSkeleton rows={3} /></div>
      </Screen>
    );
  }

  if (error && !stats) {
    return (
      <Screen>
        <ScreenTitle title="Report" />
        <RetryBox message={error} onRetry={() => void load()} />
      </Screen>
    );
  }

  if (!stats) return <Screen><ScreenTitle title="Report" /></Screen>;

  const pie = Object.entries(stats.byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({
      name: CATEGORY_LABEL[k as Category] ?? k,
      value: Number((v / 60).toFixed(1)),
      color: CATEGORY_COLOR[k as Category] ?? 'var(--hint)',
    }));

  const daily = stats.dailyPercent.map((d) => ({ day: d.date.slice(8), percent: d.percent }));
  const focus = stats.focusByHour.map((f) => ({ hour: `${f.hour}:00`, avg: f.avg }));
  const mockSeries = mocks.map((m) => ({ date: m.date.slice(5), ...m.scores }));
  const mockKeys = mockSeries.length > 0
    ? Object.keys(mockSeries[0] as Record<string, unknown>).filter((k) => k !== 'date')
    : [];

  const nothingYet = pie.length === 0 && daily.length === 0;

  return (
    <Screen>
      <ScreenTitle
        title="Report"
        subtitle={`${stats.from} - ${stats.to}`}
      />

      {nothingYet ? (
        <EmptyState
          icon={ChartBar}
          title="No data yet"
          body="Work through your schedule for a few days and your time split, completion rate and focus map will appear here."
        />
      ) : (
        <>
          <div className="flex items-baseline gap-2 pt-1">
            <span className="tabular text-[28px] font-semibold leading-none">{stats.totalDoneHours}</span>
            <span className="tabular text-[14px]" style={{ color: 'var(--hint)' }}>
              / {stats.totalPlannedHours} hours completed
            </span>
          </div>

          {pie.length > 0 && (
            <Section title="Time by category">
              <ResponsiveContainer width="100%" height={190}>
                <PieChart>
                  <Pie data={pie} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={2} strokeWidth={0}>
                    {pie.map((p) => <Cell key={p.name} fill={p.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => `${v} h`} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
                {pie.map((p) => (
                  <div key={p.name} className="flex items-center gap-2 text-[12px]">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span className="tabular" style={{ color: 'var(--hint)' }}>{p.value}h</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {daily.length > 0 && (
            <Section title="Daily completion">
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={daily} margin={{ top: 4, right: 0, bottom: 0, left: -24 }}>
                  <XAxis dataKey="day" tick={axis} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={axis} axisLine={false} tickLine={false} width={34} />
                  <Tooltip formatter={(v: number) => `${v}%`} />
                  <Bar dataKey="percent" radius={[4, 4, 0, 0]}>
                    {daily.map((d) => (
                      <Cell
                        key={d.day}
                        fill={d.percent >= 80 ? 'var(--ok)' : d.percent >= 40 ? 'var(--warn)' : 'var(--bad)'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Section>
          )}

          {focus.length > 0 && (
            <Section title="Focus map">
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={focus} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
                  <XAxis dataKey="hour" tick={axis} axisLine={false} tickLine={false} />
                  <YAxis domain={[1, 5]} tick={axis} axisLine={false} tickLine={false} width={30} />
                  <Tooltip />
                  <Line type="monotone" dataKey="avg" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
              <p className="mt-1 text-[12px]" style={{ color: 'var(--hint)' }}>
                Put your hardest work in your most focused hours.
              </p>
            </Section>
          )}

          {mockSeries.length > 0 && (
            <Section title="Mock test scores">
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={mockSeries} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
                  <XAxis dataKey="date" tick={axis} axisLine={false} tickLine={false} />
                  <YAxis tick={axis} axisLine={false} tickLine={false} width={34} />
                  <Tooltip />
                  {mockKeys.map((k, i) => (
                    <Line
                      key={k}
                      type="monotone"
                      dataKey={k}
                      stroke={['var(--accent)', 'var(--ok)', 'var(--warn)', 'var(--bad)'][i % 4]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </Section>
          )}

          {Object.keys(stats.skipReasons).length > 0 && (
            <Section title="Why blocks were skipped">
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(stats.skipReasons).map(([k, v]) => (
                  <div key={k} className="rounded-[var(--r-card)] p-3" style={{ background: 'var(--surface)' }}>
                    <div className="tabular text-[20px] font-semibold leading-none">{v}</div>
                    <div className="mt-1 text-[12px]" style={{ color: 'var(--hint)' }}>
                      {SKIP_LABEL[k] ?? k}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section title="AI analysis">
            {ai ? (
              <div className="space-y-3 rounded-[var(--r-card)] p-3.5 text-[13px] leading-snug" style={{ background: 'var(--surface)' }}>
                <p>{ai.summary}</p>
                {ai.wins.length > 0 && (
                  <div>
                    <p className="font-medium" style={{ color: 'var(--ok)' }}>Going well</p>
                    <ul className="ml-4 mt-1 list-disc space-y-0.5" style={{ color: 'var(--hint)' }}>
                      {ai.wins.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  </div>
                )}
                {ai.problems.length > 0 && (
                  <div>
                    <p className="font-medium" style={{ color: 'var(--warn)' }}>Problems</p>
                    <ul className="ml-4 mt-1 list-disc space-y-0.5" style={{ color: 'var(--hint)' }}>
                      {ai.problems.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  </div>
                )}
                {ai.recommendations.length > 0 && (
                  <div>
                    <p className="font-medium">Recommendations</p>
                    <ul className="ml-4 mt-1 list-disc space-y-0.5" style={{ color: 'var(--hint)' }}>
                      {ai.recommendations.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <Button full variant="secondary" icon={Sparkle} disabled={aiLoading} onClick={() => void loadAi()}>
                {aiLoading ? 'Analysing' : 'Get weekly analysis'}
              </Button>
            )}
          </Section>
        </>
      )}
    </Screen>
  );
}
