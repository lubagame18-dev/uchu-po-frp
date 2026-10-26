-- «Учу по ФРП»: проверка и закрытие дыр. Выполните в Supabase → SQL Editor по частям (каждый блок отдельно).

-- 1. КТО СЕЙЧАС РАЗРАБОТЧИК. Должна остаться только ваша почта. Старый скрипт делал админами ВСЕХ зарегистрированных.
select * from site_admins;
-- лишнее удалить (подставьте свою почту):
-- delete from site_admins where email <> 'ВАША_ПОЧТА@gmail.com';

-- 2. СТАРЫЕ ПРОМОКОДЫ были в открытом репозитории — погасить и завести новые в режиме разработчика (раздел «Промокоды»).
update promo_codes set active = false where code in ('FRP-D6D3-3DGP','FRP-8WRU-M5N4','FRP-5FGB-VKRZ','FRP-4PFR-FN8B','FRP-KKVX-B5GE','FRP-ADBR-GZSM','FRP-AJW9-LR47','FRP-7HZZ-B2BA','FRP-LZ82-4JQK','FRP-387R-BK3F');
-- проверьте, не раздавали ли они бесплатный доступ (free) кому-то лишнему:
select code, active, free, discount, used_by from promo_codes order by created_at;

-- 3. КТО ПОЛУЧИЛ БЕСПЛАТНЫЙ ДОСТУП ЧЕРЕЗ ПРОМОКОД (проверьте, что это те, кому вы его давали)
select email, plan, promo, promo_free_code, paid_until from profiles where promo or plan = 'promo' or promo_free_code is not null;

-- 4. Профили: пользователь может только ЧИТАТЬ свою строку (менять тариф и остаток ИИ может только сервер). Должна быть одна политика select.
select policyname, cmd from pg_policies where tablename = 'profiles';

-- 5. Присланные материалы: ограничение размера, чтобы нельзя было забить базу гигабайтами текста.
alter table shared_materials drop constraint if exists shared_len;
alter table shared_materials add constraint shared_len check (length(text) <= 400000) not valid;

-- 6. Уроки в облаке: ограничение размера одной записи (около 5 МБ)
alter table lessons drop constraint if exists lessons_size;
alter table lessons add constraint lessons_size check (pg_column_size(data) <= 5000000) not valid;
