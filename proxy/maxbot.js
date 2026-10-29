/* «Учу по ФРП» — бот для мессенджера MAX.
   API: https://platform-api2.max.ru, авторизация заголовком Authorization: <token>.
   Сценарий тот же, что в Telegram: /start → тема («тема, предмет, класс») →
   конспект сообщением и ссылка на сайт.
   Токен и секрет вебхука — только в переменных окружения (MAX_BOT_TOKEN, MAX_SECRET). */
"use strict";

const API = "https://platform-api2.max.ru";
const SITE = "https://uchu-po-frp.ru/";
const TOKEN = () => process.env.MAX_BOT_TOKEN || "";
const { guess, buildLocal } = require("./telegram.js");

const state = new Map(); // userId → { subject, grade, topic }

async function api(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json", Authorization: TOKEN() },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json().catch(() => ({}));
}
const esc = s => String(s || "").replace(/<[^>]*>/g, "");

/* Кнопка-ссылка в MAX: вложение inline_keyboard */
function linkButtons(rows) {
  return [{ type: "inline_keyboard", payload: { buttons: rows.map(r => r.map(b => ({ type: "link", text: b.text, url: b.url }))) } }];
}

async function send(to, text, rows) {
  const q = to.chatId ? "?chat_id=" + to.chatId : "?user_id=" + to.userId;
  const body = { text: esc(text).slice(0, 4000), format: "plain", notify: true };
  if (rows) body.attachments = linkButtons(rows);
  try { return await api("POST", "/messages" + q, body); } catch (e) { return { success: false }; }
}

function plain(md) {
  return String(md || "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^[-*]\s+/gm, "• ")
    .replace(/>\s?/g, "")
    .replace(/`/g, "")
    .trim();
}

async function onStart(to) {
  state.delete(to.userId);
  await send(to,
    "Учу по ФРП — соберу урок по вашей теме.\n\n" +
    "Напишите тему одним сообщением, можно с предметом и классом:\n«Строение клетки, биология, 5 класс»\n\n" +
    "Пришлю конспект и ссылку на сайт — там можно скачать Word, PDF и презентацию.",
    [[{ text: "Открыть сайт", url: SITE }]]);
}
async function onHelp(to) {
  await send(to,
    "Как пользоваться:\n1. Напишите тему урока (можно с предметом и классом).\n2. Если чего-то не хватило — уточню предмет и класс.\n3. Пришлю конспект и ссылку на сайт.\n\nКоманды: /start, /lesson, /site, /help",
    [[{ text: "Открыть сайт", url: SITE }]]);
}
async function onSite(to) {
  await send(to, "Сайт «Учу по ФРП»: " + SITE, [[{ text: "Открыть сайт", url: SITE }]]);
}

async function generate(to, job) {
  const text = buildLocal(job);
  const link = SITE + "?subject=" + encodeURIComponent(job.subject) +
    "&grade=" + encodeURIComponent(job.grade) + "&topic=" + encodeURIComponent(job.topic);
  await send(to, plain(text), [[{ text: "Скачать Word/PDF на сайте", url: link }]]);
  state.delete(to.userId);
}

async function onText(to, text) {
  const job = state.get(to.userId) || {};
  const g = guess(text);
  if (g.subject) job.subject = g.subject;
  if (g.grade) job.grade = g.grade;
  if (g.topic) job.topic = g.topic;
  if (!job.subject) {
    state.set(to.userId, job);
    await send(to, "Уточните предмет и класс в одном сообщении, например: «биология, 5 класс».");
    return;
  }
  if (!job.grade) {
    state.set(to.userId, job);
    await send(to, "Уточните класс — например: «6 класс».");
    return;
  }
  await generate(to, job);
}

/* ---------- обработка события MAX ---------- */
async function handle(update) {
  if (!update || !TOKEN()) return;
  const type = update.update_type || "";

  if (type === "bot_started") {
    const userId = update.user?.user_id ?? update.user_id;
    if (userId) return onStart({ userId });
    return;
  }
  if (type === "message_created") {
    const msg = update.message || {};
    const text = String(msg.body?.text || msg.text || "").trim();
    const userId = msg.sender?.user_id ?? update.user?.user_id;
    const chatId = msg.recipient?.chat_id ?? update.chat_id;
    const to = chatId ? { chatId, userId } : { userId };
    if (!text || !userId) return;
    if (/^\/start/.test(text)) return onStart(to);
    if (/^\/help/.test(text)) return onHelp(to);
    if (/^\/site/.test(text)) return onSite(to);
    if (/^\/lesson/.test(text)) { state.delete(userId); return send(to, "Напишите тему урока (можно с предметом и классом)."); }
    return onText(to, text);
  }
  // остальные события (прочитано, изменено, кнопки) пока не требуют реакции
  return;
}

module.exports = { handle, send, onStart, generate, state };
