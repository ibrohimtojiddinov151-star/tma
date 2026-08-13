-- TMA — Time Management Assistant : initial schema
create extension if not exists pgcrypto;

create table if not exists public.users (
  id            uuid primary key default gen_random_uuid(),
  telegram_id   bigint unique,
  first_name    text not null,
  last_name     text,
  phone         text not null unique,
  password_hash text not null,
  is_active     boolean not null default true,
  timezone      text not null default 'Asia/Tashkent',
  wake_time     time,
  sleep_time    time,
  notify_mode   text not null default 'message' check (notify_mode in ('message','voice','call')),
  goals         jsonb not null default '{}'::jsonb,
  paused_until  timestamptz,
  onboarded     boolean not null default false,
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.bot_sessions (
  telegram_id  bigint primary key,
  user_id      uuid references public.users(id) on delete cascade,
  state        text not null default 'awaiting_phone'
               check (state in ('awaiting_phone','awaiting_password','authenticated','locked')),
  temp_phone   text,
  attempts     int  not null default 0,
  locked_until timestamptz,
  data         jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now()
);

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null check (type in ('IELTS','SAT')),
  exam_date date, target_score text, current_score text,
  created_at timestamptz not null default now()
);
create index if not exists exams_user_idx on public.exams(user_id);

create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  status text not null default 'draft' check (status in ('draft','active','completed')),
  generated_by text not null default 'manual' check (generated_by in ('ai','manual','template')),
  rationale text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, date)
);
create index if not exists schedules_user_date_idx on public.schedules(user_id, date);

create table if not exists public.blocks (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.schedules(id) on delete cascade,
  start_time time not null, end_time time not null,
  title text not null,
  category text not null check (category in
    ('reading','listening','vocab','writing','speaking','sat_math','sat_rw',
     'course','commute','meal','exercise','rest','sleep')),
  notes text,
  notify boolean not null default true,
  locked boolean not null default false,
  status text not null default 'pending' check (status in ('pending','active','done','skipped')),
  actual_start timestamptz, actual_end timestamptz,
  focus_rating int check (focus_rating between 1 and 5),
  skip_reason text check (skip_reason in ('tired','distracted','other_task','too_long')),
  order_index int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists blocks_schedule_idx on public.blocks(schedule_id, order_index);

create table if not exists public.day_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  day_kind text check (day_kind in ('odd','even','weekend','custom')),
  blocks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists day_templates_user_idx on public.day_templates(user_id);

create table if not exists public.error_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  block_id uuid references public.blocks(id) on delete set null,
  section text not null, question_type text,
  what_went_wrong text, correct_approach text,
  created_at timestamptz not null default now()
);
create index if not exists error_log_user_idx on public.error_log(user_id, created_at desc);

create table if not exists public.vocab (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  word text not null, collocation text, meaning text, source text,
  ease real not null default 2.5,
  interval_days int not null default 0,
  repetitions int not null default 0,
  due_date date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists vocab_due_idx on public.vocab(user_id, due_date);

create table if not exists public.mock_tests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  exam_type text not null check (exam_type in ('IELTS','SAT')),
  date date not null, scores jsonb not null default '{}'::jsonb, notes text,
  created_at timestamptz not null default now()
);
create index if not exists mock_tests_user_idx on public.mock_tests(user_id, date desc);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null, model text,
  tokens_in int default 0, tokens_out int default 0, latency_ms int,
  created_at timestamptz not null default now()
);
create index if not exists ai_messages_user_idx on public.ai_messages(user_id, created_at desc);

create table if not exists public.pending_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  schedule_id uuid references public.schedules(id) on delete cascade,
  diff jsonb not null, rationale text,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','expired')),
  expires_at timestamptz not null default now() + interval '24 hours',
  created_at timestamptz not null default now()
);
create index if not exists pending_changes_user_idx on public.pending_changes(user_id, status);

create table if not exists public.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  block_id uuid references public.blocks(id) on delete cascade,
  fire_at timestamptz not null,
  type text not null check (type in ('pre','start','end','wake','escalation')),
  payload jsonb not null default '{}'::jsonb,
  sent boolean not null default false, attempts int not null default 0,
  job_key text unique,
  created_at timestamptz not null default now()
);
create index if not exists notification_jobs_fire_idx on public.notification_jobs(fire_at) where sent = false;

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  day date not null default current_date,
  calls int not null default 0, tokens_in int not null default 0, tokens_out int not null default 0,
  unique(user_id, day)
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger users_touch     before update on public.users       for each row execute function public.touch_updated_at();
create trigger schedules_touch before update on public.schedules   for each row execute function public.touch_updated_at();
create trigger sessions_touch  before update on public.bot_sessions for each row execute function public.touch_updated_at();
