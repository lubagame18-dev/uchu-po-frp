# Подготовка кабинета: почта, Яндекс и Google

Рабочий сайт не переключён. SMS по последнему решению владельца выключен.
Один новый кабинет PocketBase; пять прежних аккаунтов остаются в Supabase.

## Текущий выбор размещения

Только PocketBase — на отдельный VPS в РФ; рассматриваются 4VPS, RUVDS и VDSina. Домен и почта SpaceWeb, статика, Cloud DNS
и функция Яндекса сохраняются. Установщик больше не скачивает SpaceWeb-клиент
и не запрашивает его пароль. См. HOSTING_OPTIONS.md: RUVDS Старт Хит SSD — 349 ₽/месяц без подтверждённой доплаты за бэкапы;
окончательный выбор пока не принят. 4VPS Москва 590 ₽ / 30 дней выше
предела 520 ₽, дешёвые найденные Promo недоступны. Оплата и развёртывание не выполнены.

## Сделано в репозитории

- Google OAuth: PKCE S256, одноразовое состояние, проверенный email, стабильный provider ID,
  явная привязка к существующему кабинету. Email и Яндекс сохранены.
- В новом кабинете скрыт телефон; переключатель требует приёмку Google вместо SMS.
- `install.sh`: Ubuntu amd64, Python/pip/requests в venv, проверка последнего релиза
  PocketBase и checksum, файлы `/opt/pocketbase`, закрытые данные и секреты,
  registration hook, служба Systemd с автозапуском и локальным health.
- API-клиент SpaceWeb: JSON-RPC, скрытый ввод пароля, безопасные ошибки,
  ограниченное изменение существующей accounts A-записи. Делегация на Яндекс
  блокирует DNS-запись через SpaceWeb. Покупок и платежей скрипт не делает; эта прежняя утилита для нового запуска не используется.
- Обновлена [страница с семью шагами](https://uchu-rf-setup-guide.keenlarch65.chatgpt.site),
  START.html и README: ссылки на реальные панели, что копировать, куда вставить,
  что сообщить Codex. Отметки новой версии не наследуют прежнюю приёмку SMS.

Основные изменённые файлы: `install.sh`, `spaceweb_api.py`, `pocketbase.service`,
`pb_hooks/registration.pb.js`, `pb_hooks/identities.js`, `pb_hooks/identity-providers.js`,
`pb_hooks/uchu.pb.js`, новая миграция Google, `js/account.js`, `js/yandex-auth.js`,
`google.html`, `sw.js`, переключатель, server env, acceptance gates, тесты и workflow.
Учебные тексты и генератор не менялись.

## Проверки и команды

```bash
POCKETBASE_BROWSER=1 PLAYWRIGHT_MODULE=/opt/codex/cua_node/lib/node_modules/playwright python deploy/pocketbase/test-integration.py
POCKETBASE_BROWSER=1 PLAYWRIGHT_MODULE=/opt/codex/cua_node/lib/node_modules/playwright python deploy/pocketbase/test-identities.py
POCKETBASE_BROWSER=1 PLAYWRIGHT_MODULE=/opt/codex/cua_node/lib/node_modules/playwright python deploy/pocketbase/test-identities.py Identities.test_08_browser
python deploy/pocketbase/test-migration.py
python deploy/pocketbase/test-installer.py
node deploy/pocketbase/test-identity-providers.cjs
node deploy/pocketbase/test-client.cjs
node deploy/supabase-rf/test-session.cjs
node deploy/pocketbase/test-start.cjs
python deploy/check-site-deploy.py
bash -n deploy/pocketbase/install.sh
node --check js/account.js
node --check js/yandex-auth.js
git diff --check
git status --short
```

Пройдены 11 интеграционных, 12 identity, 3 migration, 3 installer-проверки и
перечисленные Node/deploy-проверки. Браузер: оба OAuth-входа, сохранение старого
Google-маршрута до переключения, отсутствие SMS-формы в PocketBase, 360 px;
основной набор включает Word/PDF, изоляцию, лимиты и повторы платёжного webhook.
Настоящие внешние OAuth и платёжный провайдер имитировались.

Проверено HTTP-скачивание install.sh по неизменяемому SHA
`25ce41bc219bfaa853cae1f5c6760b724956285e` и совпадение содержимого с коммитом.
Полная установка apt/Systemd на Ubuntu VPS не выполнялась: VPS и SSH отсутствуют.
Нет нового скриншота инструкции: Sites preview relay недоступен и браузерный
инструмент Sites отсутствует. Логика localStorage и 12/12 проверена DOM-фикстурой.

## Внешние действия

- Владелец выбирает провайдера и подтверждает итоговую цену с IPv4 и бэкапами, затем создаёт/оплачивает VPS
  в РФ и подключает SSH. Прежний предел 520 ₽ автоматически не увеличен. При отсутствии подключённого SSH предусмотрена
  одна команда для веб-консоли нового VPS.
- Владелец подтверждает Google/Яндекс-приложения, размещение секретов защищённым
  способом, DNS в Яндексе и юридические документы. Codex выполняет доступные
  технические настройки и приёмку после получения доступа.
- Единственная выполненная попытка авторизации SpaceWeb дала -32400: токен,
  реальный счёт и реквизиты оплаты не получены. VPS не заказан. Оплата только
  по 4VPS пока не выполнялась; действуют ссылки из 4VPS_SETUP.md. Переданный в чат пароль SpaceWeb сменить.
- До настоящих HTTPS/SMTP/OAuth, проверки бэкапов и оплаты переключение запрещено.

## Проверки смены провайдера

`python deploy/pocketbase/test-installer.py` и `python deploy/pocketbase/test-migration.py`
прошли: по 3 сценария. `node deploy/pocketbase/test-start.cjs` проверяет сохранение
отметок, блокировку 11/12 и разблокировку 12/12. Полная браузерная/серверная приёмка
из-за смены названия провайдера не повторялась; новых auth/платёжных изменений нет.
