# Перенос данных из старого Supabase в РФ

## До начала

- Новый Supabase уже развёрнут и доступен по `https://supa.uchu-po-frp.ru`.
- Старый проект **не удалён**.
- Сделан бэкап старого проекта.
- Сайт пока смотрит на старый `cloud`; `accounts` ещё пуст.
- Есть строка подключения к старой базе (Supabase → Project Settings → Database).

## 1. Дамп старой базы

```bash
export OLD_DB='postgresql://postgres:<password>@<host>:5432/postgres'
pg_dump "$OLD_DB" --no-owner --no-privileges -Fc -f old-public.dump
pg_dump "$OLD_DB" --schema=auth --no-owner --no-privileges -Fc -f old-auth.dump
```

Если провайдер не даёт прямой доступ, используйте Supabase CLI:

```bash
supabase db dump --db-url "$OLD_DB" -f old-schema.sql
```

## 2. Восстановление

```bash
export NEW_DB='postgresql://postgres:<new-password>@127.0.0.1:5432/postgres'
pg_restore --no-owner --no-privileges -d "$NEW_DB" old-public.dump
pg_restore --no-owner --no-privileges -d "$NEW_DB" old-auth.dump
```

Если схема `auth` уже создана Supabase, восстанавливайте только данные:

```bash
pg_restore --data-only --no-owner --no-privileges -d "$NEW_DB" old-auth.dump
```

## 3. Проверка

```sql
select count(*) from auth.users;
select count(*) from public.profiles;
select count(*) from public.lessons;
select count(*) from public.quizzes;
```

- Пользователь входит со старым паролем.
- Видит только свои уроки.
- Чужой `lesson_id` недоступен.
- Результаты тестов принадлежат владельцу.

## 4. Storage

Файлы Storage переносятся отдельно:

- через Supabase CLI / S3-совместимый клиент;
- или вручную: скачать объекты и загрузить в новый Storage.

После переноса проверьте публичные ссылки и права.

## 5. JWT-ключи

Рекомендуется **новый JWT_SECRET**. Тогда старые сессии сбросятся, а пользователи
просто войдут заново. Если оставить старый секрет, старые токены продолжат
работать — это удобнее, но менее безопасно.

## 6. Переключение сайта

1. Заполните `accounts` в `index.html`.
2. Задеплойте сайт.
3. Войдите тестовым аккаунтом.
4. Создайте и сохраните урок.
5. Проверьте экспорт и оплату.
6. Только после этого сообщите пользователям о переносе.

## 7. Откат

Если что-то не работает:

- верните `accounts` в пустое значение;
- сайт снова будет использовать старый `cloud`;
- не удаляйте старый проект, пока не пройдёт проверка.

## 8. После переноса

- Удалить ПДн из зарубежного проекта.
- Настроить бэкапы в РФ.
- Ограничить доступ к Studio.
- Обновить политику и согласия.
- Зафиксировать дату переноса.
