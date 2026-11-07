# Self-hosted Supabase в РФ

Комплект для переноса аккаунтов и персональных данных с зарубежного
`supabase.com` на собственный сервер в России.

**Важно:** это не облачный сервис Supabase. Это открытый Supabase, который вы
разворачиваете на своём российском VPS. Только так можно выполнить требование
152-ФЗ о хранении персональных данных граждан РФ в базах на территории России.

## Что нужно

- VPS в РФ: Timeweb, Beget, Selectel, Cloud.ru или другой российский провайдер.
- Минимум: **4 vCPU, 8 ГБ RAM, 100 ГБ SSD**.
- Ubuntu 24.04.
- Домен и доступ к DNS.
- Поддомены:
  - `supa.uchu-po-frp.ru` — API Supabase;
  - `studio.uchu-po-frp.ru` — админ-панель аккаунтов.

## 1. DNS

Добавьте две A-записи на IP сервера:

```text
supa    A   <IP VPS>
studio  A   <IP VPS>
```

## 2. Сервер

```bash
apt update && apt upgrade -y
apt install -y docker.io docker-compose-plugin git curl ufw caddy
systemctl enable --now docker
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw enable
```

Порты **8000** (Kong) и **3000** (Studio) не открывайте наружу: к ним должен
ходить только Caddy на этом же сервере.

## 3. Запуск Supabase

```bash
sudo bash deploy/supabase-rf/bootstrap.sh
```

Скрипт:

1. клонирует официальный `supabase/supabase` в `/opt/supabase`;
2. создаёт `.env` из примера;
3. генерирует пароли и JWT-ключи;
4. поднимает контейнеры;
5. показывает `ANON_KEY` и `SERVICE_ROLE_KEY`.

Если ключи не сгенерировались автоматически, используйте официальный
`docker/utils/generate-keys.sh` из клона.

Проверка:

```bash
cd /opt/supabase/docker
docker compose ps
curl -s http://127.0.0.1:8000/auth/v1/health
```

## 4. Caddy и HTTPS

Скопируйте `Caddyfile` на сервер, замените домен и выполните:

```bash
cp deploy/supabase-rf/Caddyfile /etc/caddy/Caddyfile
# отредактируйте домен
systemctl reload caddy
```

Проверка:

```bash
curl -s https://supa.uchu-po-frp.ru/auth/v1/health
```

## 5. Подключение сайта

В `index.html` заполните:

```js
accounts: {
  url: "https://supa.uchu-po-frp.ru",
  anonKey: "<ANON_KEY из /opt/supabase/docker/.env>",
  dashboard: "https://studio.uchu-po-frp.ru"
}
```

Пока `accounts` пуст, сайт использует старый `cloud`. После заполнения
кабинет, профили, уроки и тесты переключатся на сервер в РФ.

## 6. Яндекс Облако

Яндекс Облако остаётся для:

- статического сайта в Object Storage;
- AI-прокси (функция).

В настройках функции замените:

```text
SUPABASE_URL=https://supa.uchu-po-frp.ru
SUPABASE_SERVICE_KEY=<SERVICE_ROLE_KEY>
```

Функция не хранит ПДн, только передаёт запросы; база — в РФ.

## 7. Перенос данных

Пока не переключайте `accounts`, пока не перенесены:

- `auth.users` — пользователи;
- `profiles` — профили;
- `lessons` — уроки;
- `quizzes`, `quiz_results` — тесты;
- Storage — файлы.

Порядок:

1. Сделать дамп старого проекта (`pg_dump` / Supabase backup).
2. Восстановить в новый PostgreSQL.
3. Проверить, что пользователи входят (пароли переносятся хешами).
4. Проверить RLS: чужой урок недоступен.
5. Только потом заполнить `accounts` на сайте.

Подробнее: `MIGRATION.md`.

## 8. Бэкапы

```bash
bash deploy/supabase-rf/backup.sh
```

Скрипт делает дамп БД и архив Storage в `/var/backups/uchu-supabase/`.
Настройте cron и хранение копий **в РФ** (другой сервер или российский S3).

## 9. 152-ФЗ

Перед реальными пользователями:

- оформить согласие на обработку ПДн;
- опубликовать политику;
- назначить ответственного за ПДн;
- ограничить доступ к Studio;
- включить HTTPS;
- делать бэкапы в РФ;
- описать сроки хранения и удаление аккаунта;
- проверить, что за пределами РФ ПДн не сохраняются.

Это инженерный комплект, а не юридическая консультация.

## Ограничения

- Self-hosted Supabase нужно обслуживать: обновления, бэкапы, мониторинг.
- Один VPS — это одна точка отказа. Для продакшена нужен второй сервер
  или управляемый PostgreSQL в РФ.
- Не храните `.env` в Git.
