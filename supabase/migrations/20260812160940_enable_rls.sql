-- Row Level Security. Backend service_role kaliti bilan ishlaydi (RLS bypass).
-- Supabase JWT ishlatilsa, custom claim `app_user_id` bo'yicha filtr ishlaydi.

create or replace function public.current_app_user_id()
returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'app_user_id', '')::uuid
$$;

alter table public.users             enable row level security;
alter table public.bot_sessions      enable row level security;
alter table public.exams             enable row level security;
alter table public.schedules         enable row level security;
alter table public.blocks            enable row level security;
alter table public.day_templates     enable row level security;
alter table public.error_log         enable row level security;
alter table public.vocab             enable row level security;
alter table public.mock_tests        enable row level security;
alter table public.ai_messages       enable row level security;
alter table public.pending_changes   enable row level security;
alter table public.notification_jobs enable row level security;
alter table public.ai_usage          enable row level security;

create policy users_self on public.users for all to authenticated
  using (id = public.current_app_user_id()) with check (id = public.current_app_user_id());

create policy exams_own on public.exams for all to authenticated
  using (user_id = public.current_app_user_id()) with check (user_id = public.current_app_user_id());

create policy schedules_own on public.schedules for all to authenticated
  using (user_id = public.current_app_user_id()) with check (user_id = public.current_app_user_id());

create policy blocks_own on public.blocks for all to authenticated
  using (exists (select 1 from public.schedules s where s.id = blocks.schedule_id and s.user_id = public.current_app_user_id()))
  with check (exists (select 1 from public.schedules s where s.id = blocks.schedule_id and s.user_id = public.current_app_user_id()));

create policy day_templates_own on public.day_templates for all to authenticated
  using (user_id = public.current_app_user_id()) with check (user_id = public.current_app_user_id());

create policy error_log_own on public.error_log for all to authenticated
  using (user_id = public.current_app_user_id()) with check (user_id = public.current_app_user_id());

create policy vocab_own on public.vocab for all to authenticated
  using (user_id = public.current_app_user_id()) with check (user_id = public.current_app_user_id());

create policy mock_tests_own on public.mock_tests for all to authenticated
  using (user_id = public.current_app_user_id()) with check (user_id = public.current_app_user_id());

create policy ai_messages_own on public.ai_messages for all to authenticated
  using (user_id = public.current_app_user_id()) with check (user_id = public.current_app_user_id());

create policy pending_changes_own on public.pending_changes for all to authenticated
  using (user_id = public.current_app_user_id()) with check (user_id = public.current_app_user_id());

create policy notification_jobs_own on public.notification_jobs for all to authenticated
  using (user_id = public.current_app_user_id()) with check (user_id = public.current_app_user_id());

create policy ai_usage_own on public.ai_usage for all to authenticated
  using (user_id = public.current_app_user_id()) with check (user_id = public.current_app_user_id());

-- bot_sessions: policy yo'q => anon/authenticated uchun to'liq yopiq, faqat backend kiradi.
