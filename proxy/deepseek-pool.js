/* ===================================================================
   «Учу по ФРП» — пул аккаунтов DeepSeek (балансировщик запросов).
   Ключи хранятся ТОЛЬКО на сервере (в переменной окружения функции или в этом файле
   на сервере) — пользователи сайта ключей не видят и не знают о них.

   1. Карусель (Round-Robin): каждый новый запрос берёт следующий аккаунт по кругу.
   2. Подстраховка: если аккаунт ответил ошибкой (закончился баланс — 402,
      неверный ключ — 401, лимит — 429, сбой сервера — 5xx), запрос повторяется
      на следующем аккаунте; пользователь ошибки не видит. Сломанный аккаунт
      на время «отдыхает» (5 минут после 429, 1 час после 402/401).
   3. Заглушки: ключи вида "..." или пустые пропускаются автоматически.
   4. Флаг isActive: false — аккаунт выключен вручную и не используется.

   Как задать аккаунты (любой из способов):
   • переменная окружения DEEPSEEK_POOL = JSON-массив:
       [{"email":"first@mail.ru","key":"sk-...","isActive":true}, ...]
   • или прямо здесь, в ACCOUNT_POOL ниже (только на сервере, не в репозитории сайта!).
   =================================================================== */
const ACCOUNT_POOL = [
  { email: "аккаунт-1@почта", key: "...", isActive: true },
  { email: "аккаунт-2@почта", key: "...", isActive: true },
  { email: "аккаунт-3@почта", key: "...", isActive: false }
];
const API = process.env.DEEPSEEK_API_URL || "https://api.deepseek.com";
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-flash"; // с 24.07.2026 старые имена deepseek-chat/-reasoner не работают

function loadPool() {
  let list = ACCOUNT_POOL;
  try { if (process.env.DEEPSEEK_POOL) list = JSON.parse(process.env.DEEPSEEK_POOL); } catch (e) { console.warn("DEEPSEEK_POOL: не JSON", e.message); }
  if (process.env.DEEPSEEK_KEY) list = [{ email: "основной", key: process.env.DEEPSEEK_KEY, isActive: true }, ...list];
  return list.map((a, i) => ({ id: i, email: String(a.email || "аккаунт " + (i + 1)), key: String(a.key || "").trim(), isActive: a.isActive !== false }));
}
const isPlaceholder = k => !k || /^\.+$/.test(k) || /^(sk-)?\.{2,}/.test(k) || k.length < 10;
const rest = new Map(); // id → до какого времени аккаунт «отдыхает»
let cursor = 0;

/* Рабочие аккаунты в порядке карусели, начиная со следующего */
function queue() {
  const pool = loadPool().filter(a => a.isActive && !isPlaceholder(a.key));
  if (!pool.length) return [];
  const start = cursor++ % pool.length;
  const ordered = pool.slice(start).concat(pool.slice(0, start));
  const now = Date.now();
  const fresh = ordered.filter(a => !(rest.get(a.id) > now));
  return fresh.length ? fresh : ordered; // если «отдыхают» все — пробуем всё равно
}
const mask = e => String(e).replace(/^(.).*(@.*)$/, "$1***$2");

/* Запрос к DeepSeek с переключением аккаунтов. request — функция из proxy.js (Node https). */
async function chat(body, request, readAll) {
  const accounts = queue();
  if (!accounts.length) { const e = new Error("на сервере не настроен ни один аккаунт DeepSeek"); e.status = 503; e.reason = "no_key"; throw e; }
  const payload = JSON.stringify({ ...body, model: body.model && !/^deepseek-(chat|reasoner)$/.test(body.model) ? body.model : MODEL, stream: false });
  let last = null;
  for (const a of accounts) {
    try {
      const res = await request(API + "/chat/completions", { headers: { Authorization: "Bearer " + a.key, "Content-Type": "application/json", Accept: "application/json" }, body: payload, timeout: 120000 });
      const text = await readAll(res);
      if (res.statusCode === 200) { rest.delete(a.id); return { status: 200, text, account: mask(a.email) }; }
      last = { status: res.statusCode, text };
      // 401 — ключ неверный, 402 — нет денег: аккаунт отдыхает час; 429 — лимит: 5 минут; 5xx — 1 минута
      const pause = res.statusCode === 401 || res.statusCode === 402 ? 3600e3 : res.statusCode === 429 ? 300e3 : res.statusCode >= 500 ? 60e3 : 0;
      if (!pause) break; // ошибка в самом запросе (400) — другой аккаунт не поможет
      rest.set(a.id, Date.now() + pause);
      console.warn(`DeepSeek: ${mask(a.email)} ответил ${res.statusCode}, переключаюсь на следующий аккаунт`);
    } catch (e) { last = { status: 502, text: String(e.message || e) }; rest.set(a.id, Date.now() + 60e3); }
  }
  const e = new Error("DeepSeek не ответил ни на одном аккаунте: " + (last ? `HTTP ${last.status} ${String(last.text).slice(0, 160)}` : "нет ответа"));
  e.status = last?.status === 400 ? 400 : 502; e.reason = last?.status === 402 ? "payment" : last?.status === 429 ? "rate" : "other"; throw e;
}

/* Баланс каждого аккаунта (для владельца): GET https://api.deepseek.com/user/balance */
async function balances(request, readAll) {
  const out = [];
  for (const a of loadPool()) {
    if (!a.isActive || isPlaceholder(a.key)) { out.push({ account: mask(a.email), active: a.isActive, configured: !isPlaceholder(a.key) }); continue; }
    try {
      const res = await request(API + "/user/balance", { method: "GET", headers: { Authorization: "Bearer " + a.key, Accept: "application/json" }, timeout: 20000 });
      const j = JSON.parse(await readAll(res) || "{}");
      const info = (j.balance_infos || [])[0] || {};
      out.push({ account: mask(a.email), active: true, available: j.is_available, balance: info.total_balance, currency: info.currency, resting: rest.get(a.id) > Date.now() });
    } catch (e) { out.push({ account: mask(a.email), active: true, error: String(e.message || e) }); }
  }
  return out;
}
module.exports = { chat, balances, loadPool, isPlaceholder, queue, ACCOUNT_POOL };
