# Перенос данных из старого Supabase Cloud

Нужна строка подключения к старой базе (Supabase → Project Settings → Database →
Connection string / Direct connection) и доступ к новой базе на ВМ.

## Вариант A. Полный дамп (если есть доступ к базе)

На машине с `pg_dump` (можно временно на ВМ):

```bash
# старый Supabase — только нужные схемы
pg_dump "postgresql://postgres:ПАРОЛЬ@db.СТАРЫЙ_ПРОЕКТ.supabase.co:5432/postgres" \
  --no-owner --no-privileges --schema=public --schema=auth \
  -Fc -f uchu.dump

# новая база внутри docker
docker compose exec -T db pg_restore -U postgres -d postgres --no-owner --no-privileges < uchu.dump
```

Если `auth`-схема не восстанавливается из-за версии — переносите только `public`,
а пользователям предложите войти заново/сбросить пароль.

## Вариант B. Только данные сайта (проще и безопаснее)

Экспортируйте из старого Supabase таблицы:
`profiles`, `user_info`, `lessons`, `quizzes`, `quiz_results`, `quiz_questions`,
`payments`, `ai_keys`, `img_keys` (если есть).

В новом Supabase создайте те же таблицы (файлы `supabase.sql`, `supabase_quizzes.sql`,
`supabase_quizzes_ai.sql`, `supabase_keys_unlimited.sql` и т. д.), затем залейте CSV:

```bash
# пример для lessons
psql "$NEW_DB_URL" -c "\copy lessons from 'lessons.csv' csv header"
```

`user_info` и `profiles` привязаны к `auth.users.id`. Если пользователи регистрируются
заново, старые строки нужно либо удалить, либо обновить `id` на новые UUID.

## Переключение сайта

1. В `index.html`:
   ```js
   cloud: { url: "https://api.uchu-po-frp.ru", anonKey: "НОВЫЙ_ANON_KEY" }
   ```
2. В новом Supabase проверьте:
   - Auth → URL Configuration: `https://uchu-po-frp.ru` и redirect-адреса;
   - Email/SMS провайдеры;
   - подтверждение почты (если включено — письма должны уходить через SMTP).
3. Задеплойте сайт.
4. Проверьте: регистрация, вход, создание урока, скачивание, результаты тестов.
5. Только после проверки отключите старый проект Supabase.

## Вход по телефону

См. `README.md`, шаг 5. Хук `/sms-hook` уже есть в `uchu-function.zip`; нужны только
переменные `SMS_*` и адрес функции в Supabase Auth Hooks.

## Если нужна помощь

Для создания ВМ/переноса нужны доступ к Яндекс Облаку (или SSH к ВМ) и строка
подключения к старой базе. Без них можно подготовить только конфигурацию и скрипты.
