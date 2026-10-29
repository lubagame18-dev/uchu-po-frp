/* «Учу по ФРП» — догоняющая миграция Supabase.
   Живая база отстала от supabase.sql: не хватало промо-флага, лимитов картинок,
   таблицы img_keys и двух серверных функций.

   Как применить: Supabase → SQL Editor → New query → вставить целиком → Run.
   Скрипт идемпотентный: повторный запуск ничего не сломает. */

-- 1. profiles: промо-флаг (скидка 50%) и месячные лимиты листов с картинками
alter table profiles add column if not exists promo boolean not null default false;
alter table profiles add column if not exists img_month text;
alter table profiles add column if not exists img_used int default 0;

-- 2. Общие ключи для картинок (5 ячеек). Читает и пишет только сервер служебным ключом.
create table if not exists img_keys (
  slot int primary key check (slot between 1 and 5),
  label text,
  key text,
  base_url text,
  model text,
  is_active boolean not null default true,
  updated_at timestamptz default now()
);
alter table img_keys enable row level security;

-- 3. Атомарное списание запроса/токенов ИИ (чинит гонку при параллельных запросах)
create or replace function spend_ai(p_id uuid, p_tokens bigint, p_tok boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_tok then
    update profiles set tokens_used = coalesce(tokens_used, 0) + greatest(1, p_tokens) where id = p_id;
  else
    update profiles set ai_left = greatest(0, ai_left - 1) where id = p_id;
  end if;
end $$;
revoke all on function spend_ai(uuid, bigint, boolean) from public, anon, authenticated;

-- 4. Бесплатный тариф: проверить все ключи и списать разом, одной транзакцией
create or replace function free_use_bump(keys text[], lims int[], mon text, dry boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare i int; cur int; mn int := 2147483647; over_key text := null;
begin
  for i in 1 .. array_length(keys, 1) loop
    select coalesce(n, 0) into cur from free_usage where key = keys[i] and month = mon for update;
    cur := coalesce(cur, 0);
    if cur >= lims[i] then over_key := keys[i]; end if;
    mn := least(mn, lims[i] - cur);
  end loop;
  if over_key is not null then return jsonb_build_object('over', over_key); end if;
  if dry then return jsonb_build_object('left', mn); end if;
  for i in 1 .. array_length(keys, 1) loop
    insert into free_usage (key, month, n, updated_at) values (keys[i], mon, 1, now())
      on conflict (key, month) do update set n = free_usage.n + 1, updated_at = now();
  end loop;
  return jsonb_build_object('left', greatest(0, mn - 1));
end $$;
revoke all on function free_use_bump(text[], int[], text, boolean) from public, anon, authenticated;

-- 5. Проверка, что всё применилось
-- new columns (должно быть 3 строки):
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name in ('promo', 'img_month', 'img_used');

-- new functions (должно быть 2 строки):
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and proname in ('spend_ai', 'free_use_bump');

-- new table:
select table_name from information_schema.tables
where table_schema = 'public' and table_name = 'img_keys';
