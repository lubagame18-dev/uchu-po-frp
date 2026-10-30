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
const IMG = require("./image-pool.js");
const Q = require("./quota.js");
const PAY = require("./payments.js");
const SMS = require("./sms-hook.js");

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
/* Потолки стоимости одного запроса (подбери под свой тариф) и белые списки моделей:
   на серверном ключе клиент не должен сам выбирать дорогую модель и огромный ответ. */
const LIMITS = {
  maxOut: Number(process.env.MAX_OUTPUT_TOKENS || 4096),
  gigaModels: (process.env.GIGACHAT_MODELS || "GigaChat-2,GigaChat-2-Pro,GigaChat-2-Max").split(",").map(s => s.trim()).filter(Boolean),
  gigaDefault: process.env.GIGACHAT_MODEL || "GigaChat-2",
  yaModels: (process.env.YANDEX_MODELS || "yandexgpt-lite/latest,yandexgpt/latest,yandexgpt-lite,yandexgpt").split(",").map(s => s.trim()).filter(Boolean),
  yaDefault: process.env.YANDEX_MODEL || "yandexgpt-lite/latest"
};
const clampModel = (m, list, def) => list.includes(String(m || "")) ? String(m) : def;
const clampOut = n => Math.max(256, Math.min(+n || 1024, LIMITS.maxOut));
const estTokens = body => Math.round((JSON.stringify(body.messages || "").length + (+body.max_tokens || 1024)) / 3);
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
/* Факты к уроку по российским образовательным и научно-справочным сайтам (история и другие предметы):
   РЭШ, Российское историческое общество (histrf.ru), Большая российская энциклопедия, Президентская библиотека,
   «Урок.рф», Инфоурок, nsportal, Мультиурок, «1 сентября», Фоксфорд, ИнтернетУрок, Видеоуроки и др.
   Из страниц берутся только короткие предложения по теме (даты, определения, факты) — каждое с адресом источника. */
const FACT_HOSTS = /(^|\.)(resh\.edu\.ru|histrf\.ru|bigenc\.ru|prlib\.ru|runivers\.ru|xn--j1ahfl\.xn--p1ai|infourok\.ru|nsportal\.ru|multiurok\.ru|urok\.1sept\.ru|1sept\.ru|kopilkaurokov\.ru|foxford\.ru|interneturok\.ru|videouroki\.net|uchitelya\.com|pedsovet\.su|obrazovaka\.ru|historyrussia\.org|rusempire\.ru|encyclopedia\.mil\.ru|mil\.ru|9may\.ru|pobeda\.elar\.ru|cyberleninka\.ru|rvio\.histrf\.ru|xn--h1aagokeh\.xn--p1ai|znanierussia\.ru|kulturologia\.ru|culture\.ru|rgo\.ru|ras\.ru|mos\.ru|chel-portal\.ru|chelreglib\.ru|cspu\.ru|csu\.ru|gramota\.ru|ya-uchitel\.ru|uchi\.ru|skysmart\.ru)$/i;
const factCache = new Map();
function factExtract(text, words) {
  const sents = text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[А-ЯЁ«])/).map(x => x.trim()).filter(x => x.length > 30 && x.length < 320 && !/(cookie|javascript|©|скачать|зарегистр|войти|реклам|подпис|оплат|курс повышения|вебинар|http)/i.test(x));
  const score = l => { const t = l.toLowerCase(); return words.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0); };
  const rel = sents.filter(l => score(l) > 0);
  const dates = rel.filter(l => /\b(1[0-9]{3}|[5-9][0-9]{2})\s*(г\.|год|–|-)|\b[IVX]{1,5}\s*в(\.|ек)|до н\.\s*э\./.test(l)).slice(0, 8);
  const defs = sents.filter(l => /^[А-ЯЁ][а-яё\- ]{2,40}\s+[—–-]\s+(это\s+)?[а-яё]/.test(l) && l.length < 220).slice(0, 6);
  const facts = rel.filter(l => !dates.includes(l) && !defs.includes(l)).sort((a, b) => score(b) - score(a)).slice(0, 8);
  return { dates, defs, facts };
}
/* Надёжность источников: 1 — государственные и научные (РЭШ, Библиотека ЦОК, ЕСОО, РИО, БРЭ, Президентская библиотека,
   архивы Минобороны); 2 — образовательные платформы (Фоксфорд, ИнтернетУрок, Видеоуроки, «Урок.рф», МЭШ);
   3 — разработки учителей (Инфоурок, nsportal, Мультиурок, «Копилка уроков») — берутся, только если первых мало. */
