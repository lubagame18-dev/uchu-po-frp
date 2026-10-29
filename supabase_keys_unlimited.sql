/* «Учу по ФРП» — ключи без ограничения «5 ячеек».

   Что делает:
   1. Снимает ограничение slot 1..5 у таблиц ai_keys и img_keys (ключей может быть сколько угодно).
   2. Добавляет поля для умной ротации:
        weight          — вес ключа (больше = чаще используется),
        last_used       — когда ключ последний раз работал,
        fail_count      — сколько раз подряд падал,
        disabled_until  — до какого времени ключ «отдыхает» (после 402/401/429).

   Как применить: Supabase → SQL Editor → New query → вставить целиком → Run.
   Скрипт идемпотентный: повторный запуск ничего не сломает.
   Перед этим желательно выполнить supabase_update.sql (создаёт img_keys и функции).

   В конце — проверочные запросы: покажут, что ограничений на slot больше нет. */

-- 1. Снять любые check-ограничения, где упоминается slot, у ai_keys
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.ai_keys'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%slot%'
  loop
    execute 'alter table public.ai_keys drop constraint ' || quote_ident(c.conname);
  end loop;
end $$;

-- 2. То же для img_keys (если таблица уже создана)
do $$
declare c record;
begin
  if to_regclass('public.img_keys') is not null then
    for c in
      select conname
      from pg_constraint
      where conrelid = 'public.img_keys'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%slot%'
    loop
      execute 'alter table public.img_keys drop constraint ' || quote_ident(c.conname);
    end loop;
  end if;
end $$;

-- 3. Поля для ротации и здоровья ключей
alter table ai_keys add column if not exists weight int not null default 1;
alter table ai_keys add column if not exists last_used timestamptz;
alter table ai_keys add column if not exists fail_count int not null default 0;
alter table ai_keys add column if not exists disabled_until timestamptz;

do $$
begin
  if to_regclass('public.img_keys') is not null then
    alter table img_keys add column if not exists weight int not null default 1;
    alter table img_keys add column if not exists last_used timestamptz;
    alter table img_keys add column if not exists fail_count int not null default 0;
    alter table img_keys add column if not exists disabled_until timestamptz;
  end if;
end $$;

-- 4. Проверка: ограничений на slot быть не должно (пусто = хорошо)
select conrelid::regclass as таблица, conname, pg_get_constraintdef(oid) as ограничение
from pg_constraint
where conrelid in (to_regclass('public.ai_keys'), to_regclass('public.img_keys'))
  and contype = 'c';

-- 5. Проверка: поля на месте
select table_name as таблица, column_name as поле, data_type as тип
from information_schema.columns
where table_schema = 'public'
  and table_name in ('ai_keys', 'img_keys')
  and column_name in ('slot', 'weight', 'last_used', 'fail_count', 'disabled_until')
order by table_name, column_name;

-- 6. Проверка: можно завести шестую и сотую ячейку (вставка и удаление тестовой строки)
insert into ai_keys (slot, label, is_active) values (6, 'тест-6', false)
  on conflict (slot) do nothing;
insert into ai_keys (slot, label, is_active) values (100, 'тест-100', false)
  on conflict (slot) do nothing;
delete from ai_keys where slot in (6, 100) and label in ('тест-6', 'тест-100');
