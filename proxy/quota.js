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
const on = () => !!(URL0() && KEY());
async function sb(request, readAll, path, { method = "GET", body, token } = {}) {
  const res = await request(URL0() + path, { method, headers: { apikey: KEY(), Authorization: "Bearer " + (token || KEY()), "Content-Type": "application/json", Prefer: "return=representation" }, body: body ? JSON.stringify(body) : undefined, timeout: 15000 });
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
  if (p.plan === "free" && p.free_month !== month) { p.ai_left = FREE(); p.free_month = month; await sb(request, readAll, `/rest/v1/profiles?id=eq.${id}`, { method: "PATCH", body: { ai_left: p.ai_left, free_month: month } }); }
  if (p.plan !== "free" && p.paid_until && new Date(p.paid_until) < new Date()) { p.plan = "free"; p.ai_left = FREE(); await sb(request, readAll, `/rest/v1/profiles?id=eq.${id}`, { method: "PATCH", body: { plan: "free", ai_left: p.ai_left, free_month: month } }); }
  if (!(p.ai_left > 0)) return { ok: false, status: 402, reason: "quota", message: "Запросы к ИИ по вашему тарифу на этот месяц закончились. Можно собрать урок без ИИ или сменить тариф в кабинете." };
  return { ok: true, id, left: p.ai_left };
}
async function spend(q, request, readAll) {
  if (!on() || !q.id) return;
  await sb(request, readAll, `/rest/v1/profiles?id=eq.${q.id}`, { method: "PATCH", body: { ai_left: Math.max(0, q.left - 1) } });
}
/* Промокод: закрепить «свободную зону» за учётной записью (коды — в переменной PROMO_CODES через запятую) */
async function promo(userToken, code, request, readAll) {
  const LOOK = { А: "A", В: "B", Е: "E", Ё: "E", К: "K", М: "M", Н: "H", О: "O", Р: "P", С: "C", Т: "T", Х: "X", У: "Y" };
  const N = x => String(x || "").toUpperCase().replace(/\s+/g, "").replace(/^ФРП/, "FRP").replace(/[АВЕЁКМНОРСТХУ]/g, ch => LOOK[ch]).replace(/[–—]/g, "-");
  const codes = String(process.env.PROMO_CODES || "").split(",").map(N).filter(Boolean);
  if (!codes.includes(N(code))) return { ok: false, status: 404, message: "нет такого промокода" };
  if (!on() || !userToken) return { ok: true };
  const u = await sb(request, readAll, "/auth/v1/user", { token: userToken });
  if (u.status !== 200 || !u.json?.id) return { ok: false, status: 401, message: "войдите в кабинет" };
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
module.exports = { check, spend, on, promo, isAdmin };
