# Кабинет в РФ: комплект для Codex и владельца

Откройте **START.html** локально в браузере. Страница автономна, не загружает
внешних ресурсов и не обращается к API. Ссылки открываются по нажатию.
Отметки сохраняются в localStorage; это ручные подтверждения, не live-аудит.

## Состояние и ответственность

VPS ещё нет. Реальная миграция, вход старым паролем, SMS, восстановление, экспорт
и оплата на целевом сервере **не проверены**. Рабочий сайт пока не переключён.
Яндекс остаётся для статики и AI-прокси. Учебные тексты и генератор не меняются.

Владелец: создать/оплатить VPS, DNS, предоставить SSH и доступ к исходному проекту
через защищённые настройки среды, утвердить юридические документы, при необходимости
оплатить SMS/SMTP. Все команды ниже выполняет Codex после получения доступа.
Пароли, приватные ключи и строки с паролями не передавать в чат и не коммитить.

Официальные страницы (цены уточнить на сайте):

- https://timeweb.cloud/services/vds-vps
- https://beget.com/ru/vps
- https://selectel.ru/services/cloud/servers/
- https://cloud.ru/products/evolution-compute
- https://www.reg.ru/
- https://dnschecker.org/
- https://pd.rkn.gov.ru/

Шаблоны всех сообщений — в START.html. Российское размещение сервера само по
себе не подтверждает соблюдение 152-ФЗ. Юридические решения принимает владелец.

## 1. Подготовка VPS (Codex)

Ubuntu 24.04, рекомендовано 4 vCPU / 8 ГБ / 80 ГБ SSD; ёмкость уточнить по базе
и Storage. Регион и размещение дисков, журналов, бэкапов подтвердить у провайдера.
A-записи `supa` и `studio` → IPv4 VPS; конфликтующие AAAA убрать.
Firewall провайдера: SSH только от администраторов, входящие 80/443; остальные
порты закрыть. Docker-порты дополнительно привязаны к localhost: ufw недостаточно
для защиты опубликованных Docker-портов.

```bash
ssh -p <SSH_PORT> <USER>@<VPS_IP>
# Codex копирует deploy/supabase-rf на VPS по SSH, например:
scp -P <SSH_PORT> -r deploy/supabase-rf <USER>@<VPS_IP>:~/
# На VPS:
cd ~/supabase-rf
sudo env DOMAIN=supa.<DOMAIN> STUDIO_DOMAIN=studio.<DOMAIN> \
  EMAIL=<TLS_EMAIL> SITE_URL=https://<SITE_DOMAIN> bash bootstrap.sh
```

bootstrap требует чистой установки, закреплён `self-hosted/v0.8.4`. Сохраняет
официальный compose в `/opt/uchu-supabase/docker`. Генерирует секреты один раз,
не печатает их, сохраняет `.env` с правами 600. Повторный запуск не ротирует
ключи. Не применять к существующему `/opt/supabase` из старой инструкции:
сначала инвентаризация/бэкап. Не удалять существующие данные ради установки.
Caddy разрешает API-пути на supa, закрывает Studio там; studio защищён basic auth.
Пароль admin находится в `.env`, читается Codex по защищённому SSH, не в чат.
Регистрация email/phone выключена до теста SMTP/SMS, автоподтверждение выключено.

```bash
cd /opt/uchu-supabase/docker
sudo docker compose ps
curl --fail https://supa.<DOMAIN>/auth/v1/health
curl -I https://studio.<DOMAIN>/  # без credentials ожидается 401
curl -I https://supa.<DOMAIN>/    # ожидается 404
sudo ss -lntp                   # 8000, 5432, 6543 только 127.0.0.1
sudo systemctl status caddy --no-pager # Caddy loads env through its systemd unit; never source the bcrypt hash in a shell
```

## 2. SMTP, SMS и социальный вход (Codex)

Заполнить SMTP_HOST/PORT/USER/PASS/ADMIN_EMAIL/SENDER_NAME в root-only `.env`;
у почтового провайдера настроить SPF/DKIM/DMARC. После теста доставки включить
ENABLE_EMAIL_SIGNUP=true и перезапустить auth. Проверить подтверждение почты,
восстановление и повторный вход. Для OAuth перенести настройки провайдера и
callback на новый домен, не считать их частью дампа БД.

Для существующего SMS-хука Яндекс-прокси задать GOTRUE_HOOK_SEND_SMS_ENABLED,
GOTRUE_HOOK_SEND_SMS_URI и GOTRUE_HOOK_SEND_SMS_SECRETS в environment auth
официального compose по актуальной документации Auth Hooks. Передать новый
секрет в SMS_HOOK_SECRET прокси защищённым каналом; проверить подпись, лимит,
неверный/истёкший код и повторы. Только после тестов включить
ENABLE_PHONE_SIGNUP=true. ENABLE_PHONE_AUTOCONFIRM оставлять false.
SMS/SMTP и договоры не настроены этим комплектом без доступа к провайдерам.

## 3. Экспорт и импорт

Подробный порядок, команды pg_dump/pg_restore, версии, Storage и окно запрета
записи: **MIGRATION.md**. Сначала пробный перенос. Не запускать raw auth schema
restore поверх живого self-hosted Auth: версии и миграции могут отличаться.
Для финального переноса остановить **все** записи на источник, включая старые
вкладки, мобильные клиенты и webhooks. Баннер обслуживания сам по себе не блокирует
REST API. Перед переносом проверить, что тестовая запись действительно отклонена.

## 4. Тесты на сервере

