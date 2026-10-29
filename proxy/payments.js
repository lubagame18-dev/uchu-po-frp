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
/* tokens — сколько токенов ИИ сайта (DeepSeek) входит в тариф на месяц: ≈ 40 тыс. на урок с ИИ */
const PLANS = { basic: { name: "Без ИИ", price: 250, ai: 0, tokens: 0, days: 30 }, ai: { name: "С ИИ", price: 500, ai: 90, tokens: 4860000, days: 30 }, basicYear: { name: "Без ИИ, год", price: 2000, ai: 0, tokens: 0, days: 365 }, aiYear: { name: "С ИИ, год", price: 4000, ai: 1080, tokens: 58320000, days: 365 }, pro: { name: "Методист", price: 1190, ai: 140, tokens: 7560000, days: 30 } };
const PROMO_K = 0.5; // скидка по промокоду, если у кода не задан свой процент
const kOf = p => (!!p.promo || p.plan === "promo") ? (p.promo_pct ? 1 - Math.max(1, Math.min(99, +p.promo_pct)) / 100 : PROMO_K) : 1;
const PACKS = { ai10: { name: "10 конспектов с ИИ", price: 70, ai: 10, tokens: 540000 }, ai30: { name: "30 конспектов с ИИ", price: 190, ai: 30, tokens: 1620000 } };
const DAY = 864e5;
const env = k => process.env[k] || "";
/* ЮKassa (самозанятые): YOOKASSA_SHOP_ID и YOOKASSA_KEY — если заданы, оплата идёт через неё (основной способ — СБП) */
const yk = () => !!(env("YOOKASSA_SHOP_ID") && env("YOOKASSA_KEY"));
const on = () => yk() || !!(env("PRODAMUS_URL") && env("PRODAMUS_KEY"));

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
async function userOf(token, request, readAll) { if (!token) return null; const u = await sb(request, readAll, "/auth/v1/user", { token }); return u.status === 200 && u.json?.id && (u.json.email_confirmed_at || u.json.confirmed_at || u.json.phone_confirmed_at) ? u.json : null; }
async function profile(id, request, readAll) { return (await sb(request, readAll, `/rest/v1/profiles?id=eq.${id}&select=*`)).json?.[0] || null; }

