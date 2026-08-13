/**
 * Gemini model routing.
 *
 * Pro is expensive and preview-tier — use it only for heavy planning/analysis.
 * Every id is overridable through env so swapping models needs no code change.
 *
 * Model ids verified against ai.google.dev/gemini-api/docs/models (2026-08).
 */
export const MODELS = {
  /**
   * Full-day schedule generation. Defaults to Flash, not Pro: the Pro preview
   * has no free tier, so a free API key gets `429 ... limit: 0` on every call.
   * Set MODEL_PLANNER=gemini-3.1-pro-preview once billing is enabled.
   */
  planner: process.env.MODEL_PLANNER ?? 'gemini-3.6-flash',
  /** Weekly analysis. Same reasoning as the planner. */
  analyst: process.env.MODEL_ANALYST ?? 'gemini-3.6-flash',
  /** Plain chat / Q&A — fast, stable, cheap. */
  chat: process.env.MODEL_CHAT ?? 'gemini-3.6-flash',
  /** Small edits to an existing schedule. */
  edit: process.env.MODEL_EDIT ?? 'gemini-3.6-flash',
  /** Used when the primary model returns no usable output (safety block / empty). */
  fallback: process.env.MODEL_FALLBACK ?? 'gemini-3.5-flash',
} as const;

export type ModelRole = keyof typeof MODELS;

/** Gemini 3 `thinking_level` — maximum depth of the model's internal reasoning. */
export type ThinkingLevel = 'minimal' | 'low' | 'medium' | 'high';

export const THINKING: Record<ModelRole, ThinkingLevel> = {
  planner: 'high',
  analyst: 'high',
  chat: 'low',
  edit: 'medium',
  fallback: 'low',
};

export const MAX_TOKENS: Record<ModelRole, number> = {
  planner: 8000,
  analyst: 6000,
  chat: 1500,
  edit: 3000,
  fallback: 2000,
};
