import { env } from '../config/env.js';
import { log } from '../lib/logger.js';

export interface CallResult {
  ok: boolean;
  providerId?: string;
  error?: string;
}

/** Provider-agnostic voice call interface — swap providers without touching callers. */
export interface CallProvider {
  readonly name: string;
  call(phone: string, message: string): Promise<CallResult>;
}

/** Bosqich 1-4: calls are not enabled; Telegram escalation is used instead. */
class NoopProvider implements CallProvider {
  readonly name = 'none';
  async call(phone: string): Promise<CallResult> {
    log.warn('call_skipped_provider_none', { phone: phone.slice(-4) });
    return { ok: false, error: 'No call provider configured (CALL_PROVIDER=none)' };
  }
}

/** Bosqich 5. Fill TWILIO_* in .env and set CALL_PROVIDER=twilio. */
class TwilioProvider implements CallProvider {
  readonly name = 'twilio';

  async call(phone: string, message: string): Promise<CallResult> {
    const sid = env.TWILIO_ACCOUNT_SID;
    const token = env.TWILIO_AUTH_TOKEN;
    const from = env.TWILIO_FROM_NUMBER;
    if (!sid || !token || !from) return { ok: false, error: 'Twilio credentials are not set' };

    const twiml = `<Response><Say language="ru-RU">${message}</Say></Response>`;
    const body = new URLSearchParams({ To: phone, From: from, Twiml: twiml });

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!res.ok) return { ok: false, error: `Twilio ${res.status}: ${await res.text()}` };
    const json = (await res.json()) as { sid?: string };
    return { ok: true, providerId: json.sid };
  }
}

export const callProvider: CallProvider =
  env.CALL_PROVIDER === 'twilio' ? new TwilioProvider() : new NoopProvider();
