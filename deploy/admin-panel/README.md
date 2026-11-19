# Панель доступа владельца — установка на VPS

Статическая страница уже находится в репозитории:

- `admin.html`
- `js/admin.js`
- `js/presence.js`

Серверная часть — два файла PocketBase:

- `deploy/pocketbase/pb_hooks/uchu.js`
- `deploy/pocketbase/pb_hooks/uchu.pb.js`

## Установка на VPS

Запускать **от root** на сервере PocketBase, указав полный SHA коммита:

```bash
python3 deploy/admin-panel/update-server.py --ref <полный_40_символьный_SHA>
```

Скрипт:

1. скачивает `release.json` и проверяет SHA-256 файлов;
2. делает резервную копию текущих hooks;
3. заменяет только `uchu.js` и `uchu.pb.js`;
4. перезапускает PocketBase;
5. проверяет, что маршрут `/api/uchu/admin/v1/users` отвечает `403` без сессии;
6. при ошибке возвращает прежние hooks.

Повторный запуск после успешной установки блокируется файлом
`/root/uchu-admin-panel-release/receipt.json`.

## После установки

Войти на `https://uchu-po-frp.ru/admin.html` под почтой из `site_admins`.

Проверить:

- список пользователей;
- тарифы и остатки;
- онлайн-статус;
- начисление уроков/токенов;
- удаление тестового аккаунта (только не владельца).

Секреты и `service_role` в браузер не передаются.
