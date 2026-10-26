-- Подтверждение почты для старых аккаунтов. Выполнять в Supabase: SQL Editor → New query → Run.

-- 1. Посмотреть, кто зарегистрирован и кто подтвердил почту
select email, created_at, email_confirmed_at, last_sign_in_at
from auth.users
order by created_at;

-- 2. Снять подтверждение у всех, кроме вашей почты (замените адрес!). После этого такие люди
--    не смогут войти, пока не нажмут «Отправить письмо ещё раз» в окне входа и не откроют ссылку из письма.
update auth.users
set email_confirmed_at = null
where email_confirmed_at is not null
  and email <> 'lubagame18@gmail.com';

-- 3. Проверить результат
select count(*) filter (where email_confirmed_at is null) as без_подтверждения,
       count(*) filter (where email_confirmed_at is not null) as подтверждено
from auth.users;
