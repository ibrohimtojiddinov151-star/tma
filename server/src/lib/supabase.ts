import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { env } from '../config/env.js';

/**
 * supabase-js builds a RealtimeClient in its constructor and needs a WebSocket
 * implementation, even though TMA never subscribes to realtime channels.
 * Node 22+ ships a global WebSocket; on Node 20 it does not exist, so we hand
 * supabase-js the `ws` implementation explicitly. Harmless on newer Node.
 */
const transport = (globalThis as { WebSocket?: unknown }).WebSocket ?? WebSocket;

/**
 * Service-role client. Bypasses RLS — never expose this key to the browser.
 * Per-user scoping is enforced in the service layer.
 */
export const db: SupabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: transport as never },
});

export function assertOk<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  if (res.data === null) throw new Error(`${what}: no data found`);
  return res.data;
}
