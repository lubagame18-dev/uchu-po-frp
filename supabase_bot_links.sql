-- Привязка чатов ботов к аккаунтам «Учу по ФРП»
create table if not exists public.bot_links (
  chat_id    text primary key,
  platform   text not null default 'tg',
  user_id    uuid not null,
  email      text,
  created_at timestamptz not null default now()
);
alter table public.bot_links enable row level security;
-- бот пишет через service_role (RLS не мешает); чтение пользователю не нужно