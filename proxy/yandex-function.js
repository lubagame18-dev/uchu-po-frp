/* Обёртка для Yandex Cloud Functions (среда Node.js 18+). Точка входа: yandex-function.handler
   Функция не поддерживает потоковую передачу, поэтому ответ нейросети приходит целиком. */
const { runBuffered } = require("./proxy.js");
module.exports.handler = async (event) => {
  const body = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : (event.body || "");
  const q = { ...(event.queryStringParameters || {}) };
  // сайт передаёт путь параметром ?path=/gigachat/v1/chat/completions
  const path = (q.path || event.path || event.url || "/").replace(/^\/+/, "/"); delete q.path;
  const qs = Object.keys(q).length ? "?" + new URLSearchParams(q) : "";
  // адрес посетителя (для учёта бесплатных уроков по сети)
  const ip = event.requestContext?.identity?.sourceIp; if (ip) event.headers = { ...(event.headers || {}), "x-forwarded-for": ip };
  if (event.httpMethod === "POST" && body) {
    try { const j = JSON.parse(body); j.stream = false; return await out({ method: "POST", url: path + qs, headers: event.headers, body: JSON.stringify(j) }); } catch { }
  }
  return out({ method: event.httpMethod || "GET", url: path + qs, headers: event.headers, body });
};
async function out(r) { const res = await runBuffered(r); return { statusCode: res.statusCode, headers: res.headers, body: res.body, isBase64Encoded: !!res.isBase64Encoded }; }
