# Отчёт: комплект переноса аккаунтов в РФ

Дата: 07.11.2026. Ветка codex/rf-migration, база актуализирована до main 1acc1f68.
На старте оставались локальные P0-исправления деплоя из предыдущей задачи;
они сохранены. После fetch обнаружен и изучен новый deploy/supabase-rf.

## Сделано

- bootstrap: закрепление upstream, установка зависимостей, одноразовая генерация,
  секреты не выводятся, localhost-порты, Caddy и Studio с Basic Auth.
- backup/restore: закрытые файлы, env и Storage, SHA256, явные guards,
  остановка writers, проверки кодов возврата/транзакция восстановления.
- migrate.sh, verify.sql: официальный filtered export, pg_dump/pg_restore команды,
  инвентаризация и fingerprints, проверки orphan/RLS; сохранение auth UUID/passwords.
- switch-accounts.py: проверка публичного ключа, dry run, backup HTML.
- js/account.js: endpoint для cached session, сброс токенов прежнего проекта
  без удаления локальных уроков.
- START.html: автономный пульт, официальные ссылки, placeholders, шаблоны,
  12 ответов, localStorage, проверка завершения; нет внешних скриптов/API.
- README, MIGRATION, TESTS, корневой README, .gitignore и исключения rollback HTML.

## Выполненные проверки

- `python3 deploy/supabase-rf/test-local.py`: 3 tests OK, включая configure.py
  на compose/.env.example закреплённого self-hosted/v0.8.4; все три порта закрыты.
- `node deploy/supabase-rf/test-session.cjs`: OK, выполнение реального модуля.
- `node --check js/account.js`: OK.
- `python3 deploy/check-site-deploy.py`: OK, ранее подготовленная проверка публикации.
- `PLAYWRIGHT_MODULE=/opt/codex/cua_node/lib/node_modules/playwright node deploy/supabase-rf/test-start.cjs`:
  OK, desktop и 360 px, нет горизонтального переполнения, отметки после reload,
  блокировка до 12 «Да» и после «Нет», copy/next, нет внешних запросов/JS errors.
- `git diff --check`: OK. `git status --short --branch` проверен до/после.
- Документация Supabase и changelog проверены через curl; upstream файлы через curl.

Прямой file:// в облачном Chromium запрещён политикой (ERR_BLOCKED_BY_ADMINISTRATOR).
Browser-тест использует Playwright HTTP fixture, без HTTP-сервера и внешнего API.
Скриншоты: START-desktop.png, START-mobile.png рядом с отчётом.
Полный Caddy/Docker/SQL/live integration запуск на целевом VPS не выполнен.

## Не выполнено и почему

Владелец подтвердил отсутствие VPS. Нет целевого IP/SSH и подключения к исходной
базе. Поэтому установка на сервер, health, миграция auth/Storage, восстановление,
старый пароль, регистрация/SMS, RLS реальных данных, экспорт приложения и платежи
остаются НЕ ПРОВЕРЕНЫ. Сайт на новую БД не переключён. Секреты не вставлялись.
Экспорт/оплата имеют приёмочный сценарий TESTS.md, не ложный зелёный автотест.

## Внешние действия владельца

Аккаунт/оплата VPS в РФ, A supa/studio, SSH и доступ к исходной БД через защищённые
настройки, юридические решения/подписи, при необходимости SMS/SMTP-договор/оплата.
Технические команды выполняет Codex после доступа.
