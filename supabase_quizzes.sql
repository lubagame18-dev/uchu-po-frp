-- «Учу по ФРП»: интерактивы для учеников (QR-код в конце презентации) и «Результаты тестов» в кабинете.
-- Запустить ОДИН раз: Supabase → SQL Editor → New query → вставить всё → Run. Повторный запуск безопасен.

create table if not exists public.quizzes (
  id text primary key check (id ~ '^[a-z0-9]{6,32}$'),   -- код в ссылке …?q=…
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  template text not null,                                  -- какой готовый интерактив (taras-bulba-2 и т. д.)
  title text,                                              -- тема урока
  created_at timestamptz not null default now()
);
alter table public.quizzes enable row level security;
drop policy if exists quizzes_own on public.quizzes;
create policy quizzes_own on public.quizzes for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.quizzes to authenticated;

create table if not exists public.quiz_results (
  id uuid primary key default gen_random_uuid(),
  quiz_id text not null references public.quizzes(id) on delete cascade,
  student text not null,
  klass text,
  score int,
  total int,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists quiz_results_quiz on public.quiz_results (quiz_id, created_at desc);
alter table public.quiz_results enable row level security;

-- есть ли такой интерактив (ученик не видит таблицу quizzes, поэтому проверка через функцию)
create or replace function public.quiz_exists(p_id text) returns boolean
language sql security definer stable set search_path = public as $$ select exists (select 1 from public.quizzes where id = p_id) $$;
revoke all on function public.quiz_exists(text) from public;
grant execute on function public.quiz_exists(text) to anon, authenticated;

-- ученик (без входа) может только отправить результат в существующий интерактив
drop policy if exists quiz_results_insert on public.quiz_results;
create policy quiz_results_insert on public.quiz_results for insert to anon, authenticated
  with check (char_length(student) between 3 and 80
              and coalesce(char_length(klass), 0) <= 20
              and pg_column_size(details) < 20000
              and public.quiz_exists(quiz_id));
-- учитель видит и удаляет результаты только своих интерактивов
drop policy if exists quiz_results_owner on public.quiz_results;
create policy quiz_results_owner on public.quiz_results for select to authenticated
  using (exists (select 1 from public.quizzes q where q.id = quiz_id and q.user_id = auth.uid()));
drop policy if exists quiz_results_owner_del on public.quiz_results;
create policy quiz_results_owner_del on public.quiz_results for delete to authenticated
  using (exists (select 1 from public.quizzes q where q.id = quiz_id and q.user_id = auth.uid()));
grant insert on public.quiz_results to anon, authenticated;
grant select, delete on public.quiz_results to authenticated;
