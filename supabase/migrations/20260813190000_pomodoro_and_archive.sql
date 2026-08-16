-- Pomodoro sessions run inside the bot: one row per focus or break interval.
create table if not exists public.pomodoro_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  block_id    uuid references public.blocks(id) on delete set null,
  phase       text not null check (phase in ('focus', 'short_break', 'long_break')),
  round       int  not null default 1,
  minutes     int  not null,
  started_at  timestamptz not null default now(),
  ends_at     timestamptz not null,
  status      text not null default 'running' check (status in ('running', 'done', 'stopped')),
  message_id  bigint,
  created_at  timestamptz not null default now()
);
create index if not exists pomodoro_user_idx on public.pomodoro_sessions(user_id, status);

alter table public.pomodoro_sessions enable row level security;
create policy pomodoro_own on public.pomodoro_sessions for all to authenticated
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

-- A day moves to 'archived' once it is over, so "today" never shows a stale list.
alter table public.schedules drop constraint if exists schedules_status_check;
alter table public.schedules
  add constraint schedules_status_check
  check (status in ('draft', 'active', 'completed', 'archived'));

-- Motivational nudges: remember what was sent so lines do not repeat.
create table if not exists public.nudges_sent (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  key        text not null,
  sent_at    timestamptz not null default now()
);
create index if not exists nudges_user_idx on public.nudges_sent(user_id, sent_at desc);

alter table public.nudges_sent enable row level security;
create policy nudges_own on public.nudges_sent for all to authenticated
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

-- Pomodoro preferences live on the user row.
alter table public.users add column if not exists pomodoro_focus  int not null default 25;
alter table public.users add column if not exists pomodoro_short  int not null default 5;
alter table public.users add column if not exists pomodoro_long   int not null default 15;
alter table public.users add column if not exists nudges_enabled  boolean not null default true;
