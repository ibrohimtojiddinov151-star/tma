import type { ReactNode } from 'react';
import { ArrowClockwise, type Icon } from '@phosphor-icons/react';

export function Screen({ children }: { children: ReactNode }): JSX.Element {
  return <div className="mx-auto w-full max-w-[560px] px-4 pb-8">{children}</div>;
}

export function ScreenTitle({ title, subtitle, right }: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}): JSX.Element {
  return (
    <header className="flex items-start justify-between gap-3 pb-4 pt-5">
      <div className="min-w-0">
        <h1 className="text-[21px] font-semibold leading-tight tracking-[-0.01em]">{title}</h1>
        {subtitle && <p className="tabular mt-0.5 text-[13px]" style={{ color: 'var(--hint)' }}>{subtitle}</p>}
      </div>
      {right}
    </header>
  );
}

/** Skeletons match the shape of the content they replace, not a generic spinner. */
export function BlockSkeleton({ rows = 5 }: { rows?: number }): JSX.Element {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3 rounded-[var(--r-card)] p-3" style={{ background: 'var(--surface)' }}>
          <div className="skeleton h-9 w-10 shrink-0" />
          <div className="flex-1 space-y-2 py-0.5">
            <div className="skeleton h-3.5" style={{ width: `${58 + ((i * 13) % 34)}%` }} />
            <div className="skeleton h-2.5 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton(): JSX.Element {
  return <div className="skeleton h-[180px] w-full" aria-busy="true" />;
}

export function EmptyState({ icon: Glyph, title, body, action }: {
  icon: Icon;
  title: string;
  body?: string;
  action?: ReactNode;
}): JSX.Element {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <Glyph size={30} weight="light" style={{ color: 'var(--hint)' }} />
      <div>
        <p className="text-[15px] font-medium">{title}</p>
        {body && <p className="mt-1 text-[13px] leading-snug" style={{ color: 'var(--hint)' }}>{body}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

export function Button({
  children, onClick, variant = 'primary', disabled, full, icon: Glyph, size = 'md',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  full?: boolean;
  icon?: Icon;
  size?: 'sm' | 'md';
}): JSX.Element {
  const style: Record<ButtonVariant, React.CSSProperties> = {
    primary: { background: 'var(--accent)', color: 'var(--accent-text)' },
    secondary: { background: 'var(--fill-strong)', color: 'var(--text)' },
    quiet: { background: 'transparent', color: 'var(--hint)' },
    danger: { background: 'var(--fill)', color: 'var(--bad)' },
  };
  const pad = size === 'sm' ? 'h-9 px-3 text-[13px]' : 'h-11 px-4 text-[15px]';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={style[variant]}
      className={`inline-flex items-center justify-center gap-2 rounded-[var(--r-control)] font-medium
        disabled:opacity-40 ${pad} ${full ? 'w-full' : ''}`}
    >
      {Glyph && <Glyph size={17} weight="bold" />}
      {children}
    </button>
  );
}

export function Card({ children, onClick, rail, muted }: {
  children: ReactNode;
  onClick?: () => void;
  rail?: string;
  muted?: boolean;
}): JSX.Element {
  const inner = (
    <div className="relative overflow-hidden rounded-[var(--r-card)] p-3" style={{ background: 'var(--surface)' }}>
      {rail && <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: rail }} aria-hidden />}
      <div className={muted ? 'opacity-45' : undefined}>{children}</div>
    </div>
  );

  if (!onClick) return inner;
  return (
    <button type="button" onClick={onClick} className="block w-full text-left">
      {inner}
    </button>
  );
}

export function Notice({ tone = 'info', children, action }: {
  tone?: 'info' | 'warn' | 'error';
  children: ReactNode;
  action?: ReactNode;
}): JSX.Element {
  const color = { info: 'var(--accent)', warn: 'var(--warn)', error: 'var(--bad)' }[tone];
  return (
    <div
      className="rounded-[var(--r-card)] p-3 text-[13px] leading-snug"
      style={{ background: 'var(--fill)', borderLeft: `3px solid ${color}` }}
      role={tone === 'error' ? 'alert' : undefined}
    >
      {children}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function RetryBox({ message, onRetry }: { message: string; onRetry: () => void }): JSX.Element {
  return (
    <Notice
      tone="error"
      action={<Button size="sm" variant="secondary" icon={ArrowClockwise} onClick={onRetry}>Try again</Button>}
    >
      {message}
    </Notice>
  );
}

/** Thin progress rail. No filled background track behind a partial fill. */
export function Progress({ percent, color }: { percent: number; color?: string }): JSX.Element {
  return (
    <div
      className="h-[3px] w-full overflow-hidden rounded-full"
      style={{ background: 'var(--line)' }}
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%`, background: color ?? 'var(--accent)' }}
      />
    </div>
  );
}
