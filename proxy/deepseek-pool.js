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
   • ГЛАВНЫЙ: на сайте, режим разработчика → «Ключи ИИ» (5 ячеек). Ключи сохраняются
     в облаке Supabase, в таблице ai_keys, которую читает только сервер (секретным ключом);
     сайт после сохранения видит лишь начало и конец ключа;
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
/* ---------- ключи из облака (таблица ai_keys, читает только сервер) ---------- */
const SB = () => ({ url: (process.env.SUPABASE_URL || "").replace(/\/+$/, ""), key: process.env.SUPABASE_SERVICE_KEY || "" });
let dbCache = { at: 0, list: [] };
async function sb(request, readAll, path, { method = "GET", body } = {}) {
  const { url, key } = SB(); if (!url || !key) return { status: 0, json: null };
  const res = await request(url + path, { method, headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json", Prefer: "return=representation,resolution=merge-duplicates" }, body: body ? JSON.stringify(body) : undefined, timeout: 15000 });
  const t = await readAll(res); let j = null; try { j = t ? JSON.parse(t) : null; } catch { }
  return { status: res.statusCode, json: j };
}
async function dbPool(request, readAll, force) {
  if (!SB().url || !SB().key || !request) return [];
  if (!force && Date.now() - dbCache.at < 30000) return dbCache.list;
  try { const r = await sb(request, readAll, "/rest/v1/ai_keys?select=*&order=slot"); if (r.status === 200 && Array.isArray(r.json)) dbCache = { at: Date.now(), list: r.json }; }
  catch (e) { console.warn("ai_keys:", e.message); }
  return dbCache.list;
}
/* Все аккаунты: сначала ячейки с сайта, потом из переменных функции */
async function pool(request, readAll, force) {
  const db = (await dbPool(request, readAll, force)).map(a => ({ id: "s" + a.slot, slot: a.slot, email: String(a.label || "ячейка " + a.slot), key: String(a.key || "").trim(), url: String(a.base_url || "").trim().replace(/\/+$/, ""), model: String(a.model || "").trim(), isActive: a.is_active !== false, weight: Math.max(1, +a.weight || 1), lastUsed: a.last_used ? Date.parse(a.last_used) : 0, failCount: +a.fail_count || 0, disabledUntil: a.disabled_until ? Date.parse(a.disabled_until) : 0 }));
  return db.concat(loadPool());
}
const isPlaceholder = k => !k || /^\.+$/.test(k) || /^(sk-)?\.{2,}/.test(k) || k.length < 10;
const pool0 = (r, ra) => pool(r, ra);
const rest = new Map(); // id → до какого времени аккаунт «отдыхает»
let cursor = 0;

const last = new Map(); // id → последний ответ { at, status, error }
/* Рабочие аккаунты в порядке карусели, начиная со следующего */
async function queue(request, readAll) {
  const pool = (await pool0(request, readAll)).filter(a => a.isActive && !isPlaceholder(a.key));
  if (!pool.length) return [];
  const start = cursor++ % pool.length;
  const ordered = pool.slice(start).concat(pool.slice(0, start));
  const now = Date.now();
  const fresh = ordered.filter(a => !(rest.get(a.id) > now) && !(a.disabledUntil > now));
  return fresh.length ? fresh : ordered; // если «отдыхают» все — пробуем всё равно
}
const mask = e => String(e).replace(/^(.).*(@.*)$/, "$1***$2");

/* Запрос к DeepSeek с переключением аккаунтов. request — функция из proxy.js (Node https). */
/* ---------- любые нейросети: сервис узнаётся по ключу (или по адресу) ---------- */
/* Только сервисы, которые работают из России (иначе аккаунт могут заблокировать): DeepSeek и свой
   OpenAI-совместимый сервис по адресу. Claude, OpenAI, Gemini, Grok, Groq — не принимаются. */
const RU_BLOCKED_KEY = /^(sk-ant-|AIza|xai-|gsk_|sk-proj-|sk-svcacct-|sk-admin-)/, RU_BLOCKED_HOST = /anthropic\.com|openai\.com|googleapis\.com|(^|\.)x\.ai|groq\.com|claude\.ai/i;
const ruBlocked = a => RU_BLOCKED_HOST.test(String(a.url || "")) || (!String(a.url || "").trim() && RU_BLOCKED_KEY.test(String(a.key || ""))); // сторонний сервис по своему адресу — можно, на риск владельца
const PROVIDERS = [
  { id: "deepseek", name: "DeepSeek", re: /^sk-/, url: /deepseek\.com/, base: API, model: MODEL }
];
function providerOf(a) {
  const p = (a.url && PROVIDERS.find(x => x.url.test(a.url))) || (a.url ? { id: "custom", name: "Свой сервис", base: a.url, model: "" } : PROVIDERS[0]);
  return { ...p, base: a.url || p.base, model: a.model || p.model };
}
async function chat(body, request, readAll, onlySlot) {
  let accounts = await queue(request, readAll);
  if (onlySlot) accounts = (await pool(request, readAll)).filter(a => a.slot === +onlySlot && !isPlaceholder(a.key));
  if (!accounts.length) { const e = new Error("на сервере не настроен ни один общий ключ нейросети"); e.status = 503; e.reason = "no_key"; throw e; }
  let lastErr = null;
  for (const a of accounts) {
    try {
      const P = providerOf(a);
      // модель — из ячейки (или по умолчанию для сервиса); у DeepSeek — то, что просит сайт
      const model = a.model || (P.id === "deepseek" && body.model && !/^deepseek-(chat|reasoner)$/.test(body.model) ? body.model : P.model);
      let res, text;
      if (ruBlocked(a)) continue; // сервис не работает из России — не обращаемся вовсе
      res = await request(P.base + "/chat/completions", { headers: { Authorization: "Bearer " + a.key, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ ...body, model, stream: false }), timeout: 280000 }); text = await readAll(res);
      if (res.statusCode === 200) { rest.delete(a.id); last.set(a.id, { at: Date.now(), status: 200 }); dbMark(a, { last_used: new Date().toISOString(), fail_count: 0, disabled_until: null }, request, readAll); return { status: 200, text, account: mask(a.email) }; }
      last.set(a.id, { at: Date.now(), status: res.statusCode, error: String(text).slice(0, 160) });
      lastErr = { status: res.statusCode, text };
      // 401 — ключ неверный, 402 — нет денег: аккаунт отдыхает час; 429 — лимит: 5 минут; 5xx — 1 минута
      const pause = [401, 402, 403].includes(res.statusCode) ? 3600e3 : res.statusCode === 429 ? 300e3 : res.statusCode >= 500 ? 60e3 : 0;
      if (!pause) break; // ошибка в самом запросе (400) — другой аккаунт не поможет
      rest.set(a.id, Date.now() + pause);
      dbMark(a, { fail_count: (a.failCount || 0) + 1, disabled_until: new Date(Date.now() + pause).toISOString() }, request, readAll);
      console.warn(`ИИ: ${mask(a.email)} ответил ${res.statusCode}, переключаюсь на следующий аккаунт`);
    } catch (e) { lastErr = { status: 502, text: String(e.message || e) }; last.set(a.id, { at: Date.now(), status: 502, error: lastErr.text.slice(0, 160) }); rest.set(a.id, Date.now() + 60e3); }
  }
  const e = new Error("Нейросеть не ответила ни на одном общем ключе: " + (lastErr ? `HTTP ${lastErr.status} ${String(lastErr.text).slice(0, 160)}` : "нет ответа"));
  e.status = lastErr?.status === 400 ? 400 : 502; e.reason = lastErr?.status === 402 ? "payment" : lastErr?.status === 429 ? "rate" : "other"; throw e;
}

/* Баланс каждого аккаунта (для владельца): GET https://api.deepseek.com/user/balance */
async function balance1(a, request, readAll) {
  const res = await request((a.url || API) + "/user/balance", { method: "GET", headers: { Authorization: "Bearer " + a.key, Accept: "application/json" }, timeout: 20000 });
  const t = await readAll(res); if (res.statusCode !== 200) throw new Error(res.statusCode === 401 ? "ключ не подходит (401)" : `HTTP ${res.statusCode} ${t.slice(0, 120)}`);
  const j = JSON.parse(t || "{}"), info = (j.balance_infos || [])[0] || {};
  return { available: j.is_available, balance: info.total_balance, currency: info.currency };
}
async function balances(request, readAll) {
  const out = [];
  for (const a of await pool(request, readAll)) {
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
/* ---------- управление ячейками с сайта (только автору сайта) ---------- */
const MAX_SLOT = 100; /* ключей может быть сколько угодно: ограничение «5 ячеек» снято */
const tail = k => isPlaceholder(k) ? "" : String(k).slice(0, 3) + "…" + String(k).slice(-4);
async function admin(body, request, readAll) {
  if (!SB().url || !SB().key) return { status: 400, json: { error: "в функции не заданы SUPABASE_URL и SUPABASE_SERVICE_KEY" } };
  const act = body.action || "list", slot = Math.round(+body.slot);
  if (act !== "list" && !(slot >= 1 && slot <= MAX_SLOT)) return { status: 400, json: { error: "ячейка — от 1 до " + MAX_SLOT } };
  if (act === "save") {
    const row = { slot, label: String(body.label || "").slice(0, 80), base_url: String(body.url || "").trim().slice(0, 200), model: String(body.model || "").trim().slice(0, 80), is_active: body.isActive !== false, updated_at: new Date().toISOString() };
    if (row.base_url && !/^https:\/\/[\w.-]+(\/[\w./-]*)?$/.test(row.base_url)) return { status: 400, json: { error: "адрес должен начинаться с https://" } };
    if (ruBlocked({ key: body.key, url: row.base_url })) return { status: 400, json: { error: "этот сервис (Claude, OpenAI, Gemini, Grok, Groq) не работает из России — подключать нельзя, чтобы аккаунт не заблокировали" } };
    const k = String(body.key || "").trim(); if (k) row.key = k;
    const old = (await dbPool(request, readAll, true)).find(a => a.slot === slot);
    if (!old && !k) return { status: 400, json: { error: "вставьте ключ" } };
    let r = await sb(request, readAll, "/rest/v1/ai_keys?on_conflict=slot", { method: "POST", body: { ...(old || {}), ...row } });
    if (r.status >= 300 && /model/.test(JSON.stringify(r.json))) { const { model, ...noModel } = { ...(old || {}), ...row }; r = await sb(request, readAll, "/rest/v1/ai_keys?on_conflict=slot", { method: "POST", body: noModel }); } // колонки model ещё нет
    if (r.status >= 300) return { status: 502, json: { error: /ai_keys/.test(JSON.stringify(r.json)) ? "в облаке нет таблицы ai_keys — выполните SQL из инструкции" : "облако не сохранило: " + JSON.stringify(r.json).slice(0, 160) } };
    rest.delete("s" + slot); last.delete("s" + slot);
  }
  if (act === "delete") { await sb(request, readAll, `/rest/v1/ai_keys?slot=eq.${slot}`, { method: "DELETE" }); rest.delete("s" + slot); last.delete("s" + slot); }
  const rows = await dbPool(request, readAll, true);
  let test = null;
  if (act === "test") {
    const a = (await pool(request, readAll)).find(x => x.slot === slot);
    const P = a ? providerOf(a) : null;
    if (!a || isPlaceholder(a.key)) test = { ok: false, message: "в ячейке нет ключа" };
    else if (P.id === "deepseek") { try { const b = await balance1(a, request, readAll); test = { ok: true, ...b, message: `${P.name}: ключ работает, баланс ${b.balance ?? "?"} ${b.currency || ""}`.trim() }; } catch (e) { test = { ok: false, message: e.message }; } }
    else { try { const r = await chat({ messages: [{ role: "user", content: "Ответь одним словом: готово" }], max_tokens: 20 }, request, readAll, slot); const j = JSON.parse(r.text); test = { ok: true, message: `${P.name} (${a.model || P.model}): ключ работает, ответ «${String(j.choices?.[0]?.message?.content || "").trim().slice(0, 40)}»` }; } catch (e) { test = { ok: false, message: `${P.name}: ${e.message}${/403|not allowed|unsupported_country|region/i.test(e.message) ? " — сервис не принимает запросы из России (сервер сайта в Яндекс Облаке)" : ""}` }; } }
  }
  const now = Date.now();
  const existingSlots = (rows || []).map(r => +r.slot).filter(n => n >= 1);
  const topSlot = existingSlots.length ? Math.max(...existingSlots) : 0;
  const slotsCount = Math.min(Math.max(topSlot + 1, 5), MAX_SLOT);
  const slots = Array.from({ length: slotsCount }, (_, i) => { const n = i + 1, a = (rows || []).find(r => r.slot === n), id = "s" + n, L = last.get(id); return a ? { slot: n, label: a.label || "", url: a.base_url || "", model: a.model || "", provider: providerOf({ key: a.key, url: a.base_url, model: a.model }).name, isActive: a.is_active !== false, key: tail(a.key), resting: rest.get(id) > now ? Math.ceil((rest.get(id) - now) / 60000) : 0, last: L || null } : { slot: n, empty: true }; });
  const env = loadPool().filter(a => !isPlaceholder(a.key)).map(a => ({ label: mask(a.email), isActive: a.isActive, key: tail(a.key) }));
  return { status: 200, json: { ok: true, slots, env, test, table: rows !== null } };
}
module.exports = { PROVIDERS, providerOf, chat, balances, loadPool, pool, admin, isPlaceholder, queue, ACCOUNT_POOL };
