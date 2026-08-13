import {
  CalendarBlank, ChartBar, ChatCircleText, GearSix, ListChecks, type Icon,
} from '@phosphor-icons/react';
import { haptic } from '../lib/format';

export type Tab = 'today' | 'calendar' | 'chat' | 'reports' | 'settings';

const ITEMS: Array<{ id: Tab; icon: Icon; label: string }> = [
  { id: 'today', icon: ListChecks, label: 'Today' },
  { id: 'calendar', icon: CalendarBlank, label: 'Calendar' },
  { id: 'chat', icon: ChatCircleText, label: 'Chat' },
  { id: 'reports', icon: ChartBar, label: 'Report' },
  { id: 'settings', icon: GearSix, label: 'Settings' },
];

export function Nav({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }): JSX.Element {
  return (
    <nav
      className="sticky bottom-0 z-10"
      style={{
        background: 'var(--bg)',
        borderTop: '1px solid var(--line)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="mx-auto grid max-w-[560px] grid-cols-5">
        {ITEMS.map(({ id, icon: Glyph, label }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => { onChange(id); haptic('light'); }}
              aria-current={active ? 'page' : undefined}
              className="flex flex-col items-center gap-1 py-2"
              style={{ color: active ? 'var(--accent)' : 'var(--hint)' }}
            >
              <Glyph size={21} weight={active ? 'fill' : 'regular'} />
              <span className="text-[10px] font-medium leading-none">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