/* ---------- 1. Ссылка на оплату ---------- */
async function create(body, userToken, request, readAll) {
  if (!on()) return { status: 503, json: { error: "оплата ещё не подключена" } };
  const user = await userOf(userToken, request, readAll);
  if (!user) return { status: 401, json: { error: "войдите в личный кабинет" } };
  const p = (await profile(user.id, request, readAll)) || { plan: "free" };
  if (p.promo_free_code && await require("./quota.js").freeOk(p, request, readAll)) return { status: 400, json: { error: "у вас бесплатный доступ по промокоду — оплачивать ничего не нужно" } };
  const promo = !!p.promo || p.plan === "promo", k = kOf(p), pct = Math.round((1 - k) * 100); // по промокоду — скидка, которую задал выдавший код
  if (p.plan === "promo") p.plan = "free";
  const item = String(body.item || "");
  let kind, price, name, sub = "";
  if (PACKS[item]) {
    if (promo) return { status: 400, json: { error: "по промокоду в тарифах с ИИ работает ваша нейросеть — докупать уроки не нужно" } };
    if (!PLANS[p.plan]?.ai) return { status: 400, json: { error: "дополнительные уроки с ИИ — для тарифов «Учитель + ИИ» и «Методист»" } };
    kind = "pack_" + item; price = PACKS[item].price; name = PACKS[item].name;
  } else if (PLANS[item]) {
    const cur = PLANS[p.plan], left = p.paid_until ? new Date(p.paid_until) - Date.now() : 0;
    if (cur && left > 0 && PLANS[item].price > cur.price) {
      // повышение тарифа: доплата разницы только за оставшиеся дни
      kind = "up_" + item; price = Math.max(10, Math.round((PLANS[item].price - cur.price) * k * left / ((PLANS[item]?.days || 30) * DAY))); name = `Переход на тариф «${PLANS[item].name}» (доплата до ${new Date(p.paid_until).toLocaleDateString("ru-RU")})`;
    } else {
      kind = "plan_" + item; price = Math.round(PLANS[item].price * k); name = `Тариф «${PLANS[item].name}», 1 месяц${promo ? ` (промокод −${pct}%)` : ""}`;
      if (body.autopay && !promo) sub = env("PRODAMUS_SUB_" + item.toUpperCase());
    }
  } else return { status: 400, json: { error: "нет такого тарифа" } };
  const order = `${user.id}.${kind}.${Date.now()}`;
  const site = env("SITE_URL") || "https://uchu-po-frp.ru/";
  if (yk()) return ykCreate({ order, user, kind, price, name, site, method: body.method === "any" ? "" : "sbp" }, request, readAll);
  const data = { do: "pay", order_id: order, ...(user.email ? { customer_email: user.email } : { customer_phone: "+" + String(user.phone || "").replace(/\D/g, "") }), urlReturn: site + "?pay=cancel", urlSuccess: site + "?pay=ok", sys: "", npd_income_type: "FROM_INDIVIDUAL" };
  if (sub) { data.subscription = sub; } else { data.products = [{ name, price: String(price), quantity: "1" }]; }
  data.signature = sign(data, env("PRODAMUS_KEY"));
  const q = new URLSearchParams();
  const add = (o, pre) => { for (const [k, v] of Object.entries(o)) { const key = pre ? `${pre}[${k}]` : k; if (v && typeof v === "object") add(v, key); else q.append(key, v); } };
  add(data, "");
  await sb(request, readAll, "/rest/v1/payments", { method: "POST", body: { order_id: order, user_id: user.id, kind, amount: price, status: "created" } }).catch(() => null);
  return { status: 200, json: { url: env("PRODAMUS_URL").replace(/\/+$/, "") + "/?" + q.toString(), price, name } };
}

