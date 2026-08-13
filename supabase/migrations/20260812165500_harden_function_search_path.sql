-- Supabase security linter: pin search_path (0011_function_search_path_mutable)
alter function public.touch_updated_at() set search_path = '';
alter function public.current_app_user_id() set search_path = '';
