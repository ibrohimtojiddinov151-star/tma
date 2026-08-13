import { ArrowClockwise, PlugsConnected } from '@phosphor-icons/react';
import { apiBase } from '../lib/api';
import { Button, Notice, Screen } from '../components/ui';

/**
 * Shown when the backend cannot be reached at all. A raw "Xatolik (405)" tells
 * the user nothing: the real cause is almost always a missing VITE_API_URL on
 * the deployed build, or the local server not running.
 */
export function SetupNeeded({ detail, onRetry }: { detail?: string; onRetry: () => void }): JSX.Element {
  return (
    <Screen>
      <div className="flex flex-col items-center gap-4 px-2 pt-16 text-center">
        <PlugsConnected size={32} weight="light" style={{ color: 'var(--hint)' }} />
        <div>
          <h1 className="text-[18px] font-semibold">Cannot reach the server</h1>
          <p className="mx-auto mt-1.5 max-w-[38ch] text-[13px] leading-snug" style={{ color: 'var(--hint)' }}>
            The app loaded, but the backend was not found. It needs an API url to show your data.
          </p>
        </div>

        <Button icon={ArrowClockwise} onClick={onRetry}>Try again</Button>
      </div>

      <div className="mt-8 space-y-3 text-left">
        <Notice tone="warn">
          <p className="font-medium">Backend url: {apiBase || 'not configured'}</p>
          <p className="mt-1">
            <code>VITE_API_URL</code> is empty on this deployment. It is baked in at build time,
            so a redeploy is required after you set it.
          </p>
          {detail && <p className="mt-1.5 opacity-70">Error: {detail}</p>}
        </Notice>

        <div className="rounded-[var(--r-card)] p-3" style={{ background: 'var(--surface)' }}>
          <p className="mb-2 text-[13px] font-medium">How to fix it</p>
          <ol className="ml-4 list-decimal space-y-1.5 text-[13px]" style={{ color: 'var(--hint)' }}>
            <li>Keep the backend running: <code>npm run dev</code></li>
            <li>Expose it over HTTPS: <code>npx localtunnel --port 3000</code></li>
            <li>Run <code>npx vercel env add VITE_API_URL production</code> and paste that url</li>
            <li>Redeploy with <code>npx vercel --prod</code></li>
          </ol>
        </div>

        <p className="px-1 text-[12px] leading-snug" style={{ color: 'var(--hint)' }}>
          Until then everything still works in the bot: /today, /plan, /report.
        </p>
      </div>
    </Screen>
  );
}