/* ---------- ЮKassa: платёж (сразу СБП; если СБП недоступна — все способы) и проверка уведомлений ---------- */
async function ykApi(method, path, body, idem, request, readAll) {
  const res = await request("https://api.yookassa.ru/v3" + path, { method, headers: { Authorization: "Basic " + Buffer.from(env("YOOKASSA_SHOP_ID") + ":" + env("YOOKASSA_KEY")).toString("base64"), "Content-Type": "application/json", ...(idem ? { "Idempotence-Key": idem } : {}) }, body: body ? JSON.stringify(body) : undefined, timeout: 20000 });
  const t = await readAll(res); let j = null; try { j = t ? JSON.parse(t) : null; } catch { }
  return { status: res.statusCode, json: j };
}
async function ykCreate({ order, user, kind, price, name, site, method }, request, readAll) {
  const amount = { value: Number(price).toFixed(2), currency: "RUB" };
  const base = { amount, capture: true, confirmation: { type: "redirect", return_url: site + "?pay=ok" }, description: String(name).slice(0, 128), metadata: { order, uid: user.id, kind } };
  const receipt = { customer: user.email ? { email: user.email } : { phone: "+" + String(user.phone || "").replace(/\D/g, "") }, items: [{ description: String(name).slice(0, 128), quantity: "1.00", amount, vat_code: 1, payment_subject: "service", payment_mode: "full_payment" }] };
  // по порядку: СБП с чеком → СБП без чека → все способы с чеком → все способы без чека
  const tries = [];
  if (method === "sbp") tries.push({ ...base, payment_method_data: { type: "sbp" }, receipt }, { ...base, payment_method_data: { type: "sbp" } });
  tries.push({ ...base, receipt }, { ...base });
  let r = null, used = "";
  for (const [i, b] of tries.entries()) {
    r = await ykApi("POST", "/payments", b, `${order}.${i}`, request, readAll);
    if (r.status < 300 && r.json?.confirmation?.confirmation_url) { used = b.payment_method_data ? "sbp" : "any"; break; }
    if (r.status === 401 || r.status === 403) return { status: 503, json: { error: "ЮKassa не приняла ключи магазина — проверьте YOOKASSA_SHOP_ID и YOOKASSA_KEY" } };
  }
  if (!used) return { status: 502, json: { error: "ЮKassa не создала платёж: " + (r?.json?.description || r?.status || "нет ответа") } };
  await sb(request, readAll, "/rest/v1/payments", { method: "POST", body: { order_id: order, user_id: user.id, kind, amount: Number(price), status: "created" } }).catch(() => null);
  return { status: 200, json: { url: r.json.confirmation.confirmation_url, price, name, method: used } };
}
// уведомлению не верим на слово: статус платежа запрашиваем у ЮKassa по его номеру
async function ykNotify(raw, request, readAll) {
  let id = ""; try { id = String(JSON.parse(raw)?.object?.id || ""); } catch { }
  if (!id || !yk()) return { status: 200 };
  const r = await ykApi("GET", "/payments/" + encodeURIComponent(id), null, "", request, readAll);
  const pay = r.json; if (r.status !== 200 || pay?.status !== "succeeded" || !pay.paid) return { status: 200 };
  const { order, uid, kind } = pay.metadata || {}; if (!uid || !/^(plan|up|pack)_/.test(kind || "")) return { status: 200 };
  const row = (await sb(request, readAll, `/rest/v1/payments?order_id=eq.${encodeURIComponent(order || "")}&select=status`)).json?.[0];
  if (row?.status === "paid") return { status: 200 }; // уже начислено (ЮKassa может прислать уведомление повторно)
  const p = (await profile(uid, request, readAll)) || { id: uid, plan: "free", ai_left: 0 };
  const [type, item] = kind.split("_"), sum = parseFloat(pay.amount?.value || "0");
  const expect = type === "pack" ? PACKS[item]?.price : type === "plan" ? Math.round((PLANS[item]?.price || 0) * kOf(p)) || undefined : 10;
  if (!expect || sum + 0.01 < expect) return { status: 200 };
  // занимаем платёж одним действием в БД: два одинаковых уведомления подряд не начислят тариф дважды
  if (row) { const claim = await sb(request, readAll, `/rest/v1/payments?order_id=eq.${encodeURIComponent(order)}&status=neq.paid`, { method: "PATCH", body: { status: "paid", amount: sum } }).catch(() => null); if (!claim || claim.status >= 300 || !Array.isArray(claim.json) || !claim.json.length) return { status: 200 }; }
  await apply(uid, p, type, item, !!p.promo || p.plan === "promo", request, readAll);
  if (!row) await sb(request, readAll, "/rest/v1/payments", { method: "POST", body: { order_id: order || ("yk_" + String(pay.id)), user_id: uid, kind, amount: sum, status: "paid" } }).catch(() => null);
  return { status: 200 };
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
  const promo = !!p.promo || p.plan === "promo";
  const expect = type === "pack" ? PACKS[item]?.price : type === "plan" ? Math.round((PLANS[item]?.price || 0) * kOf(p)) || undefined : 10;
  if (!expect || sum + 0.01 < expect) return { status: 200, text: "success" }; // сумма меньше цены — тариф не выдаём
  await apply(uid, p, type, item, promo, request, readAll);
  await sb(request, readAll, `/rest/v1/payments?order_id=eq.${encodeURIComponent(String(data.order_id || ""))}`, { method: "PATCH", body: { status: "paid", amount: sum } }).catch(() => null);
  return { status: 200, text: "success" };
}
/* Начисление тарифа (после оплаты или тестовой оплаты): срок, уроки с ИИ и лимит токенов на месяц */
function patchFor(p, type, item, promo) {
  if (p.plan === "promo") p = { ...p, plan: "free" };
  const aiOf = x => promo ? 0 : PLANS[x]?.ai || 0, tokOf = x => promo ? 0 : PLANS[x]?.tokens || 0;
  const now = Date.now(), until = p.paid_until && new Date(p.paid_until) > now ? new Date(p.paid_until).getTime() : now;
  const leftTok = Math.max(0, (p.tokens_limit || 0) - (p.tokens_used || 0));
  if (type === "plan") return { plan: item, ai_left: aiOf(item) + (p.plan === item ? Math.max(0, (p.ai_left || 0)) : 0), paid_until: new Date((p.plan === item ? until : now) + (PLANS[item]?.days || 30) * DAY).toISOString(), tokens_limit: tokOf(item) + (p.plan === item ? leftTok : 0), tokens_used: 0 };
  if (type === "up") return { plan: item, ai_left: Math.max(0, (p.ai_left || 0) + aiOf(item) - aiOf(p.plan)), tokens_limit: (p.tokens_limit || 0) + Math.max(0, tokOf(item) - tokOf(p.plan)) };
  return { ai_left: (p.ai_left || 0) + PACKS[item].ai, tokens_limit: (p.tokens_limit || 0) + PACKS[item].tokens };
}
async function apply(uid, p, type, item, promo, request, readAll) {
  const patch = patchFor(p, type, item, promo);
  await sb(request, readAll, "/rest/v1/profiles", { method: "POST", body: { id: uid, plan: "free", ai_left: 0 } }).catch(() => null);
  const r = await sb(request, readAll, `/rest/v1/profiles?id=eq.${uid}`, { method: "PATCH", body: patch });
  if (r.status >= 300) { const { tokens_limit, tokens_used, ...old } = patch; await sb(request, readAll, `/rest/v1/profiles?id=eq.${uid}`, { method: "PATCH", body: old }); } // колонок токенов ещё нет
  return patch;
}
/* Тестовая оплата (только разработчики): тариф начисляется без денег — проверить ИИ сайта и учёт токенов */
async function test(body, userToken, request, readAll) {
  const user = await userOf(userToken, request, readAll);
  if (!user) return { status: 401, json: { error: "войдите в личный кабинет" } };
  const item = String(body.item || ""), type = PLANS[item] ? "plan" : PACKS[item] ? "pack" : item === "free" ? "free" : "";
  if (!type) return { status: 400, json: { error: "нет такого тарифа" } };
  let uid = user.id;
  if (body.email && String(body.email).toLowerCase() !== String(user.email).toLowerCase()) { const pr = (await sb(request, readAll, `/rest/v1/profiles?email=eq.${encodeURIComponent(String(body.email).toLowerCase())}&select=id`)).json?.[0]; if (!pr) return { status: 404, json: { error: "учитель с такой почтой ещё не заходил на сайт" } }; uid = pr.id; }
  const p = (await profile(uid, request, readAll)) || { id: uid, plan: "free", ai_left: 0 };
  if (type === "free") { // вернуть бесплатный тариф (для проверки)
    const b = { plan: "free", ai_left: 0, paid_until: null, tokens_limit: 0, tokens_used: 0 };
    await sb(request, readAll, "/rest/v1/profiles", { method: "POST", body: { id: uid, plan: "free", ai_left: 0 } }).catch(() => null);
    const r = await sb(request, readAll, `/rest/v1/profiles?id=eq.${uid}`, { method: "PATCH", body: b });
    if (r.status >= 300) { const { tokens_limit, tokens_used, ...old } = b; await sb(request, readAll, `/rest/v1/profiles?id=eq.${uid}`, { method: "PATCH", body: old }); }
    return { status: 200, json: { ok: true, patch: b } };
  }
  const patch = await apply(uid, p, type, item, !!p.promo, request, readAll);
  await sb(request, readAll, "/rest/v1/payments", { method: "POST", body: { order_id: `test.${uid}.${type}_${item}.${Date.now()}`, user_id: uid, kind: `${type}_${item}`, amount: 0, status: "test" } }).catch(() => null);
  return { status: 200, json: { ok: true, patch } };
}
module.exports = { provider: () => yk() ? "yookassa" : on() ? "prodamus" : "", create, notify, ykNotify, test, patchFor, sign, verify, parseForm, PLANS, PACKS, on };
