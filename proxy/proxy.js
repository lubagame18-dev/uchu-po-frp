"use strict";
/**
 * Прокси «Учу по ФРП» (v5). Без зависимостей, Node.js 18+.
 *
 * Зачем нужен. Браузер не может обращаться к GigaChat и YandexGPT напрямую:
 * у этих сервисов нет CORS, а у GigaChat ещё и сертификат НУЦ Минцифры.
 * Прокси пересылает запросы и (по желанию) хранит ключи на сервере.
 *
 *   GET  /health                          состояние: ключи, сертификат, последняя ошибка
 *   POST /gigachat/v1/chat/completions    заголовок X-GigaChat-Key (если ключа нет на сервере)
 *   POST /yandex/v1/chat/completions      заголовки X-Yandex-Key, X-Yandex-Folder
 *   GET  /images?q=<запрос>               поиск картинок через Яндекс (Yandex Search API), для слайдов
 *   GET  /media?q=<запрос>&k=audio|video  чтение артистами, экранизации, спектакли (ссылки на видеохостинги)
 *   GET  /edu?q=<запрос>&w=<слова>         поиск по образовательным сайтам: ссылки + короткие методические выдержки
 *   GET  /img?url=<адрес картинки>        скачать найденную картинку (чтобы её можно было обрезать и вставить в PowerPoint)
 *   POST /relay?url=<адрес>               «крайняя мера»: пересылка к зарубежным нейросетям
 *                                         (OpenRouter, Pollinations, DeepSeek, Gemini, Claude),
 *                                         если из сети школы они не открываются напрямую.
 *
 * Что изменилось в v5:
 *  1) Сертификат Минцифры. Раньше прокси скачивал его в фоне при первом запросе,
 *     а /health отвечал раньше, чем скачивание заканчивалось: отсюда "cert": false
 *     и отказ Сбера в токене. Теперь сертификат ищется по порядку: переменная
 *     GIGACHAT_CA (сам текст PEM), файл GIGACHAT_CA_FILE или russian_trusted_root_ca.pem
 *     рядом с proxy.js, скачивание с Госуслуг (два адреса, PEM и DER). Если ничего
 *     не вышло, для адресов Сбера проверка сертификата отключается — так, как
 *     разрешает сам Сбер в своём SDK (verify_ssl_certs=False). В /health это видно.
 *  2) Точная причина отказа GigaChat: сертификат, блокировка IP (дата-центр или
 *     зарубежный адрес), неверный ключ, неверный scope, истёкший токен, таймаут.
 *  3) Маршрут /relay с логином и паролем (PROXY_USER, PROXY_PASS).
 */
const http = require("http");
const https = require("https");
const crypto = require("crypto");
const fs = require("fs"), path = require("path"), tls = require("tls");
const DS = require("./deepseek-pool.js");
const Q = require("./quota.js");
const PAY = require("./payments.js");

