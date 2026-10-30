/* «Учу по ФРП» — адаптер MAX для общего «мозга» (botbrain.js).
   Команды: start — создать материалы, app — открыть приложение.
   Отдаёт файлы .docx: загрузка через /uploads и вложение type=file. */
"use strict";
const fs = require("fs");
const { createBrain, SITE } = require("./botbrain.js");

const API = "https://platform-api2.max.ru";
const TOKEN = () => process.env.MAX_BOT_TOKEN || "";
const MEM_FILE = process.env.BOT_MEMORY_FILE || "";
let memCache = {};
if (MEM_FILE) { try { memCache = JSON.parse(fs.readFileSync(MEM_FILE, "utf8")); } catch { } }
const persist = () => { if (!MEM_FILE) return; try { fs.writeFileSync(MEM_FILE, JSON.stringify(memCache)); } catch { } };

async function api(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json", Authorization: TOKEN() },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json().catch(() => ({}));
}

/* buttons: [{text, url}] → link, [{text, data}] → callback */
const maxButtons = rows => rows && rows.length ? [{
  type: "inline_keyboard",
  payload: {
    buttons: rows.map(row => row.map(b => b.url
      ? { type: "link", text: b.text, url: b.url }
      : { type: "callback", text: b.text, payload: b.data }))
  }
}] : undefined;

function queryOf(to) {
  if (to.chatId && to.chatType && to.chatType !== "dialog") return "?chat_id=" + encodeURIComponent(to.chatId);
  if (to.userId) return "?user_id=" + encodeURIComponent(to.userId);
  return "";
}

async function send(to, text, rows) {
  const base = { text: String(text || "").slice(0, 4000), notify: true };
  if (rows) base.attachments = maxButtons(rows);
  try {
    let r = await api("POST", "/messages" + queryOf(to), { ...base, format: "markdown" });
    if (r && (r.code || r.error)) {
      console.log("MAX send markdown:", JSON.stringify(r).slice(0, 200));
      r = await api("POST", "/messages" + queryOf(to), base);
    }
    if (r && (r.code || r.error)) { console.log("MAX send plain:", JSON.stringify(r).slice(0, 200), "to:", JSON.stringify(to), "url:", queryOf(to), "text:", String(text).slice(0, 80)); }
    return r;
  } catch (e) {
    console.log("MAX send error:", String(e.message || e).slice(0, 200));
    return {};
  }
}

async function sendDoc(to, buffer, filename, caption) {
  try {
    const up = await api("POST", "/uploads?type=file");
    if (!up.url) return;
    const form = new FormData();
    form.append("data", new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), filename);
    const r = await fetch(up.url, { method: "POST", body: form });
    let tok = up.token;
    try { const j = await r.json(); if (j && j.token) tok = j.token; } catch { }
    if (!tok) return;
    const body = { text: caption || filename, notify: true, attachments: [{ type: "file", payload: { token: tok } }] };
    let res = await api("POST", "/messages" + queryOf(to), body);
    // файл может обрабатываться пару секунд — повторяем
    for (let i = 0; i < 4 && (!res || res.code === "attachment.not.ready"); i++) {
      await new Promise(r2 => setTimeout(r2, 1500 * (i + 1)));
      res = await api("POST", "/messages" + queryOf(to), body);
    }
  } catch (e) { }
}

const brain = createBrain({
  send,
  sendDoc,
  links: { site: SITE },
  platform: "max",
  store: {
    get: id => memCache[id] || {},
    set: (id, mem) => { memCache[id] = mem; persist(); }
  }
});

async function handle(update) {
  if (!update || !TOKEN()) return;
  const type = update.update_type || "";
  try {
    const msg = update.message || update;
    const text = String(msg?.body?.text || msg?.text || "").trim();
    const userId = msg?.sender?.user_id ?? update.user?.user_id ?? update.user_id ?? update.callback?.user?.user_id;
    const chatId = msg?.recipient?.chat_id ?? update.chat_id;
    const chatType = msg?.recipient?.chat_type || update.chat_type || "dialog";
    if (!userId) { console.log("MAX: нет user_id в обновлении", JSON.stringify(update).slice(0, 300)); return; }
    const to = { userId, chatId, chatType };

    if (type === "bot_started") return brain.start(chatId || userId);
    if (type === "message_created") {
      if (!text) return;
      if (/^\/start/i.test(text)) return brain.start(chatId || userId);
      if (/^\/app/i.test(text)) return send(to, "Приложение «Учу по ФРП» — это сайт, установленный как приложение.", [[{ text: "Открыть сайт", url: SITE }]]);
      return brain.onText(chatId || userId, text);
    }
    if (type === "message_callback") {
      const data = update.callback?.payload || update.payload || update.data || "";
      const cb = update.callback || {};
      if (cb.callback_id) await api("POST", "/answers", { callback_id: cb.callback_id }).catch(() => { });
      return brain.onCallback(chatId || userId, String(data));
    }
  } catch (e) { try { await send({ userId: update.user?.user_id || update.message?.sender?.user_id }, "Ошибка: " + String(e.message).slice(0, 160)); } catch { } }
}

module.exports = { handle, send, sendDoc };
