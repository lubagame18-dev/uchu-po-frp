/* «Учу по ФРП» — опрос Telegram из GitHub Actions (сеть GitHub видит Telegram,
   в отличие от функции Яндекс.Облака). Запускается по расписанию, работает
   почти непрерывно: держит один long-polling цикл ~5 ч 45 мин.
   Токен — только из секрета репозитория (TELEGRAM_BOT_TOKEN).
   Смещение обновлений сохраняется в .tg-offset.json и кешируется между запусками. */
"use strict";
const fs = require("fs");
const path = require("path");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
if (!TOKEN) { console.error("Нет TELEGRAM_BOT_TOKEN"); process.exit(1); }

const OFFSET_FILE = path.join(process.cwd(), ".tg-offset.json");
const RUN_LIMIT_MS = (Number(process.env.RUN_LIMIT_MIN) || 345) * 60 * 1000; // ~5ч45м
const started = Date.now();

let offset = 0;
try { offset = JSON.parse(fs.readFileSync(OFFSET_FILE, "utf8")).offset || 0; } catch { }
const saveOffset = () => { try { fs.writeFileSync(OFFSET_FILE, JSON.stringify({ offset, savedAt: new Date().toISOString() })); } catch { } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const tg = require(path.join(process.cwd(), "proxy", "telegram.js"));

async function getUpdates() {
  const url = `https://api.telegram.org/bot${TOKEN}/getUpdates?timeout=30&offset=${offset}&allowed_updates=${encodeURIComponent(JSON.stringify(["message", "callback_query"]))}`;
  const res = await fetch(url);
  return res.json().catch(() => ({}));
}

(async () => {
  console.log("бот запущен, ожидаю сообщения…");
  while (Date.now() - started < RUN_LIMIT_MS) {
    try {
      const j = await getUpdates();
      if (!j.ok) {
        if (j.error_code === 409) { console.log("у бота включён вебхук — опрос остановлен"); break; }
        console.log("Telegram:", j.description || JSON.stringify(j).slice(0, 120));
        await sleep(3000);
        continue;
      }
      for (const u of j.result || []) {
        offset = u.update_id + 1;
        saveOffset();
        try { await tg.handle(u); } catch (e) { console.log("ошибка обработки:", e.message.slice(0, 160)); }
      }
    } catch (e) {
      console.log("сеть:", e.message.slice(0, 160));
      await sleep(3000);
    }
  }
  saveOffset();
  console.log("опрос завершён, смещение сохранено");
})();
