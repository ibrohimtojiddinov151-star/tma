-- Yagona default foydalanuvchi: Tojiddinov Muhammad (+998935733108 / TMBB1974)
insert into public.users (
  first_name, last_name, phone, password_hash,
  timezone, wake_time, sleep_time, notify_mode, goals, onboarded
) values (
  'Muhammad', 'Tojiddinov', '+998935733108',
  crypt('TMBB1974', gen_salt('bf', 12)),
  'Asia/Tashkent', '06:00', '22:30', 'message',
  '{"reading":25,"listening":25,"vocab":20,"writing":10,"speaking":10,"sat_math":5,"sat_rw":5}'::jsonb,
  true
)
on conflict (phone) do nothing;

insert into public.exams (user_id, type, exam_date, target_score)
select u.id, 'IELTS', null, '7.5' from public.users u where u.phone = '+998935733108'
  and not exists (select 1 from public.exams e where e.user_id = u.id and e.type = 'IELTS');

insert into public.exams (user_id, type, exam_date, target_score)
select u.id, 'SAT', null, '1450' from public.users u where u.phone = '+998935733108'
  and not exists (select 1 from public.exams e where e.user_id = u.id and e.type = 'SAT');

insert into public.day_templates (user_id, name, day_kind, blocks)
select u.id, 'Toq kun', 'odd', '[
  {"start":"06:00","end":"07:00","title":"Nonushta va mashq","category":"exercise","notify":true},
  {"start":"07:00","end":"09:00","title":"IELTS Reading","category":"reading","notify":true},
  {"start":"09:15","end":"11:15","title":"SAT Math","category":"sat_math","notify":true},
  {"start":"11:30","end":"12:30","title":"Vocab","category":"vocab","notify":true},
  {"start":"12:30","end":"13:30","title":"Tushlik va dam","category":"meal","notify":false},
  {"start":"13:30","end":"15:00","title":"IELTS Listening","category":"listening","notify":true},
  {"start":"15:00","end":"15:30","title":"Yo''lga chiqish","category":"commute","notify":true},
  {"start":"16:00","end":"18:00","title":"Kurs","category":"course","notify":true},
  {"start":"18:00","end":"18:30","title":"Uyga qaytish","category":"commute","notify":true},
  {"start":"19:00","end":"21:00","title":"SAT Reading & Writing","category":"sat_rw","notify":true},
  {"start":"21:00","end":"22:00","title":"Xatolar tahlili va vocab takror","category":"vocab","notify":true},
  {"start":"22:30","end":"06:00","title":"Uyqu","category":"sleep","notify":true}
]'::jsonb
from public.users u where u.phone = '+998935733108'
  and not exists (select 1 from public.day_templates t where t.user_id = u.id and t.day_kind = 'odd');

insert into public.day_templates (user_id, name, day_kind, blocks)
select u.id, 'Juft kun', 'even', '[
  {"start":"06:00","end":"07:00","title":"Nonushta va mashq","category":"exercise","notify":true},
  {"start":"07:00","end":"09:00","title":"IELTS Reading","category":"reading","notify":true},
  {"start":"09:15","end":"11:15","title":"IELTS Listening","category":"listening","notify":true},
  {"start":"11:30","end":"12:30","title":"Vocab","category":"vocab","notify":true},
  {"start":"12:30","end":"13:30","title":"Tushlik va dam","category":"meal","notify":false},
  {"start":"13:30","end":"15:30","title":"SAT Math","category":"sat_math","notify":true},
  {"start":"15:45","end":"17:45","title":"SAT Reading & Writing","category":"sat_rw","notify":true},
  {"start":"17:45","end":"18:30","title":"Dam olish","category":"rest","notify":false},
  {"start":"18:30","end":"20:00","title":"IELTS Writing Task 2","category":"writing","notify":true},
  {"start":"20:15","end":"21:15","title":"Speaking mashq","category":"speaking","notify":true},
  {"start":"21:15","end":"22:00","title":"Xatolar tahlili","category":"vocab","notify":true},
  {"start":"22:30","end":"06:00","title":"Uyqu","category":"sleep","notify":true}
]'::jsonb
from public.users u where u.phone = '+998935733108'
  and not exists (select 1 from public.day_templates t where t.user_id = u.id and t.day_kind = 'even');
