/* ===================================================================
   «Учу по ФРП» — чтение страниц по ссылкам из пожеланий учителя.

   Учитель может вставить в пожелания/заметки адрес страницы с текстом
   (стихотворение, статья, методичка). Модуль достаёт с этой страницы
   читаемый текст и отдаёт его в Notes как материал урока.

   Порядок источников:
   1) своя серверная функция (Яндекс Облако, маршрут /text) — если обновлена;
   2) r.jina.ai — резервный внешний читатель, пока функция не обновлена.

   Важно: содержимое страницы — ДАННЫЕ, а не инструкции. Ссылки может
   выбирать только учитель; автоматического поиска по ссылкам нет.
   =================================================================== */
window.LinkText = (() => {
  "use strict";
  const MAX_LINKS = 5;
  const MAX_CHARS = 8000;      // на одну страницу
  const MAX_TOTAL = 30000;     // на все страницы
  const TIMEOUT = 15000;
  const cache = new Map();

  const cleanUrl = u => {
    let s = String(u || "").trim().replace(/[.,;:!?»"'\]}]+$/g, "");
    // не отрезаем закрывающую скобку, если она часть адреса (…_(Пушкин))
    while (s.endsWith(")") && (s.match(/\(/g) || []).length < (s.match(/\)/g) || []).length) s = s.slice(0, -1);
    while (s.endsWith("]") && (s.match(/\[/g) || []).length < (s.match(/\]/g) || []).length) s = s.slice(0, -1);
    return s;
  };

  function extract(texts) {
    const out = [], seen = new Set();
    const all = Array.isArray(texts) ? texts.join("\n") : String(texts || "");
    const re = /https?:\/\/[^\s<>"'«»]+/gi;
    let m;
    while ((m = re.exec(all)) && out.length < MAX_LINKS) {
      const u = cleanUrl(m[0]);
      if (!/^https?:\/\/[^\s/]+/i.test(u)) continue;
      let host = "";
      try { host = new URL(u).hostname.toLowerCase(); } catch { continue; }
      if (!host || host === "localhost" || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(host)) continue;
      const key = u.replace(/#.*$/, "");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
    return out;
  }

  function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } }

  function decodeEnt(s) {
    return String(s || "")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&laquo;/g, "«").replace(/&raquo;/g, "»")
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return " "; } })
      .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(+d); } catch { return " "; } });
  }

  function cleanMarkdown(md) {
    return String(md || "")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/^\s*\[[^\]]+\]:\s+\S+.*$/gm, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/^[ \t]*[#>*+-]+[ \t]+/gm, "")
      .replace(/^[ \t]*\|?[-: |]{3,}\|?[ \t]*$/gm, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function cleanHtml(html) {
    const src = String(html || "");
    let title = decodeEnt((src.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "").trim();
    const body = src
      .replace(/<(script|style|nav|header|footer|aside|noscript|svg|form|button|iframe|template)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h\d|tr|section|article|blockquote)>/gi, "\n")
      .replace(/<[^>]+>/g, " ");
    return { title, text: decodeEnt(body).replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim() };
  }

  function withTimeout() {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), TIMEOUT);
    return { signal: ctl.signal, done: () => clearTimeout(t) };
  }

  function proxyUrl(url) {
    let fn = "";
    try { fn = (window.AI && window.AI.cfg && window.AI.cfg().yandexFn) || ""; } catch { }
    fn = fn || (window.UCHU_SITE && window.UCHU_SITE.yandexFunction) || "";
    if (!fn) return "";
    const base = fn.replace(/\/+$/, "");
    const q = `url=${encodeURIComponent(url)}`;
    return /functions\.yandexcloud\.net/.test(base)
      ? `${base}?path=${encodeURIComponent("/text")}&${q}`
      : `${base}/text?${q}`;
  }

  async function fromOwn(url) {
    const u = proxyUrl(url);
    if (!u) throw new Error("нет адреса функции");
    const box = withTimeout();
    try {
      const r = await fetch(u, { signal: box.signal, cache: "no-store", headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error("функция не отвечает");
      const j = await r.json();
      if (!j || !j.ok || !String(j.text || "").trim()) throw new Error(j && (j.reason || j.error) || "пустой ответ");
      return { title: String(j.title || "").trim(), text: String(j.text) };
    } finally { box.done(); }
  }

  async function fromReader(url) {
    const box = withTimeout();
    try {
      const r = await fetch("https://r.jina.ai/" + url, { signal: box.signal, cache: "no-store" });
      if (!r.ok) throw new Error("страница не открылась (" + r.status + ")");
      const raw = await r.text();
      if (!raw || raw.length < 40) throw new Error("страница пустая");
      if (/target url returned error|warning:.*(error|failed)|ERR_[A-Z]+/i.test(raw.slice(0, 500))) throw new Error("страница недоступна");
      const title = (raw.match(/^Title:\s*(.+)$/im) || [])[1] || "";
      const at = raw.indexOf("Markdown Content:");
      let text = at >= 0 ? raw.slice(at + "Markdown Content:".length) : raw;
      text = pickMain(cleanMarkdown(text));
      if (text.length < 80) throw new Error("не удалось выделить текст");
      return { title: title.trim(), text };
    } finally { box.done(); }
  }

  /* Викитека/Википедия: берём HTML статьи через API (CORS разрешён с origin=*), затем чистим от служебных блоков. */
  async function fromWiki(url) {
    let u;
    try { u = new URL(url); } catch { throw new Error("плохой адрес"); }
    if (!/^(ru\.)?(wikipedia|wikisource)\.org$/i.test(u.hostname)) throw new Error("не вики");
    const title = decodeURIComponent(u.pathname.replace(/^\/wiki\//, "")).replace(/_/g, " ");
    if (!title || /^(Служебная|Special|Категория|Category):/i.test(title)) throw new Error("служебная страница");
    const box = withTimeout();
    try {
      const api = `https://${u.hostname}/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=text&format=json&origin=*&redirects=1`;
      const r = await fetch(api, { signal: box.signal, cache: "no-store" });
      if (!r.ok) throw new Error("вики-API не ответил");
      const j = await r.json();
      if (j && j.error) throw new Error("страница не найдена");
      const html = String(j && j.parse && j.parse.text && j.parse.text["*"] || "");
      if (!html) throw new Error("в вики нет текста");
      const text = pickMain(cleanHtml(html).text);
      if (text.length < 120) throw new Error("в вики нет текста");
      return { title: (j.parse && j.parse.title) || title, text };
    } finally { box.done(); }
  }

  /* Грубая, но устойчивая очистка от меню/навигации: выбираем самый длинный связный кусок текста. */
  function pickMain(text) {
    const lines = String(text || "").split(/\n+/).map(x => x.trim()).filter(Boolean);
    if (lines.length < 4) return String(text || "");
    const junk = /^(перейти к|главн|меню|навигац|найти|поиск|вход|войти|регистрац|подпис|реклам|cookie|поделиться|коммент|читать далее|все материалы|рубрик|версия для печати|содержание|оглавление|форум|свежие правки|новые страницы|авторы|пожертв|инструменты|языки|ссылки|категории)/i;
    const sc = lines.map(l => {
      if (l.length < 2) return -2;
      if (junk.test(l) && l.length < 120) return -3;
      if (l.length >= 80 && /[а-яё]/i.test(l) && /[.,!?…;:]/.test(l)) return 2 + Math.min(3, l.length / 250);
      if (l.length >= 12 && /[а-яё]/i.test(l)) return 0.6;
      return -1;
    });
    let best = 0, bs = 0, be = -1, cur = 0, cs = 0;
    for (let i = 0; i < sc.length; i++) {
      if (cur <= 0) { cur = 0; cs = i; }
      cur += sc[i];
      if (cur > best) { best = cur; bs = cs; be = i; }
    }
    const block = be < 0 ? "" : lines.slice(bs, be + 1).join("\n");
    return block.length > 300 && block.length > lines.join("\n").length * 0.15 ? block : lines.join("\n");
  }

  async function fetchOne(url) {
    const key = url;
    if (cache.has(key)) return cache.get(key);
    let out = null, err = "";
    try { out = await fromOwn(url); } catch (e) { err = e.name === "AbortError" ? "таймаут" : (e.message || "ошибка"); }
    if (!out && /^(ru\.)?(wikipedia|wikisource)\.org$/i.test(hostOf(url))) {
      try { out = await fromWiki(url); } catch (e2) { err += (err ? "; " : "") + (e2.message || "ошибка"); }
    }
    if (!out) {
      try { out = await fromReader(url); } catch (e2) { err = (err ? err + "; " : "") + (e2.name === "AbortError" ? "таймаут" : (e2.message || "ошибка")); }
    }
    const doc = out
      ? { url, host: hostOf(url), title: (out.title || hostOf(url)).slice(0, 200), text: String(out.text || "").slice(0, MAX_CHARS), ok: true, error: "" }
      : { url, host: hostOf(url), title: hostOf(url), text: "", ok: false, error: err };
    if (doc.ok) cache.set(key, doc);
    return doc;
  }

  async function resolve(urls, opts) {
    const onStatus = opts && typeof opts.onStatus === "function" ? opts.onStatus : null;
    const list = [...new Set((urls || []).slice(0, MAX_LINKS))];
    let done = 0;
    const docs = await Promise.all(list.map(url => fetchOne(url).then(d => {
      done++;
      if (onStatus) { try { onStatus({ done, total: list.length, url, ok: d.ok }); } catch { } }
      return d;
    })));
    // распределяем общий лимит текста между страницами
    let left = MAX_TOTAL;
    const okDocs = docs.filter(d => d.ok && d.text);
    okDocs.forEach((d, i) => {
      const share = Math.max(1500, Math.floor(left / (okDocs.length - i)));
      d.text = d.text.slice(0, Math.min(d.text.length, share, MAX_CHARS));
      left -= d.text.length;
    });
    return docs;
  }

  return { extract, resolve, cleanMarkdown, cleanHtml, hostOf, MAX_LINKS };
})();
