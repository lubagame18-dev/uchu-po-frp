/* ===================================================================
   «Учу по ФРП» — учёт запросов к ИИ по тарифу кабинета.
   Работает, если в функции заданы SUPABASE_URL и SUPABASE_SERVICE_KEY (секретный ключ
   service_role — только на сервере!). Без них ограничений нет (как раньше).
   Таблица profiles (SQL — в ЛИЧНЫЙ_КАБИНЕТ_И_ОПЛАТА.md):
     id uuid (= пользователь), plan text, ai_left int, paid_until timestamptz
   Бесплатно (без тарифа) каждому — FREE_AI запросов в месяц (по умолчанию 15).
   =================================================================== */
const URL0 = () => (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const KEY = () => process.env.SUPABASE_SERVICE_KEY || "";
const FREE = () => Number(process.env.FREE_AI || 2);
const PER_LESSON = 40000; // ≈ токенов на один урок с ИИ
const FREE_TOK = () => FREE() * PER_LESSON;
const on = () => !!(URL0() && KEY());
async function sb(request, readAll, path, { method = "GET", body, token, prefer } = {}) {
  const res = await request(URL0() + path, { method, headers: { apikey: KEY(), Authorization: "Bearer " + (token || KEY()), "Content-Type": "application/json", Prefer: "return=representation" + (prefer ? "," + prefer : "") }, body: body ? JSON.stringify(body) : undefined, timeout: 15000 });
  const t = await readAll(res); let j = null; try { j = t ? JSON.parse(t) : null; } catch { }
  return { status: res.statusCode, json: j };
}
async function check(userToken, request, readAll) {
  if (!on()) return { ok: true, free: true };
  if (!userToken) return { ok: false, status: 401, reason: "login", message: "Войдите в личный кабинет, чтобы пользоваться ИИ сайта." };
  const u = await sb(request, readAll, "/auth/v1/user", { token: userToken });
  if (u.status !== 200 || !u.json?.id) return { ok: false, status: 401, reason: "login", message: "Вход устарел — войдите в кабинет ещё раз." };
  if (!(u.json.email_confirmed_at || u.json.confirmed_at || u.json.phone_confirmed_at)) return { ok: false, status: 403, reason: "confirm", message: "Подтвердите почту: откройте письмо от сайта и нажмите ссылку. После этого ИИ откроется." };
  const id = u.json.id;
  let p = (await sb(request, readAll, `/rest/v1/profiles?id=eq.${id}&select=*`)).json?.[0];
  const month = new Date().toISOString().slice(0, 7);
  if (!p) p = (await sb(request, readAll, "/rest/v1/profiles", { method: "POST", body: { id, email: (u.json.email || "").toLowerCase(), plan: "free", ai_left: FREE(), free_month: month } })).json?.[0] || { id, plan: "free", ai_left: FREE(), free_month: month };
  else if (!p.email && u.json.email) await sb(request, readAll, `/rest/v1/profiles?id=eq.${id}`, { method: "PATCH", body: { email: u.json.email.toLowerCase() } });
  // бесплатный доступ по промокоду: без лимитов, пока код существует и включён (удалили код — доступ закончился)
  if (await freeOk(p, request, readAll)) return { ok: true, promoFree: true };
  // бесплатный лимит обновляется раз в месяц; у платного — пока не кончился срок
  const tok = typeof p.tokens_limit === "number"; // учёт в токенах (если в облаке есть колонки tokens_limit / tokens_used)
  const patch = b => sb(request, readAll, `/rest/v1/profiles?id=eq.${id}`, { method: "PATCH", body: b });
  if (p.plan === "promo" && p.free_month !== month) { p.ai_left = FREE(); p.free_month = month; const b = { ai_left: p.ai_left, free_month: month }; if (tok) { b.tokens_limit = p.tokens_limit = FREE_TOK(); b.tokens_used = p.tokens_used = 0; } await patch(b); }
  if (p.plan !== "free" && p.plan !== "promo" && p.paid_until && new Date(p.paid_until) < new Date()) { p.plan = "free"; p.ai_left = 0; const b = { plan: "free", ai_left: 0, free_month: month }; if (tok) { b.tokens_limit = p.tokens_limit = FREE_TOK(); b.tokens_used = p.tokens_used = 0; } await patch(b); }
  const NO = { ok: false, status: 402, reason: "quota", message: "ИИ по вашему тарифу на этот месяц закончился. Можно собрать урок без ИИ, докупить уроки с ИИ или сменить тариф в кабинете." };
  if (tok) { const left = (p.tokens_limit || 0) - (p.tokens_used || 0); if (left <= 0) return NO; return { ok: true, id, tok: true, left, used: p.tokens_used || 0, limit: p.tokens_limit || 0 }; }
  if (!(p.ai_left > 0)) return NO;
  return { ok: true, id, left: p.ai_left };
}
/* Списание: в токенах — сколько реально потратил запрос (из ответа DeepSeek); иначе — 1 запрос */
async function spend(q, request, readAll, tokens = 0) {
  if (!on() || !q.id) return;
  const n = Math.max(1, Math.round(tokens));
  // атомарно одним запросом в БД (функция spend_ai из supabase.sql) — не ломается при параллельных вызовах
  const r = await sb(request, readAll, "/rest/v1/rpc/spend_ai", { method: "POST", body: { p_id: q.id, p_tokens: n, p_tok: !!q.tok } }).catch(() => null);
  if (r && r.status < 300) return;
  // запас, если функции ещё нет в облаке (с гонкой, но лучше, чем не списать)
  if (q.tok) {
    const cur = (await sb(request, readAll, `/rest/v1/profiles?id=eq.${q.id}&select=tokens_used`)).json?.[0]?.tokens_used ?? q.used;
    await sb(request, readAll, `/rest/v1/profiles?id=eq.${q.id}`, { method: "PATCH", body: { tokens_used: (cur || 0) + n } });
    return;
  }
  await sb(request, readAll, `/rest/v1/profiles?id=eq.${q.id}`, { method: "PATCH", body: { ai_left: Math.max(0, q.left - 1) } });
}
/* Промокод: закрепить «свободную зону» за учётной записью (коды — в переменной PROMO_CODES через запятую) */
async function promo(userToken, code, request, readAll) {
  const LOOK = { А: "A", В: "B", Е: "E", Ё: "E", К: "K", М: "M", Н: "H", О: "O", Р: "P", С: "C", Т: "T", Х: "X", У: "Y" };
  const N = x => String(x || "").toUpperCase().replace(/\s+/g, "").replace(/^ФРП/, "FRP").replace(/[АВЕЁКМНОРСТХУ]/g, ch => LOOK[ch]).replace(/[–—]/g, "-");
  // коды: таблица promo_codes в облаке (меняются в режиме разработчика) + переменная PROMO_CODES
  let table = [];
  if (on()) { let t = await sb(request, readAll, "/rest/v1/promo_codes?select=code,active,used_by,discount,free").catch(() => null); if (t?.status !== 200) t = await sb(request, readAll, "/rest/v1/promo_codes?select=code,active,used_by").catch(() => null); if (t?.status === 200 && Array.isArray(t.json)) table = t.json; }
  const row = table.find(r => N(r.code) === N(code));
  const envCodes = String(process.env.PROMO_CODES || "").split(",").map(N).filter(Boolean);
  const valid = row ? row.active !== false : envCodes.includes(N(code)); // отключённый в таблице код не действует, даже если он есть в переменной
  if (!N(code) || !valid) return { ok: false, status: 404, message: "нет такого промокода" };
  if (!on() || !userToken) return { ok: true };
  const u = await sb(request, readAll, "/auth/v1/user", { token: userToken });
  if (u.status !== 200 || !u.json?.id) return { ok: false, status: 401, message: "войдите в кабинет" };
  const em = (u.json.email || "").toLowerCase();
  if (row && em && !(row.used_by || []).includes(em)) await sb(request, readAll, `/rest/v1/promo_codes?code=eq.${encodeURIComponent(row.code)}`, { method: "PATCH", body: { used_by: [...(row.used_by || []), em] } }).catch(() => null);
  await sb(request, readAll, "/rest/v1/profiles", { method: "POST", body: { id: u.json.id, email: (u.json.email || "").toLowerCase(), plan: "free", ai_left: 0 } }).catch(() => null);
  // код бесплатного доступа (он один): все возможности сайта без оплаты, пока код существует и включён
  if (row?.free) {
    let r = await sb(request, readAll, `/rest/v1/profiles?id=eq.${u.json.id}`, { method: "PATCH", body: { promo_free_code: row.code, promo: false } });
    // облако ещё не обновлено (нет колонки) — открываем всё через самый полный тариф без срока
    const FULL = { plan: "pro", paid_until: "2099-12-31T00:00:00Z", ai_left: 100000 };
    if (r.status >= 300) { r = await sb(request, readAll, `/rest/v1/profiles?id=eq.${u.json.id}`, { method: "PATCH", body: { ...FULL, tokens_limit: 1e12, tokens_used: 0 } }); if (r.status >= 300) await sb(request, readAll, `/rest/v1/profiles?id=eq.${u.json.id}`, { method: "PATCH", body: FULL }); }
    return { ok: true, free: true };
  }
  // код скидки: процент задаёт тот, кто выдаёт промокоды (по умолчанию 50%); в тарифах с ИИ — своя нейросеть
  const pct = Math.max(1, Math.min(99, Math.round(+row?.discount || 50)));
  let r = await sb(request, readAll, `/rest/v1/profiles?id=eq.${u.json.id}`, { method: "PATCH", body: { promo: true, promo_pct: pct } });
  if (r.status >= 300) r = await sb(request, readAll, `/rest/v1/profiles?id=eq.${u.json.id}`, { method: "PATCH", body: { promo: true } });
  if (r.status >= 300) await sb(request, readAll, `/rest/v1/profiles?id=eq.${u.json.id}`, { method: "PATCH", body: { plan: "promo" } }); // колонки promo ещё нет — по-старому
  return { ok: true, pct };
}
/* Действует ли у человека код бесплатного доступа */
async function freeOk(p, request, readAll) {
  if (!p?.promo_free_code || !on()) return false;
  const c = (await sb(request, readAll, `/rest/v1/promo_codes?code=eq.${encodeURIComponent(p.promo_free_code)}&select=free,active`).catch(() => null))?.json?.[0];
  return !!(c && c.free && c.active !== false);
}
/* Автор сайта: вошёл в кабинет почтой из таблицы site_admins */
async function isAdmin(userToken, request, readAll) {
  if (!on() || !userToken) return false;
  const u = await sb(request, readAll, "/auth/v1/user", { token: userToken });
  const email = (u.json?.email || "").toLowerCase(); if (u.status !== 200 || !email) return false;
  const r = await sb(request, readAll, `/rest/v1/site_admins?email=eq.${encodeURIComponent(email)}&select=email`);
  return Array.isArray(r.json) && r.json.length > 0;
}
/* Разработчик ввёл код на сайте (уже войдя в кабинет) — вносим его почту в site_admins.
   Сверяется отпечаток кода, как на сайте; свой код — переменная DEV_CODE_HASH (SHA-256 от "uchu-po-frp:dev:v5" + код). */
// отпечаток кода разработчика берётся только из переменной окружения DEV_CODE_HASH (в репозитории его нет).
// Задай длинный случайный код; хэш = SHA-256 от "uchu-po-frp:dev:v5" + код.
const DEV_HASH = () => process.env.DEV_CODE_HASH || "";
/* Защита от подбора кода: не больше 8 неверных попыток за 15 минут на вошедшего и 30 — на весь экземпляр функции.
   Счётчик в памяти (у каждого экземпляра свой), поэтому код всё равно должен быть длинным и случайным. */
const fails = new Map();
function tooMany(key) { const now = Date.now(), a = (fails.get(key) || []).filter(t => now - t < 900000); fails.set(key, a); return a.length >= (key === "*" ? 30 : 8); }
function failed(key) { const a = fails.get(key) || []; a.push(Date.now()); fails.set(key, a); const g = fails.get("*") || []; g.push(Date.now()); fails.set("*", g); if (fails.size > 2000) for (const [k, v] of fails) if (!v.length || Date.now() - v[v.length - 1] > 900000) fails.delete(k); }
async function join(userToken, code, request, readAll) {
  if (!on()) return { ok: false, status: 503, message: "облако не подключено" };
  const u = await sb(request, readAll, "/auth/v1/user", { token: userToken });
  const email = (u.json?.email || "").toLowerCase(); if (u.status !== 200 || !email) return { ok: false, status: 401, message: "войдите в кабинет" };
  // уже разработчик (почта есть в site_admins) — код не нужен
  const ex = await sb(request, readAll, `/rest/v1/site_admins?email=eq.${encodeURIComponent(email)}&select=email`);
  if (Array.isArray(ex.json) && ex.json.length) return { ok: true, email, already: true };
  if (!DEV_HASH()) return { ok: false, status: 403, message: "вход по коду разработчика отключён на сервере" };
  if (tooMany(u.json.id) || tooMany("*")) return { ok: false, status: 429, message: "слишком много неверных попыток, подождите 15 минут" };
  const h = require("crypto").createHash("sha256").update("uchu-po-frp:dev:v5" + String(code || "")).digest("hex");
  if (h !== DEV_HASH()) { failed(u.json.id); return { ok: false, status: 403, message: "неверный код" }; }
  await sb(request, readAll, "/rest/v1/site_admins?on_conflict=email", { method: "POST", body: { email } });
  return { ok: true, email };
}
/* Бесплатный тариф: учёт уроков на сервере сразу по трём ключам — учётная запись, устройство
   (отпечаток браузера, не сбрасывается очисткой) и сеть (/24). Новая почта на том же устройстве
   лимит не обнуляет. Сеть — с запасом: в школе многие учителя выходят с одного адреса. */
const FREE_LESSONS = () => Number(process.env.FREE_LESSONS || 3), FREE_NET = () => Number(process.env.FREE_NET || 25);
async function freeUse(userToken, body, ip, request, readAll) {
  if (!on()) return { ok: true, off: true };
  const u = userToken ? await sb(request, readAll, "/auth/v1/user", { token: userToken }) : null;
  if (!u || u.status !== 200 || !u.json?.id) return { ok: false, status: 401, reason: "login", message: "Войдите в личный кабинет, чтобы собрать бесплатный урок." };
  const H = s => require("crypto").createHash("sha256").update("uchu-free:" + s).digest("hex").slice(0, 32);
  const net = String(ip || "").replace(/^::ffff:/, "").split(".").slice(0, 3).join(".");
  const month = new Date().toISOString().slice(0, 7);
  const keys = [["u:" + u.json.id, FREE_LESSONS()], ...(body.fp ? [["f:" + H(String(body.fp).slice(0, 200)), FREE_LESSONS()]] : []), ...(body.dev ? [["d:" + H(String(body.dev).slice(0, 100)), FREE_LESSONS()]] : []), ...(net ? [["n:" + H(net), FREE_NET()]] : [])];
  const netMsg = "С этой сети бесплатные уроки на этот месяц закончились. Выберите тариф.";
  const devMsg = "Бесплатные уроки на этот месяц закончились (на этом устройстве или в этом кабинете). Выберите тариф — уроки без ограничений.";
  // атомарно: проверка и списание всех ключей одной функцией в БД (free_use_bump из supabase.sql) — не обойти параллельными запросами
  const rpc = await sb(request, readAll, "/rest/v1/rpc/free_use_bump", { method: "POST", body: { keys: keys.map(k => k[0]), lims: keys.map(k => k[1]), mon: month, dry: !!body.dry } }).catch(() => null);
  if (rpc && rpc.status < 300 && rpc.json && typeof rpc.json === "object") {
    if (rpc.json.over) return { ok: false, status: 402, reason: "free", message: String(rpc.json.over).startsWith("n:") ? netMsg : devMsg };
    return { ok: true, left: rpc.json.left };
  }
  // запас, если функции ещё нет в облаке (со старой гонкой)
  const list = (await sb(request, readAll, `/rest/v1/free_usage?month=eq.${month}&key=in.(${keys.map(k => `"${k[0]}"`).join(",")})&select=key,n`)).json;
  if (!Array.isArray(list)) return { ok: true, off: true }; // таблицы ещё нет — не мешаем
  const n = k => (list.find(r => r.key === k)?.n) || 0;
  const over = keys.find(([k, lim]) => n(k) >= lim);
  if (over) return { ok: false, status: 402, reason: "free", message: over[0][0] === "n" ? netMsg : devMsg };
  if (body.dry) return { ok: true, left: Math.min(...keys.map(([k, lim]) => lim - n(k))) };
  for (const [k] of keys) await sb(request, readAll, "/rest/v1/free_usage?on_conflict=key,month", { method: "POST", body: { key: k, month, n: n(k) + 1, updated_at: new Date().toISOString() }, prefer: "resolution=merge-duplicates" });
  return { ok: true, left: Math.min(...keys.map(([k, lim]) => lim - n(k) - 1)) };
}
const devCodeOk = code => {
  if (!DEV_HASH() || !code || tooMany("*")) return false;
  const ok = require("crypto").createHash("sha256").update("uchu-po-frp:dev:v5" + String(code)).digest("hex") === DEV_HASH();
  if (!ok) failed("*");
  return ok;
};
/* Проверка входа без списания квоты (для открытых маршрутов вроде /relay) */
async function validUser(userToken, request, readAll) {
  if (!on() || !userToken) return null;
  const u = await sb(request, readAll, "/auth/v1/user", { token: userToken });
  return u.status === 200 && u.json?.id ? u.json : null;
}
module.exports = { check, spend, on, promo, isAdmin, join, freeUse, devCodeOk, freeOk, validUser };
