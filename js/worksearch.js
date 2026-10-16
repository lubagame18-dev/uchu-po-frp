/* ===================================================================
   «Учу по ФРП» — умный поиск заданий для рабочих листов (и конспекта).
   Ищет по строгим рамкам и собирает только качественный материал:
     • где: встроенная база (рабочие тетради, учебник, сборники), ваши
       материалы, а при наличии сети — Викитека (тексты) и Википедия (справка);
     • релевантность: совпадение с темой по основам слов (как при подборе
       результатов ФРП), класс — тот же или соседний;
     • качество: нет мусора распознавания (смешанные латиница/кириллица,
       посторонние символы, номера страниц), есть формулировка задания,
       разумная длина; дубли убираются;
     • задания вставляются дословно, с источником.
   =================================================================== */
const WorkSearch = (() => {
  "use strict";
  const VERB = /(вставьте|расставьте|подчеркните|выпишите|определите|укажите|найдите|спишите|составьте|замените|прочитайте|запишите|объясните|сопоставьте|исправьте|распределите|подберите|перепишите|обозначьте|выделите|раскройте|образуйте|разберите|ответьте|докажите|сравните|дополните|продолжите|озаглавьте|напишите)/i;
  const norm = t => String(t).toLowerCase().replace(/ё/g, "е").replace(/[^а-яa-z0-9]+/g, " ").trim().slice(0, 90);
  /* Оценка качества 0–100 и причины снижения */
  function quality(text, kind) {
    const t = String(text || ""); let q = 100; const why = [];
    const bad = (t.match(/[^А-Яа-яЁё0-9\s.,;:!?—–\-«»()"'…*\/№%+=<>\[\]_]/g) || []).length / Math.max(1, t.length);
    if (bad > 0.01) { q -= Math.round(bad * 1500); why.push("посторонние символы"); }
    const mixed = (t.match(/[A-Za-z][А-Яа-яЁё]|[А-Яа-яЁё][A-Za-z]/g) || []).length;
    if (mixed) { q -= mixed * 6; why.push("ошибки распознавания"); }
    const pageNums = (t.match(/\n\s*\d{1,3}\s*\n/g) || []).length;
    if (pageNums) { q -= pageNums * 4; why.push("номера страниц внутри"); }
    const frag = (t.match(/(?:^|\s)[бгдежзйлмнпртфхцчшщъыьэю](?=\s|$)/gi) || []).length;
    if (frag) { q -= frag * 5; why.push("обрывки слов"); }
    if (/\|/.test(t)) { q -= 10; why.push("следы вёрстки"); }
    const lowStart = (t.match(/\n\s*\n\s*[а-яё]/g) || []).length;
    if (lowStart) { q -= lowStart * 6; why.push("разорванные абзацы"); }
    if (t.length < 60) { q -= 30; why.push("слишком коротко"); }
    if (t.length > 3500) { q -= 15; why.push("очень длинно"); }
    if (kind === "ex" && !VERB.test(t.slice(0, 400))) { q -= 25; why.push("нет формулировки задания"); }
    return { q: Math.max(0, Math.min(100, q)), why };
  }
  /* Хвост с соседней страницы пособия (после номера страницы) отрезаем, если он хуже основного текста */
  function trimTail(text, kind) {
    const m = String(text).match(/\n\s*\d{1,3}\s*\n/); if (!m) return text;
    const head = text.slice(0, m.index).trim(), tail = text.slice(m.index + m[0].length).trim();
    if (!tail) return head;
    return quality(tail, "text").q < 90 && head.length > 60 ? head : text;
  }
  async function search(query, { grade, subject, local = true, mine = true, online = true, min = 60 } = {}) {
    const out = [];
    const st = FRP.stems(query);
    const rel = t => FRP.score(String(t).slice(0, 800), st) * 2 + FRP.score(t, st);
    if (local && subject === "ru" && typeof Base !== "undefined" && Base.loaded()) for (const e of Base.exercises(query, grade, 60)) out.push({ kind: "ex", text: e.text, source: e.source + (e.sec ? ` · ${e.sec}` : ""), from: "встроенная база", r: e.s });
    if (local && subject === "lit" && typeof Base !== "undefined" && Base.loaded()) {
      const LB = Base.lit(query);
      for (const q of (LB.questions || []).slice(0, 40)) out.push({ kind: "q", text: q.text, source: q.source, from: "встроенная база", r: rel(q.text) + 2 });
      for (const l of (LB.lessons || []).slice(0, 4)) for (const t of (l.questions || []).slice(0, 10)) out.push({ kind: "q", text: t, source: "разработка: " + l.title, from: "встроенная база", r: rel(t) + 1 });
    }
    if (mine && typeof Engine !== "undefined") for (const e of Engine.exercisesFrom(state.materials.filter(m => !m.builtin), query, grade, 40)) out.push({ kind: "ex", text: e.text, source: e.source, from: "мои материалы", r: e.s });
    if (local && typeof Engine !== "undefined") for (const e of Engine.exercisesFrom(state.materials.filter(m => m.builtin && (!m.subject || m.subject === subject)), query, grade, 30)) out.push({ kind: "ex", text: e.text, source: e.source, from: "встроенные материалы", r: e.s });
    if (online && navigator.onLine !== false) {
      try {
        if (subject === "lit") { const w = (query.match(/«([^»]+)»/) || [])[1]; const t = await Base.wikisourceText(w ? `${w} ${(Engine.authorOf(query) || "").split(/\s|\./).filter(Boolean).pop() || ""}` : query, 3000); if (t?.text) out.push({ kind: "text", text: t.text, source: `${t.source}: «${t.title}»`, url: t.url, from: "Викитека", r: 6 }); }
        const wk = await Base.wikiSummary(typeof Engine !== "undefined" ? Engine.core(query) : query); if (wk?.text) out.push({ kind: "info", text: wk.text, source: `${wk.source}: «${wk.title}»`, url: wk.url, from: "Википедия", r: 3 });
      } catch { }
    }
    const seen = new Set(), res = [];
    for (const x0 of out) {
      const x = { ...x0, text: trimTail(x0.text, x0.kind) };
      const k = norm(x.text); if (!k || seen.has(k)) continue; seen.add(k);
      const qa = quality(x.text, x.kind);
      if (qa.q < min) continue;
      if (x.r < 2 && x.kind !== "text" && x.kind !== "info") continue;
      res.push({ ...x, quality: qa.q, why: qa.why });
    }
    return res.sort((a, b) => (b.r * 8 + b.quality / 10) - (a.r * 8 + a.quality / 10)).slice(0, 40);
  }
  const BLANK = "[ ________________________________________ ]";
  function insert(item, doc) {
    const L = state.lesson; if (!L) return;
    const kindName = { ex: "Задание", q: "Вопрос", text: "Текст для работы", info: "Справка" }[item.kind] || "Задание";
    const body = item.kind === "text" ? item.text.split("\n").map(l => "> " + l).join("\n") : item.text;
    const block = `### 🔍 ${kindName}\n\n${body}\n\n*Источник: ${item.source}${item.url ? ` ([открыть](${item.url}))` : ""}*\n\n${item.kind === "info" ? "" : BLANK + "\n\n" + BLANK + "\n\n"}`;
    let md = L.docs[doc] || "";
    const ans = md.search(/^-{3}\s*\n+### 🔑|^### 🔑/m);
    md = ans >= 0 ? md.slice(0, ans) + block + md.slice(ans) : md.replace(/\s*$/, "\n\n") + block;
    L.docs[doc] = md; $("#md").value = md; saveLesson(L); renderPreview();
    toast(`Вставлено в ${doc === "worksheet" ? "рабочий лист" : "конспект"} — дословно, с источником.`);
  }
  function open() {
    const L = state.lesson; if (!L) return;
    const P = L.params || {}, doc = state.active === "conspect" ? "conspect" : "worksheet";
    const m = openModal(`<div class="dialog wide"><div class="dlg-h"><h2>Умный поиск заданий</h2><button class="btn ghost x" data-close aria-label="Закрыть">×</button></div><div class="dlg-b">
      <p class="hint">Строгие рамки: только задания по теме и классу, без мусора распознавания и дублей. Источники: встроенная база и ваши материалы${navigator.onLine === false ? " (сейчас нет сети — поиск идёт только по ним)" : ", а также Викитека и Википедия"}. Вставка — дословно, с источником.</p>
      <div class="deck-opts"><input type="text" id="wsQ" value="${esc(cleanTopic(P.topic || L.title))}" style="flex:1 1 300px" aria-label="Что ищем"><label class="sx-tl">Класс <select id="wsG">${[5, 6, 7, 8, 9, 10, 11].map(g => `<option ${g == P.grade ? "selected" : ""}>${g}</option>`).join("")}</select></label>
        <label class="check"><input type="checkbox" id="wsLocal" checked> база</label><label class="check"><input type="checkbox" id="wsMine" checked> мои материалы</label><label class="check"><input type="checkbox" id="wsOnline" ${navigator.onLine === false ? "" : "checked"}> интернет</label>
        <label class="sx-tl">Качество не ниже <select id="wsMin"><option value="80">высокое</option><option value="60" selected>хорошее</option><option value="40">любое приличное</option></select></label>
        <button class="btn sm flame" id="wsGo">Найти</button></div>
      <div id="wsRes" class="ws-res"><p class="small">Ищу…</p></div></div></div>`);
    let res = [];
    const go = async () => {
      const box = m.querySelector("#wsRes"); box.innerHTML = `<p class="small">Ищу…</p>`;
      res = await search(m.querySelector("#wsQ").value.trim(), { grade: +m.querySelector("#wsG").value, subject: P.subject, local: m.querySelector("#wsLocal").checked, mine: m.querySelector("#wsMine").checked, online: m.querySelector("#wsOnline").checked, min: +m.querySelector("#wsMin").value });
      if (!document.body.contains(box)) return;
      box.innerHTML = res.length ? res.map((x, i) => `<article class="ws-item"><div class="ws-meta"><span class="tag">${esc(x.from)}</span><span class="tag ${x.quality >= 80 ? "ok" : ""}">качество ${x.quality}</span><span class="small">${esc(x.source)}</span></div>
        <div class="ws-text">${esc(x.text.slice(0, 700))}${x.text.length > 700 ? `<span class="small"> … (ещё ${x.text.length - 700} зн.; вставится целиком)</span>` : ""}</div>
        <div class="mat-row"><button class="btn sm flame" data-ins="${i}" data-doc="${doc}">Вставить в ${doc === "worksheet" ? "лист" : "конспект"}</button>${doc === "worksheet" ? `<button class="btn sm ghost" data-ins="${i}" data-doc="conspect">В конспект</button>` : `<button class="btn sm ghost" data-ins="${i}" data-doc="worksheet">В рабочий лист</button>`}</div></article>`).join("")
        : `<p>Ничего достаточно качественного не нашлось. Уточните запрос, снизьте порог качества или загрузите свои материалы.</p>`;
      box.querySelectorAll("[data-ins]").forEach(b => b.onclick = () => { insert(res[+b.dataset.ins], b.dataset.doc); b.textContent = "✓ вставлено"; b.disabled = true; });
    };
    m.querySelector("#wsGo").onclick = go; m.querySelector("#wsQ").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); go(); } });
    go();
  }
  // кнопка над листом (рабочий лист и конспект)
  const btn = document.createElement("button"); btn.className = "btn sm ghost"; btn.id = "btnFind"; btn.type = "button"; btn.textContent = "🔍 Найти задания"; btn.hidden = true; btn.onclick = open;
  function syncBtn() { const tools = document.getElementById("wsTools"); if (tools && !tools.contains(btn)) tools.prepend(btn); btn.hidden = !(state.lesson && ["worksheet", "conspect"].includes(state.active)); }
  document.addEventListener("DOMContentLoaded", syncBtn);
  return { search, quality, open, insert, syncBtn };
})();
window.WorkSearch = WorkSearch;
