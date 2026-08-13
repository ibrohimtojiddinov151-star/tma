import { useEffect, useRef, useState } from 'react';
import { ArrowUp, ChatCircleText } from '@phosphor-icons/react';
import { api } from '../lib/api';
import type { ChatMessage } from '../lib/types';
import { ProposalCard } from '../components/ProposalCard';
import { haptic } from '../lib/format';
import { BlockSkeleton, EmptyState } from '../components/ui';

const SUGGESTIONS = [
  'I am tired today, shorten the evening blocks',
  'Give Reading more time',
  'What should I focus on tomorrow?',
];

export function Chat(): JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [decided, setDecided] = useState<Record<string, 'accepted' | 'rejected'>>({});
  const [pendingBusy, setPendingBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await api.messages();
        setMessages(res.messages);
      } catch {
        /* an empty history is a fine starting state */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  const send = async (text: string): Promise<void> => {
    const body = text.trim();
    if (!body || sending) return;
    setInput('');
    setSending(true);
    haptic('light');

    setMessages((m) => [...m, { id: `u-${Date.now()}`, role: 'user', content: body }]);

    try {
      const res = await api.chat(body);
      if (res.type === 'proposal') {
        setMessages((m) => [...m, {
          id: `p-${res.pendingId}`,
          role: 'assistant',
          content: '',
          proposal: { pendingId: res.pendingId, diff: res.diff },
        }]);
      } else {
        setMessages((m) => [...m, { id: `a-${Date.now()}`, role: 'assistant', content: res.answer }]);
      }
    } catch (e) {
      setMessages((m) => [...m, {
        id: `e-${Date.now()}`,
        role: 'assistant',
        content: e instanceof Error ? e.message : 'Something went wrong',
      }]);
    } finally {
      setSending(false);
    }
  };

  const decide = async (pendingId: string, accept: boolean): Promise<void> => {
    setPendingBusy(true);
    haptic(accept ? 'success' : 'light');
    try {
      if (accept) await api.acceptPending(pendingId);
      else await api.rejectPending(pendingId);
      setDecided((d) => ({ ...d, [pendingId]: accept ? 'accepted' : 'rejected' }));
      if (!accept) {
        setMessages((m) => [...m, {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: 'Fair enough. What did not work? Tell me and I will propose something else.',
        }]);
      }
    } finally {
      setPendingBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[560px] space-y-3 px-4 py-4">
          {loading ? (
            <BlockSkeleton rows={3} />
          ) : messages.length === 0 ? (
            <EmptyState
              icon={ChatCircleText}
              title="What do you want to change?"
              body="Ask for a schedule change and the AI proposes it first. Nothing is applied until you approve it."
            />
          ) : null}

          {messages.map((m) => {
            if (m.proposal) {
              const { pendingId, diff } = m.proposal;
              return (
                <ProposalCard
                  key={m.id}
                  diff={diff}
                  busy={pendingBusy}
                  decided={decided[pendingId]}
                  onAccept={() => void decide(pendingId, true)}
                  onReject={() => void decide(pendingId, false)}
                />
              );
            }
            const mine = m.role === 'user';
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className="max-w-[84%] whitespace-pre-wrap rounded-[var(--r-card)] px-3.5 py-2.5 text-[14px] leading-snug"
                  style={mine
                    ? { background: 'var(--accent)', color: 'var(--accent-text)' }
                    : { background: 'var(--surface)' }}
                >
                  {m.content}
                </div>
              </div>
            );
          })}

          {sending && (
            <div className="flex justify-start">
              <div className="rounded-[var(--r-card)] px-3.5 py-2.5" style={{ background: 'var(--surface)' }}>
                <span className="skeleton block h-3 w-24" />
              </div>
            </div>
          )}

          <div ref={bottom} />
        </div>
      </div>

      {messages.length === 0 && !loading && (
        <div className="mx-auto w-full max-w-[560px] px-4 pb-2">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void send(s)}
                className="shrink-0 whitespace-nowrap rounded-full px-3.5 text-[13px]"
                style={{ background: 'var(--fill-strong)', minHeight: 36 }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          background: 'var(--bg)',
          borderTop: '1px solid var(--line)',
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)',
        }}
      >
        <div className="mx-auto flex w-full max-w-[560px] gap-2 px-4 pt-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void send(input); }}
            placeholder="Write a message"
            aria-label="Message"
            className="h-11 flex-1 px-3.5 text-[15px]"
          />
          <button
            type="button"
            onClick={() => void send(input)}
            disabled={sending || !input.trim()}
            aria-label="Send"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--r-control)] disabled:opacity-30"
            style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}
          >
            <ArrowUp size={18} weight="bold" />
          </button>
        </div>
      </div>
    </div>
  );
}
