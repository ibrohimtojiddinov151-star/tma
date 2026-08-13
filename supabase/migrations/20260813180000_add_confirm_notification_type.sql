-- 'confirm' fires 5 minutes before a block ends and asks whether it got done.
alter table public.notification_jobs drop constraint if exists notification_jobs_type_check;
alter table public.notification_jobs
  add constraint notification_jobs_type_check
  check (type in ('pre', 'start', 'confirm', 'end', 'wake', 'escalation'));