const ENV = {
  port: Number(process.env.PORT || 8787),
  allowOrigin: process.env.ALLOW_ORIGIN || "*",
  gigaOauth: process.env.GIGACHAT_OAUTH_URL || "https://ngw.devices.sberbank.ru:9443/api/v2/oauth",
  gigaApi: process.env.GIGACHAT_API_URL || "https://gigachat.devices.sberbank.ru/api/v1/chat/completions",
  gigaScope: process.env.GIGACHAT_SCOPE || "GIGACHAT_API_PERS",
  yaApi: process.env.YANDEX_API_URL || "https://llm.api.cloud.yandex.net/v1/chat/completions",
  insecure: process.env.GIGACHAT_TLS_INSECURE === "1",
  rpm: Number(process.env.RATE_PER_MIN || 30),
  proxyUser: process.env.PROXY_USER || "", proxyPass: process.env.PROXY_PASS || "",
  maxBody: 900 * 1024
};
/* Поиск картинок Яндекса: API-ключ сервисного аккаунта с ролью search-api.webSearch.user и ID каталога */
const YS = { key: process.env.YANDEX_SEARCH_KEY || process.env.YANDEX_KEY || "", folder: process.env.YANDEX_SEARCH_FOLDER || process.env.YANDEX_FOLDER || "" };
const imgCache = new Map();
async function yandexImages(q, n) {
  const ck = q + "|" + n; const hit = imgCache.get(ck); if (hit && Date.now() - hit.at < 6 * 3600e3) return hit.items;
  const body = JSON.stringify({ query: { searchType: "SEARCH_TYPE_RU", queryText: q, familyMode: "FAMILY_MODE_STRICT", page: 0, fixTypoMode: "FIX_TYPO_MODE_ON" }, imageSpec: { size: "IMAGE_SIZE_LARGE" }, docsOnPage: n, folderId: YS.folder });
  const res = await request("https://searchapi.api.cloud.yandex.net/v2/image/search", { headers: { Authorization: "Api-Key " + YS.key, "Content-Type": "application/json" }, body, timeout: 20000 });
  const text = await readAll(res);
  if (res.statusCode !== 200) throw Object.assign(new Error("Поиск Яндекса ответил " + res.statusCode + ": " + text.slice(0, 200)), { status: res.statusCode === 401 || res.statusCode === 403 ? 401 : 502, reason: res.statusCode === 401 || res.statusCode === 403 ? "auth" : "search" });
  const xml = Buffer.from(JSON.parse(text).rawData || "", "base64").toString("utf8");
  const tag = (s, t) => { const m = s.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return m ? m[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim() : ""; };
  const items = (xml.match(/<doc[\s>][\s\S]*?<\/doc>/g) || []).map(d => ({
    url: tag(d, "url"), thumb: tag(d, "thumbnail-link") || tag(d, "url"), w: +tag(d, "original-width") || null, h: +tag(d, "original-height") || null,
    domain: tag(d, "domain"), title: tag(d, "title") || tag(d, "passage") || tag(d, "domain"), page: tag(d, "html-link") || tag(d, "saved-copy-url") || ""
  })).filter(x => /^https?:\/\//.test(x.url));
  imgCache.set(ck, { at: Date.now(), items }); if (imgCache.size > 500) imgCache.delete(imgCache.keys().next().value);
  return items;
}
/* Поиск по образовательным сайтам (Yandex Search API, тот же ключ, что для картинок).
   Возвращает ссылки и КОРОТКИЕ выдержки (вопросы, проблемные вопросы, тезисы анализа ≤ 300 знаков) с указанием источника. */
const EDU = /(^|\.)(resh\.edu\.ru|урок\.рф|xn--j1ahfl\.xn--p1ai|infourok\.ru|nsportal\.ru|multiurok\.ru|urok\.1sept\.ru|kopilkaurokov\.ru|pedsovet\.su|uchitelya\.com|prodlenka\.org|videouroki\.net|interneturok\.ru|foxford\.ru|lit\.wikireading\.ru|feb-web\.ru|ruslit\.traumlibrary\.net|litra\.ru|obrazovaka\.ru|pishi-stihi\.ru|rustih\.ru|wikipedia\.org|ilibrary\.ru|gramota\.ru|rusyaz-online\.ru|licey\.net|ped-kopilka\.ru|1sept\.ru)$/i;
const eduCache = new Map();
async function yandexWeb(q, n = 10) {
  const body = JSON.stringify({ query: { searchType: "SEARCH_TYPE_RU", queryText: q, familyMode: "FAMILY_MODE_STRICT", page: 0, fixTypoMode: "FIX_TYPO_MODE_ON" }, groupSpec: { groupMode: "GROUP_MODE_DEEP", groupsOnPage: n, docsInGroup: 1 }, folderId: YS.folder, responseFormat: "FORMAT_XML" });
  const res = await request("https://searchapi.api.cloud.yandex.net/v2/web/search", { headers: { Authorization: "Api-Key " + YS.key, "Content-Type": "application/json" }, body, timeout: 20000 });
  const text = await readAll(res);
  if (res.statusCode !== 200) throw Object.assign(new Error("Поиск Яндекса ответил " + res.statusCode + ": " + text.slice(0, 200)), { status: res.statusCode === 401 || res.statusCode === 403 ? 401 : 502 });
  const xml = Buffer.from(JSON.parse(text).rawData || "", "base64").toString("utf8");
  const clean = s => String(s || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
  const tag = (d, t) => { const m = d.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return m ? clean(m[1]) : ""; };
  return (xml.match(/<doc[\s>][\s\S]*?<\/doc>/g) || []).map(d => ({ url: tag(d, "url"), domain: tag(d, "domain"), title: tag(d, "title"), snippet: (d.match(/<passage>[\s\S]*?<\/passage>/g) || []).map(clean).join(" … ").slice(0, 400) })).filter(x => /^https?:\/\//.test(x.url));
}
async function fetchPageText(url, depth = 0) {
  const u = new URL(url); if (!/^https?:$/.test(u.protocol) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname)) return "";
  const res = await request(u.href, { method: "GET", headers: { "User-Agent": "Mozilla/5.0 (uchu-po-frp)", Accept: "text/html" }, timeout: 9000 }).catch(() => null);
  if (!res) return "";
  if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && depth < 2) { res.resume(); return fetchPageText(new URL(res.headers.location, u).href, depth + 1); }
  if (res.statusCode !== 200 || !/html|text/.test(String(res.headers["content-type"] || ""))) { res.resume(); return ""; }
  const ch = []; let size = 0; for await (const c of res) { size += c.length; if (size > 1.5 * 1024 * 1024) break; ch.push(c); }
  let html = Buffer.concat(ch).toString("utf8"); if ((html.match(/\uFFFD/g) || []).length > 50) html = new TextDecoder("windows-1251").decode(Buffer.concat(ch));
  return html.replace(/<(script|style|nav|header|footer|aside|noscript)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/(p|li|h\d|div|tr)>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&laquo;/g, "«").replace(/&raquo;/g, "»").replace(/&mdash;/g, "—").replace(/&amp;/g, "&").replace(/[ \t]+/g, " ");
}
// из страницы — только короткие методические выдержки: проблемные вопросы, вопросы к тексту, тезисы о конфликте
function eduExtract(text, words) {
  const lines = text.split(/\n+/).map(x => x.trim()).filter(x => x.length > 20 && x.length < 300);
  const on = l => !words.length || words.some(w => l.toLowerCase().includes(w));
  const problem = lines.filter(l => /проблемн\S* вопрос/i.test(l) && /\?/.test(l)).map(l => l.replace(/^.*?проблемн\S* вопрос\S*\s*[:—–-]?\s*/i, "")).filter(l => l.length > 15);
  const qs = lines.filter(l => /\?\s*$/.test(l) && /почему|зачем|как|чем|что|в ч[её]м|можно ли/i.test(l) && on(l)).slice(0, 12);
  const theses = lines.filter(l => /противопостав|конфликт|контраст|противореч|антитез|символ|бунт|протест|одиночеств|свобод/i.test(l) && !/\?/.test(l) && on(l)).slice(0, 6);
  return { problem: [...new Set(problem)].slice(0, 4), questions: [...new Set(qs)].slice(0, 8), theses: [...new Set(theses)].slice(0, 4) };
}
async function eduSearch(q, words) {
  const ck = q; const hit = eduCache.get(ck); if (hit && Date.now() - hit.at < 24 * 3600e3) return hit.data;
  const found = [];
  for (const qq of [q + " урок литературы проблемный вопрос конспект", q + " анализ произведения", q + " разработка урока вопросы к тексту"]) {
    try { for (const r of await yandexWeb(qq, 10)) if (EDU.test(r.domain || new URL(r.url).hostname) && !found.some(x => x.url === r.url)) found.push(r); } catch (e) { if (e.status === 401) throw e; }
    if (found.length >= 8) break;
  }
  const top = found.slice(0, 5);
  const pages = await Promise.all(top.map(r => Promise.race([fetchPageText(r.url).catch(() => ""), new Promise(res => setTimeout(() => res(""), 10000))])));
  const results = found.slice(0, 8).map((r, i) => ({ url: r.url, domain: r.domain, title: r.title, snippet: r.snippet, ...(pages[i] ? eduExtract(pages[i], words) : {}) }));
  const data = { ok: true, results };
  eduCache.set(ck, { at: Date.now(), data }); if (eduCache.size > 300) eduCache.delete(eduCache.keys().next().value);
  return data;
}
/* Аудио и видео к уроку: чтение стихов артистами, экранизации, спектакли — только страницы видеохостингов */
const MEDIA = /(^|\.)(rutube\.ru|vkvideo\.ru|vk\.com|vk\.ru|smotrim\.ru|culture\.ru|youtube\.com|youtu\.be|ok\.ru)$/i;
const MEDIA_PAGE = /rutube\.ru\/video\/|vkvideo\.ru\/video-?\d|vk\.(com|ru)\/video-?\d|youtube\.com\/watch|youtu\.be\/|smotrim\.ru\/(video|brand)|culture\.ru\/(movies|watch|s\/|audio)|ok\.ru\/video\//i;
const mediaCache = new Map();
async function mediaSearch(q, kind) {
  const ck = kind + ":" + q; const hit = mediaCache.get(ck); if (hit && Date.now() - hit.at < 24 * 3600e3) return hit.data;
  const qs = kind === "audio" ? [q + " читает народный артист", q + " читает актёр", q + " стихотворение читает"] : [q + " фильм фрагмент", q + " экранизация сцена", q + " спектакль"];
  const found = [];
  for (const qq of qs) {
    try { for (const r of await yandexWeb(qq, 15)) { let host = r.domain; try { host = new URL(r.url).hostname; } catch { } if (MEDIA.test(host) && MEDIA_PAGE.test(r.url) && !found.some(x => x.url === r.url)) found.push(r); } } catch (e) { if (e.status === 401) throw e; }
    if (found.length >= 12) break;
  }
  const data = { ok: true, results: found.slice(0, 16).map(r => ({ url: r.url, domain: r.domain, title: r.title, snippet: r.snippet })) };
  mediaCache.set(ck, { at: Date.now(), data }); if (mediaCache.size > 300) mediaCache.delete(mediaCache.keys().next().value);
  return data;
}
/* Скачивание картинки: только изображения, не больше 8 МБ */
async function fetchImage(url, depth = 0) {
  const u = new URL(url); if (!/^https?:$/.test(u.protocol) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname)) throw Object.assign(new Error("недопустимый адрес"), { status: 400 });
  const res = await request(u.href, { method: "GET", headers: { "User-Agent": "Mozilla/5.0 (uchu-po-frp)", Accept: "image/*" }, timeout: 15000 });
  if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && depth < 3) { res.resume(); return fetchImage(new URL(res.headers.location, u).href, depth + 1); }
  const type = String(res.headers["content-type"] || "");
  if (res.statusCode !== 200 || !/^image\//.test(type)) { res.resume(); throw Object.assign(new Error("это не картинка или она недоступна"), { status: 415 }); }
  const ch = []; let size = 0;
  for await (const c of res) { size += c.length; if (size > 8 * 1024 * 1024) throw Object.assign(new Error("картинка больше 8 МБ"), { status: 413 }); ch.push(c); }
  return { type, buf: Buffer.concat(ch) };
}

/* Куда разрешено пересылать через /relay (чтобы прокси не стал открытым для всего интернета) */
const RELAY_HOSTS = (process.env.RELAY_HOSTS || "openrouter.ai,gen.pollinations.ai,text.pollinations.ai,api.deepseek.com").split(",").map(s => s.trim()).filter(Boolean);

/* ---------- сертификат НУЦ Минцифры ---------- */
const CA_URLS = (process.env.GIGACHAT_CA_URL ? [process.env.GIGACHAT_CA_URL] : []).concat([
  "https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt",
  "https://gu-st.ru/content/Other/doc/russian_trusted_root_ca.cer"
]);
let ca = null, caSource = null, caFallback = false, lastError = null;
function derToPem(buf) { const b64 = buf.toString("base64").match(/.{1,64}/g).join("\n"); return `-----BEGIN CERTIFICATE-----\n${b64}\n-----END CERTIFICATE-----\n`; }
function readLocalCa() {
  if (process.env.GIGACHAT_CA && process.env.GIGACHAT_CA.includes("BEGIN CERTIFICATE")) { caSource = "переменная GIGACHAT_CA"; return process.env.GIGACHAT_CA.replace(/\\n/g, "\n"); }
  for (const f of [process.env.GIGACHAT_CA_FILE, path.join(__dirname, "russian_trusted_root_ca.pem"), path.join(__dirname, "russian_trusted_root_ca.cer"), path.join(require("os").tmpdir(), "russian_trusted_root_ca.pem")].filter(Boolean)) {
    try { const b = fs.readFileSync(f); const s = b.toString("utf8"); caSource = "файл " + path.basename(f); return s.includes("BEGIN CERTIFICATE") ? s : derToPem(b); } catch { }
  }
  return null;
}
ca = readLocalCa();
function fetchBuf(url, ms = 8000) {
  return new Promise(resolve => {
    const r = https.get(url, { timeout: ms }, res => {
      if (res.statusCode !== 200) { res.resume(); return resolve(null); }
      const ch = []; res.on("data", c => ch.push(c)); res.on("end", () => resolve(Buffer.concat(ch)));
    });
    r.on("error", () => resolve(null)); r.on("timeout", () => { r.destroy(); resolve(null); });
  });
}
let caTried = null;
function ensureCa() {
  if (ca || ENV.insecure) return Promise.resolve(!!ca);
  if (!caTried) caTried = (async () => {
    for (const u of CA_URLS) {
      const b = await fetchBuf(u); if (!b || b.length < 300) continue;
      const s = b.toString("utf8");
      ca = s.includes("BEGIN CERTIFICATE") ? s : derToPem(b); caSource = "скачан: " + u;
      try { fs.writeFileSync(path.join(require("os").tmpdir(), "russian_trusted_root_ca.pem"), ca); } catch { }
      agents.clear(); return true;
    }
    caFallback = true; // как verify_ssl_certs=False в официальном SDK Сбера — только для адресов Сбера
    return false;
  })();
  return caTried;
}
const SBER = /(^|\.)sberbank\.ru$|(^|\.)devices\.sberbank\.ru$/;
const agents = new Map();
function agentFor(host) {
  const sber = SBER.test(host);
  const key = sber ? (ca ? "sber-ca" : caFallback || ENV.insecure ? "sber-insecure" : "sber-default") : "default";
  if (!agents.has(key)) agents.set(key, new https.Agent({ keepAlive: true, ...(key === "sber-ca" ? { ca: [...tls.rootCertificates, ca] } : {}), ...(key === "sber-insecure" ? { rejectUnauthorized: false } : {}) }));
  return agents.get(key);
}

/* ---------- общее ---------- */
function cors(req, res) {
  const origin = req.headers.origin || "*";
  const allowed = ENV.allowOrigin === "*" ? "*" : ENV.allowOrigin.split(",").map(s => s.trim()).includes(origin) ? origin : "";
  if (allowed) res.setHeader("Access-Control-Allow-Origin", allowed);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-GigaChat-Key, X-Yandex-Key, X-Yandex-Folder, X-Proxy-Auth, X-Api-Key, Anthropic-Version, Anthropic-Dangerous-Direct-Browser-Access, HTTP-Referer, X-Title, X-User-Token, X-Admin-Token, X-Uchu-Slot");
  res.setHeader("Access-Control-Expose-Headers", "X-Uchu-Reason, X-Uchu-Tokens, X-Uchu-Account");
}
function send(res, status, obj) { if (obj && obj.reason) res.setHeader("X-Uchu-Reason", obj.reason); res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(obj)); }
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > ENV.maxBody) { reject(Object.assign(new Error("слишком большой запрос"), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
function request(url, { method = "POST", headers = {}, body, timeout = 120000 }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "http:" ? http : https;
    const r = lib.request(u, { method, headers, agent: u.protocol === "https:" ? agentFor(u.hostname) : undefined, timeout }, resolve);
    r.on("error", reject); r.on("timeout", () => r.destroy(Object.assign(new Error("таймаут"), { code: "ETIMEDOUT" })));
    if (body) r.write(body); r.end();
  });
}
async function readAll(stream) { const chunks = []; for await (const c of stream) chunks.push(c); return Buffer.concat(chunks).toString("utf8"); }

/* ---------- ограничение частоты по IP ---------- */
const hits = new Map();
function limited(ip) {
  const now = Date.now(), arr = (hits.get(ip) || []).filter(t => now - t < 60000);
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > 60000) hits.delete(k);
  return arr.length > ENV.rpm;
}

