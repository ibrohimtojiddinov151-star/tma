import { useCallback, useEffect, useState } from 'react';
import { Nav, type Tab } from './components/Nav';
import { Today } from './screens/Today';
import { Calendar } from './screens/Calendar';
import { Chat } from './screens/Chat';
import { Reports } from './screens/Reports';
import { Settings } from './screens/Settings';
import { Login } from './screens/Login';
import { SetupNeeded } from './screens/SetupNeeded';
import { ApiError, api, apiConfigured } from './lib/api';
import { BlockSkeleton, Screen } from './components/ui';

type AuthState =
  | { kind: 'checking' }
  | { kind: 'ready' }
  | { kind: 'needs-login' }
  | { kind: 'unreachable'; detail: string };

export default function App(): JSX.Element {
  const [tab, setTab] = useState<Tab>('today');
  const [auth, setAuth] = useState<AuthState>({ kind: 'checking' });

  /**
   * A session that already exists in the bot is reused here: the backend maps
   * verified Telegram initData to the logged-in bot session. So a user who has
   * signed in through the bot is never asked for a password again. The login
   * form only appears when the backend answers 401.
   */
  const check = useCallback(async () => {
    if (!apiConfigured()) {
      setAuth({ kind: 'unreachable', detail: 'VITE_API_URL sozlanmagan' });
      return;
    }
    setAuth({ kind: 'checking' });
    try {
      await api.me();
      setAuth({ kind: 'ready' });
    } catch (e) {
      if (e instanceof ApiError && e.isUnauthorized) setAuth({ kind: 'needs-login' });
      else setAuth({ kind: 'unreachable', detail: e instanceof Error ? e.message : 'Unknown error' });
    }
  }, []);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    tg?.ready();
    tg?.expand();
    void check();
  }, [check]);

  if (auth.kind === 'checking') {
    return (
      <Screen>
        <div className="pt-6" />
        <BlockSkeleton rows={6} />
      </Screen>
    );
  }

  if (auth.kind === 'unreachable') {
    return <SetupNeeded detail={auth.detail} onRetry={() => void check()} />;
  }

  if (auth.kind === 'needs-login') {
    return <Login onDone={() => void check()} />;
  }

  return (
    <div className="flex h-full flex-col">
      <main className="flex-1 overflow-y-auto">
        {tab === 'today' && <Today />}
        {tab === 'calendar' && <Calendar />}
        {tab === 'chat' && <Chat />}
        {tab === 'reports' && <Reports />}
        {tab === 'settings' && <Settings />}
      </main>
      <Nav tab={tab} onChange={setTab} />
    </div>
  );
}