```bash
psql -X "$TARGET_DB_URL" -v ON_ERROR_STOP=1 -f verify.sql
# Dedicated disposable test accounts; credentials in protected env, never shell history:
CONFIRM_TEST_TARGET=yes python3 test-live.py
```

Для test-live.py требуются ACCOUNTS_URL, ACCOUNTS_ANON_KEY, TEST_A_EMAIL,
TEST_A_PASSWORD, TEST_B_EMAIL, TEST_B_PASSWORD. Скрипт проверяет health, два входа,
CRUD урока, чужой ID, запрет подмены user_id и удаления чужой записи.
Тестовые аккаунты создаёт Codex на пробном сервере; данные реальных пользователей
не использовать. Тест создаёт и удаляет строку с migration-test-UUID.

Дополнительно по TESTS.md: старый пароль мигрированного тестового аккаунта,
регистрация нового, подтверждение, logout/recovery/SMS, PDF/Word, платежи,
повтор webhook и восстановление backup на отдельной ВМ. Платёжные проверки
только в sandbox/тестовом режиме, реальные списания без владельца не делать.

## 5. Переключение и откат (Codex)

Сначала сверить UUID, хеши паролей, все пользовательские таблицы и RLS. Затем
в одно окно изменить SUPABASE_URL и SUPABASE_SERVICE_KEY в окружении **всех**
Яндекс-функций/прокси, использующих аккаунты (payments, quota, trial, AI pools,
SMS, quiz). Новый service_role только на сервере; не в index.html/START.html.
Сохранить старую конфигурацию в защищённом хранилище для отката.

```bash
# public-anon.txt содержит только публичный anon JWT, не service_role.
python3 deploy/supabase-rf/switch-accounts.py \
  --url https://supa.<DOMAIN> --dashboard https://studio.<DOMAIN> \
  --key-file <PRIVATE_DIR>/public-anon.txt
# После live-проверок — та же команда с --write, затем review diff и деплой статики.
```

Скрипт меняет только accounts, сохраняет `index.html.before-accounts` (исключён
из публикации). cloud/AI URL не меняет. Сессии привязаны к адресу API; старые токены
не отправляются новому серверу, локальные уроки не стираются.
Проверить кэш/service worker: старая вкладка не должна продолжать запись на источник.

При откате сначала остановить новые записи, сверить изменения, сделанные после
переключения. Нельзя просто вернуть старую БД и потерять новые уроки/платежи.
После согласованного переноса дельты вернуть HTML из локальной резервной копии,
старые серверные env и публикацию статики. Снова проверить вход/сохранение/оплату.
Старый проект не удалять автоматически; срок хранения и удаление ПД утвердить
с владельцем/юристом после проверки восстановления и окончания окна отката.

## 6. Backup и disaster recovery

```bash
# Maintenance: Codex остановил внешние writers, volume зашифрован и размещён в РФ.
sudo env BACKUP_ROOT=<ENCRYPTED_RF_VOLUME> MAINTENANCE_CONFIRMED=yes bash backup.sh
# На отдельном совместимом тестовом сервере с тем же env и upstream revision:
sudo env RESTORE_DIR=<BACKUP_DIRECTORY> CONFIRM_RESTORE=restore-test-target bash restore.sh
```

backup: custom pg_dump БД, роли, env, версия, compose, файловый Storage, SHA256.
Секреты и хеши паролей находятся в backup. Шифрование диска/отдельной копии,
права доступа и размещение в РФ проверить; архивы сами по себе не зашифрованы.
Копия на том же VPS не заменяет внешнюю резервную копию. Автоудаления архивов нет.
roles.sql — инвентаризация ролей: на отдельной ВМ Codex проверяет и восстанавливает
нестандартные роли до pg_restore; системные роли создаёт Supabase, их не дублировать.
restore требует идентичный env; использует --clean и транзакцию, при ошибке
останавливается и оставляет writers остановленными. Совместимость полного дампа
с конкретной версией self-hosted требует пробного восстановления. Произвольные
скрипты Storage/Edge Functions и изменения compose также сохранить отдельно.
Назначить backup таймер после успешного restore drill и согласования окна простоя;
не выдавать этот maintenance-backup за непрерывное PITR.

## 7. Локальные проверки

```bash
python3 deploy/supabase-rf/test-local.py
node deploy/supabase-rf/test-session.cjs
node --check js/account.js
python3 deploy/check-site-deploy.py
git diff --check
```

Browser-тест START и screenshot: `test-start.cjs` (нужен Playwright и Chromium).
Ни локальные тесты, ни 12 ручных «Да» не доказывают серверную миграцию.

Документы проверены по официальным страницам 07.11.2026:
https://supabase.com/changelog.md (CLI v3 меняет remote flags),
https://supabase.com/docs/guides/self-hosting/docker,
https://supabase.com/docs/guides/self-hosting/restore-from-platform.

### Повторение проверки закреплённого compose

Для полного test-local.py Codex скачивает публичные fixtures, они не коммитятся:

```bash
mkdir -p work/supabase-docs
curl -fsSL https://raw.githubusercontent.com/supabase/supabase/self-hosted/v0.8.4/docker/docker-compose.yml -o work/supabase-docs/compose.yml
curl -fsSL https://raw.githubusercontent.com/supabase/supabase/self-hosted/v0.8.4/docker/.env.example -o work/supabase-docs/env.example
python3 deploy/supabase-rf/test-local.py
```

Browser-проверка использует HTTP fixture Playwright без сервера/API. В данной
облачной среде file:// запрещён политикой браузера, поэтому прямое локальное
открытие проверено через эквивалентную HTTP-страницу. Скриншоты — в docs/supabase-rf/.