/* ---------- диагностика отказов GigaChat ---------- */
function diagnose(e, status, text) {
  const code = e && (e.code || e.cause?.code) || "";
  if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER/i.test(code)) return { reason: "cert", message: "Сбер не принят: нет сертификата НУЦ Минцифры на сервере прокси. Положите russian_trusted_root_ca.pem рядом с proxy.js или задайте GIGACHAT_CA." };
  if (/ETIMEDOUT|ESOCKETTIMEDOUT|ECONNRESET|EHOSTUNREACH|ECONNREFUSED/i.test(code) || status === 403) return { reason: "blocked_ip", message: "Сбер не пускает запрос с этого сервера: похоже на блокировку IP (адрес дата-центра или зарубежный адрес). Поставьте прокси на российский сервер или в Яндекс Облако." };
  if (/ENOTFOUND|EAI_AGAIN/i.test(code)) return { reason: "dns", message: "Сервер прокси не находит адрес Сбера (DNS). Проверьте выход в интернет у сервера." };
  if (status === 401) return { reason: "auth", message: "Ключ авторизации GigaChat не принят: проверьте ключ (Authorization key из личного кабинета)." };
  if (status === 400 && /scope/i.test(text || "")) return { reason: "scope", message: "Неверный scope: для физлиц GIGACHAT_API_PERS, для организаций — GIGACHAT_API_B2B или GIGACHAT_API_CORP." };
  if (status === 402 || /payment|баланс|quota|limit/i.test(text || "")) return { reason: "payment", message: "У ключа закончился бесплатный пакет или нужна оплата (cloud.ru)." };
  if (status === 429) return { reason: "rate", message: "Слишком много запросов к GigaChat. Подождите минуту." };
  return { reason: "other", message: "GigaChat не ответил: " + (e?.message || ("HTTP " + status + " " + String(text || "").slice(0, 160))) };
}

