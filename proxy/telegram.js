/* «Учу по ФРП» — адаптер Telegram для общего «мозга» (botbrain.js).
   Команды: /start — создать материалы, /app — открыть приложение.
   Понимает свободный текст и кнопки, отдаёт файлы .docx в чат. */
"use strict";
const fs = require("fs");
const { createBrain, SITE, buildConspect } = require("./botbrain.js");

const TOKEN = () => process.env.TELEGRAM_BOT_TOKEN || "";
const MEM_FILE = process.env.BOT_MEMORY_FILE || "";
let memCache = {};
if (MEM_FILE) { try { memCache = JSON.parse(fs.readFileSync(MEM_FILE, "utf8")); } catch { } }
const persist = () => { if (!MEM_FILE) return; try { fs.writeFileSync(MEM_FILE, JSON.stringify(memCache)); } catch { } };

async function api(method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return res.json().catch(() => ({}));
}

const tgButtons = rows => rows && rows.length ? {
  inline_keyboard: rows.map(row => row.map(b => b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.data }))
} : undefined;

async function send(chatId, text, rows) {
  return api("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, reply_markup: tgButtons(rows) });
}

async function sendDoc(chatId, buffer, filename, caption) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("document", new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), filename);
  if (caption) form.append("caption", caption);
  const res = await fetch(`https://api.telegram.org/bot${TOKEN()}/sendDocument`, { method: "POST", body: form });
  return res.json().catch(() => ({}));
}

const brain = createBrain({
  send,
  sendDoc,
  links: { site: SITE },
  store: {
    get: id => memCache[id] || {},
    set: (id, mem) => { memCache[id] = mem; persist(); }
  }
});

/* совместимость со старыми вызовами */
function guess(text) { return brain.parse(text, {}); }

async function handle(update) {
  if (!update || !TOKEN()) return;
  try {
    if (update.message) {
      const chatId = update.message.chat.id;
      const text = String(update.message.text || "").trim();
      if (update.message.voice || update.message.audio) {
        return send(chatId, "Голосовые пока не распознаю — напишите текстом, например: «Строение клетки, биология, 5 класс».");
      }
      if (!text) return;
      if (/^\/start/.test(text)) return brain.start(chatId);
      if (/^\/app/.test(text)) return send(chatId, "Приложение «Учу по ФРП» — это сайт, установленный как приложение.", [[{ text: "Открыть сайт", url: SITE }]]);
      return brain.onText(chatId, text);
    }
    if (update.callback_query) {
      const q = update.callback_query;
      await api("answerCallbackQuery", { callback_query_id: q.id }).catch(() => { });
      return brain.onCallback(q.message.chat.id, String(q.data || ""));
    }
  } catch (e) { try { if (update.message) await send(update.message.chat.id, "Ошибка: " + String(e.message).slice(0, 160)); } catch { } }
}

module.exports = { handle, guess, send, sendDoc, buildConspect };
