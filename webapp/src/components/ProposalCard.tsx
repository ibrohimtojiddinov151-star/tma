import { Check, Minus, Plus, X } from '@phosphor-icons/react';
import type { Diff } from '../lib/types';
import { Button } from './ui';

/**
 * Nothing in this card is applied to the schedule until "Apply" is pressed.
 * That rule is enforced on the server too - this is only the surface.
 */
export function ProposalCard({
  diff, onAccept, onReject, decided, busy,
}: {
  diff: Diff;
  onAccept: () => void;
  onReject: () => void;
  decided?: 'accepted' | 'rejected';
  busy?: boolean;
}): JSX.Element {
  return (
    <div
      className="rounded-[var(--r-card)] p-3.5"
      style={{ background: 'var(--surface)', border: '1px solid var(--line-strong)' }}
    >
      <p className="mb-2.5 text-[13px] font-semibold">Proposed change</p>

      <div className="tabular space-y-1 text-[13px]">
        {diff.remove.map((r, i) => (
          <div key={`r${i}`} className="flex items-start gap-1.5" style={{ color: 'var(--bad)' }}>
            <Minus size={13} weight="bold" className="mt-1 shrink-0" />
            <span>{r.start}-{r.end} {r.title}</span>
          </div>
        ))}
        {diff.add.map((a, i) => (
          <div key={`a${i}`} className="flex items-start gap-1.5" style={{ color: 'var(--ok)' }}>
            <Plus size={13} weight="bold" className="mt-1 shrink-0" />
            <span>{a.start}-{a.end} {a.title}</span>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[13px] leading-snug" style={{ color: 'var(--hint)' }}>
        {diff.rationale}
      </p>

      {decided ? (
        <p className="mt-3 flex items-center gap-1.5 text-[13px]" style={{ color: 'var(--hint)' }}>
          {decided === 'accepted'
            ? <><Check size={14} weight="bold" style={{ color: 'var(--ok)' }} /> Applied</>
            : <><X size={14} weight="bold" /> Dismissed</>}
        </p>
      ) : (
        <div className="mt-3.5 flex gap-2">
          <Button full icon={Check} disabled={busy} onClick={onAccept}>Apply</Button>
          <Button full variant="secondary" icon={X} disabled={busy} onClick={onReject}>No</Button>
        </div>
      )}
    </div>
  );
}
