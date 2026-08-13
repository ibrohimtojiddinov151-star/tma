export type Category =
  | 'reading' | 'listening' | 'vocab' | 'writing' | 'speaking'
  | 'sat_math' | 'sat_rw' | 'course' | 'commute' | 'meal'
  | 'exercise' | 'rest' | 'sleep';

export type BlockStatus = 'pending' | 'active' | 'done' | 'skipped';

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
  focus_rating: number | null;
  order_index: number;
}

export interface Progress {
  plannedMinutes: number;
  doneMinutes: number;
  donePercent: number;
  doneCount: number;
  skippedCount: number;
  totalCount: number;
}

export interface Schedule {
  id: string;
  date: string;
  status: 'draft' | 'active' | 'completed';
  generated_by: 'ai' | 'manual' | 'template';
  rationale: string | null;
  blocks: Block[];
  progress?: Progress;
}

export interface Me {
  id: string;
  first_name: string;
  phone: string;
  timezone: string;
  wake_time: string | null;
  sleep_time: string | null;
  notify_mode: 'message' | 'voice' | 'call';
  goals: Record<string, number>;
}

export interface Exam {
  id: string;
  type: 'IELTS' | 'SAT';
  exam_date: string | null;
  target_score: string | null;
  current_score: string | null;
}

export interface WeeklyStats {
  from: string;
  to: string;
  byCategory: Record<string, number>;
  dailyPercent: Array<{ date: string; percent: number }>;
  focusByHour: Array<{ hour: number; avg: number }>;
  totalPlannedHours: number;
  totalDoneHours: number;
  skipReasons: Record<string, number>;
}

export interface Diff {
  date: string;
  remove: Array<{ start: string; end: string; title: string }>;
  add: Array<{ start: string; end: string; title: string; category: Category }>;
  rationale: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
  proposal?: { pendingId: string; diff: Diff };
}

export interface VocabCard {
  id: string;
  word: string;
  meaning: string | null;
  collocation: string | null;
  interval_days: number;
}
