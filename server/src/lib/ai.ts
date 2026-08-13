import { GoogleGenAI } from '@google/genai';
import type { ZodType, ZodTypeDef } from 'zod';
import { env } from '../config/env.js';
import { MAX_TOKENS, MODELS, THINKING, type ModelRole, type ThinkingLevel } from '../config/models.js';
import { log } from './logger.js';
import { db } from './supabase.js';

const client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AskOptions {
  role: ModelRole;
  /** System instruction. Kept stable across calls so implicit caching can hit. */
  system: string;
  messages: AiMessage[];
  userId?: string;
  maxTokens?: number;
  /** Overrides the per-role default thinking level. */
  thinking?: ThinkingLevel;
  /** Force `application/json` output. Set by askJson(). */
  json?: boolean;
}

export interface AskResult {
  text: string;
  model: string;
  /** True when the primary model produced nothing usable and we fell back. */
  refused: boolean;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
}

export class DailyLimitError extends Error {
  constructor() {
    super("You have hit today's AI request limit. Try again tomorrow.");
    this.name = 'DailyLimitError';
  }
}

/**
 * Minimal structural view of an Interaction.
 * The SDK ships its own types, but field casing has shifted between releases —
 * reading defensively keeps us working across 2.3.x without pinning hard.
 */
interface InteractionLike {
  id?: string;
  output_text?: string;
  outputText?: string;
  steps?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  finish_reason?: string;
  finishReason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  usage_metadata?: { prompt_token_count?: number; candidates_token_count?: number };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

async function checkQuota(userId: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await db
    .from('ai_usage')
    .select('calls')
    .eq('user_id', userId)
    .eq('day', today)
    .maybeSingle();

  const calls = (data?.calls as number | undefined) ?? 0;
  if (calls >= env.AI_DAILY_CALL_LIMIT) throw new DailyLimitError();
}

async function recordUsage(userId: string | undefined, tokensIn: number, tokensOut: number): Promise<void> {
  if (!userId) return;
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await db
    .from('ai_usage')
    .select('id, calls, tokens_in, tokens_out')
    .eq('user_id', userId)
    .eq('day', today)
    .maybeSingle();

  if (data) {
    await db.from('ai_usage').update({
      calls: (data.calls as number) + 1,
      tokens_in: (data.tokens_in as number) + tokensIn,
      tokens_out: (data.tokens_out as number) + tokensOut,
    }).eq('id', data.id as string);
  } else {
    await db.from('ai_usage').insert({
      user_id: userId, day: today, calls: 1, tokens_in: tokensIn, tokens_out: tokensOut,
    });
  }
}

function textOf(res: InteractionLike): string {
  const direct = res.output_text ?? res.outputText;
  if (direct && direct.trim()) return direct.trim();

  // Fall back to walking the execution steps for model_output text blocks.
  const fromSteps = (res.steps ?? [])
    .filter((s) => s.type === 'model_output')
    .flatMap((s) => s.content ?? [])
    .filter((c) => c.type === 'text' && c.text)
    .map((c) => c.text as string)
    .join('\n')
    .trim();

  return fromSteps;
}

function usageOf(res: InteractionLike): { tokensIn: number; tokensOut: number } {
  return {
    tokensIn:
      res.usage?.input_tokens ??
      res.usage_metadata?.prompt_token_count ??
      res.usageMetadata?.promptTokenCount ??
      0,
    tokensOut:
      res.usage?.output_tokens ??
      res.usage_metadata?.candidates_token_count ??
      res.usageMetadata?.candidatesTokenCount ??
      0,
  };
}

/**
 * Gemini has no single "refusal" stop reason the way some APIs do — a blocked
 * or filtered response comes back as an empty output, optionally with a
 * SAFETY/PROHIBITED finish reason. Both cases are treated the same: retry on
 * the fallback model rather than showing the user an error.
 */
function isUnusable(text: string): boolean {
  return text.length === 0;
}

function blockReason(res: InteractionLike): string {
  return (res.finish_reason ?? res.finishReason ?? 'empty_output').toString();
}

/**
 * Flatten a short chat history into a single input string.
 *
 * The Interactions API can carry history server-side via
 * `previous_interaction_id`, but TMA already persists every turn in
 * `ai_messages`, so we stay stateless (`store: false`) and replay the last few
 * turns as a labelled transcript. Keeps the DB as the single source of truth.
 */
function buildInput(messages: AiMessage[]): string {
  if (messages.length === 1 && messages[0]) return messages[0].content;

  const history = messages.slice(0, -1);
  const last = messages[messages.length - 1];
  const transcript = history
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n');

  return `## CONVERSATION HISTORY\n${transcript}\n\n## CURRENT REQUEST\n${last?.content ?? ''}`;
}

async function callModel(model: string, role: ModelRole, opts: AskOptions): Promise<InteractionLike> {
  const request: Record<string, unknown> = {
    model,
    input: buildInput(opts.messages),
    system_instruction: opts.system,
    // Stateless: we manage history ourselves, and nothing is retained server-side.
    store: false,
    generation_config: {
      // Gemini 3 is tuned for temperature 1.0 — the docs warn against lowering it.
      max_output_tokens: opts.maxTokens ?? MAX_TOKENS[role],
      thinking_level: opts.thinking ?? THINKING[role],
    },
  };

  if (opts.json) {
    request.response_format = { type: 'text', mime_type: 'application/json' };
  }

  const api = client as unknown as {
    interactions: { create(req: Record<string, unknown>): Promise<InteractionLike> };
  };
  return api.interactions.create(request);
}

/**
 * Central Gemini wrapper.
 *
 * If the primary model returns nothing usable (safety filter, empty output),
 * we silently retry on the cheaper stable fallback model so the user never
 * sees an error.
 */
export async function ask(opts: AskOptions): Promise<AskResult> {
  if (!env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set. Fill it in your .env file.');
  }
  if (opts.userId) await checkQuota(opts.userId);

  const primary = MODELS[opts.role];
  const started = Date.now();

  let res = await callModel(primary, opts.role, opts);
  let text = textOf(res);
  let usedModel = primary;
  let refused = false;

  if (isUnusable(text)) {
    refused = true;
    log.warn('ai_unusable_response', {
      model: primary, role: opts.role, reason: blockReason(res), userId: opts.userId,
    });
    usedModel = MODELS.fallback;
    res = await callModel(usedModel, 'fallback', { ...opts, thinking: 'low' });
    text = textOf(res);
  }

  const latencyMs = Date.now() - started;
  const { tokensIn, tokensOut } = usageOf(res);

  log.info('ai_call', { model: usedModel, role: opts.role, tokensIn, tokensOut, latencyMs, refused });
  await recordUsage(opts.userId, tokensIn, tokensOut);

  if (!text) throw new Error('The AI returned nothing. Please try again in a moment.');

  return { text, model: usedModel, refused, tokensIn, tokensOut, latencyMs };
}

function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? raw).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON found in the AI response');
  return JSON.parse(candidate.slice(start, end + 1));
}