/* ---------- ключ: приводим к виду Authorization key ----------
   Частые причины «ключ не принят»: вставлено «Basic …», кавычки, переносы строк,
   пара «Client ID:Client Secret» вместо готового ключа, или только Client ID. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function normalizeKey(raw) {
  let k = String(raw || "").replace(/^\s*(authorization\s*:\s*)?basic\s+/i, "").replace(/["'«»\s]/g, "");
  if (!k) return { key: "" };
  if (UUID.test(k)) return { key: "", error: "Вставлен Client ID. Нужен Authorization key (длинная строка, кнопка «Получить ключ» в личном кабинете GigaChat API) — или пара Client ID:Client Secret." };
  const pair = k.match(/^([0-9a-f-]{36})[:;,|/]([0-9a-f-]{36})$/i);
  if (pair) return { key: Buffer.from(pair[1] + ":" + pair[2]).toString("base64"), fixed: "пара Client ID и Client Secret превращена в ключ" };
  try { const dec = Buffer.from(k, "base64").toString("utf8"); if (!/^[0-9a-f-]{36}:[0-9a-f-]{36}$/i.test(dec)) return { key: k, warn: "ключ не похож на Authorization key (base64 от «Client ID:Client Secret»)" }; } catch { }
  return { key: k };
}
const SCOPES = ["GIGACHAT_API_PERS", "GIGACHAT_API_B2B", "GIGACHAT_API_CORP"];
const scopeOf = new Map(); // какой scope подошёл ключу

/* ---------- токены GigaChat: живут 30 минут, кэшируем по хэшу ключа ---------- */
const tokens = new Map();
async function gigaToken(rawKey) {
  await ensureCa();
  const nk = normalizeKey(rawKey);
  if (!nk.key) { const m = nk.error || "нет ключа GigaChat"; lastError = { at: new Date().toISOString(), reason: "auth", message: m }; throw Object.assign(new Error(m), { status: 401, reason: "auth" }); }
  const key = nk.key;
  const id = crypto.createHash("sha256").update(key).digest("hex");
  const cached = tokens.get(id);
  if (cached && cached.exp - Date.now() > 60000) return cached.token;
  // scope: сначала из настроек (или подошедший раньше), при отказе по scope — остальные по очереди
  const order = [...new Set([scopeOf.get(id) || ENV.gigaScope, ...SCOPES])];
  let res, text;
  for (const scope of order) {
    try {
      res = await request(ENV.gigaOauth, { headers: { Authorization: "Basic " + key, RqUID: crypto.randomUUID(), Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: "scope=" + encodeURIComponent(scope), timeout: 20000 });
      text = await readAll(res);
    } catch (e) { const d = diagnose(e); lastError = { at: new Date().toISOString(), ...d }; throw Object.assign(new Error(d.message), { status: 502, reason: d.reason }); }
    if (res.statusCode === 200) { scopeOf.set(id, scope); break; }
    const scopeIssue = (res.statusCode === 400 || res.statusCode === 401) && /scope/i.test(text || "");
    if (!scopeIssue) break;
  }
  if (res.statusCode !== 200) { const d = diagnose(null, res.statusCode, text); if (d.reason === "auth" && nk.warn) d.message += " Похоже, " + nk.warn + "."; lastError = { at: new Date().toISOString(), ...d }; throw Object.assign(new Error(d.message), { status: res.statusCode === 401 ? 401 : 502, reason: d.reason }); }
  const j = JSON.parse(text);
  tokens.set(id, { token: j.access_token, exp: Number(j.expires_at) || Date.now() + 25 * 60000 });
  lastError = null;
  return j.access_token;
}

async function pipeUpstream(res, upstream) {
  res.writeHead(upstream.statusCode, { "Content-Type": upstream.headers["content-type"] || "text/event-stream; charset=utf-8", "Cache-Control": "no-cache" });
  upstream.pipe(res);
}
function relayAuthOk(req) {
  if (!ENV.proxyUser && !ENV.proxyPass) return true;
  const h = String(req.headers["x-proxy-auth"] || "");
  const want = "Basic " + Buffer.from(ENV.proxyUser + ":" + ENV.proxyPass).toString("base64");
  return h.length === want.length && crypto.timingSafeEqual(Buffer.from(h), Buffer.from(want));
}

async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  const u = new URL(req.url, "http://x");
  const route = u.pathname.replace(/\/+$/, "").replace(/^\/(api\/)?ai(?=\/|$)/, "");
  if (req.method === "GET" && (route === "" || route === "/health")) {
    // ждём сертификат (не дольше 9 секунд), чтобы ответ показывал правду
    await Promise.race([ensureCa(), new Promise(r => setTimeout(r, 9000))]);
    return send(res, 200, { ok: true, service: "uchu-po-frp-proxy", version: 12, providers: ["gigachat", "deepseek", "yandex", "relay", "images", "edu", "media", "pay"], pay: PAY.on(), deepseek: (await DS.pool(request, readAll).catch(() => DS.loadPool())).filter(a => a.isActive && !DS.isPlaceholder(a.key)).length, images: !!(YS.key && YS.folder), keys: { gigachat: !!process.env.GIGACHAT_KEY, yandex: !!(process.env.YANDEX_KEY && process.env.YANDEX_FOLDER) }, cert: !!ca || ENV.insecure || caFallback, certMode: ca ? "сертификат Минцифры: " + caSource : ENV.insecure || caFallback ? "проверка сертификата Сбера отключена (запасной режим)" : "нет", relay: { hosts: RELAY_HOSTS, auth: !!(ENV.proxyUser || ENV.proxyPass) }, lastError });
  }
  if (req.method === "GET" && route === "/images") {
    if (!YS.key || !YS.folder) return send(res, 200, { ok: false, reason: "no_key", message: "Поиск картинок Яндекса не настроен: нужны переменные YANDEX_SEARCH_KEY и YANDEX_SEARCH_FOLDER." });
    const q = String(u.searchParams.get("q") || "").trim().slice(0, 300); if (!q) return send(res, 400, { error: "нет запроса q" });
    const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
    if (limited(ip)) return send(res, 429, { error: "слишком много запросов, подождите минуту", reason: "rate" });
    try { return send(res, 200, { ok: true, items: await yandexImages(q, Math.min(30, Math.max(4, +u.searchParams.get("n") || 16))) }); }
    catch (e) { return send(res, 200, { ok: false, reason: e.reason || "search", message: e.message }); }
  }
  if (req.method === "GET" && route === "/media") {
    if (!(YS.key && YS.folder)) return send(res, 200, { ok: false, reason: "no_keys", results: [] });
    const q = String(u.searchParams.get("q") || "").slice(0, 200).trim(); if (!q) return send(res, 400, { error: "нужен q" });
    const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
    if (limited(ip)) return send(res, 429, { error: "слишком много запросов, подождите минуту", reason: "rate" });
    try { return send(res, 200, await mediaSearch(q, u.searchParams.get("k") === "video" ? "video" : "audio")); } catch (e) { return send(res, e.status || 502, { ok: false, error: String(e.message || e), results: [] }); }
  }
  if (req.method === "GET" && route === "/edu") {
    if (!(YS.key && YS.folder)) return send(res, 200, { ok: false, reason: "no_keys", results: [] });
    const q = String(u.searchParams.get("q") || "").slice(0, 200).trim(); if (!q) return send(res, 400, { error: "нужен q" });
    const words = String(u.searchParams.get("w") || "").toLowerCase().split(/[,\s]+/).filter(w => w.length > 3).slice(0, 6);
    try { return send(res, 200, await eduSearch(q, words)); } catch (e) { return send(res, e.status || 502, { ok: false, error: String(e.message || e), results: [] }); }
  }
  if (req.method === "GET" && route === "/img") {
    try { const r = await fetchImage(String(u.searchParams.get("url") || "")); res.writeHead(200, { "Content-Type": r.type, "Cache-Control": "public, max-age=86400" }); return res.end(r.buf); }
    catch (e) { return send(res, e.status || 502, { error: e.message }); }
  }
  if (req.method === "GET" && route === "/deepseek/balance") {
    // баланс аккаунтов — только владельцу (заголовок X-Admin-Token = переменная ADMIN_TOKEN)
    if (!process.env.ADMIN_TOKEN || req.headers["x-admin-token"] !== process.env.ADMIN_TOKEN) return send(res, 403, { error: "нужен токен владельца" });
    return send(res, 200, { ok: true, accounts: await DS.balances(request, readAll) });
  }
  if (req.method === "GET" && route === "/diagnose") {
    // проверка «вживую»: получить токен GigaChat ключом с сервера (или из заголовка)
    const key = String(req.headers["x-gigachat-key"] || process.env.GIGACHAT_KEY || "").trim();
    if (!key) return send(res, 200, { ok: false, reason: "no_key", message: "На прокси нет ключа GigaChat (GIGACHAT_KEY)." });
    try { await gigaToken(key); const nk = normalizeKey(key); return send(res, 200, { ok: true, message: "Сбер выдал токен: GigaChat доступен." + (nk.fixed ? " (" + nk.fixed + ")" : ""), scope: scopeOf.get(crypto.createHash("sha256").update(nk.key).digest("hex")) }); }
    catch (e) { return send(res, 200, { ok: false, reason: e.reason || "other", message: e.message }); }
  }
  if (req.method !== "POST") return send(res, 405, { error: "метод не поддерживается" });
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  if (limited(ip)) return send(res, 429, { error: "слишком много запросов, подождите минуту", reason: "rate" });
  try {
    const raw = await readBody(req);
    if (route === "/relay") {
      if (!relayAuthOk(req)) return send(res, 407, { error: "прокси требует логин и пароль", reason: "proxy_auth" });
      let target; try { target = new URL(u.searchParams.get("url") || ""); } catch { return send(res, 400, { error: "нет адреса url" }); }
      if (target.protocol !== "https:" || !RELAY_HOSTS.some(h => target.hostname === h || target.hostname.endsWith("." + h))) return send(res, 403, { error: "этот адрес нельзя пересылать: " + target.hostname });
      const pass = {}; for (const h of ["authorization", "x-api-key", "anthropic-version", "anthropic-dangerous-direct-browser-access", "http-referer", "x-title", "content-type"]) if (req.headers[h]) pass[h] = req.headers[h];
      const up = await request(target.href, { headers: pass, body: raw });
      return pipeUpstream(res, up);
    }
    if (route === "/pay/notify") { const r = await PAY.notify(raw, req.headers, request, readAll); res.writeHead(r.status, { "Content-Type": "text/plain; charset=utf-8" }); return res.end(r.text); }
    let body; try { body = JSON.parse(raw); } catch { return send(res, 400, { error: "тело запроса — не JSON" }); }
    if (route === "/admin/join") { const r = await Q.join(req.headers["x-user-token"], body.code, request, readAll); return send(res, r.ok ? 200 : r.status, r.ok ? { ok: true } : { error: r.message }); }
    if (route === "/admin/keys") {
      // ячейки ключей DeepSeek — только автору сайта (вход в кабинет почтой из site_admins или X-Admin-Token)
      const tokOk = process.env.ADMIN_TOKEN && req.headers["x-admin-token"] === process.env.ADMIN_TOKEN;
      if (!tokOk && !(await Q.isAdmin(req.headers["x-user-token"], request, readAll))) return send(res, 403, { error: "только для автора сайта: войдите в личный кабинет своей почтой" });
      const r = await DS.admin(body, request, readAll); return send(res, r.status, r.json);
    }
    if (route === "/free/use") { const ip2 = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim(); const r = await Q.freeUse(req.headers["x-user-token"], body, ip2, request, readAll); return send(res, r.ok ? 200 : r.status, r.ok ? r : { error: r.message, reason: r.reason }); }
    if (route === "/pay/test") {
      // тестовая оплата — только разработчики (почта в site_admins) или X-Admin-Token
      const tokOk = process.env.ADMIN_TOKEN && req.headers["x-admin-token"] === process.env.ADMIN_TOKEN;
      // код разработчика — тот же, что для входа разработчика (без него тест недоступен)
      if (!tokOk && !Q.devCodeOk(body.code) && !(await Q.isAdmin(req.headers["x-user-token"], request, readAll))) return send(res, 403, { error: "неверный код разработчика" });
      const r = await PAY.test(body, req.headers["x-user-token"], request, readAll); return send(res, r.status, r.json);
    }
    if (route === "/pay/create") { const r = await PAY.create(body, req.headers["x-user-token"], request, readAll); return send(res, r.status, r.json); }
    if (!Array.isArray(body.messages)) return send(res, 400, { error: "нужен массив messages" });
    if (route === "/promo") {
      const r = await Q.promo(req.headers["x-user-token"], body.code, request, readAll);
      return send(res, r.ok ? 200 : r.status, r.ok ? { ok: true } : { error: r.message });
    }
    if (route === "/deepseek/v1/chat/completions") {
      // пул аккаунтов DeepSeek: ключи только на сервере; карусель и подстраховка — в deepseek-pool.js
      // если подключено облако кабинета — запрос только по входу и в пределах тарифа (списывается 1 запрос)
      // разработчик может выбрать конкретный общий ключ (заголовок X-Uchu-Slot) — без списания с тарифа
      const slot = +req.headers["x-uchu-slot"] || 0, admin = slot ? await Q.isAdmin(req.headers["x-user-token"], request, readAll) : false;
      if (slot && !admin) return send(res, 403, { error: "выбор общего ключа — только для разработчиков" });
      const quota = admin ? { ok: true, admin: true } : await Q.check(req.headers["x-user-token"], request, readAll);
      if (!quota.ok) return send(res, quota.status, { error: quota.message, reason: quota.reason });
      // не дать потратить больше, чем осталось по тарифу: ответ ограничивается остатком токенов
      if (quota.tok) body.max_tokens = Math.max(256, Math.min(+body.max_tokens || 8192, quota.left));
      const r = await DS.chat(body, request, readAll, slot || 0);
      let used = 0; try { const u = JSON.parse(r.text).usage; used = u?.total_tokens || ((u?.prompt_tokens || 0) + (u?.completion_tokens || 0)); } catch { }
      if (!used) used = Math.round((JSON.stringify(body.messages || "").length + r.text.length) / 3); // оценка, если сервис не прислал расход
      if (!quota.admin) await Q.spend(quota, request, readAll, used).catch(e => console.warn("quota", e.message));
      if (quota.tok) res.setHeader("X-Uchu-Tokens", `${quota.used + used}/${quota.limit}`);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "X-Uchu-Account": r.account });
      return res.end(r.text);
    }
    if (route === "/gigachat/v1/chat/completions") {
      const key = String(req.headers["x-gigachat-key"] || process.env.GIGACHAT_KEY || "").trim();
      if (!key) return send(res, 401, { error: "нет ключа GigaChat (заголовок X-GigaChat-Key)", reason: "no_key" });
      const token = await gigaToken(key);
      const out = JSON.stringify({ model: body.model || "GigaChat-2-Pro", messages: body.messages, stream: body.stream !== false, ...(body.max_tokens ? { max_tokens: body.max_tokens } : {}), ...(body.temperature != null ? { temperature: body.temperature } : {}) });
      const up = await request(ENV.gigaApi, { headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", Accept: body.stream === false ? "application/json" : "text/event-stream" }, body: out });
      if (up.statusCode === 401) tokens.clear(); // токен истёк — следующий запрос получит новый
      return pipeUpstream(res, up);
    }
    if (route === "/yandex/v1/chat/completions") {
      const key = String(req.headers["x-yandex-key"] || process.env.YANDEX_KEY || "").trim();
      const folder = String(req.headers["x-yandex-folder"] || process.env.YANDEX_FOLDER || "").trim();
      if (!key || !folder) return send(res, 401, { error: "нужны X-Yandex-Key и X-Yandex-Folder", reason: "no_key" });
      const model = String(body.model || "yandexgpt/latest");
      const out = JSON.stringify({ ...body, model: model.startsWith("gpt://") ? model : `gpt://${folder}/${model}`, stream: body.stream !== false });
      const up = await request(ENV.yaApi, { headers: { Authorization: "Api-Key " + key, "OpenAI-Project": folder, "x-folder-id": folder, "Content-Type": "application/json" }, body: out });
      return pipeUpstream(res, up);
    }
    return send(res, 404, { error: "нет такого адреса" });
  } catch (e) {
    console.error("proxy:", e.message);
    if (!res.headersSent) send(res, e.status || 502, { error: e.message, reason: e.reason || "other" });
    else res.end();
  }
}

