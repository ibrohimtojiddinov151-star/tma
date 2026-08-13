import { useState } from 'react';
import { ArrowLeft, ArrowRight, Phone, SignIn } from '@phosphor-icons/react';
import { ApiError, api, insideTelegram, setToken } from '../lib/api';
import { haptic } from '../lib/format';
import { Button, Notice } from '../components/ui';

export function Login({ onDone }: { onDone: () => void }): JSX.Element {
  const [step, setStep] = useState<'phone' | 'password'>('phone');
  const [phone, setPhone] = useState('+998');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    if (step === 'phone') {
      if (phone.replace(/\D/g, '').length < 9) {
        setError('Enter your full phone number');
        return;
      }
      setError('');
      setStep('password');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const res = await api.login(phone, password);
      setToken(res.token);
      haptic('success');
      onDone();
    } catch (e) {
      haptic('error');
      setError(e instanceof ApiError ? e.message : 'Sign in failed');
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[420px] flex-col justify-center px-6 py-10">
      <div className="mb-9">
        <h1 className="text-[26px] font-semibold leading-none tracking-[-0.02em]">TMA</h1>
        <p className="mt-1.5 text-[14px]" style={{ color: 'var(--hint)' }}>
          Time Management Assistant
        </p>
      </div>

      {step === 'phone' ? (
        <div>
          <label htmlFor="phone" className="mb-1.5 block text-[13px] font-medium">
            Phone number
          </label>
          <input
            id="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
            inputMode="tel"
            autoComplete="tel"
            placeholder="+998 90 123 45 67"
            className="tabular h-12 w-full px-4 text-[16px]"
          />
          <p className="mt-1.5 text-[12px]" style={{ color: 'var(--hint)' }}>
            The number you use in the bot.
          </p>
        </div>
      ) : (
        <div>
          <label htmlFor="password" className="mb-1.5 block text-[13px] font-medium">
            Password
          </label>
          <input
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
            type="password"
            autoComplete="current-password"
            autoFocus
            placeholder="••••••••"
            className="h-12 w-full px-4 text-[16px]"
          />
          <button
            type="button"
            onClick={() => { setStep('phone'); setError(''); }}
            className="mt-2 inline-flex items-center gap-1.5 text-[13px]"
            style={{ color: 'var(--hint)', minHeight: 0 }}
          >
            <ArrowLeft size={14} weight="bold" />
            {phone}
          </button>
        </div>
      )}

      {error && (
        <p className="mt-3 text-[13px]" style={{ color: 'var(--bad)' }} role="alert">
          {error}
        </p>
      )}

      <div className="mt-6">
        <Button
          full
          disabled={busy}
          onClick={() => void submit()}
          icon={step === 'phone' ? ArrowRight : SignIn}
        >
          {busy ? 'Checking' : step === 'phone' ? 'Continue' : 'Sign in'}
        </Button>
      </div>

      {insideTelegram() && (
        <div className="mt-6">
          <Notice tone="info">
            <span className="inline-flex items-start gap-2">
              <Phone size={15} weight="bold" className="mt-0.5 shrink-0" />
              <span>
                Sign in through the bot once and the app will recognise you from then on,
                without asking for a password. Send <code>/start</code> to the bot.
              </span>
            </span>
          </Notice>
        </div>
      )}
    </div>
  );
}