/**
 * Ask for structured output and validate with Zod.
 * `response_format: application/json` makes malformed output rare, but the
 * schema still has to be enforced — on a validation failure we retry exactly
 * once, feeding the errors back to the model.
 */
export async function askJson<T>(
  // ZodSchema<T> forces input and output to be the same type, which breaks for
  // any schema using .default(): its input has optional fields while its output
  // has them filled in. Only the output type matters here, so the input side is
  // left as `unknown`.
  schema: ZodType<T, ZodTypeDef, unknown>,
  opts: AskOptions,
  extraCheck?: (value: T) => string[],
): Promise<{ value: T; meta: AskResult }> {
  const jsonRule =
    '\n\nIMPORTANT: reply with a single JSON object and nothing else. ' +
    'No commentary, no markdown fences, no extra text.';

  let attempt = 0;
  let messages = [...opts.messages];
  let lastErr = '';

  while (attempt < 2) {
    const meta = await ask({ ...opts, json: true, system: opts.system + jsonRule, messages });
    try {
      const parsed = schema.parse(extractJson(meta.text));
      const problems = extraCheck?.(parsed) ?? [];
      if (problems.length > 0) throw new Error(problems.join('; '));
      return { value: parsed, meta };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      log.warn('ai_json_invalid', { attempt, error: lastErr });
      messages = [
        ...opts.messages,
        { role: 'assistant', content: meta.text },
        { role: 'user', content: `Your reply was rejected for these reasons:\n${lastErr}\n\nSend the corrected JSON again.` },
      ];
      attempt += 1;
    }
  }
  throw new Error(`The AI response failed validation: ${lastErr}`);
}