/* Буферизованный вызов — для облачных функций без потоковой передачи (Яндекс Облако) */
function runBuffered({ method, url, headers, body }) {
  const { PassThrough, Writable } = require("stream");
  return new Promise(resolve => {
    const req = new PassThrough(); Object.assign(req, { method, url, headers: Object.fromEntries(Object.entries(headers || {}).map(([k, v]) => [k.toLowerCase(), v])), socket: { remoteAddress: (headers && (headers["x-forwarded-for"] || headers["X-Forwarded-For"])) || "0.0.0.0" } });
    const chunks = []; let status = 200; const outHeaders = {};
    const res = new Writable({ write(c, e, cb) { chunks.push(Buffer.from(c)); cb(); } });
    Object.assign(res, { headersSent: false, setHeader(k, v) { outHeaders[k] = v; }, writeHead(code, h) { status = code; Object.assign(outHeaders, h || {}); this.headersSent = true; return this; } });
    res.on("finish", () => { const buf = Buffer.concat(chunks); const ct = String(outHeaders["Content-Type"] || outHeaders["content-type"] || ""); const bin = /^image\//.test(ct); resolve({ statusCode: status, headers: outHeaders, body: bin ? buf.toString("base64") : buf.toString("utf8"), isBase64Encoded: bin }); });
    handler(req, res);
    req.end(body || "");
  });
}
module.exports = { handler, runBuffered, gigaToken, request, ENV, ensureCa };
if (require.main === module) http.createServer(handler).listen(ENV.port, () => console.log(`Прокси «Учу по ФРП» v5: :${ENV.port}`));
