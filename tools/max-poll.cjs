/* «Учу по ФРП» — опрос MAX из GitHub Actions (надёжнее вебхука:
   нет холодных стартов функции и блокировок доставки).
   Токен — только из секрета репозитория MAX_BOT_TOKEN.
   Сертификат Минцифры подключается через NODE_EXTRA_CA_CERTS=tools/russian_ca.pem. */
"use strict";
const fs = require("fs");
const path = require("path");

const TOKEN = process.env.MAX_BOT_TOKEN || "";
if (!TOKEN) { console.error("Нет MAX_BOT_TOKEN"); process.exit(1); }

const API = "https://platform-api2.max.ru";
const OFFSET_FILE = path.join(process.cwd(), ".max-marker.json");
const RUN_LIMIT_MS = (Number(process.env.RUN_LIMIT_MIN) || 340) * 60 * 1000;
const started = Date.now();

let marker = null;
try { marker = JSON.parse(fs.readFileSync(OFFSET_FILE, "utf8")).marker ?? null; } catch { }
const saveMarker = () => { try { fs.writeFileSync(OFFSET_FILE, JSON.stringify({ marker })); } catch { } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const mb = require(path.join(process.cwd(), "proxy", "maxbot.js"));
process.env.BOT_MEMORY_FILE = process.env.BOT_MEMORY_FILE || path.join(process.cwd(), ".max-memory.json");

async function getUpdates() {
  const q = new URLSearchParams({ timeout: "30", limit: "100" });
  if (marker !== null) q.set("marker", String(marker));
  const res = await fetch(API + "/updates?" + q.toString(), { headers: { Authorization: TOKEN } });
  return res.json().catch(() => ({}));
}

(async () => {
  console.log("MAX-бот запущен, ожидаю сообщения…");
  while (Date.now() - started < RUN_LIMIT_MS) {
    try {
      const j = await getUpdates();
      if (j && j.code === 409) { console.log("у бота включён вебхук — опрос остановлен"); break; }
      if (j.marker !== undefined) { marker = j.marker; saveMarker(); }
      for (const u of j.updates || []) {
        try { await mb.handle(u); } catch (e) { console.log("ошибка обработки:", e.message.slice(0, 160)); }
      }
    } catch (e) {
      console.log("сеть:", e.message.slice(0, 160));
      await sleep(3000);
    }
  }
  saveMarker();
  console.log("опрос завершён");
})();
