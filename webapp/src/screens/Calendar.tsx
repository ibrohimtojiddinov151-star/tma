import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarBlank, CaretLeft, CaretRight, Sparkle } from '@phosphor-icons/react';
import { api } from '../lib/api';
import type { Schedule } from '../lib/types';
import {
  CATEGORY_COLOR, CATEGORY_ICON, CATEGORY_LABEL, dayLabelFor, haptic, hhmm, todayISO,
} from '../lib/format';
import { BlockSkeleton, Button, Card, EmptyState, RetryBox, Screen, ScreenTitle } from '../components/ui';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function monthGrid(year: number, month: number): Array<string | null> {
  const offset = (new Date(year, month, 1).getDay() + 6) % 7; // Monday-first
  const days = new Date(year, month + 1, 0).getDate();
  const cells: Array<string | null> = Array<null>(offset).fill(null);
  for (let d = 1; d <= days; d += 1) {
    cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return cells;
}

/** Completion is encoded as fill opacity of the single accent, not a rainbow. */
function dayStyle(percent: number | undefined, selected: boolean, isToday: boolean): React.CSSProperties {
  const base: React.CSSProperties = {
    borderRadius: 'var(--r-control)',
    fontWeight: isToday ? 700 : 400,
  };
  if (selected) {
    return { ...base, background: 'var(--accent)', color: 'var(--accent-text)' };
  }
  if (percent === undefined) {
    return { ...base, color: 'var(--hint)' };
  }
  const opacity = percent >= 80 ? 0.9 : percent >= 40 ? 0.55 : percent > 0 ? 0.28 : 0.1;
  return {
    ...base,
    background: `color-mix(in srgb, var(--accent) ${opacity * 100}%, transparent)`,
    color: opacity > 0.5 ? 'var(--accent-text)' : 'var(--text)',
  };
}

export function Calendar(): JSX.Element {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [map, setMap] = useState<Record<string, Schedule>>({});
  const [selected, setSelected] = useState<string>(todayISO());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const cells = useMemo(() => monthGrid(year, month), [year, month]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const mm = String(month + 1).padStart(2, '0');
      const last = new Date(year, month + 1, 0).getDate();
      const res = await api.schedules(`${year}-${mm}-01`, `${year}-${mm}-${last}`);
      setMap(Object.fromEntries(res.schedules.map((s) => [s.date, s])));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load');
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { void load(); }, [load]);

  const shift = (n: number): void => {
    const d = new Date(year, month + n, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
    haptic('light');
  };

  const create = async (date: string): Promise<void> => {
    setBusy(true);
    haptic('medium');
    try {
      await api.generate(date);
      await load();
      haptic('success');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build the schedule');
    } finally {
      setBusy(false);
    }
  };

  const sel = map[selected];
  const monthName = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <Screen>
      <ScreenTitle
        title="Calendar"
        subtitle={monthName.charAt(0).toUpperCase() + monthName.slice(1)}
        right={
          <div className="flex shrink-0 gap-1">
            <button type="button" onClick={() => shift(-1)} aria-label="Previous month"
              className="flex h-11 w-11 items-center justify-center" style={{ color: 'var(--hint)' }}>
              <CaretLeft size={17} weight="bold" />
            </button>
            <button type="button" onClick={() => shift(1)} aria-label="Next month"
              className="flex h-11 w-11 items-center justify-center" style={{ color: 'var(--hint)' }}>
              <CaretRight size={17} weight="bold" />
            </button>
          </div>
        }
      />

      {error && <div className="mb-3"><RetryBox message={error} onRetry={() => void load()} /></div>}

      <div className="mb-1.5 grid grid-cols-7 gap-1 text-center text-[11px]" style={{ color: 'var(--hint)' }}>
        {WEEKDAYS.map((w) => <div key={w}>{w}</div>)}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((iso, i) => {
          if (!iso) return <div key={`pad-${i}`} />;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => { setSelected(iso); haptic('light'); }}
              className="tabular flex aspect-square items-center justify-center text-[13px]"
              style={{ ...dayStyle(map[iso]?.progress?.donePercent, selected === iso, iso === todayISO()), minHeight: 0 }}
              aria-pressed={selected === iso}
            >
              {Number(iso.slice(8))}
            </button>
          );
        })}
      </div>

      <section className="mt-7">
        <h2 className="mb-3 text-[15px] font-semibold">{dayLabelFor(selected)}</h2>

        {loading ? (
          <BlockSkeleton rows={3} />
        ) : sel && sel.blocks.length > 0 ? (
          <div className="space-y-2">
            {sel.blocks.map((b) => {
              const Glyph = CATEGORY_ICON[b.category];
              return (
                <Card key={b.id} rail={CATEGORY_COLOR[b.category]}>
                  <div className="flex items-center gap-3 pl-2">
                    <span className="tabular w-[38px] shrink-0 text-[13px]" style={{ color: 'var(--hint)' }}>
                      {hhmm(b.start_time)}
                    </span>
                    <Glyph size={15} style={{ color: CATEGORY_COLOR[b.category] }} className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-[14px]">{b.title}</span>
                    <span className="shrink-0 text-[11px]" style={{ color: 'var(--hint)' }}>
                      {CATEGORY_LABEL[b.category]}
                    </span>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={CalendarBlank}
            title="No schedule for this day"
            action={
              <Button icon={Sparkle} disabled={busy} onClick={() => void create(selected)}>
                {busy ? 'Building' : 'Build schedule'}
              </Button>
            }
          />
        )}
      </section>
    </Screen>
  );
}
