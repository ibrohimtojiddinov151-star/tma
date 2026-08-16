export type NotifyMode = 'message' | 'voice' | 'call';
export type BlockStatus = 'pending' | 'active' | 'done' | 'skipped';
export type ScheduleStatus = 'draft' | 'active' | 'completed' | 'archived';
export type SkipReason = 'tired' | 'distracted' | 'other_task' | 'too_long';

export type Category =
  | 'reading' | 'listening' | 'vocab' | 'writing' | 'speaking'
  | 'sat_math' | 'sat_rw' | 'course' | 'commute' | 'meal'
  | 'exercise' | 'rest' | 'sleep';

export interface User {
  id: string;
  telegram_id: number | null;
  first_name: string;
  last_name: string | null;
  phone: string;
  password_hash: string;
  is_active: boolean;
  timezone: string;
  wake_time: string | null;
  sleep_time: string | null;
  notify_mode: NotifyMode;
  goals: Record<string, number>;
  paused_until: string | null;
  onboarded: boolean;
  last_login_at: string | null;
  created_at: string;
  pomodoro_focus: number;
  pomodoro_short: number;
  pomodoro_long: number;
  nudges_enabled: boolean;
}

export type PomodoroPhase = 'focus' | 'short_break' | 'long_break';

export interface PomodoroSession {
  id: string;
  user_id: string;
  block_id: string | null;
  phase: PomodoroPhase;
  round: number;
  minutes: number;
  started_at: string;
  ends_at: string;
  status: 'running' | 'done' | 'stopped';
  message_id: number | null;
}

export type BotSessionState = 'awaiting_phone' | 'awaiting_password' | 'authenticated' | 'locked';

export interface BotSession {
  telegram_id: number;
  user_id: string | null;
  state: BotSessionState;
  temp_phone: string | null;
  attempts: number;
  locked_until: string | null;
  data: Record<string, unknown>;
}

export interface Exam {
  id: string;
  user_id: string;
  type: 'IELTS' | 'SAT';
  exam_date: string | null;
  target_score: string | null;
  current_score: string | null;
}

export interface Schedule {
  id: string;
  user_id: string;
  date: string;
  status: ScheduleStatus;
  generated_by: 'ai' | 'manual' | 'template';
  rationale: string | null;
}

export interface Block {
  id: string;
  schedule_id: string;
  start_time: string;
  end_time: string;
  title: string;
  category: Category;
  notes: string | null;
  notify: boolean;
  locked: boolean;
  status: BlockStatus;
  actual_start: string | null;
  actual_end: string | null;
  focus_rating: number | null;
  skip_reason: SkipReason | null;
  order_index: number;
}

export interface TemplateBlock {
  start: string;
  end: string;
  title: string;
  category: Category;
  notes?: string;
  notify?: boolean;
}

export interface DayTemplate {
  id: string;
  user_id: string;
  name: string;
  day_kind: 'odd' | 'even' | 'weekend' | 'custom' | null;
  blocks: TemplateBlock[];
}

export interface PendingChange {
  id: string;
  user_id: string;
  schedule_id: string | null;
  diff: ScheduleDiff;
  rationale: string | null;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  expires_at: string;
}

export interface ScheduleDiff {
  date: string;
  remove: Array<{ id?: string; start: string; end: string; title: string }>;
  add: Array<{ start: string; end: string; title: string; category: Category; notes?: string; notify?: boolean }>;
}

export interface VocabCard {
  id: string;
  user_id: string;
  word: string;
  collocation: string | null;
  meaning: string | null;
  source: string | null;
  ease: number;
  interval_days: number;
  repetitions: number;
  due_date: string;
}

export interface MockTest {
  id: string;
  user_id: string;
  exam_type: 'IELTS' | 'SAT';
  date: string;
  scores: Record<string, number>;
  notes: string | null;
}

export interface ErrorLogEntry {
  id: string;
  user_id: string;
  block_id: string | null;
  section: string;
  question_type: string | null;
  what_went_wrong: string | null;
  correct_approach: string | null;
  created_at: string;
}
