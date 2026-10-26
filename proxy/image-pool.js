/* ===================================================================
   «Учу по ФРП» — пул ключей для КАРТИНОК (рабочие листы и презентации).
   Отдельно от пула текстовой модели (deepseek-pool.js): 5 ячеек, ключи только на сервере.
   Как работает: карусель; если ключ перегружен или закончились деньги (429, 402, 401, 5xx),
   запрос сам уходит на следующий ключ, а сломанный ключ «отдыхает» (5 минут, при 401/402 — час).
   Сервис: любой OpenAI-совместимый /images/generations (например AITUNNEL: https://api.aitunnel.ru/v1).
   Тариф и месячный лимит листов проверяются здесь же (таблица profiles, колонки img_month, img_used).
   Ключи — в таблице img_keys (SQL в supabase.sql) или в переменной IMG_POOL:
     [{"label":"основной","key":"sk-...","url":"https://api.aitunnel.ru/v1","model":"flux-schnell"}]
   =================================================================== */
const SLOTS = 5;
const DEF_URL = () => process.env.IMG_API_URL || "https://api.aitunnel.ru/v1";
const DEF_MODEL = () => process.env.IMG_MODEL || "flux-schnell";
const QUOTA = { ai: +process.env.IMG_QUOTA_AI || 8, pro: +process.env.IMG_QUOTA_PRO || 18 };
const SB = () => ({ url: (process.env.SUPABASE_URL || "").replace(/\/+$/, ""), key: process.env.SUPABASE_SERVICE_KEY || "" });
const isPlaceholder = k => !k || /^\.+$/.test(k) || k.length < 10;
const mask = e => String(e).replace(/^(.).*(@.*)$/, "$1***$2");
const tail = k => isPlaceholder(k) ? "" : String(k).slice(0, 3) + "…" + String(k).slice(-4);
const RU_BLOCKED_HOST = /anthropic\.com|openai\.com|googleapis\.com|(^|\.)x\.ai|groq\.com|claude\.ai/i;
async function sb(request, readAll, path, { method = "GET", body, token } = {}) {
  const { url, key } = SB(); if (!url || !key) return { status: 0, json: null };
  const res = await request(url + path, { method, headers: { apikey: key, Authorization: "Bearer " + (token || key), "Content-Type": "application/json", Prefer: "return=representation,resolution=merge-duplicates" }, body: body ? JSON.stringify(body) : undefined });
  const t = await readAll(res); let j = null; try { j = t ? JSON.parse(t) : null; } catch { }
  return { status: res.statusCode, json: j };
}
let cache = { at: 0, list: [] };
async function dbPool(request, readAll, force) {
  if (!SB().url || !SB().key) return [];
  if (!force && Date.now() - cache.at < 30000) return cache.list;
  try { const r = await sb(request, readAll, "/rest/v1/img_keys?select=*&order=slot"); if (r.status === 200 && Array.isArray(r.json)) cache = { at: Date.now(), list: r.json }; } catch (e) { console.warn("img_keys:", e.message); }
  return cache.list;
}
function envPool() { try { return process.env.IMG_POOL ? JSON.parse(process.env.IMG_POOL) : []; } catch { return []; } }
async function pool(request, readAll, force) {
  const db = (await dbPool(request, readAll, force)).map(a => ({ id: "s" + a.slot, slot: a.slot, label: String(a.label || "ячейка " + a.slot), key: String(a.key || "").trim(), url: String(a.base_url || "").trim().replace(/\/+$/, ""), model: String(a.model || "").trim(), isActive: a.is_active !== false }));
  const env = envPool().map((a, i) => ({ id: "e" + i, label: String(a.label || "ключ " + (i + 1)), key: String(a.key || "").trim(), url: String(a.url || "").trim().replace(/\/+$/, ""), model: String(a.model || "").trim(), isActive: a.isActive !== false }));
  return db.concat(env);
}
const rest = new Map(), last = new Map(); let cursor = 0;
async function queue(request, readAll) {
  const p = (await pool(request, readAll)).filter(a => a.isActive && !isPlaceholder(a.key));
  if (!p.length) return [];
  const s = cursor++ % p.length, ord = p.slice(s).concat(p.slice(0, s)), now = Date.now(), fresh = ord.filter(a => !(rest.get(a.id) > now));
  return fresh.length ? fresh : ord;
}
const sizeOf = (aspect, model) => { const dalle = /dall-e-3/.test(model); return aspect === "1:1" ? "1024x1024" : aspect === "9:16" || aspect === "3:4" ? (dalle ? "1024x1792" : "1024x1536") : (dalle ? "1792x1024" : "1536x1024"); };
/* Один запрос к одному ключу: 3 попытки с упрощением параметров (некоторые сервисы не знают response_format / size) */
async function one(a, prompt, aspect, request, readAll, only) {
  const base = (a.url || DEF_URL()).replace(/\/+$/, ""), model = a.model || DEF_MODEL();
  if (RU_BLOCKED_HOST.test(base)) return { skip: true };
  const bd = { model, prompt: `${prompt} Aspect ratio ${aspect}.`, n: 1, size: sizeOf(aspect, model), response_format: "b64_json" };
  let res, text;
  for (let i = 0; i < 3; i++) {
    res = await request(base + "/images/generations", { headers: { Authorization: "Bearer " + a.key, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(bd), timeout: 120000 });
    text = await readAll(res);
    if (res.statusCode !== 400) break;
    if (i === 0) delete bd.response_format; else delete bd.size;
  }
  return { status: res.statusCode, text };
}
async function image(prompt, aspect, request, readAll, onlySlot) {
  let accounts = await queue(request, readAll);
  if (onlySlot) accounts = (await pool(request, readAll)).filter(a => a.slot === +onlySlot && !isPlaceholder(a.key));
  if (!accounts.length) { const e = new Error("на сервере не подключён ни один общий ключ для картинок"); e.status = 503; e.reason = "no_key"; throw e; }
  let lastErr = null;
  for (const a of accounts) {
    try {
      const r = await one(a, prompt, aspect, request, readAll);
      if (r.skip) continue;
      if (r.status === 200) {
        let j = {}; try { j = JSON.parse(r.text); } catch { }
        const d = j.data?.[0], im = d?.b64_json ? "data:image/png;base64," + d.b64_json : d?.url || "";
        if (!im) { lastErr = { status: 502, text: "сервис не вернул картинку" }; last.set(a.id, { at: Date.now(), status: 502, error: lastErr.text }); rest.set(a.id, Date.now() + 60e3); continue; }
        rest.delete(a.id); last.set(a.id, { at: Date.now(), status: 200 });
        return { image: im, account: mask(a.label) };
      }
      last.set(a.id, { at: Date.now(), status: r.status, error: String(r.text).slice(0, 160) });
      lastErr = { status: r.status, text: r.text };
      const pause = [401, 402, 403].includes(r.status) ? 3600e3 : r.status === 429 ? 300e3 : r.status >= 500 ? 60e3 : 0;
      if (!pause) break;
      rest.set(a.id, Date.now() + pause);
      console.warn(`Картинки: ${mask(a.label)} ответил ${r.status}, переключаюсь на следующий ключ`);
    } catch (e) { lastErr = { status: 502, text: String(e.message || e) }; last.set(a.id, { at: Date.now(), status: 502, error: lastErr.text.slice(0, 160) }); rest.set(a.id, Date.now() + 60e3); }
  }
  const e = new Error("Картинку не удалось нарисовать ни на одном общем ключе: " + (lastErr ? `HTTP ${lastErr.status} ${String(lastErr.text).slice(0, 160)}` : "нет ответа"));
  e.status = lastErr?.status === 400 ? 400 : 502; e.reason = lastErr?.status === 402 ? "payment" : lastErr?.status === 429 ? "rate" : "other"; throw e;
}
/* ---------- тариф и месячный лимит листов с картинками ---------- */
async function check(userToken, request, readAll) {
  const { url, key } = SB(); if (!url || !key) return { ok: true, free: true };
  if (!userToken) return { ok: false, status: 401, reason: "login", message: "Войдите в личный кабинет." };
  const u = await sb(request, readAll, "/auth/v1/user", { token: userToken });
  if (u.status !== 200 || !u.json?.id) return { ok: false, status: 401, reason: "login", message: "Вход устарел — войдите в кабинет ещё раз." };
  if (!(u.json.email_confirmed_at || u.json.confirmed_at || u.json.phone_confirmed_at)) return { ok: false, status: 403, reason: "confirm", message: "Подтвердите почту: откройте письмо от сайта и нажмите ссылку. После этого ИИ откроется." };
  const id = u.json.id, p = (await sb(request, readAll, `/rest/v1/profiles?id=eq.${id}&select=*`)).json?.[0] || {};
  const month = new Date().toISOString().slice(0, 7);
  const paid = !p.paid_until || new Date(p.paid_until) >= new Date();
  const q = paid ? QUOTA[p.plan] : 0;
  if (!q) return { ok: false, status: 403, reason: "plan", message: "Картинки для листов доступны в тарифах «Учитель + ИИ» и «Методист»." };
  const used = p.img_month === month ? (p.img_used || 0) : 0;
  return { ok: true, id, month, used, left: q - used, q };
}
async function spend(c, request, readAll) {
  if (!c.id) return;
  await sb(request, readAll, `/rest/v1/profiles?id=eq.${c.id}`, { method: "PATCH", body: { img_month: c.month, img_used: c.used + 1 } });
}
/* Запрос сайта: POST /image {prompt, aspect}. Лист с картинками = 1 единица лимита; сайт присылает kind:"sheet" один раз на лист, остальные запросы того же листа — kind:"part" (не списываются) */
async function handle(body, userToken, request, readAll) {
  const prompt = String(body.prompt || "").slice(0, 3000), aspect = /^(1:1|3:4|4:3|16:9|9:16)$/.test(body.aspect) ? body.aspect : "16:9";
  if (!prompt) return { status: 400, json: { error: "нет описания картинки" } };
  const c = await check(userToken, request, readAll);
  if (!c.ok) return { status: c.status, json: { error: c.message, reason: c.reason } };
  if (c.left !== undefined && c.left <= 0 && body.kind !== "part") return { status: 402, json: { error: "В этом месяце лимит листов с картинками исчерпан.", reason: "quota" } };
  try {
    const r = await image(prompt, aspect, request, readAll);
    if (body.kind !== "part") await spend(c, request, readAll);
    return { status: 200, json: { image: r.image } };
  } catch (e) { return { status: e.status || 502, json: { error: e.message, reason: e.reason } }; }
}
/* ---------- управление ячейками с сайта (только автору сайта) ---------- */
async function admin(body, request, readAll) {
  if (!SB().url || !SB().key) return { status: 400, json: { error: "в функции не заданы SUPABASE_URL и SUPABASE_SERVICE_KEY" } };
  const act = body.action || "list", slot = Math.round(+body.slot);
  if (act !== "list" && !(slot >= 1 && slot <= SLOTS)) return { status: 400, json: { error: "ячейка — от 1 до " + SLOTS } };
  if (act === "save") {
    const row = { slot, label: String(body.label || "").slice(0, 80), base_url: String(body.url || "").trim().slice(0, 200), model: String(body.model || "").trim().slice(0, 80), is_active: body.isActive !== false, updated_at: new Date().toISOString() };
    if (row.base_url && !/^https:\/\/[\w.-]+(\/[\w./-]*)?$/.test(row.base_url)) return { status: 400, json: { error: "адрес должен начинаться с https://" } };
    if (RU_BLOCKED_HOST.test(row.base_url)) return { status: 400, json: { error: "этот сервис (OpenAI, Google, Claude, Grok, Groq) не работает из России — подключайте посредника, например AITUNNEL" } };
    const k = String(body.key || "").trim(); if (k) row.key = k;
    const old = (await dbPool(request, readAll, true)).find(a => a.slot === slot);
    if (!old && !k) return { status: 400, json: { error: "вставьте ключ" } };
    const r = await sb(request, readAll, "/rest/v1/img_keys?on_conflict=slot", { method: "POST", body: { ...(old || {}), ...row } });
    if (r.status >= 300) return { status: 502, json: { error: /img_keys/.test(JSON.stringify(r.json)) ? "в облаке нет таблицы img_keys — выполните SQL из supabase.sql" : "облако не приняло ключ: " + JSON.stringify(r.json).slice(0, 160) } };
    rest.delete("s" + slot); last.delete("s" + slot);
  }
  if (act === "delete") { await sb(request, readAll, `/rest/v1/img_keys?slot=eq.${slot}`, { method: "DELETE" }); rest.delete("s" + slot); last.delete("s" + slot); }
  const rows = await dbPool(request, readAll, true);
  let test = null;
  if (act === "test") {
    const a = (await pool(request, readAll)).find(x => x.slot === slot);
    if (!a || isPlaceholder(a.key)) test = { ok: false, message: "в ячейке нет ключа" };
    else { try { await image("A simple smiling sun, flat vector, white background. No text.", "1:1", request, readAll, slot); test = { ok: true, message: "ключ работает: тестовая картинка нарисована" }; } catch (e) { test = { ok: false, message: e.message }; } }
  }
  const now = Date.now();
  const slots = Array.from({ length: SLOTS }, (_, i) => { const n = i + 1, a = rows.find(r => r.slot === n), id = "s" + n, L = last.get(id); return a ? { slot: n, label: a.label || "", url: a.base_url || "", model: a.model || "", isActive: a.is_active !== false, empty: isPlaceholder(a.key), key: tail(a.key), resting: rest.get(id) > now ? Math.ceil((rest.get(id) - now) / 60000) : 0, last: L || null, provider: a.base_url ? "" : "AITUNNEL" } : { slot: n, empty: true, isActive: true, label: "", url: "", model: "" }; });
  const env = envPool().filter(a => !isPlaceholder(a.key)).map(a => ({ label: mask(a.label || ""), isActive: a.isActive !== false, key: tail(a.key) }));
  return { status: 200, json: { ok: true, slots, env, test } };
}
module.exports = { image, handle, admin, check, pool, queue, QUOTA };
