const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

let token: string | null = null;

export function setToken(t: string | null): void {
  token = t;
}

function initData(): string {
  return window.Telegram?.WebApp?.initData ?? '';
}

export function insideTelegram(): boolean {
  return initData().length > 0;
}

/**
 * True when the app is served from a real host but no backend URL was compiled
 * in. In that case every call would hit the static host and fail with 405 or
 * 404, so we surface a setup screen instead of a meaningless error code.
 */
export function apiConfigured(): boolean {
  if (BASE.length > 0) return true;
  const { hostname } = window.location;
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

export const apiBase = BASE;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }

  /** Reachable backend that says "you are not logged in". */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** Network failure or a response from something that is not our API. */
  get isUnreachable(): boolean {
    return this.status === 0 || this.status === 404 || this.status === 405;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!apiConfigured()) {
    throw new ApiError(0, 'Backend URL is not configured');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Telegram-Init-Data': initData(),
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(0, 'Could not reach the server');
  }

  if (!res.ok) {
    let msg = `Server error (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch {
      /* non-JSON response, keep the default message */
    }
    throw new ApiError(res.status, msg);
  }

  return (await res.json()) as T;
}

type Me = import('./types').Me;
type Schedule = import('./types').Schedule;
type Progress = import('./types').Progress;
type Diff = import('./types').Diff;
type Exam = import('./types').Exam;
type WeeklyStats = import('./types').WeeklyStats;
type ChatMessage = import('./types').ChatMessage;
type VocabCard = import('./types').VocabCard;

export interface AiSummary {
  summary: string;
  wins: string[];
  problems: string[];
  recommendations: string[];
}

export const api = {
  login: (phone: string, password: string) =>
    request<{ token: string; user: Me }>('/api/login', {
      method: 'POST',
      body: JSON.stringify({ phone, password }),
    }),

  me: () => request<{ user: Me; streak: number }>('/api/me'),

  updateMe: (patch: Record<string, unknown>) =>
    request<{ user: Me }>('/api/me', { method: 'PATCH', body: JSON.stringify(patch) }),

  schedule: (date: string) =>
    request<{ schedule: Schedule | null; progress: Progress | null }>(`/api/schedule/${date}`),

  schedules: (from: string, to: string) =>
    request<{ schedules: Schedule[] }>(`/api/schedules?from=${from}&to=${to}`),

  generate: (date: string) =>
    request<{ schedule: Schedule; progress: Progress }>(`/api/schedule/${date}/generate`, { method: 'POST' }),

  fromTemplate: (date: string) =>
    request<{ schedule: Schedule }>(`/api/schedule/${date}/from-template`, { method: 'POST' }),

  patchBlock: (id: string, patch: Record<string, unknown>) =>
    request<{ ok: true }>(`/api/block/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  chat: (message: string, date?: string) =>
    request<
      | { type: 'text'; answer: string }
      | { type: 'proposal'; pendingId: string; diff: Diff }
    >('/api/chat', { method: 'POST', body: JSON.stringify({ message, date }) }),

  messages: () => request<{ messages: ChatMessage[] }>('/api/messages'),

  acceptPending: (id: string) =>
    request<{ schedule: Schedule }>(`/api/pending/${id}/accept`, { method: 'POST' }),

  rejectPending: (id: string) =>
    request<{ ok: true }>(`/api/pending/${id}/reject`, { method: 'POST' }),

  weekly: (withAi = false) =>
    request<{ stats: WeeklyStats; ai?: AiSummary }>(`/api/report/weekly${withAi ? '?ai=1' : ''}`),

  exams: () => request<{ exams: Exam[] }>('/api/exams'),

  patchExam: (id: string, patch: Record<string, unknown>) =>
    request<{ ok: true }>(`/api/exams/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  mockTests: () =>
    request<{ tests: Array<{ id: string; exam_type: string; date: string; scores: Record<string, number> }> }>('/api/mock-tests'),

  vocabDue: () => request<{ cards: VocabCard[] }>('/api/vocab/due'),

  reviewVocab: (id: string, quality: number) =>
    request<{ card: VocabCard | null }>(`/api/vocab/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ quality }),
    }),

  recovery: () => request<{ minutesBehind: number }>('/api/recovery'),

  rebuild: () => request<{ schedule: Schedule }>('/api/recovery/rebuild', { method: 'POST' }),
};
