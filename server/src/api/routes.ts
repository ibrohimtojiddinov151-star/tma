import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { db } from '../lib/supabase.js';
import { getSession, getUserById, verifyAppToken, issueAppToken, loginWithPassword, normalizePhone } from '../lib/auth.js';
import { verifyInitData } from './miniapp-auth.js';
import {
  computeProgress, computeStreak, getSchedule, getSchedulesInRange,
  saveSchedule, scheduleFromTemplate, setBlockStatus, setSkipReason,
} from '../services/schedules.js';
import { generateSchedule, acceptPendingChange, proposeChange, rejectPendingChange, chat } from '../services/planner.js';
import { collectWeeklyStats, weeklyReport, analyzeErrors } from '../services/reports.js';
import { dueCards, reviewCard, addWord } from '../services/vocab.js';
import { minutesBehind, rebuildRestOfDay } from '../services/recovery.js';
import { toIcs } from '../services/ics.js';
import { scheduleDay } from '../queue/scheduler.js';
import { BlockSchema } from '../lib/schemas.js';
import { addDaysISO, todayISO } from '../lib/time.js';
import type { User } from '../types/db.js';

async function authenticate(req: FastifyRequest): Promise<User | null> {
  const header = req.headers.authorization ?? '';

  if (header.startsWith('Bearer ')) {
    const userId = verifyAppToken(header.slice(7));
    if (userId) return getUserById(userId);
  }

  // Mini App: trust verified initData, then map telegram_id -> logged-in session.
  const initData = req.headers['x-telegram-init-data'];
  if (typeof initData === 'string' && initData.length > 0) {
    const tgUser = verifyInitData(initData);
    if (tgUser) {
      const session = await getSession(tgUser.id);
      if (session.state === 'authenticated' && session.user_id) return getUserById(session.user_id);
    }
  }
  return null;
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({ ok: true, ts: new Date().toISOString() }));

  /** Password login for the Mini App (same credentials as the bot). */
  app.post('/api/login', async (req, reply) => {
    const body = z.object({ phone: z.string(), password: z.string() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "phone and password are required" });

    const initData = req.headers['x-telegram-init-data'];
    const tgUser = typeof initData === 'string' ? verifyInitData(initData) : null;
    if (!tgUser) return reply.code(401).send({ error: 'Telegram verification failed' });

    const phone = normalizePhone(body.data.phone);
    if (!phone) return reply.code(400).send({ error: 'Invalid phone number' });

    const result = await loginWithPassword(tgUser.id, phone, body.data.password);
    if (!result.ok || !result.user) {
      return reply.code(401).send({ error: 'Wrong phone number or password', reason: result.reason });
    }
    return { token: issueAppToken(result.user.id), user: sanitize(result.user) };
  });

  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/api/') || req.url === '/api/login') return;
    const user = await authenticate(req);
    if (!user) return reply.code(401).send({ error: 'Authentication required' });
    (req as FastifyRequest & { user: User }).user = user;
  });

  const u = (req: FastifyRequest): User => (req as FastifyRequest & { user: User }).user;

  app.get('/api/me', async (req) => {
    const user = u(req);
    return { user: sanitize(user), streak: await computeStreak(user) };
  });

  app.patch('/api/me', async (req) => {
    const user = u(req);
    const body = z.object({
      wake_time: z.string().optional().nullable(),
      sleep_time: z.string().optional().nullable(),
      timezone: z.string().optional(),
      notify_mode: z.enum(['message', 'voice', 'call']).optional(),
      goals: z.record(z.number()).optional(),
    }).parse(req.body);

    const { data } = await db.from('users').update(body).eq('id', user.id).select('*').single();
    return { user: sanitize(data as User) };
  });

  app.get('/api/schedule/:date', async (req) => {
    const user = u(req);
    const { date } = req.params as { date: string };
    const s = await getSchedule(user.id, date);
    return { schedule: s, progress: s ? computeProgress(s.blocks) : null };
  });

  app.get('/api/schedules', async (req) => {
    const user = u(req);
    const q = z.object({ from: z.string(), to: z.string() }).parse(req.query);
    const list = await getSchedulesInRange(user.id, q.from, q.to);
    return {
      schedules: list.map((s) => ({ ...s, progress: computeProgress(s.blocks) })),
    };
  });

  app.post('/api/schedule/:date/generate', async (req) => {
    const user = u(req);
    const { date } = req.params as { date: string };
    const saved = await generateSchedule(user, date);
    await scheduleDay(user, saved);
    return { schedule: saved, progress: computeProgress(saved.blocks) };
  });

  app.post('/api/schedule/:date/from-template', async (req, reply) => {
    const user = u(req);
    const { date } = req.params as { date: string };
    const saved = await scheduleFromTemplate(user, date);
    if (!saved) return reply.code(404).send({ error: 'Template not found' });
    await scheduleDay(user, saved);
    return { schedule: saved, progress: computeProgress(saved.blocks) };
  });

  app.put('/api/schedule/:date', async (req) => {
    const user = u(req);
    const { date } = req.params as { date: string };
    const body = z.object({ blocks: z.array(BlockSchema) }).parse(req.body);
    const saved = await saveSchedule(user.id, date, body.blocks, 'manual');
    await scheduleDay(user, saved);
    return { schedule: saved, progress: computeProgress(saved.blocks) };
  });

  app.patch('/api/block/:id', async (req) => {
    const user = u(req);
    void user;
    const { id } = req.params as { id: string };
    const body = z.object({
      status: z.enum(['pending', 'active', 'done', 'skipped']).optional(),
      focus_rating: z.number().int().min(1).max(5).optional(),
      skip_reason: z.enum(['tired', 'distracted', 'other_task', 'too_long']).optional(),
      locked: z.boolean().optional(),
    }).parse(req.body);

    if (body.locked !== undefined) await db.from('blocks').update({ locked: body.locked }).eq('id', id);
    if (body.status) {
      await setBlockStatus(id, body.status, body.focus_rating ? { focus_rating: body.focus_rating } : {});
    }
    if (body.skip_reason) await setSkipReason(id, body.skip_reason);
    return { ok: true };
  });

  /** AI chat + schedule-edit proposals. Nothing is written until accepted. */
  app.post('/api/chat', async (req) => {
    const user = u(req);
    const body = z.object({ message: z.string().min(1), date: z.string().optional() }).parse(req.body);
    const date = body.date ?? todayISO(user.timezone);

    const editHint = /(qisqartir|ko'chir|almashtir|qo'sh|olib tashla|o'zgartir|surib)/i;
    if (editHint.test(body.message)) {
      const proposal = await proposeChange(user, date, body.message);
      if (proposal) {
        return { type: 'proposal', pendingId: proposal.pending.id, diff: proposal.diff };
      }
    }

    const { data: history } = await db.from('ai_messages').select('role, content')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(10);
    const past = ((history ?? []) as Array<{ role: 'user' | 'assistant'; content: string }>).reverse();

    const answer = await chat(user, body.message, past);
    await db.from('ai_messages').insert([
      { user_id: user.id, role: 'user', content: body.message },
      { user_id: user.id, role: 'assistant', content: answer },
    ]);
    return { type: 'text', answer };
  });

  app.get('/api/messages', async (req) => {
    const user = u(req);
    const { data } = await db.from('ai_messages').select('id, role, content, created_at')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(50);
    return { messages: ((data ?? []) as unknown[]).reverse() };
  });

  app.post('/api/pending/:id/accept', async (req, reply) => {
    const user = u(req);
    const { id } = req.params as { id: string };
    const saved = await acceptPendingChange(user, id);
    if (!saved) return reply.code(410).send({ error: 'Proposal expired' });
    await scheduleDay(user, saved);
    return { schedule: saved, progress: computeProgress(saved.blocks) };
  });

  app.post('/api/pending/:id/reject', async (req) => {
    const user = u(req);
    const { id } = req.params as { id: string };
    await rejectPendingChange(user, id);
    return { ok: true };
  });

  app.get('/api/report/weekly', async (req) => {
    const user = u(req);
    const withAi = (req.query as { ai?: string }).ai === '1';
    if (!withAi) return { stats: await collectWeeklyStats(user) };
    const { stats, ai } = await weeklyReport(user);
    return { stats, ai };
  });

  app.get('/api/report/errors', async (req) => {
    const user = u(req);
    return { patterns: await analyzeErrors(user) };
  });

  app.get('/api/recovery', async (req) => {
    const user = u(req);
    return { minutesBehind: await minutesBehind(user) };
  });

  app.post('/api/recovery/rebuild', async (req, reply) => {
    const user = u(req);
    const saved = await rebuildRestOfDay(user);
    if (!saved) return reply.code(404).send({ error: 'No schedule for today' });
    await scheduleDay(user, saved);
    return { schedule: saved, progress: computeProgress(saved.blocks) };
  });

  app.get('/api/vocab/due', async (req) => {
    const user = u(req);
    return { cards: await dueCards(user, 20) };
  });

  app.post('/api/vocab', async (req) => {
    const user = u(req);
    const body = z.object({
      word: z.string().min(1), meaning: z.string().optional(),
      collocation: z.string().optional(), source: z.string().optional(),
    }).parse(req.body);
    await addWord(user.id, body.word, body.meaning, body.collocation, body.source);
    return { ok: true };
  });

  app.post('/api/vocab/:id/review', async (req) => {
    const { id } = req.params as { id: string };
    const body = z.object({ quality: z.number().int().min(0).max(5) }).parse(req.body);
    return { card: await reviewCard(id, body.quality) };
  });

  app.get('/api/errors', async (req) => {
    const user = u(req);
    const { data } = await db.from('error_log').select('*')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(100);
    return { entries: data ?? [] };
  });

  app.post('/api/errors', async (req) => {
    const user = u(req);
    const body = z.object({
      section: z.string(), question_type: z.string().optional(),
      what_went_wrong: z.string().optional(), correct_approach: z.string().optional(),
      block_id: z.string().uuid().optional(),
    }).parse(req.body);
    await db.from('error_log').insert({ user_id: user.id, ...body });
    return { ok: true };
  });

  app.get('/api/mock-tests', async (req) => {
    const user = u(req);
    const { data } = await db.from('mock_tests').select('*')
      .eq('user_id', user.id).order('date', { ascending: true });
    return { tests: data ?? [] };
  });

  app.post('/api/mock-tests', async (req) => {
    const user = u(req);
    const body = z.object({
      exam_type: z.enum(['IELTS', 'SAT']), date: z.string(),
      scores: z.record(z.number()), notes: z.string().optional(),
    }).parse(req.body);
    await db.from('mock_tests').insert({ user_id: user.id, ...body });
    return { ok: true };
  });

  app.get('/api/exams', async (req) => {
    const user = u(req);
    const { data } = await db.from('exams').select('*').eq('user_id', user.id);
    return { exams: data ?? [] };
  });

  app.patch('/api/exams/:id', async (req) => {
    const { id } = req.params as { id: string };
    const body = z.object({
      exam_date: z.string().nullable().optional(),
      target_score: z.string().optional(),
      current_score: z.string().optional(),
    }).parse(req.body);
    await db.from('exams').update(body).eq('id', id);
    return { ok: true };
  });

  /** .ics export for Google Calendar. */
  app.get('/api/export.ics', async (req, reply) => {
    const user = u(req);
    const today = todayISO(user.timezone);
    const list = await getSchedulesInRange(user.id, addDaysISO(today, -7, user.timezone), addDaysISO(today, 30, user.timezone));
    reply.header('Content-Type', 'text/calendar; charset=utf-8');
    reply.header('Content-Disposition', 'attachment; filename="tma.ics"');
    return toIcs(list, user.timezone);
  });
}

function sanitize(user: User): Omit<User, 'password_hash'> {
  const { password_hash: _ignored, ...rest } = user;
  return rest;
}
