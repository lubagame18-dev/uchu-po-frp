create table if not exists lessons (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table lessons enable row level security;
drop policy if exists own_lessons on lessons;
create policy own_lessons on lessons for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  plan text not null default 'free',
  ai_left int not null default 15,
  paid_until timestamptz,
  free_month text
);
alter table profiles add column if not exists email text;
alter table profiles enable row level security;
drop policy if exists own_profile_read on profiles;
create policy own_profile_read on profiles for select using (auth.uid() = id);

create table if not exists payments (
  order_id text primary key,
  user_id uuid references auth.users on delete set null,
  kind text,
  amount numeric,
  status text,
  created_at timestamptz not null default now()
);
alter table payments enable row level security;

-- профиль учителя (имя, школа, город, фото) — каждый видит и меняет только свой
create table if not exists user_info (id uuid primary key default auth.uid() references auth.users on delete cascade, name text, school text, city text, avatar text, updated_at timestamptz default now());
alter table user_info enable row level security;
drop policy if exists own_info on user_info;
create policy own_info on user_info for all using (auth.uid() = id) with check (auth.uid() = id);

-- материалы, которые учителя прикрепили у себя: отправить может любой вошедший, видит только автор сайта
create table if not exists site_admins (email text primary key);
alter table site_admins enable row level security;
drop policy if exists admin_self on site_admins;
create policy admin_self on site_admins for select using (email = auth.jwt()->>'email');
create table if not exists shared_materials (id text primary key, user_id uuid not null default auth.uid() references auth.users on delete cascade, email text, name text, title text, kind text, type text, subject text, grade int, topic text, text text, chars int, created_at timestamptz not null default now());
alter table shared_materials enable row level security;
drop policy if exists send_own on shared_materials;
create policy send_own on shared_materials for insert with check (auth.uid() = user_id);
drop policy if exists admin_read on shared_materials;
create policy admin_read on shared_materials for select using (exists (select 1 from site_admins a where a.email = auth.jwt()->>'email'));
drop policy if exists admin_del on shared_materials;
create policy admin_del on shared_materials for delete using (exists (select 1 from site_admins a where a.email = auth.jwt()->>'email'));
-- автор сайта: ВПИШИ СВОЮ почту (ту, которой входишь в кабинет). НЕ засевать всех пользователей!
-- Было опасно: `select email from auth.users` делает администраторами всех, кто успел зарегистрироваться.
-- insert into site_admins (email) values ('ВАША_ПОЧТА@example.com') on conflict do nothing;
-- Проверь состав: select * from site_admins;  лишние удали: delete from site_admins where email <> 'ВАША_ПОЧТА@example.com';

-- ключи DeepSeek (ячейки 1–5 из режима разработчика): политик нет — читает и пишет только сервер секретным ключом
create table if not exists ai_keys (slot int primary key check (slot between 1 and 5), label text, key text, base_url text, is_active boolean not null default true, updated_at timestamptz default now());
alter table ai_keys enable row level security;

-- промокод: отметка у учителя (скидка 50% на тарифы)
alter table profiles add column if not exists promo boolean not null default false;

-- промокоды (скидка 50%): видят и меняют только разработчики (site_admins), сервер проверяет секретным ключом
create table if not exists promo_codes (code text primary key, note text, active boolean not null default true, used_by text[] not null default '{}', created_at timestamptz not null default now());
alter table promo_codes enable row level security;
drop policy if exists promo_admin on promo_codes;
create policy promo_admin on promo_codes for all using (exists (select 1 from site_admins a where a.email = auth.jwt()->>'email')) with check (exists (select 1 from site_admins a where a.email = auth.jwt()->>'email'));
-- Промокоды НЕ хранить в репозитории: он публичный, и любой их прочитает и применит скидку.
-- Старые коды (FRP-…) были здесь в открытую — считать скомпрометированными: отключи их и заведи новые.
--   update promo_codes set active = false;   -- погасить все старые
--   insert into promo_codes (code, discount) values ('НОВЫЙ-КОД-1', 50) on conflict do nothing;  -- новые добавляй в дашборде Supabase
-- Коды раздавай из панели Supabase или через переменную PROMO_CODES на прокси, не коммить в git.

-- общая база материалов: загруженное разработчиками сразу видно всем учителям; читать может любой, менять — только разработчики
create table if not exists base_materials (id text primary key, name text, title text, kind text, type text, subject text, grade int, topic text, tags jsonb, text text, chars int, hash text, added_by text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
alter table base_materials enable row level security;
drop policy if exists base_read on base_materials;
create policy base_read on base_materials for select using (true);
drop policy if exists base_admin on base_materials;
create policy base_admin on base_materials for all using (exists (select 1 from site_admins a where a.email = auth.jwt()->>'email')) with check (exists (select 1 from site_admins a where a.email = auth.jwt()->>'email'));

-- правила сборки уроков («Обучение сайта»): читают все, меняют разработчики
create table if not exists site_rules (id text primary key, data jsonb not null, updated_by text, updated_at timestamptz not null default now());
alter table site_rules enable row level security;
drop policy if exists rules_read on site_rules;
create policy rules_read on site_rules for select using (true);
drop policy if exists rules_admin on site_rules;
create policy rules_admin on site_rules for all using (exists (select 1 from site_admins a where a.email = auth.jwt()->>'email')) with check (exists (select 1 from site_admins a where a.email = auth.jwt()->>'email'));

-- учёт токенов ИИ сайта по тарифу (сколько потрачено и сколько можно за месяц)
alter table profiles add column if not exists tokens_used bigint not null default 0;
alter table profiles add column if not exists tokens_limit bigint not null default 0;
-- бесплатный тариф: счёт уроков по кабинету, устройству и сети (только сервер)
create table if not exists free_usage (key text not null, month text not null, n int not null default 0, updated_at timestamptz default now(), primary key (key, month));
alter table free_usage enable row level security;

-- общие ключи: любая нейросеть — модель для каждой ячейки
alter table ai_keys add column if not exists model text;

-- ===== Промокоды: свой процент скидки у каждого кода и один код бесплатного доступа =====
alter table promo_codes add column if not exists discount int not null default 50;
alter table promo_codes add column if not exists free boolean not null default false;
create unique index if not exists promo_one_free on promo_codes (free) where free;
alter table profiles add column if not exists promo_pct int;
alter table profiles add column if not exists promo_free_code text;
-- кабинет узнаёт, действует ли бесплатный доступ, не видя самих кодов
create or replace function promo_free_ok() returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from profiles p join promo_codes c on c.code = p.promo_free_code where p.id = auth.uid() and c.free and c.active);
$$;
grant execute on function promo_free_ok() to authenticated;

-- Общие ключи для картинок (рабочие листы и презентации): 5 ячеек, читает только сервер
create table if not exists img_keys (slot int primary key check (slot between 1 and 5), label text, key text, base_url text, model text, is_active boolean not null default true, updated_at timestamptz default now());
alter table img_keys enable row level security;
-- Месячный лимит листов с картинками по тарифу
alter table profiles add column if not exists img_month text;
alter table profiles add column if not exists img_used int default 0;

-- ===== Атомарное списание (чинит гонку при параллельных запросах) =====
-- Списать запрос/токены у профиля одним действием (вместо «прочитал → записал»).
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
-- вызывает только сервер служебным ключом (service_role обходит RLS и ограничения grant)

-- Бесплатный тариф: проверить все ключи и списать разом, одной транзакцией (не обойти параллельными запросами).
-- Возвращает {"over": "<ключ>"} если лимит достигнут, иначе {"left": <минимальный остаток>}.
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
