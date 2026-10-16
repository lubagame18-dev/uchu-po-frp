/* ===================================================================
   «Учу по ФРП» — сверка фактов после сборки урока.
   Что проверяется: цитаты, даты (годы), имена, названия произведений,
   наличие результатов ФРП. Порядок: 1) текст произведения урока;
   2) встроенная база (учебник, разработки, материалы); 3) внешние
   авторитетные источники — Википедия и Викитека.
   Подтверждённое остаётся как есть; неподтверждённое помечается
   «⟦проверить⟧» прямо в тексте и попадает в отчёт сверки. Ничего не
   выдаётся за истину без источника. Источники видны в отчёте.
   Инфоурок и подобные сайты не дают читать себя со сторонних страниц
   (нет открытого API), поэтому для них сайт даёт ссылки на поиск.
   =================================================================== */
const Verify = (() => {
  "use strict";
  const MARK = " ⟦проверить⟧";
  const norm = s => String(s || "").toLowerCase().replace(/ё/g, "е").replace(/[^а-яa-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const WIKI = "https://ru.wikipedia.org/w/api.php", WS = "https://ru.wikisource.org/w/api.php";
  async function getJson(url, ms = 9000) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
    try { const r = await fetch(url, { signal: ctl.signal }); return r.ok ? await r.json() : null; } catch { return null; } finally { clearTimeout(t); }
  }
  const cache = new Map();
  /* Полный текст статьи Википедии (о писателе) — для сверки дат и имён */
  async function wikiArticle(query) {
    if (!query) return null;
    if (cache.has("w:" + query)) return cache.get("w:" + query);
    const s = await getJson(`${WIKI}?action=query&format=json&origin=*&list=search&srlimit=1&srsearch=${encodeURIComponent(query)}`);
    const title = s?.query?.search?.[0]?.title;
    let out = null;
    if (title) {
      const j = await getJson(`${WIKI}?action=query&format=json&origin=*&prop=extracts&explaintext=1&exlimit=1&titles=${encodeURIComponent(title)}`);
      const page = Object.values(j?.query?.pages || {})[0];
      if (page?.extract) out = { title, text: page.extract, url: `https://ru.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}` };
    }
    cache.set("w:" + query, out); return out;
  }
  /* Цитата есть в Викитеке? Поиск точной фразы */
  async function wikisourceHas(quote) {
    const k = "s:" + quote; if (cache.has(k)) return cache.get(k);
    const j = await getJson(`${WS}?action=query&format=json&origin=*&list=search&srlimit=1&srsearch=${encodeURIComponent('"' + quote + '"')}`);
    const hit = j?.query?.search?.[0];
    const out = hit ? { title: hit.title, url: `https://ru.wikisource.org/wiki/${encodeURIComponent(hit.title.replace(/ /g, "_"))}` } : null;
    cache.set(k, out); return out;
  }
  /* Встроенная база одним большим нормализованным текстом (строится один раз) */
  let baseText = null;
  function baseCorpus() {
    if (baseText) return baseText;
    const B = window.UCHU_BASE || {}, parts = [];
    (B.lit?.chunks || []).forEach(c => parts.push(c.t));
    (B.lessons || []).forEach(l => parts.push(l.t));
    (typeof state !== "undefined" ? state.materials : []).forEach(m => { if (m.text && m.kind !== "frp") parts.push(m.text); });
    baseText = norm(parts.join(" \n "));
    return baseText;
  }

  /* ---------- извлечение утверждений ---------- */
  // не проверяем служебные части: результаты ФРП, блок «Из открытых источников» (это и есть источник), ссылки, комментарии
  function checkable(md) {
    return md.replace(/## Планируемые результаты[\s\S]*?(?=\n## |\n---)/, "").replace(/## Из открытых источников[\s\S]*?(?=\n## |$)/, "").replace(/## Источники[\s\S]*$/, "").replace(/<!--[\s\S]*?-->/g, "").replace(/\]\([^)]*\)/g, "]");
  }
  function claims(md) {
    const t = checkable(md), out = [];
    for (const m of t.matchAll(/«([^«»\n]{18,220})»/g)) { const q = m[1].trim(); if (q.split(" ").length >= 4) out.push({ type: "цитата", text: q }); }
    for (const m of t.matchAll(/(^|[^\d])(1[0-9]{3}|20[0-2][0-9])(?=\s*(г\.|год|–|—|-|\)|,|\.|\s))/g)) {
      const at = m.index, ctx = t.slice(Math.max(0, at - 90), at + 40).replace(/\s+/g, " ");
      out.push({ type: "дата", text: m[2], ctx });
    }
    for (const m of t.matchAll(/(?:^|[\s(«—])((?:[А-ЯЁ]\.\s?){1,2}[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?)/g)) out.push({ type: "имя", text: m[1].replace(/\s+/g, " ") });
    // уникальные
    const seen = new Set(); return out.filter(c => { const k = c.type + "|" + c.text; if (seen.has(k)) return false; seen.add(k); return true; });
  }

  /* ---------- проверка ---------- */
  async function check(c, ctx) {
    const n = norm(c.text);
    if (c.type === "цитата") {
      if (ctx.workText && ctx.workText.includes(n)) return { ok: true, src: ctx.workSrc || "текст произведения урока" };
      if (n.length > 20 && baseCorpus().includes(n)) return { ok: true, src: "встроенная база" };
      // вопросы и задания в кавычках — не цитаты (их пишет методист)
      if (/[?]$/.test(c.text) || /^(найдите|объясните|составьте|ответьте|прочитайте|закончите|если бы|что|как|почему|какой)/i.test(c.text)) return { ok: true, src: "формулировка задания", skip: true };
      const w = await wikisourceHas(c.text.split(/\s+/).slice(0, 8).join(" "));
      if (w) return { ok: true, src: `Викитека: «${w.title}»`, url: w.url };
      return { ok: false };
    }
    if (c.type === "имя") {
      const sur = norm(c.text.split(/\s|\./).filter(Boolean).pop());
      if (sur.length < 3) return { ok: true, skip: true };
      if (ctx.workText?.includes(sur) || baseCorpus().includes(sur)) return { ok: true, src: "встроенная база" };
      if (ctx.article && norm(ctx.article.text).includes(sur)) return { ok: true, src: `Википедия: «${ctx.article.title}»`, url: ctx.article.url };
      const a = await wikiArticle(c.text);
      if (a && norm(a.title).includes(sur)) return { ok: true, src: `Википедия: «${a.title}»`, url: a.url };
      return { ok: false };
    }
    if (c.type === "дата") {
      if (ctx.article && ctx.article.text.includes(c.text)) return { ok: true, src: `Википедия: «${ctx.article.title}»`, url: ctx.article.url };
      // дата рядом с именем писателя в базе
      const near = norm(c.ctx); const sur = (near.match(/[а-я]{4,}/g) || []).slice(-3);
      const base = baseCorpus(); let i = base.indexOf(c.text);
      while (i >= 0) { const win = base.slice(Math.max(0, i - 300), i + 300); if (sur.some(w => win.includes(w))) return { ok: true, src: "встроенная база" }; i = base.indexOf(c.text, i + 4); if (i > 0 && i > 5e6) break; }
      return { ok: false };
    }
    return { ok: true, skip: true };
  }

  /* Сверка всех листов урока; пометки ⟦проверить⟧ ставятся только в тексте, написанном нейросетью
     (в листах без ИИ всё взято из источников, их сверка — для отчёта) */
  async function run(L, p) {
    const author = typeof Engine !== "undefined" ? Engine.authorOf(p.topic) : null;
    const ctx = {
      workText: p.plan?.analysis ? norm(p.notes?.text || "") + " " + norm(L.web?.text?.text || "") : norm(p.notes?.text || ""),
      workSrc: p.plan?.textSource,
      article: p.subject === "lit" && author ? await wikiArticle(author).catch(() => null) : null
    };
    // текст произведения, по которому строились вопросы (Викитека или база)
    if (p.plan?.analysis && typeof Variety !== "undefined") {
      const src = await (async () => { try { const w = await Base.wikisourceText(`${(p.topic.match(/«([^»]+)»/) || [])[1] || ""} ${author ? author.split(/\s|\./).filter(Boolean).pop() : ""}`.trim(), 20000); return w?.text || ""; } catch { return ""; } })();
      ctx.workText += " " + norm(src);
    }
    const report = { at: new Date().toISOString(), checked: 0, ok: 0, flagged: [], sources: [], frp: null, mode: L.built };
    const srcSet = new Map();
    for (const d of Object.keys(L.docs)) {
      const md = L.docs[d]; if (!md) continue;
      const cs = claims(md).slice(0, 40);
      const bad = [];
      for (const c of cs) {
        const r = await check(c, ctx);
        if (r.skip) continue;
        report.checked++;
        if (r.ok) { report.ok++; if (r.src) srcSet.set(r.src, r.url || ""); }
        else { bad.push(c); report.flagged.push({ doc: d, type: c.type, text: c.text }); }
      }
      if (L.built === "ai" && bad.length) L.docs[d] = markUnverified(md, bad);
    }
    // соответствие ФРП: результаты подставляет система дословно
    const frp = typeof FRP !== "undefined" ? FRP.results(p.subject, p.grade, p.topic, p.type?.id) : null;
    report.frp = frp?.loaded ? `результаты взяты из ФРП дословно (${frp.source})` : "текст ФРП не встроен в сайт — раздел результатов помечен, сверка с ФРП невозможна";
    report.sources = [...srcSet].map(([title, url]) => ({ title, url }));
    L.verify = report;
    return report;
  }
  function markUnverified(md, bad) {
    let out = md;
    for (const c of bad) {
      if (c.type === "цитата") out = out.replace(`«${c.text}»`, `«${c.text}»${MARK}`);
      else if (c.type === "дата") out = out.replace(new RegExp(`(^|[^\\d])(${c.text})(?![\\d⟦])`), `$1$2${MARK}`);
      else if (c.type === "имя") out = out.replace(c.text, c.text + MARK);
    }
    return out;
  }
  /* Краткая строка для учителя и подробный отчёт для разработчика */
  function line(v) {
    if (!v) return "";
    const n = v.flagged.length;
    return `Сверка фактов: проверено ${v.checked}, подтверждено ${v.ok}${n ? `, требует проверки ${n} (помечено «⟦проверить⟧»)` : ""}. ${v.frp}.`;
  }
  function reportHtml(v) {
    if (!v) return "<p class='small'>Сверка ещё не проводилась.</p>";
    return `<p>${esc(line(v))}</p>${v.flagged.length ? `<h4>Требует проверки</h4><ul>${v.flagged.map(f => `<li><b>${esc(f.type)}</b> (${esc(f.doc)}): ${esc(f.text)}</li>`).join("")}</ul>` : ""}${v.sources.length ? `<h4>Источники сверки</h4><ul>${v.sources.map(s => `<li>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>` : esc(s.title)}</li>`).join("")}</ul>` : ""}`;
  }
  return { run, claims, check, line, reportHtml, wikiArticle };
})();
window.Verify = Verify;
