# Владельческий экран пользователей

Страница: `https://uchu-po-frp.ru/admin.html`

Она показывает аккаунты PocketBase, тариф, остаток уроков и токенов, а также позволяет
начислить уроки или токены при компенсации.

## Что должно быть на сервере

В `pb_hooks/` должны лежать обновлённые файлы:

- `uchu.js` — функции `adminUsers`, `adminAdjust`, `adminDeleteUser` и `presencePing`;
- `uchu.pb.js` — маршруты:
  - `GET /api/uchu/admin/v1/users`
  - `POST /api/uchu/admin/v1/adjust`
  - `POST /api/uchu/admin/v1/delete-user`
  - `POST /api/uchu/presence/v1/ping`

Онлайн-статус: сайт раз в минуту отправляет heartbeat; сервер хранит его 3 минуты
в закрытой `uchu_login_state`. Панель обновляет список раз в 30 секунд.

После копирования файлов перезапустите PocketBase:

```bash
systemctl restart pocketbase
```

Проверьте:

```bash
curl -fSs https://accounts.uchu-po-frp.ru/api/uchu/auth/v1/health
```

## Доступ

Страница не публичная: данные отдаются только подтверждённой почте из коллекции
`site_admins`. Обычный пользователь получит `403`.

Ключ `service_role` / `UCHU_SERVICE_TOKEN` в браузере не используется.
