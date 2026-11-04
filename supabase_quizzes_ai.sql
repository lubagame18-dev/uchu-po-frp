-- «Учу по ФРП»: вопросы тестов, которые создаёт нейросеть.
-- Запустить ОДИН раз: Supabase → SQL Editor → New query → вставить → Run. Повторный запуск безопасен.

create table if not exists public.quiz_questions (
  quiz_id text primary key references public.quizzes(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.quiz_questions enable row level security;

drop policy if exists quiz_questions_own on public.quiz_questions;
create policy quiz_questions_own on public.quiz_questions for all to authenticated
  using (exists (select 1 from public.quizzes q where q.id = quiz_id and q.user_id = auth.uid()))
  with check (exists (select 1 from public.quizzes q where q.id = quiz_id and q.user_id = auth.uid()));
grant select, insert, update, delete on public.quiz_questions to authenticated;

-- ученик без входа получает только вопросы (не ответы на другие тесты и не список тестов)
create or replace function public.quiz_public(p_id text) returns jsonb
language sql security definer stable set search_path = public as $$
  select data from public.quiz_questions where quiz_id = p_id
$$;
revoke all on function public.quiz_public(text) from public;
grant execute on function public.quiz_public(text) to anon, authenticated;
