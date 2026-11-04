# Выкладка без GitHub Actions

Если минуты GitHub Actions закончились, сайт можно выложить с компьютера.

## Вариант 1. Скрипт (нужен AWS CLI)

1. Установите AWS CLI: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html
2. Возьмите статический ключ сервисного аккаунта `uchu-deploy`
   (роль `storage.editor`):
   https://console.yandex.cloud/folders/b1gh2pavc41nvt0kcki7/iam
3. Выполните в PowerShell из корня проекта:

```powershell
$env:YC_KEY_ID="КЛЮЧ"
$env:YC_SECRET="СЕКРЕТ"
.\deploy\local-deploy.ps1
```

Скрипт копирует только файлы сайта, обновляет `index.html` и `sw.js` без кеша.

## Вариант 2. Вручную через консоль

1. Откройте бакет:
   https://console.yandex.cloud/folders/b1gh2pavc41nvt0kcki7/storage/buckets/uchu-po-frp.ru
2. Загрузите изменённые файлы (`index.html`, `sw.js`, `js/`, `css/` и т. д.).
3 Для `index.html` и `sw.js` поставьте `Cache-Control: no-cache`.

## Что делать с минутами GitHub

- Бесплатный лимит для приватного репозитория — **2000 минут/мес**; сброс — в дату
  расчётного периода: https://github.com/settings/billing
- **GitHub Pro** — 3000 минут/мес (около $4).
- **Публичный репозиторий** — стандартные GitHub-раннеры бесплатны, но код станет
  открытым.
- **Свой runner** — бесплатно, но компьютер должен быть включён.
- Пока лимит не восстановлен — выкладывайте локальным скриптом.

## Поддержка GitHub

Форма: https://support.github.com/contact?tags=rr-billing

Шаблон:
> Здравствуйте! В репозитории … workflow `.github/workflows/telegram-bot.yml`
> запускался по расписанию каждые 6 часов с timeout 350 минут и израсходовал
> минуты GitHub Actions. Workflow уже удалён, бот отключён. Прошу проверить
> расход и, если возможно, вернуть ошибочно израсходованные минуты.
