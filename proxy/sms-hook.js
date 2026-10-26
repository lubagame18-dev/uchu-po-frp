/* ===================================================================
   «Учу по ФРП» — отправка SMS-кода для входа по номеру телефона.
   Supabase (Authentication → Auth Hooks → Send SMS) вызывает этот адрес, когда человек просит код.
   Переменные функции:
     SMS_HOOK_SECRET  — секрет хука из Supabase (строка вида v1,whsec_…)
     SMS_PROVIDER     — smsru (по умолчанию) или smsc
     SMS_API_ID       — для sms.ru: api_id из личного кабинета
     SMS_LOGIN, SMS_PASSWORD — для smsc.ru
     SMS_SENDER       — имя отправителя (необязательно; на sms.ru по умолчанию — общий номер, дешевле)
     SMS_DAILY_MAX    — потолок SMS в сутки на весь сайт (по умолчанию 300): защита бюджета от ботов
   =================================================================== */
const crypto = require("crypto");
const env = k => process.env[k] || "";
const on = () => !!(env("SMS_HOOK_SECRET") && (env("SMS_API_ID") || (env("SMS_LOGIN") && env("SMS_PASSWORD"))));

/* Подпись Standard Webhooks: HMAC-SHA256 от «id.timestamp.тело», ключ — base64 после whsec_ */
function verify(raw, h) {
  const secret = env("SMS_HOOK_SECRET").replace(/^v1,/, "").replace(/^whsec_/, "");
  const id = h["webhook-id"], ts = h["webhook-timestamp"], sigs = String(h["webhook-signature"] || "");
  if (!secret || !id || !ts || !sigs) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const mine = crypto.createHmac("sha256", Buffer.from(secret, "base64")).update(`${id}.${ts}.${raw}`).digest("base64");
  return sigs.split(" ").some(s => { const v = s.replace(/^v1,/, ""); const a = Buffer.from(v), b = Buffer.from(mine); return a.length === b.length && crypto.timingSafeEqual(a, b); });
}

/* Счётчики в памяти: сутки (UTC) на весь сайт и на номер. Функция может перезапускаться — это страховка, основная — лимит Supabase */
let day = "", total = 0; const perPhone = {};
function allow(phone) {
  const d = new Date().toISOString().slice(0, 10); if (d !== day) { day = d; total = 0; for (const k of Object.keys(perPhone)) delete perPhone[k]; }
  if (total >= (+env("SMS_DAILY_MAX") || 300)) return "дневной лимит SMS исчерпан";
  if ((perPhone[phone] || 0) >= 6) return "слишком много кодов на этот номер за сутки";
  total++; perPhone[phone] = (perPhone[phone] || 0) + 1; return "";
}

async function sendSms(phone, text, request, readAll) {
  const to = String(phone).replace(/\D/g, "");
  if (env("SMS_PROVIDER") === "smsc") {
    const q = new URLSearchParams({ login: env("SMS_LOGIN"), psw: env("SMS_PASSWORD"), phones: to, mes: text, charset: "utf-8", fmt: "3" });
    if (env("SMS_SENDER")) q.set("sender", env("SMS_SENDER"));
    const r = await request("https://smsc.ru/sys/send.php?" + q.toString(), { method: "GET", timeout: 15000 }); const t = await readAll(r); let j = null; try { j = JSON.parse(t); } catch { }
    if (!j || j.error) throw new Error("smsc: " + (j?.error || "нет ответа"));
    return true;
  }
  const q = new URLSearchParams({ api_id: env("SMS_API_ID"), to, msg: text, json: "1" });
  if (env("SMS_SENDER")) q.set("from", env("SMS_SENDER"));
  const r = await request("https://sms.ru/sms/send?" + q.toString(), { method: "GET", timeout: 15000 }); const t = await readAll(r); let j = null; try { j = JSON.parse(t); } catch { }
  if (!j || j.status !== "OK") throw new Error("sms.ru: " + (j?.status_text || "нет ответа"));
  const s = j.sms && j.sms[to]; if (s && s.status !== "OK") throw new Error("sms.ru: " + (s.status_text || s.status));
  return true;
}

/* Ответ для Supabase: {} — успех; {error:{http_code,message}} — отказ */
async function handle(raw, headers, request, readAll) {
  if (!on()) return { status: 200, json: { error: { http_code: 503, message: "отправка SMS не подключена" } } };
  if (!verify(raw, headers)) return { status: 401, json: { error: { http_code: 401, message: "неверная подпись" } } };
  let j; try { j = JSON.parse(raw); } catch { return { status: 400, json: { error: { http_code: 400, message: "не JSON" } } }; }
  const phone = String(j.user?.phone || ""), otp = String(j.sms?.otp || "");
  const digits = phone.replace(/\D/g, "");
  if (!/^7\d{10}$/.test(digits) || !/^\d{4,8}$/.test(otp)) return { status: 400, json: { error: { http_code: 400, message: "ожидается российский номер +7" } } };
  const lim = allow(digits); if (lim) return { status: 200, json: { error: { http_code: 429, message: lim } } };
  try { await sendSms(phone, `Код входа в «Учу по ФРП»: ${otp}`, request, readAll); return { status: 200, json: {} }; }
  catch (e) { console.warn("sms", e.message); return { status: 200, json: { error: { http_code: 502, message: "не удалось отправить SMS" } } }; }
}
module.exports = { handle, verify, on, sendSms };
