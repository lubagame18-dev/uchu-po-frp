/* ===================================================================
   «Учу по ФРП» — оплата тарифов через Продамус (самозанятая, чеки в «Мой налог» — у Продамуса).
   Переменные функции:
     PRODAMUS_URL  — адрес вашей платёжной страницы, например https://uchupofrp.payform.ru
     PRODAMUS_KEY  — секретный ключ (Продамус → Настройки → платёжная страница → «Секретный ключ»)
     PRODAMUS_SUB_BASIC, PRODAMUS_SUB_AI, PRODAMUS_SUB_PRO — номера подписок (для автооплаты)
     SITE_URL      — адрес сайта (куда вернуть учителя после оплаты)
     SUPABASE_URL, SUPABASE_SERVICE_KEY — облако кабинета (тариф записывается туда)
   Маршруты: POST /pay/create (сайт просит ссылку на оплату), POST /pay/notify (Продамус сообщает об оплате).
   Цены — только здесь, на сервере: подменить цену со стороны браузера нельзя.
   =================================================================== */
const crypto = require("crypto");
const PLANS = { basic: { name: "Учитель", price: 300, ai: 0 }, ai: { name: "Учитель + ИИ", price: 500, ai: 50 }, pro: { name: "Методист", price: 900, ai: 120 } };
const PACKS = { ai10: { name: "10 уроков с ИИ", price: 50, ai: 10 }, ai30: { name: "30 уроков с ИИ", price: 140, ai: 30 } };
const DAY = 864e5;
const env = k => process.env[k] || "";
const on = () => !!(env("PRODAMUS_URL") && env("PRODAMUS_KEY"));

/* Подпись Продамуса: все значения — строки, ключи отсортированы (вложенно), JSON без экранирования кириллицы, HMAC-SHA256 */
function sortDeep(v) { if (Array.isArray(v)) return v.map(sortDeep); if (v && typeof v === "object") return Object.keys(v).sort().reduce((o, k) => (o[k] = sortDeep(v[k]), o), {}); return v == null ? "" : String(v); }
const phpJson = o => JSON.stringify(o).replace(/\//g, "\\/"); // как json_encode(..., JSON_UNESCAPED_UNICODE) в PHP
const sign = (data, key) => crypto.createHmac("sha256", key).update(phpJson(sortDeep(data))).digest("hex");
const verify = (data, key, s) => { if (!s) return false; const a = Buffer.from(sign(data, key)), b = Buffer.from(String(s).toLowerCase()); return a.length === b.length && crypto.timingSafeEqual(a, b); };
/* Тело уведомления (form-urlencoded) → объект, с вложенными ключами products[0][name] */
function parseForm(raw) {
  const out = {};
  for (const [k0, v] of new URLSearchParams(raw)) {
    const path = k0.replace(/\]/g, "").split("["); let o = out;
    path.forEach((p, i) => { if (i === path.length - 1) o[p] = v; else o = o[p] = o[p] || {}; });
  }
  // как в PHP: ключи 0,1,2… — это список
  const arr = o => { if (!o || typeof o !== "object") return o; const ks = Object.keys(o); if (ks.length && ks.every((k, i) => k === String(i))) return ks.map(k => arr(o[k])); for (const k of ks) o[k] = arr(o[k]); return o; };
  return arr(out);
}
/* ---------- облако ---------- */
async function sb(request, readAll, path, { method = "GET", body, token } = {}) {
  const res = await request(env("SUPABASE_URL").replace(/\/+$/, "") + path, { method, headers: { apikey: env("SUPABASE_SERVICE_KEY"), Authorization: "Bearer " + (token || env("SUPABASE_SERVICE_KEY")), "Content-Type": "application/json", Prefer: "return=representation" }, body: body ? JSON.stringify(body) : undefined, timeout: 15000 });
  const t = await readAll(res); let j = null; try { j = t ? JSON.parse(t) : null; } catch { }
  return { status: res.statusCode, json: j };
}
async function userOf(token, request, readAll) { if (!token) return null; const u = await sb(request, readAll, "/auth/v1/user", { token }); return u.status === 200 && u.json?.id ? u.json : null; }
async function profile(id, request, readAll) { return (await sb(request, readAll, `/rest/v1/profiles?id=eq.${id}&select=*`)).json?.[0] || null; }

