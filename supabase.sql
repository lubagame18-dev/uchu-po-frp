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
