# Полная инструкция: перенос в РФ, SMS-вход и публикация

Это пошаговая инструкция для владельца сайта. Она не заменяет юридическую
консультацию: тексты согласий и уведомление в Роскомнадзор проверьте с юристом.

**Важно:** не удаляйте старый Supabase и не меняйте DNS, пока новый вход и уроки не
проверены. Секреты и пароли не публикуйте в GitHub и не присылайте в чат.

---

## 0. Что понадобится

- Аккаунт Яндекс Облака: https://console.yandex.cloud/
- Папка проекта: `b1gh2pavc41nvt0kcki7`
- Домен `uchu-po-frp.ru` (DNS в Яндекс Cloud DNS)
- Аккаунт Supabase (старая база): https://supabase.com/dashboard/project/omnqygnlibkcybwryrrh
- Аккаунт SMS-провайдера:
  - SMS.ru: https://sms.ru/
  - SMSC: https://smsc.ru/
- Доступ к GitHub-репозиторию: https://github.com/lubagame18-dev/uchu-po-frp
- Строка подключения к старой базе Supabase:
  https://supabase.com/dashboard/project/omnqygnlibkcybwryrrh/settings/database

---

## 1. Резервная копия перед переносом

1. Старый Supabase → **Database → Backups**:
   https://supabase.com/dashboard/project/omnqygnlibkcybwryrrh/database/backups
2. Скачайте резервную копию (если тариф позволяет) или сделайте `pg_dump` (см. `migrate.md`).
3. Скачайте `.env`/список ключей нового сервера после установки в надёжное место.
4. Экспортируйте таблицы `lessons`, `user_info`, `profiles`, `quizzes`, `quiz_results`.

---

## 2. Создать виртуальную машину в Яндекс Облаке

Откройте Compute Cloud:
https://console.yandex.cloud/folders/b1gh2pavc41nvt0kcki7/compute

1. **Создать ВМ**.
2. Образ: **Ubuntu 22.04 LTS**.
3. Ресурсы: **4 vCPU, 8 ГБ RAM, 50–100 ГБ SSD** (меньше 8 ГБ памяти может не хватить Supabase).
4. Публичный IP: **включить**.
5. SSH-ключ: добавьте свой публичный ключ (не пароль).
6. Создайте ВМ и запишите публичный IP.

Настройте группу безопасности: входящие **22, 80, 443**.
Инструкция по группам: https://yandex.cloud/ru/docs/vpc/operations/security-group-add-rule

### Проверка SSH

```bash
ssh ubuntu@IP_ВМ
```

---

## 3. Поддомен api

Откройте DNS:
https://console.yandex.cloud/folders/b1gh2pavc41nvt0kcki7/dns

Создайте запись:
- имя: `api`
- тип: `A`
- значение: публичный IP ВМ
- TTL: 300 (на время переноса)

Проверка:
```bash
nslookup api.uchu-po-frp.ru
```

---

## 4. Установка Supabase на ВМ

Скопируйте папку `deploy/ru` на машину и выполните:

```bash
sudo DOMAIN=api.uchu-po-frp.ru \
     EMAIL=ваш@email.ru \
     DASHBOARD_PASSWORD='сложный-пароль' \
     bash bootstrap-vm.sh
```

Скрипт:
- установит Docker и Caddy;
- скачает официальный Supabase;
- сгенерирует пароль базы, JWT-секрет, `ANON_KEY` и `SERVICE_ROLE_KEY`;
- поднимет контейнеры;
- настроит HTTPS на `api.uchu-po-frp.ru`.

Проверка:
```bash
curl https://api.uchu-po-frp.ru/auth/v1/health
curl https://api.uchu-po-frp.ru/rest/v1/
```

Документация Supabase self-hosted:
https://supabase.com/docs/guides/self-hosting/docker

---

## 5. Переключить сайт на новый API

1. Откройте `index.html`, найдите `UCHU_SITE.cloud`.
2. Замените:

```js
cloud: {
  url: "https://api.uchu-po-frp.ru",
  anonKey: "ANON_KEY_ИЗ_ВЫВОДА_СКРИПТА"
}
```

3. Закоммитьте и запушьте. Деплой:
   https://github.com/lubagame18-dev/uchu-po-frp/actions
4. Проверьте вход/регистрацию на сайте **до** удаления старой базы.

Где взять ключ:
```bash
ssh ubuntu@IP_ВМ
sudo grep '^ANON_KEY=' /opt/supabase/docker/.env
```

---

## 6. Перенос данных

См. `migrate.md`. Кратко:

1. Сделайте `pg_dump` старой базы.
2. Восстановите в новую (`docker compose exec -T db pg_restore ...`).
3. Если `auth.users` не переносится — пользователи входят заново/сбрасывают пароль,
   данные уроков переносите отдельно по `public`-таблицам.
4. После проверки отключите старый проект Supabase.

---

## 7. Вход по номеру телефона (SMS)

### 7.1. Включить Phone в Supabase

Откройте:
https://supabase.com/dashboard/project/omnqygnlibkcybwryrrh/auth/providers

Включите **Phone**, выберите провайдера/хук.

### 7.2. Ключи SMS-провайдера

**SMS.ru**
- Личный кабинет: https://sms.ru/
- API отправки: https://sms.ru/api/send
- Имя отправителя: https://sms.ru/?panel=settings&subpanel=senders
- Нужен `api_id`.