/* ---------- 1. Ссылка на оплату ---------- */
async function create(body, userToken, request, readAll) {
  if (!on()) return { status: 503, json: { error: "оплата ещё не подключена" } };
  const user = await userOf(userToken, request, readAll);
  if (!user) return { status: 401, json: { error: "войдите в личный кабинет" } };
  const p = (await profile(user.id, request, readAll)) || { plan: "free" };
  const item = String(body.item || "");
  let kind, price, name, sub = "";
  if (PACKS[item]) {
    if (!PLANS[p.plan]?.ai) return { status: 400, json: { error: "дополнительные уроки с ИИ — для тарифов «Учитель + ИИ» и «Методист»" } };
    kind = "pack_" + item; price = PACKS[item].price; name = PACKS[item].name;
  } else if (PLANS[item]) {
    const cur = PLANS[p.plan], left = p.paid_until ? new Date(p.paid_until) - Date.now() : 0;
    if (cur && left > 0 && PLANS[item].price > cur.price) {
      // повышение тарифа: доплата разницы только за оставшиеся дни
      kind = "up_" + item; price = Math.max(10, Math.round((PLANS[item].price - cur.price) * left / (30 * DAY))); name = `Переход на тариф «${PLANS[item].name}» (доплата до ${new Date(p.paid_until).toLocaleDateString("ru-RU")})`;
    } else {
      kind = "plan_" + item; price = PLANS[item].price; name = `Тариф «${PLANS[item].name}», 1 месяц`;
      if (body.autopay) sub = env("PRODAMUS_SUB_" + item.toUpperCase());
    }
  } else return { status: 400, json: { error: "нет такого тарифа" } };
  const order = `${user.id}.${kind}.${Date.now()}`;
  const site = env("SITE_URL") || "https://lubagame18-dev.github.io/uchu-po-frp/";
  const data = { do: "pay", order_id: order, customer_email: user.email, urlReturn: site + "?pay=cancel", urlSuccess: site + "?pay=ok", sys: "", npd_income_type: "FROM_INDIVIDUAL" };
  if (sub) { data.subscription = sub; } else { data.products = [{ name, price: String(price), quantity: "1" }]; }
  data.signature = sign(data, env("PRODAMUS_KEY"));
  const q = new URLSearchParams();
  const add = (o, pre) => { for (const [k, v] of Object.entries(o)) { const key = pre ? `${pre}[${k}]` : k; if (v && typeof v === "object") add(v, key); else q.append(key, v); } };
  add(data, "");
  await sb(request, readAll, "/rest/v1/payments", { method: "POST", body: { order_id: order, user_id: user.id, kind, amount: price, status: "created" } }).catch(() => null);
  return { status: 200, json: { url: env("PRODAMUS_URL").replace(/\/+$/, "") + "/?" + q.toString(), price, name } };
}

/* ---------- 2. Уведомление об оплате (в том числе автосписание по подписке) ---------- */
async function notify(raw, headers, request, readAll) {
  const data = parseForm(raw);
  if (!verify(data, env("PRODAMUS_KEY"), headers["sign"])) return { status: 400, text: "bad sign" };
  if (!/success/i.test(String(data.payment_status || "success"))) return { status: 200, text: "success" };
  const sum = parseFloat(String(data.sum || "0").replace(",", "."));
  let [uid, kind] = String(data.order_id || "").split(".");
  // автосписание по подписке: ищем учителя по почте, тариф — по номеру подписки
  if (!kind || !/^(plan|up|pack)_/.test(kind)) {
    const email = String(data.customer_email || "").toLowerCase();
    const subId = String(data.subscription?.id || data.subscription_id || "");
    const plan = Object.keys(PLANS).find(k => env("PRODAMUS_SUB_" + k.toUpperCase()) && env("PRODAMUS_SUB_" + k.toUpperCase()) === subId);
    const pr = email ? (await sb(request, readAll, `/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=*`)).json?.[0] : null;
    if (!pr || !plan) return { status: 200, text: "success" }; // неизвестный платёж — подтверждаем, разбираетесь вручную в Продамусе
    uid = pr.id; kind = "plan_" + plan;
  }
  const p = (await profile(uid, request, readAll)) || { id: uid, plan: "free", ai_left: 0 };
  const [type, item] = kind.split("_");
  const expect = type === "pack" ? PACKS[item]?.price : type === "plan" ? PLANS[item]?.price : 10;
  if (!expect || sum + 0.01 < expect) return { status: 200, text: "success" }; // сумма меньше цены — тариф не выдаём
  const now = Date.now(), until = p.paid_until && new Date(p.paid_until) > now ? new Date(p.paid_until).getTime() : now;
  let patch;
  if (type === "plan") patch = { plan: item, ai_left: PLANS[item].ai + (p.plan === item ? Math.max(0, (p.ai_left || 0)) : 0), paid_until: new Date((p.plan === item ? until : now) + 30 * DAY).toISOString() };
  else if (type === "up") patch = { plan: item, ai_left: (p.ai_left || 0) + PLANS[item].ai - (PLANS[p.plan]?.ai || 0) };
  else patch = { ai_left: (p.ai_left || 0) + PACKS[item].ai };
  await sb(request, readAll, "/rest/v1/profiles", { method: "POST", body: { id: uid, plan: "free", ai_left: 0 } }).catch(() => null);
  await sb(request, readAll, `/rest/v1/profiles?id=eq.${uid}`, { method: "PATCH", body: patch });
  await sb(request, readAll, `/rest/v1/payments?order_id=eq.${encodeURIComponent(String(data.order_id || ""))}`, { method: "PATCH", body: { status: "paid", amount: sum } }).catch(() => null);
  return { status: 200, text: "success" };
}
module.exports = { create, notify, sign, verify, parseForm, PLANS, PACKS, on };
