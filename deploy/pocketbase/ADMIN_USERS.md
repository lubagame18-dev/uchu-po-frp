# Владельческий экран пользователей

Страница: `https://uchu-po-frp.ru/admin.html`

Она показывает аккаунты PocketBase, тариф, остаток уроков и токенов, а также позволяет
начислить уроки или токены при компенсации.

## Что должно быть на сервере

В `pb_hooks/` должны лежать обновлённые файлы:

- `uchu.js` — функции `adminUsers` и `adminAdjust`;
- `uchu.pb.js` — маршруты:
  - `GET /api/uchu/admin/v1/users`
  - `POST /api/uchu/admin/v1/adjust`

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
