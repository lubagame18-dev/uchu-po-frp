# Перенос: план выполнения Codex

Не выполнен: нет VPS и подключения к исходной БД. Секреты только в защищённом
окружении. Команды с placeholders не выполнять до подстановки Codex.

## Совместимость и подготовка

1. Получить версии Postgres, Auth, Storage, список extensions/roles/public schemas,
   RLS и функций SECURITY DEFINER на источнике. Проверить доступные схемы в Data API.
2. Поднять отдельный пробный target. Закреплённый комплект self-hosted может
   отличаться от managed: при несовпадении колонок auth не пропускать COPY и ошибки;
   подобрать совместимые версии и повторить пробу. PG17 → PG15 raw restore недопустим.
3. Перед финальным экспортом запретить записи на источник и протестировать запрет.
   Остановить webhooks/задачи и старые вкладки; зафиксировать окно обслуживания.
4. Выполнить verify.sql на обеих БД; вывод хранить зашифрованным в РФ.
   Он не выводит строки с ПД/паролями, но содержит метаданные и fingerprints.

## Рекомендуемый managed → self-hosted путь

Использовать официальный фильтрованный Supabase CLI export, включающий auth.users
и identities. Не дублировать его raw auth dump. Установить CLI с поддержкой
`--remote` (проверить `supabase db dump --help`; документация CLI v3).
Docker нужен CLI для pg_dump. Сохранить версию CLI в журнале миграции.
Пароль — в root-only .pgpass (0600) или секретном credential файле, не в argv/URL.
Direct или session pooler; transaction pooler для dump не использовать.

```bash
export SOURCE_DB_URL='postgresql://<USER>@<SOURCE_HOST>:5432/postgres?sslmode=verify-full'
export TARGET_DB_URL='postgresql://postgres.<TENANT>@127.0.0.1:5432/postgres'
export MIGRATION_DIR='<ENCRYPTED_RF_VOLUME>/migration-<TIMESTAMP>'
bash migrate.sh export
# Проверка auth COPY, схем, extensions, ролей; отдельный тестовый target.
CONFIRM_IMPORT=empty-test-target bash migrate.sh import
psql -X "$SOURCE_DB_URL" -v ON_ERROR_STOP=1 -f verify.sql > "$MIGRATION_DIR/source-checks.txt"
psql -X "$TARGET_DB_URL" -v ON_ERROR_STOP=1 -f verify.sql > "$MIGRATION_DIR/target-checks.txt"
```

roles/schema/data восстанавливаются одной транзакцией с ON_ERROR_STOP и
session_replication_role=replica для data (по официальной инструкции).
Проверить импорт ролей и SECURITY DEFINER вручную: перенос сохраняет также
существующие риски. Не запускать импорт на target с новыми реальными записями.

## pg_dump / pg_restore

Для независимого полного бэкапа self-hosted той же версии — backup.sh/restore.sh.
Для диагностического архивирования ТОЛЬКО public исходника:

```bash
umask 077
pg_dump "$SOURCE_DB_URL" --schema=public --format=custom \
  --file="$MIGRATION_DIR/source-public.dump"
pg_restore --list "$MIGRATION_DIR/source-public.dump" > "$MIGRATION_DIR/public-toc.txt"
# Только на отдельном совместимом target, не после CLI restore и не поверх live:
pg_restore --dbname="$TARGET_DB_URL" --exit-on-error --single-transaction \
  "$MIGRATION_DIR/source-public.dump"
```

Public-архив не является полным переносом аккаунтов. Не удалять privileges/RLS
ради успешного импорта. UUID и encrypted_password должны сохраниться, новые JWT
секреты требуют повторного входа. OAuth и SMS/SMTP переносятся отдельно.

## Все таблицы и Storage

Сверить не только lessons: profiles, user_info, payments, quizzes, quiz_results,
quiz_questions, bot_links, shared_materials и фактически существующие другие
таблицы, sequences, функции, триггеры и grant. verify.sql перечисляет все public/auth
таблицы с counts/fingerprints. Большая БД потребует пакетной сверки без string_agg.
Проверить публичные views на обход RLS, grants и API-функции.

Storage metadata в БД недостаточно. Codex инвентаризует реальные bucket/files,
переносит через S3-совместимые endpoints/Storage API, сохраняет bucket policies,
сверяет количество/размеры/контрольные суммы и приватность. Пример для одного
bucket при заранее настроенных секретных AWS profiles (без --delete):

```bash
aws --profile source-storage --endpoint-url https://<SOURCE_S3_ENDPOINT> \
  s3 sync s3://<BUCKET> <ENCRYPTED_RF_VOLUME>/storage/<BUCKET>
aws --profile target-storage --endpoint-url https://<TARGET_S3_ENDPOINT> \
  s3 sync <ENCRYPTED_RF_VOLUME>/storage/<BUCKET> s3://<BUCKET>
```

Не считать пример выполненным переносом; проверить S3-поддержку обоих endpoints,
доступ, metadata/content-type, private/public URL. Edge Functions, cron, secrets,
Vault/encryption keys, SMTP/SMS hooks и provider settings не переносятся одним
DB dump. Если использован Vault — отдельно обеспечить расшифровку и re-encryption
на target: новые encryption keys сами по себе старые ciphertext не откроют.

## Приёмка и откат

README.md и TESTS.md: сначала тестовый restore, затем финальный frozen export,
сверка БД/Storage, смена server env и accounts в одно окно, проверка UI и оплаты,
наблюдение. Старый проект не удалять. При откате остановить writes и согласовать
дельту новых данных/платежей; простой возврат старой БД после новых записей ведёт
к потере данных. Закрытые бэкапы никогда не размещать в бакете статики.