**SMSC**
- Сайт: https://smsc.ru/
- API: https://smsc.ru/api/http/send/
- Нужны `SMS_LOGIN` и `SMS_PASSWORD`.

### 7.3. Переменные Яндекс-функции

Откройте функцию:
https://console.yandex.cloud/folders/b1gh2pavc41nvt0kcki7/functions/functions/d4ek0q8grbhn7q5muf24

Добавьте переменные окружения (версия функции → Редактировать):
- `SMS_HOOK_SECRET` — секрет из Supabase Auth Hooks;
- `SMS_API_ID` — для SMS.ru;
- или `SMS_LOGIN` и `SMS_PASSWORD` — для SMSC;
- `SMS_SENDER` — имя отправителя (после согласования);
- `SMS_DAILY_MAX=300`.

Затем загрузите новый `uchu-function.zip`:
https://console.yandex.cloud/folders/b1gh2pavc41nvt0kcki7/functions/functions/d4ek0q8grbhn7q5muf24/editor

### 7.4. Хук Send SMS в Supabase

Откройте:
https://supabase.com/dashboard/project/omnqygnlibkcybwryrrh/auth/hooks

Создайте/включите **Send SMS Hook**:
- URL: `https://functions.yandexcloud.net/d4ek0q8grbhn7q5muf24?path=/sms-hook`
- Secret: тот же, что `SMS_HOOK_SECRET`.
- Формат: Standard Webhooks.

### 7.5. Текст SMS

Сейчас функция отправляет:

> Код входа в «Учу по ФРП»: 123456

Файл с текстом: `proxy/sms-hook.js` (строка с `Код входа`).
Можно заменить на:

> Учу по ФРП: код входа 123456. Никому не сообщайте.

### 7.6. Проверка

1. Откройте сайт в режиме инкогнито.
2. Войти → **По телефону**.
3. Введите +7…, согласие, получите код.
4. Проверьте на МТС, Билайн, МегаФон, Т2.
5. Введите код — должен создаться кабинет.

### 7.7. Звонок вместо SMS

Сейчас поддерживается **только SMS**. Для звонка нужен провайдер голосовых кодов
(например, SMS.ru «Звонок» или Zvonok) и доработка `sms-hook.js`. Это отдельная задача.

---

## 8. Тексты для сайта и согласий

Проверьте страницы:
- Политика конфиденциальности: https://uchu-po-frp.ru/legal/privacy.html
- Оферта: https://uchu-po-frp.ru/legal/oferta.html
- Тарифы: https://uchu-po-frp.ru/legal/tarify.html
- Контакты: https://uchu-po-frp.ru/legal/contacts.html

Добавьте в политику:
- какие данные собираются: имя, телефон, школа, город, фото, уроки, результаты тестов;
- зачем: вход, сохранение уроков, результаты, поддержка;
- где хранятся: серверы в РФ (Яндекс Облако);
- кому передаются: SMS-провайдер (только номер и текст кода), платёжный сервис (при оплате);
- сроки хранения и удаление по запросу;
- контакт оператора ПД.

Чекбокс при регистрации уже ссылается на оферту и политику. Текст:
> Принимаю договор-оферту и даю согласие на обработку персональных данных по политике конфиденциальности.

Если работаете со школьниками — добавьте согласие законных представителей.

---

## 9. Роскомнадзор и документы

- Уведомление об обработке ПД: https://pd.rkn.gov.ru/
- Раздел о персональных данных: https://rkn.gov.ru/personal-data/
- Проверьте необходимость уведомления до запуска.
- Заключите договор с хостингом (Яндекс Облако) и SMS-провайдером — поручение на обработку.

---

## 10. Платежи (если публикуете платно)

- Продамус: https://prodamus.ru/
- ЮKassa: https://yookassa.ru/
- Чеки по 54-ФЗ, возвраты, подписки.
- Проверьте, что платёжные данные не проходят через ваш сервер.

---

## 11. Финальный чек-лист перед публикацией

- [ ] ВМ создана, HTTPS работает, DNS `api` указывает на неё.
- [ ] Сайт переключён на новый `cloud.url` и `anonKey`.
- [ ] Регистрация по телефону приходит на все операторы.
- [ ] Вход по телефону создаёт кабинет и сохраняет профиль в облаке.
- [ ] Старые уроки видны после входа.
- [ ] Тест создаётся, результаты видны в кабинете.
- [ ] Word/PDF/PNG/PPTX скачиваются без ошибок.
- [ ] Резервная копия новой базы сделана.
- [ ] Старый Supabase отключён только после проверки.
- [ ] Политика/оферта/согласие обновлены.
- [ ] Уведомление в РКН подано (если требуется).
- [ ] SMS-лимиты и антибот настроены.
- [ ] Есть контакт поддержки и порядок удаления аккаунта.

---

## 12. Откат

Если новый сервер не работает:
1. Верните в `index.html` старые `cloud.url` и `anonKey`.
2. Задеплойте сайт.
3. Не удаляйте старую базу до устранения проблемы.

---

## Ссылки на файлы проекта

- Установка: `deploy/ru/bootstrap-vm.sh`
- Миграция: `deploy/ru/migrate.md`
- Текст SMS: `proxy/sms-hook.js`
- Код входа по телефону: `js/account.js`
- Настройки сайта: `index.html` (`UCHU_SITE`)
- SQL-схемы: `supabase.sql`, `supabase_quizzes.sql`, `supabase_quizzes_ai.sql`
