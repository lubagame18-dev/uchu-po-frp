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
const FREE = () => Number(process.env.FREE_AI || 15);
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
  const id = u.json.id;
  let p = (await sb(request, readAll, `/rest/v1/profiles?id=eq.${id}&select=*`)).json?.[0];
  const month = new Date().toISOString().slice(0, 7);
  if (!p) p = (await sb(request, readAll, "/rest/v1/profiles", { method: "POST", body: { id, email: (u.json.email || "").toLowerCase(), plan: "free", ai_left: FREE(), free_month: month } })).json?.[0] || { id, plan: "free", ai_left: FREE(), free_month: month };
  else if (!p.email && u.json.email) await sb(request, readAll, `/rest/v1/profiles?id=eq.${id}`, { method: "PATCH", body: { email: u.json.email.toLowerCase() } });
  // бесплатный лимит обновляется раз в месяц; у платного — пока не кончился срок
  const tok = typeof p.tokens_limit === "number"; // учёт в токенах (если в облаке есть колонки tokens_limit / tokens_used)
  const patch = b => sb(request, readAll, `/rest/v1/profiles?id=eq.${id}`, { method: "PATCH", body: b });
  if ((p.plan === "free" || p.plan === "promo") && p.free_month !== month) { p.ai_left = FREE(); p.free_month = month; const b = { ai_left: p.ai_left, free_month: month }; if (tok) { b.tokens_limit = p.tokens_limit = FREE_TOK(); b.tokens_used = p.tokens_used = 0; } await patch(b); }
  if (p.plan !== "free" && p.plan !== "promo" && p.paid_until && new Date(p.paid_until) < new Date()) { p.plan = "free"; p.ai_left = FREE(); const b = { plan: "free", ai_left: p.ai_left, free_month: month }; if (tok) { b.tokens_limit = p.tokens_limit = FREE_TOK(); b.tokens_used = p.tokens_used = 0; } await patch(b); }
  const NO = { ok: false, status: 402, reason: "quota", message: "ИИ по вашему тарифу на этот месяц закончился. Можно собрать урок без ИИ, докупить уроки с ИИ или сменить тариф в кабинете." };
  if (tok) { const left = (p.tokens_limit || 0) - (p.tokens_used || 0); if (left <= 0) return NO; return { ok: true, id, tok: true, left, used: p.tokens_used || 0, limit: p.tokens_limit || 0 }; }
  if (!(p.ai_left > 0)) return NO;
  return { ok: true, id, left: p.ai_left };
}
/* Списание: в токенах — сколько реально потратил запрос (из ответа DeepSeek); иначе — 1 запрос */
async function spend(q, request, readAll, tokens = 0) {
  if (!on() || !q.id) return;
  if (q.tok) {
    const cur = (await sb(request, readAll, `/rest/v1/profiles?id=eq.${q.id}&select=tokens_used`)).json?.[0]?.tokens_used ?? q.used;
    await sb(request, readAll, `/rest/v1/profiles?id=eq.${q.id}`, { method: "PATCH", body: { tokens_used: (cur || 0) + Math.max(1, Math.round(tokens)) } });
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
  if (on()) { const t = await sb(request, readAll, "/rest/v1/promo_codes?select=code,active,used_by").catch(() => null); if (t?.status === 200 && Array.isArray(t.json)) table = t.json; }
  const row = table.find(r => N(r.code) === N(code));
  const envCodes = String(process.env.PROMO_CODES || "").split(",").map(N).filter(Boolean);
  const valid = row ? row.active !== false : envCodes.includes(N(code)); // отключённый в таблице код не действует, даже если он есть в переменной
  if (!N(code) || !valid) return { ok: false, status: 404, message: "нет такого промокода" };
  if (!on() || !userToken) return { ok: true };
  const u = await sb(request, readAll, "/auth/v1/user", { token: userToken });
  if (u.status !== 200 || !u.json?.id) return { ok: false, status: 401, message: "войдите в кабинет" };
  const em = (u.json.email || "").toLowerCase();
  if (row && em && !(row.used_by || []).includes(em)) await sb(request, readAll, `/rest/v1/promo_codes?code=eq.${encodeURIComponent(row.code)}`, { method: "PATCH", body: { used_by: [...(row.used_by || []), em] } }).catch(() => null);
  // промокод — отметка promo (скидка 50% на тарифы, своя нейросеть вместо ИИ сайта); тариф не меняется
  await sb(request, readAll, "/rest/v1/profiles", { method: "POST", body: { id: u.json.id, email: (u.json.email || "").toLowerCase(), plan: "free", ai_left: 0 } }).catch(() => null);
  const r = await sb(request, readAll, `/rest/v1/profiles?id=eq.${u.json.id}`, { method: "PATCH", body: { promo: true } });
  if (r.status >= 300) await sb(request, readAll, `/rest/v1/profiles?id=eq.${u.json.id}`, { method: "PATCH", body: { plan: "promo" } }); // колонки promo ещё нет — по-старому
  return { ok: true };
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
const DEV_HASH = () => process.env.DEV_CODE_HASH || "7c22fbd5e2f15b7e42bc033064a7e36016d49d7e6f1300dab2bb1fdd3dd31c1e";
async function join(userToken, code, request, readAll) {
  if (!on()) return { ok: false, status: 503, message: "облако не подключено" };
  const h = require("crypto").createHash("sha256").update("uchu-po-frp:dev:v5" + String(code || "")).digest("hex");
  if (h !== DEV_HASH()) return { ok: false, status: 403, message: "неверный код" };
  const u = await sb(request, readAll, "/auth/v1/user", { token: userToken });
  const email = (u.json?.email || "").toLowerCase(); if (u.status !== 200 || !email) return { ok: false, status: 401, message: "войдите в кабинет" };
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
  const list = (await sb(request, readAll, `/rest/v1/free_usage?month=eq.${month}&key=in.(${keys.map(k => `"${k[0]}"`).join(",")})&select=key,n`)).json;
  if (!Array.isArray(list)) return { ok: true, off: true }; // таблицы ещё нет — не мешаем
  const n = k => (list.find(r => r.key === k)?.n) || 0;
  const over = keys.find(([k, lim]) => n(k) >= lim);
  if (over) return { ok: false, status: 402, reason: "free", message: over[0][0] === "n" ? "С этой сети бесплатные уроки на этот месяц закончились. Выберите тариф." : "Бесплатные уроки на этот месяц закончились (на этом устройстве или в этом кабинете). Выберите тариф — уроки без ограничений." };
  if (body.dry) return { ok: true, left: Math.min(...keys.map(([k, lim]) => lim - n(k))) };
  for (const [k] of keys) await sb(request, readAll, "/rest/v1/free_usage?on_conflict=key,month", { method: "POST", body: { key: k, month, n: n(k) + 1, updated_at: new Date().toISOString() }, prefer: "resolution=merge-duplicates" });
  return { ok: true, left: Math.min(...keys.map(([k, lim]) => lim - n(k) - 1)) };
}
module.exports = { check, spend, on, promo, isAdmin, join, freeUse };