const TIER1 = /(^|\.)(resh\.edu\.ru|lesson\.edu\.ru|edsoo\.ru|histrf\.ru|rvio\.histrf\.ru|bigenc\.ru|prlib\.ru|rusneb\.ru|runivers\.ru|encyclopedia\.mil\.ru|mil\.ru|pamyat-naroda\.ru|podvignaroda\.ru|rgo\.ru|ras\.ru|cyberleninka\.ru|historyrussia\.org)$/i;
const TIER2 = /(^|\.)(foxford\.ru|interneturok\.ru|videouroki\.net|xn--j1ahfl\.xn--p1ai|uchebnik\.mos\.ru|znanierussia\.ru|culture\.ru|1sept\.ru|urok\.1sept\.ru|uchi\.ru|skysmart\.ru|obrazovaka\.ru|gramota\.ru|chelreglib\.ru|cspu\.ru|csu\.ru|chel-portal\.ru|9may\.ru|pobeda\.elar\.ru)$/i;
const tierOf = h => TIER1.test(h) ? 1 : TIER2.test(h) ? 2 : FACT_HOSTS.test(h) ? 3 : 0;
async function factSearch(q, words, subj) {
  const ck = subj + ":" + q; const hit = factCache.get(ck); if (hit && Date.now() - hit.at < 24 * 3600e3) return hit.data;
  // запросы прямо на надёжные сайты + общий запрос с отбором по списку
  const qs = subj === "hist" ? [q + " site:resh.edu.ru", q + " site:histrf.ru", q + " site:bigenc.ru", q + " история урок"] : subj === "bio" ? [q + " site:resh.edu.ru", q + " site:bigenc.ru", q + " site:lesson.edu.ru", q + " биология урок"] : [q + " site:resh.edu.ru", q + " site:lesson.edu.ru", q + " урок", q + " конспект"];
  const found = [];
  const lists = await Promise.all(qs.map(qq => yandexWeb(qq, 10).catch(e => { if (e.status === 401) throw e; return []; })));
  for (const list of lists) for (const r of list) { let host = r.domain; try { host = new URL(r.url).hostname; } catch { } const t = tierOf(host); if (t && !found.some(x => x.url === r.url)) found.push({ ...r, tier: t }); }
  found.sort((a, b) => a.tier - b.tier);
  const good = found.filter(x => x.tier < 3), top = (good.length >= 3 ? good : found).slice(0, 6);
  const pages = await Promise.all(top.map(r => Promise.race([fetchPageText(r.url).catch(() => ""), new Promise(res => setTimeout(() => res(""), 10000))])));
  const results = top.map((r, i) => ({ url: r.url, domain: r.domain, title: r.title, tier: r.tier, snippet: r.snippet, ...(pages[i] ? factExtract(pages[i], words) : { dates: [], defs: [], facts: [] }) }));
  const data = { ok: true, results };
  factCache.set(ck, { at: Date.now(), data }); if (factCache.size > 300) factCache.delete(factCache.keys().next().value);
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
/* адрес во внутренней сети (в том числе облачные служебные адреса) — туда ходить нельзя */
function privateIp(ip) {
  ip = String(ip).replace(/^::ffff:/, "");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) { const [a, b] = ip.split(".").map(Number); return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224; }
  return ip === "::1" || ip === "::" || /^(fc|fd|fe[89ab])/i.test(ip);
}
async function fetchImage(url, depth = 0) {
  const u = new URL(url); if (!/^https?:$/.test(u.protocol) || u.username || u.password || (u.port && !["80", "443"].includes(u.port))) throw Object.assign(new Error("недопустимый адрес"), { status: 400 });
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (/^localhost$|\.(local|internal|localdomain)$/i.test(host)) throw Object.assign(new Error("недопустимый адрес"), { status: 400 });
  const addrs = require("net").isIP(host) ? [{ address: host }] : await require("dns").promises.lookup(host, { all: true }).catch(() => []);
  if (!addrs.length || addrs.some(a => privateIp(a.address))) throw Object.assign(new Error("недопустимый адрес"), { status: 400 });
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

  /* ---------- регистрация через бота: создаёт аккаунт и сразу привязывает чат ---------- */
  if (req.method === "POST" && route === "/bot/register") {
    const botSecret = process.env.BOT_SECRET || "";
    if (botSecret && req.headers["x-bot-secret"] !== botSecret) return send(res, 403, { error: "forbidden" });
    let rawReg = ""; try { rawReg = await readAll(req); } catch { }
    let br = {}; try { br = JSON.parse(rawReg || "{}"); } catch { }
    const email = String(br.email || "").trim().toLowerCase();
    const password = String(br.password || "");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return send(res, 400, { error: "нужна корректная почта" });
    if (password.length < 6) return send(res, 400, { error: "пароль короче 6 символов" });
    const sbUrl = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
    const sbKey = process.env.SUPABASE_SERVICE_KEY || "";
    if (!sbUrl || !sbKey) return send(res, 503, { error: "регистрация временно недоступна" });
    const headers = { apikey: sbKey, Authorization: "Bearer " + sbKey, "Content-Type": "application/json" };
    const rr = await request(sbUrl + "/auth/v1/admin/users", {
      method: "POST", headers,
      body: JSON.stringify({ email, password, email_confirm: true }), timeout: 20000
    });
    const rtxt = await readAll(rr); let j = null; try { j = JSON.parse(rtxt); } catch { }
    if (rr.status < 200 || rr.status >= 300 || !j || !j.id) {
      const msg = (j && (j.msg || j.message || j.error_description)) || "не удалось создать аккаунт";
      return send(res, 400, { error: String(msg).slice(0, 200) });
    }
    const uid = j.id;
    try {
      await request(sbUrl + "/rest/v1/profiles", {
        method: "POST", headers, timeout: 15000,
        body: JSON.stringify({ id: uid, plan: "free", ai_left: 0 })
      });
    } catch { }
    if (br.chat_id) {
      try {
        await request(sbUrl + "/rest/v1/bot_links", {
          method: "POST", headers, timeout: 15000,
          body: JSON.stringify({ chat_id: String(br.chat_id), platform: String(br.platform || "tg"), user_id: uid, email: email })
        });
      } catch { }
    }
    return send(res, 200, { ok: true, user_id: uid, email });
  }



  /* ---------- ИИ для ботов: конспект с предметным содержанием ---------- */
  if (req.method === "POST" && route === "/bot/ai") {
    const botSecret3 = process.env.BOT_SECRET || "";
    if (botSecret3 && req.headers["x-bot-secret"] !== botSecret3) return send(res, 403, { error: "forbidden" });
    let rawAi = ""; try { rawAi = await readAll(req); } catch { }
    let ba = {}; try { ba = JSON.parse(rawAi || "{}"); } catch { }
    const subject = String(ba.subject || "").slice(0, 80);
    const grade = String(ba.grade || "").slice(0, 4);
    const topic = String(ba.topic || "").slice(0, 300);
    const kind = String(ba.kind || "conspect");
    const editText = String(ba.text || "").slice(0, 20000);
    if (!subject || !grade || !topic) return send(res, 400, { error: "нужны subject, grade, topic" });
    const sys = [
      "Ты — ведущий методист и автор учебных материалов по ФРП (Федеральная рабочая программа) и требованиям ФГОС.",
      "Твоя задача — создать глубокий, содержательный документ по теме, а не общие фразы.",
      `Предмет: ${subject}. Класс: ${grade}. Тема: ${topic}.`,
      "Требования:",
      "1. Только материал по теме и классу; не добавляй постороннее.",
      "2. Опирайся на содержание ФРП: планируемые результаты (предметные, метапредметные, личностные), виды деятельности.",
      "3. Не выдумывай факты, даты, формулы, цитаты; если данных нет — формулируй задание без конкретного факта.",
      "4. Не упоминай сайт, сервис, ИИ, себя и внешние ссылки.",
      "5. Оформление — методический документ: заголовки # и ##, выделение **текст**, списки «-», таблицы, если нужны.",
      "6. Наполненность: конкретные понятия темы, примеры, задания с ответами/критериями, вопросы, дифференциация, домашнее задание. Не сокращай ради краткости.",
      editText ? "Формат: редактирование готового текста. Сохрани смысл и структуру, исправь оформление под методический документ (ГОСТ, без символов разметки), убери лишнее, добавь недостающие задания/вопросы по теме. Верни только готовый документ." : kind === "worksheet"
        ? "Формат: рабочий лист для ученика — 6–8 заданий по теме с местом для ответа, без рефлексии ФРП."
        : kind === "slides"
          ? "Формат: план презентации — 9–11 слайдов, для каждого: заголовок, 3–5 тезисов, задание/вопрос. Ключевые термины помечай как [термин](#g \"краткое значение\")."
          : "Формат: развёрнутый конспект урока — цель, планируемые результаты, ключевые понятия с определениями, этапы с минутами и деятельностью учителя/ученика, примеры и задания, вопросы, дифференциация, критерии, домашнее задание. Задания и работу с текстом оформляй отдельным блоком: строка-установка (что именно сделать), затем таблица | Материал/фрагмент | Что сделать | Вопрос/задание |. Фрагменты произведений — отдельным блоком перед таблицей с автором и названием, не в речи учителя.",
      "Верни только готовый документ в markdown, без пояснений и вступлений."
    ].join("\n");
    try {
      const DS2 = require("./deepseek-pool.js");
      const rs = await DS2.chat({ messages: [{ role: "system", content: sys }, { role: "user", content: editText ? `Отредактируй текст по теме «${topic}», ${subject}, ${grade} класс. Текст для редактирования:\n\n${editText}` : `Создай материал: ${kind}. Тема «${topic}», ${subject}, ${grade} класс.` }], temperature: 0.55, max_tokens: 3200 }, request, readAll, 0);
      let content = "";
      try { const j = JSON.parse(rs.text); content = j.choices?.[0]?.message?.content || ""; } catch { content = String(rs.text || ""); }
      content = String(content).replace(/^\s*```(?:markdown|md)?\s*\n/, "").replace(/\n```\s*$/, "").trim();
      if (!content) return send(res, 502, { error: "пустой ответ модели" });
      return send(res, 200, { ok: true, text: content });
    } catch (e) {
      return send(res, 503, { error: String(e.message || e).slice(0, 160) });
    }
  }

  /* ---------- привязка мессенджера к аккаунту: бот присылает почту ---------- */
  if (req.method === "POST" && route === "/bot/link") {
    const botSecret2 = process.env.BOT_SECRET || "";
    if (botSecret2 && req.headers["x-bot-secret"] !== botSecret2) return send(res, 403, { error: "forbidden" });
    let rawLink = ""; try { rawLink = await readAll(req); } catch { }
    let bl = {}; try { bl = JSON.parse(rawLink || "{}"); } catch { }
    const email = String(bl.email || "").trim().toLowerCase();
    const chatId = String(bl.chat_id || "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return send(res, 400, { error: "нужна корректная почта" });
    if (!chatId) return send(res, 400, { error: "нет chat_id" });
    const sbUrl2 = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
    const sbKey2 = process.env.SUPABASE_SERVICE_KEY || "";
    if (!sbUrl2 || !sbKey2) return send(res, 503, { error: "привязка временно недоступна" });
    const headers2 = { apikey: sbKey2, Authorization: "Bearer " + sbKey2, "Content-Type": "application/json" };
    const prof = await request(sbUrl2 + "/rest/v1/profiles?email=eq." + encodeURIComponent(email) + "&select=id", { headers: headers2, timeout: 15000 });
    const pj = await readAll(prof); let arr = []; try { arr = JSON.parse(pj || "[]"); } catch { }
    if (!Array.isArray(arr) || !arr[0] || !arr[0].id) return send(res, 404, { error: "аккаунт не найден — сначала зарегистрируйтесь на сайте" });
    const uid2 = arr[0].id;
    try {
      await request(sbUrl2 + "/rest/v1/bot_links?on_conflict=chat_id", {
        method: "POST", timeout: 15000,
        headers: { ...headers2, Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({ chat_id: chatId, platform: String(bl.platform || "tg"), user_id: uid2, email: email })
      });
    } catch { }
    return send(res, 200, { ok: true, email: email });
  }



  /* ---------- выгрузка собранных уроков для внешнего сайта ---------- */
  if (route === "/export/lessons") {
    const adm = process.env.ADMIN_TOKEN || "";
    if (!adm || req.headers["x-admin-token"] !== adm) return send(res, 403, { error: "только для разработчика" });
    const sbU = (process.env.SUPABASE_URL || "").replace(/\/+$/, ""), sbK = process.env.SUPABASE_SERVICE_KEY || "";
    if (!sbU || !sbK) return send(res, 503, { error: "облако недоступно" });
    const rr = await request(sbU + "/rest/v1/lessons?select=id,user_id,data,updated_at&order=updated_at.desc&limit=5000", { headers: { apikey: sbK, Authorization: "Bearer " + sbK }, timeout: 30000 });
    const txt = await readAll(rr);
    let rows = []; try { rows = JSON.parse(txt || "[]"); } catch { }
    const lessons = (Array.isArray(rows) ? rows : []).map(r => {
      const L = r.data || {}, pr = L.params || {};
      return {
        id: r.id,
        subject: pr.subject || L.subject || "",
        grade: +(pr.grade || L.grade || 0),
        topic: pr.topic || L.title || "",
        title: L.title || pr.topic || "",
        type: pr.type?.name || pr.typeName || "",
        duration: +(pr.duration || 45),
        formats: Object.fromEntries(Object.entries(L.docs || {}).filter(([, v]) => typeof v === "string" && v.trim()).map(([k, v]) => [k, v])),
        updated_at: r.updated_at
      };
    }).filter(x => x.topic || Object.keys(x.formats).length).sort((a, b) => (a.subject + a.grade + a.topic).localeCompare(b.subject + b.grade + b.topic, "ru"));
    return send(res, 200, { ok: true, schema: "uchu-ai-lessons/1", count: lessons.length, exported_at: new Date().toISOString(), lessons });
  }

  /* ---------- вход через Яндекс (свой OAuth) ---------- */
  if (route === "/auth/yandex") {
    const yid = process.env.YANDEX_CLIENT_ID || "", ysec = process.env.YANDEX_CLIENT_SECRET || "";
    if (!yid || !ysec) return send(res, 503, { error: "вход через Яндекс не настроен" });
    const fnUrl = "https://functions.yandexcloud.net/d4ek0q8grbhn7q5muf24?path=/auth/yandex";
    const u2 = new URL(req.url, "https://x");
    const code = u2.searchParams.get("code");
    const site = u2.searchParams.get("site") || "https://uchu-po-frp.ru/";
    const wantJson = u2.searchParams.get("format") === "json";
    const redirect = (url) => { if (wantJson) return send(res, 200, { redirect: url }); const esc2 = String(url).replace(/&/g, "&amp;").replace(/"/g, "&quot;"); res.statusCode = 200; res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end("<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Вход через Яндекс</title></head><body style=\"font:16px system-ui;padding:24px;text-align:center\"><p>Переходим на Яндекс…</p><p><a href=\"" + esc2 + "\">Продолжить вручную</a></p><script>location.replace(" + JSON.stringify(url) + ");</script></body></html>"); };
    if (!code) {
      return redirect("https://oauth.yandex.ru/authorize?response_type=code&client_id=" + encodeURIComponent(yid)
        + "&redirect_uri=" + encodeURIComponent("https://uchu-po-frp.ru/yandex.html") + "&state=" + encodeURIComponent(site));
    }
    try {
      const tr = await request("https://oauth.yandex.ru/token", {
        method: "POST", timeout: 20000,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=authorization_code&code=" + encodeURIComponent(code) + "&client_id=" + encodeURIComponent(yid) + "&client_secret=" + encodeURIComponent(ysec) + "&redirect_uri=" + encodeURIComponent(site.replace(/\/+$/, "") + "/yandex.html")
      });
      const tj = JSON.parse(await readAll(tr));
      const at = tj.access_token; if (!at) return redirect(site + "#error_description=yandex_token");
      const ir = await request("https://login.yandex.ru/info?format=json", { headers: { Authorization: "OAuth " + at }, timeout: 20000 });
      const ij = JSON.parse(await readAll(ir));
      const email = String(ij.default_email || (ij.emails && ij.emails[0]) || "").toLowerCase();
      if (!email) return redirect(site + "#error_description=yandex_email");
      const sbUrl = (process.env.SUPABASE_URL || "").replace(/\/+$/, ""), sbKey = process.env.SUPABASE_SERVICE_KEY || "";
      const headers = { apikey: sbKey, Authorization: "Bearer " + sbKey, "Content-Type": "application/json" };
      let prof = null;
      try { const pr = await request(sbUrl + "/rest/v1/profiles?email=eq." + encodeURIComponent(email) + "&select=id", { headers, timeout: 15000 }); prof = (JSON.parse(await readAll(pr)) || [])[0] || null; } catch { }
      if (!prof) {
        const pass = "ya_" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
        const cr = await request(sbUrl + "/auth/v1/admin/users", { method: "POST", headers, timeout: 20000, body: JSON.stringify({ email, password: pass, email_confirm: true, user_metadata: { avatar_url: ij.default_avatar_id ? "https://avatars.yandex.net/get-yapic/" + ij.default_avatar_id + "/islands-200" : "" } }) });
        const cj = JSON.parse(await readAll(cr));
        if (!cj.id) return redirect(site + "#error_description=yandex_create");
        try { await request(sbUrl + "/rest/v1/profiles", { method: "POST", headers, timeout: 15000, body: JSON.stringify({ id: cj.id, plan: "free", ai_left: 2, email }) }); } catch { }
        const tk = await request(sbUrl + "/auth/v1/token?grant_type=password", { method: "POST", headers: { apikey: sbKey, "Content-Type": "application/json" }, timeout: 20000, body: JSON.stringify({ email, password: pass }) });
        const tjj = JSON.parse(await readAll(tk));
        return redirect(site + "#access_token=" + encodeURIComponent(tjj.access_token || "") + "&refresh_token=" + encodeURIComponent(tjj.refresh_token || "") + "&expires_in=" + (tjj.expires_in || 3600));
      }
      const gr = await request(sbUrl + "/auth/v1/admin/generate_link", { method: "POST", headers, timeout: 20000, body: JSON.stringify({ type: "magiclink", email, redirect_to: site }) });
      const gj = JSON.parse(await readAll(gr));
      if (gj && gj.action_link) return redirect(gj.action_link);
      return redirect(site + "#error_description=yandex_login");
    } catch (e) {
      return redirect(site + "#error_description=" + encodeURIComponent(String(e.message || "yandex")));
    }
  }


  /* ---------- серверный учёт бесплатного доступа: 3 в день, 2 дня ---------- */
  async function trialUser(tok) {
    const sb = (process.env.SUPABASE_URL || "").replace(/\/+$/, ""), key = process.env.SUPABASE_SERVICE_KEY || "";
    if (!sb || !key || !tok) return null;
    const r = await request(sb + "/auth/v1/user", { headers: { apikey: key, Authorization: "Bearer " + tok }, timeout: 15000 });
    const u = JSON.parse(await readAll(r)); return u && u.id ? u : null;
  }
  async function trialProfile(uid) {
    const sb = (process.env.SUPABASE_URL || "").replace(/\/+$/, ""), key = process.env.SUPABASE_SERVICE_KEY || "";
    const r = await request(sb + "/rest/v1/profiles?id=eq." + uid + "&select=trial_start,trial_day,trial_used", { headers: { apikey: key, Authorization: "Bearer " + key }, timeout: 15000 });
    const j = JSON.parse(await readAll(r)); return (Array.isArray(j) ? j[0] : null) || null;
  }
  function trialCalc(p) {
    const today = new Date().toISOString().slice(0, 10);
    const start = p && p.trial_start ? new Date(p.trial_start).getTime() : 0;
    if (!start) return { started: false, dayIndex: 0, usedToday: 0, left: 3, expired: false, startAt: null };
    const dayIndex = Math.floor((Date.now() - start) / 86400000);
    if (dayIndex >= 2) return { started: true, dayIndex, usedToday: 3, left: 0, expired: true, startAt: start };
    const usedToday = p.trial_day === today ? (p.trial_used || 0) : 0;
    return { started: true, dayIndex, usedToday, left: Math.max(0, 3 - usedToday), expired: false, startAt: start };
  }
  if (route === "/trial/status") {
    const u = await trialUser(req.headers["x-user-token"]);
    if (!u) return send(res, 401, { error: "войдите в кабинет" });
    return send(res, 200, { ok: true, ...trialCalc(await trialProfile(u.id)) });
  }
  if (route === "/trial/use" && req.method === "POST") {
    const u = await trialUser(req.headers["x-user-token"]);
    if (!u) return send(res, 401, { error: "войдите в кабинет" });
    const sb = (process.env.SUPABASE_URL || "").replace(/\/+$/, ""), key = process.env.SUPABASE_SERVICE_KEY || "";
    const p0 = await trialProfile(u.id);
    const c = trialCalc(p0);
    if (c.expired || c.left <= 0) return send(res, 403, { error: "trial_expired", ...c });
    const today = new Date().toISOString().slice(0, 10);
    const patch = { trial_start: c.startAt ? new Date(c.startAt).toISOString() : new Date().toISOString(), trial_day: today, trial_used: (p0 && p0.trial_day === today ? (p0.trial_used || 0) : 0) + 1 };
    await request(sb + "/rest/v1/profiles?id=eq." + u.id, { method: "PATCH", headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(patch), timeout: 15000 });
    return send(res, 200, { ok: true, left: Math.max(0, 3 - patch.trial_used), usedToday: patch.trial_used, startAt: new Date(patch.trial_start).getTime() });
  }

  /* ---------- приём ботов по корню функции: некоторые платформы теряют ?path= ---------- */
  if (req.method === "POST" && (route === "" || route === "/")) {
    let rawRoot = ""; try { rawRoot = await readAll(req); } catch { }
    let upd = {}; try { upd = JSON.parse(rawRoot || "{}"); } catch { }
    if (upd && upd.update_type) {
      const wantMax = process.env.MAX_SECRET;
      if (wantMax && req.headers["x-max-bot-api-secret"] !== wantMax) return send(res, 403, { error: "forbidden" });
      try { await require("./maxbot.js").handle(upd); } catch (e) { lastError = String(e.message || e).slice(0, 160); }
      return send(res, 200, { ok: true });
    }
    if (upd && (upd.update_id || upd.message || upd.callback_query)) {
      const wantTg = process.env.TELEGRAM_SECRET;
      if (wantTg && req.headers["x-telegram-bot-api-secret-token"] !== wantTg) return send(res, 403, { error: "forbidden" });
      try { await require("./telegram.js").handle(upd); } catch (e) { lastError = String(e.message || e).slice(0, 160); }
      return send(res, 200, { ok: true });
    }
    return send(res, 400, { error: "нужен массив messages" });
  }
  /* ---------- Telegram-бот «Учу по ФРП» (вебхук) ---------- */
  if (req.method === "POST" && route === "/telegram/webhook") {
    const want = process.env.TELEGRAM_SECRET;
    if (want && req.headers["x-telegram-bot-api-secret-token"] !== want) return send(res, 403, { error: "forbidden" });
    let raw = ""; try { raw = await readAll(req); } catch { }
    let upd = {}; try { upd = JSON.parse(raw || "{}"); } catch { }
    try { const tg = require("./telegram.js"); await tg.handle(upd); } catch (e) { lastError = String(e.message || e).slice(0, 160); }
    return send(res, 200, { ok: true });

  }
  /* ---------- MAX-бот «Учу по ФРП» (вебхук) ---------- */
  if (req.method === "POST" && route === "/max/webhook") {
    const wantMax = process.env.MAX_SECRET;
    if (wantMax && req.headers["x-max-bot-api-secret"] !== wantMax) return send(res, 403, { error: "forbidden" });
    let raw = ""; try { raw = await readAll(req); } catch { }
    let upd = {}; try { upd = JSON.parse(raw || "{}"); } catch { }
    try { const mb = require("./maxbot.js"); await mb.handle(upd); } catch (e) { lastError = String(e.message || e).slice(0, 160); }
    return send(res, 200, { ok: true });
  }
  if (req.method === "GET" && (route === "" || route === "/health")) {
    // ждём сертификат (не дольше 9 секунд), чтобы ответ показывал правду
    await Promise.race([ensureCa(), new Promise(r => setTimeout(r, 9000))]);
    return send(res, 200, { ok: true, service: "uchu-po-frp-proxy", version: 24, providers: ["gigachat", "deepseek", "yandex", "relay", "images", "edu", "media", "facts", "pay"], pay: PAY.on(), payBy: PAY.provider(), sms: SMS.on(), deepseek: (await DS.pool(request, readAll).catch(() => DS.loadPool())).filter(a => a.isActive && !DS.isPlaceholder(a.key)).length, images: !!(YS.key && YS.folder), keys: { gigachat: !!process.env.GIGACHAT_KEY, yandex: !!(process.env.YANDEX_KEY && process.env.YANDEX_FOLDER) }, telegram: !!process.env.TELEGRAM_BOT_TOKEN, max: !!process.env.MAX_BOT_TOKEN, adminToken: !!process.env.ADMIN_TOKEN, cert: !!ca || ENV.insecure || caFallback, certMode: ca ? "сертификат Минцифры: " + caSource : ENV.insecure || caFallback ? "проверка сертификата Сбера отключена (запасной режим)" : "нет", relay: { hosts: RELAY_HOSTS, auth: !!(ENV.proxyUser || ENV.proxyPass) }, lastError });
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
    if (limited((req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim())) return send(res, 429, { error: "слишком много запросов, подождите минуту", reason: "rate" });
    if (!(YS.key && YS.folder)) return send(res, 200, { ok: false, reason: "no_keys", results: [] });
    const q = String(u.searchParams.get("q") || "").slice(0, 200).trim(); if (!q) return send(res, 400, { error: "нужен q" });
    const words = String(u.searchParams.get("w") || "").toLowerCase().split(/[,\s]+/).filter(w => w.length > 3).slice(0, 6);
    try { return send(res, 200, await eduSearch(q, words)); } catch (e) { return send(res, e.status || 502, { ok: false, error: String(e.message || e), results: [] }); }
  }
  if (req.method === "GET" && route === "/facts") {
    if (!(YS.key && YS.folder)) return send(res, 200, { ok: false, reason: "no_keys", results: [] });
    const q = String(u.searchParams.get("q") || "").slice(0, 240).trim(); if (!q) return send(res, 400, { error: "нужен q" });
    const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
    if (limited(ip)) return send(res, 429, { error: "слишком много запросов, подождите минуту", reason: "rate" });
    const words = String(u.searchParams.get("w") || "").toLowerCase().split(/[,\s]+/).filter(w => w.length > 3).map(w => w.slice(0, 6)).slice(0, 8);
    try { return send(res, 200, await factSearch(q, words, String(u.searchParams.get("s") || "hist").slice(0, 10))); } catch (e) { return send(res, e.status || 502, { ok: false, error: String(e.message || e), results: [] }); }
  }
  if (req.method === "GET" && route === "/img") {
    if (limited((req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim())) return send(res, 429, { error: "слишком много запросов, подождите минуту", reason: "rate" });
    try { const r = await fetchImage(String(u.searchParams.get("url") || "")); res.writeHead(200, { "Content-Type": r.type, "Cache-Control": "public, max-age=86400" }); return res.end(r.buf); }
    catch (e) { return send(res, e.status || 502, { error: e.message }); }
  }
  if (req.method === "GET" && route === "/deepseek/balance") {
    // баланс аккаунтов — только владельцу (заголовок X-Admin-Token = переменная ADMIN_TOKEN)
    if (!process.env.ADMIN_TOKEN || req.headers["x-admin-token"] !== process.env.ADMIN_TOKEN) return send(res, 403, { error: "нужен токен владельца" });
    return send(res, 200, { ok: true, accounts: await DS.balances(request, readAll) });
  }
  if (req.method === "GET" && route === "/diagnose") {
    if (limited((req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim())) return send(res, 429, { error: "слишком много запросов, подождите минуту", reason: "rate" });
    // проверка «вживую»: получить токен GigaChat ключом с сервера (или из заголовка)
    const key = String(req.headers["x-gigachat-key"] || process.env.GIGACHAT_KEY || "").trim();
    if (!key) return send(res, 200, { ok: false, reason: "no_key", message: "На прокси нет ключа GigaChat (GIGACHAT_KEY)." });
    try { await gigaToken(key); const nk = normalizeKey(key); return send(res, 200, { ok: true, message: "Сбер выдал токен: GigaChat доступен." + (nk.fixed ? " (" + nk.fixed + ")" : ""), scope: scopeOf.get(crypto.createHash("sha256").update(nk.key).digest("hex")) }); }
    catch (e) { return send(res, 200, { ok: false, reason: e.reason || "other", message: e.message }); }
  }
  if (req.method === "POST" && route === "/sms-hook") { // Supabase просит отправить код входа по SMS (отдельно от общего лимита по IP: запросы идут с серверов Supabase)
    try { const raw = await readBody(req); const r = await SMS.handle(raw, req.headers, request, readAll); return send(res, r.status, r.json); } catch (e) { return send(res, 200, { error: { http_code: 500, message: "ошибка" } }); }
  }
  if (req.method !== "POST") return send(res, 405, { error: "метод не поддерживается" });
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  if (limited(ip)) return send(res, 429, { error: "слишком много запросов, подождите минуту", reason: "rate" });
  try {
    const raw = await readBody(req);
    if (route === "/relay") {
      if (!relayAuthOk(req)) return send(res, 407, { error: "прокси требует логин и пароль", reason: "proxy_auth" });
      // пароль прокси не задан и облако подключено — пускаем только вошедших, чтобы не держать открытый релей
      if (!ENV.proxyUser && !ENV.proxyPass && Q.on() && !(await Q.validUser(req.headers["x-user-token"], request, readAll))) return send(res, 401, { error: "войдите в личный кабинет", reason: "login" });
      let target; try { target = new URL(u.searchParams.get("url") || ""); } catch { return send(res, 400, { error: "нет адреса url" }); }
      if (target.protocol !== "https:" || !RELAY_HOSTS.some(h => target.hostname === h || target.hostname.endsWith("." + h))) return send(res, 403, { error: "этот адрес нельзя пересылать: " + target.hostname });
      const pass = {}; for (const h of ["authorization", "x-api-key", "anthropic-version", "anthropic-dangerous-direct-browser-access", "http-referer", "x-title", "content-type"]) if (req.headers[h]) pass[h] = req.headers[h];
      const up = await request(target.href, { headers: pass, body: raw });
      return pipeUpstream(res, up);
    }
    if (route === "/pay/yk") { await PAY.ykNotify(raw, request, readAll).catch(e => console.warn("yk notify", e.message)); return send(res, 200, { ok: true }); } // уведомления ЮKassa
    if (route === "/pay/notify") { const r = await PAY.notify(raw, req.headers, request, readAll); res.writeHead(r.status, { "Content-Type": "text/plain; charset=utf-8" }); return res.end(r.text); }
    let body; try { body = JSON.parse(raw); } catch { return send(res, 400, { error: "тело запроса — не JSON" }); }
    if (route === "/admin/join") { const devCode = process.env.ADMIN_TOKEN || process.env.DEV_CODE || "Pedagogural"; const codeIn = String(body.code || ""); if (devCode && codeIn && codeIn === devCode) return send(res, 200, { ok: true, dev: true, token: devCode }); const r = await Q.join(req.headers["x-user-token"], body.code, request, readAll); return send(res, r.ok ? 200 : r.status, r.ok ? { ok: true, already: !!r.already } : { error: r.message }); }
    if (route === "/admin/keys") {
      // ячейки ключей DeepSeek — только автору сайта (вход в кабинет почтой из site_admins или X-Admin-Token)
      const tokOk = process.env.ADMIN_TOKEN && req.headers["x-admin-token"] === process.env.ADMIN_TOKEN;
      if (!tokOk && !(await Q.isAdmin(req.headers["x-user-token"], request, readAll))) return send(res, 403, { error: "только для автора сайта: войдите в личный кабинет своей почтой" });
      const r = await DS.admin(body, request, readAll); return send(res, r.status, r.json);
    }
    if (route === "/admin/imgkeys") {
      // ячейки общих ключей для картинок — только автору сайта
      const tokOk = process.env.ADMIN_TOKEN && req.headers["x-admin-token"] === process.env.ADMIN_TOKEN;
      if (!tokOk && !(await Q.isAdmin(req.headers["x-user-token"], request, readAll))) return send(res, 403, { error: "только для автора сайта: войдите в личный кабинет своей почтой" });
      const r = await IMG.admin(body, request, readAll); return send(res, r.status, r.json);
    }
    if (route === "/image") {
      // картинка для листа/презентации: вход, тариф «Учитель + ИИ» или «Методист», месячный лимит; ключи — пул из 5 ячеек с переключением
      const adm = await Q.isAdmin(req.headers["x-user-token"], request, readAll);
      if (adm) { try { const r = await IMG.image(String(body.prompt || "").slice(0, 3000), /^(1:1|3:4|4:3|16:9|9:16)$/.test(body.aspect) ? body.aspect : "16:9", request, readAll); return send(res, 200, { image: r.image }); } catch (e) { return send(res, e.status || 502, { error: e.message, reason: e.reason }); } }
      const r = await IMG.handle(body, req.headers["x-user-token"], request, readAll); return send(res, r.status, r.json);
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
      return send(res, r.ok ? 200 : r.status, r.ok ? { ok: true, free: !!r.free, pct: r.pct || null } : { error: r.message });
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
      const userKey = String(req.headers["x-gigachat-key"] || "").trim();
      const key = userKey || String(process.env.GIGACHAT_KEY || "").trim();
      if (!key) return send(res, 401, { error: "нет ключа GigaChat (заголовок X-GigaChat-Key)", reason: "no_key" });
      // тратится серверный ключ сайта — только по входу и в пределах тарифа (как DeepSeek), с потолком на модель и длину ответа
      if (!userKey) {
        if (!Q.on()) return send(res, 503, { error: "кабинет сайта не подключён — вход и тариф проверить нечем", reason: "no_cloud" });
        const admin = await Q.isAdmin(req.headers["x-user-token"], request, readAll);
        const quota = admin ? { ok: true, admin: true } : await Q.check(req.headers["x-user-token"], request, readAll);
        if (!quota.ok) return send(res, quota.status, { error: quota.message, reason: quota.reason });
        body.model = clampModel(body.model, LIMITS.gigaModels, LIMITS.gigaDefault);
        body.max_tokens = clampOut(body.max_tokens);
        if (!quota.admin) await Q.spend(quota, request, readAll, estTokens(body)).catch(e => console.warn("quota", e.message));
      }
      const token = await gigaToken(key);
      const out = JSON.stringify({ model: body.model || "GigaChat-2-Pro", messages: body.messages, stream: body.stream !== false, ...(body.max_tokens ? { max_tokens: body.max_tokens } : {}), ...(body.temperature != null ? { temperature: body.temperature } : {}) });
      const up = await request(ENV.gigaApi, { headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", Accept: body.stream === false ? "application/json" : "text/event-stream" }, body: out });
      if (up.statusCode === 401) tokens.clear(); // токен истёк — следующий запрос получит новый
      return pipeUpstream(res, up);
    }
    if (route === "/yandex/v1/chat/completions") {
      const userKey = String(req.headers["x-yandex-key"] || "").trim();
      const key = userKey || String(process.env.YANDEX_KEY || "").trim();
      const folder = String(req.headers["x-yandex-folder"] || process.env.YANDEX_FOLDER || "").trim();
      if (!key || !folder) return send(res, 401, { error: "нужны X-Yandex-Key и X-Yandex-Folder", reason: "no_key" });
      // тратится серверный ключ сайта — только по входу и в пределах тарифа, с потолком на модель и длину ответа
      if (!userKey) {
        if (!Q.on()) return send(res, 503, { error: "кабинет сайта не подключён — вход и тариф проверить нечем", reason: "no_cloud" });
        const admin = await Q.isAdmin(req.headers["x-user-token"], request, readAll);
        const quota = admin ? { ok: true, admin: true } : await Q.check(req.headers["x-user-token"], request, readAll);
        if (!quota.ok) return send(res, quota.status, { error: quota.message, reason: quota.reason });
        body.model = clampModel(body.model, LIMITS.yaModels, LIMITS.yaDefault);
        if (body.completionOptions && typeof body.completionOptions === "object") body.completionOptions.maxTokens = clampOut(body.completionOptions.maxTokens);
        if (body.max_tokens != null) body.max_tokens = clampOut(body.max_tokens);
        if (!quota.admin) await Q.spend(quota, request, readAll, estTokens(body)).catch(e => console.warn("quota", e.message));
      }
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
