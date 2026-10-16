/* ===================================================================
   «Учу по ФРП» — режим разработчика: покрытие тем ФРП материалами.
   Русский язык и литература — отдельно; по каждому классу — все темы ФРП
   (поурочное / тематическое планирование) и чем каждая тема обеспечена:
     • русский: упражнения (база и загруженные материалы), правила, разработки;
     • литература: методическая опора, текст произведения, вопросы учебника, разработки.
   Внизу — свёрнутые «Рекомендации»: каких материалов не хватает, ссылки,
   где их найти и скачать, и кнопка загрузки, чтобы система на них обучилась.
   =================================================================== */
const DevCover = (() => {
  "use strict";
  const low = s => String(s || "").toLowerCase().replace(/ё/g, "е");
  const SERVICE = /контрольн|диктант|резерв|итогов|промежуточн|проверочн|административн|диагностическ|зачёт|зачет|обобщени.*повторени|^повторение\.?$/i;
  const UI = { subj: "ru", grade: null };

  /* ---------- упражнения из загруженных материалов: делим один раз ---------- */
  const VERB = /(вставьте|расставьте|подчеркните|выпишите|определите|укажите|найдите|спишите|составьте|замените|прочитайте|запишите|объясните|распределите|подберите|перепишите|обозначьте|выделите|раскройте|образуйте|разберите|сравните|дополните|напишите|в каком)/i;
  let matCache = null, matSig = "";
  function matExercises() {
    const mats = (window.state?.materials || []).filter(m => m.text && (m.subject || "ru") === "ru" && !m.fromNotes);
    const sig = mats.map(m => m.id).join("|");
    if (matCache && sig === matSig) return matCache;
    matSig = sig; matCache = [];
    for (const m of mats) {
      const parts = String(m.text).split(/\n(?=\s*(?:Упражнение\s*)?\d{1,3}\.\s+[А-ЯЁ])/);
      for (const p of parts) { const t = p.trim(); if (t.length > 60 && t.length < 3000 && VERB.test(t.slice(0, 400))) matCache.push({ head: t.slice(0, 400), grade: m.grade || null, own: !m.builtin }); }
    }
    return matCache;
  }

  /* Индекс упражнений встроенной базы: основы слов раздела и начала упражнения считаются один раз */
  let baseIdx = null;
  function baseIndex() {
    if (baseIdx) return baseIdx;
    const B = window.UCHU_BASE; if (!B) return [];
    baseIdx = B.ru.filter(it => it.k === "ex").map(it => ({ sec: FRP.stems(it.sec || ""), head: FRP.stems(it.t.slice(0, 400)), grade: B.sources[it.s]?.grade || null, junk: it.j > 0.45 }));
    return baseIdx;
  }
  const inter = (a, b) => { let n = 0; for (const x of a) if (b.has(x)) n++; return n; };
  /* ---------- оценка одной темы ---------- */
  function ruTopic(t, grade) {
    const st = FRP.stems(t.title.replace(/повторение|изученного|в\s+\d.*классах/gi, "")); const need = Math.min(2, st.size);
    const base = st.size ? baseIndex().filter(e => !e.junk && (!e.grade || Math.abs(e.grade - grade) <= 1)).filter(e => { const sc = inter(st, e.sec); return sc >= need || sc + inter(st, e.head) >= need; }) : [];
    const mats = st.size ? matExercises().filter(e => (!e.grade || Math.abs(e.grade - grade) <= 1) && inter(st, e.st || (e.st = FRP.stems(e.head))) >= need).length : 0;
    const rules = typeof Base !== "undefined" && Base.loaded() ? Base.rules(t.title, grade, 3).length : 0;
    const les = typeof Learn !== "undefined" ? Learn.lessonsFor(t.title, grade, 3, "ru").length : 0;
    const ex = base.length + mats;
    const service = SERVICE.test(t.title);
    // встроенный профиль урока (тексты-документы, словарные наборы, алгоритмы) — частичная опора даже без упражнений
    const prof = typeof RuKit !== "undefined" ? (() => { const K = RuKit.build({ topic: t.title, grade }); return K.kind !== "general" && (K.handouts?.length || K.algo || K.theory?.length) ? K.label.split(":")[0] : ""; })() : "";
    const status = service ? "service" : ex >= 5 ? "ok" : ex >= 1 || rules >= 1 || les || prof ? "part" : "none";
    const lacks = service ? [] : [ex < 5 && (ex ? `упражнения (есть ${ex}, нужно хотя бы 5)` : "упражнения"), !rules && ex < 5 && "правило (теория)", !les && ex < 5 && "разработка урока"].filter(Boolean);
    return { ex, rules, les, status, lacks, cells: [["упр.", ex], ["правил", rules], ["разраб.", les], ["профиль", prof ? "✓" : "—"]] };
  }
  function worksOf(title) { return [...String(title).matchAll(/«([^»]+)»/g)].map(m => m[1]); }
  function litTopic(t, grade) {
    const works = worksOf(t.title);
    const LB = typeof Base !== "undefined" && Base.loaded() ? Base.lit(t.title) : { questions: [], lessons: [], part: null };
    const qs = (LB.questions || []).filter(q => { const g = +(String(q.source).match(/(\d{1,2})\s*кл/) || [])[1]; return !g || Math.abs(g - grade) <= 1; }).length;
    const les = (typeof Learn !== "undefined" ? Learn.lessonsFor(t.title, grade, 3, "lit").length : 0) + (LB.lessons || []).length;
    const method = typeof LitKit !== "undefined" && LitKit.workOf ? !!LitKit.workOf(t.title) : false;
    const mats = (window.state?.materials || []).filter(m => (m.subject || "") === "lit" && m.text);
    const text = works.some(w => { const k = low(w).slice(0, 18); return mats.some(m => low(m.text).includes(k)); }) || (LB.lessons || []).length > 0;
    const service = SERVICE.test(t.title) || /^(введение|итоговый урок)/i.test(t.title);
    const status = service ? "service" : (text || method) && (qs >= 3 || les) ? "ok" : text || method || qs || les ? "part" : "none";
    const lacks = service ? [] : [!text && works.length && "текст произведения", qs < 3 && "вопросы и задания (рабочая тетрадь / учебник)", !les && "разработка урока", !method && "методическая опора (проблемный вопрос, ключевые эпизоды)"].filter(Boolean);
    return { works, qs, les, text, method, status, lacks, cells: [["текст", text ? "✓" : "—"], ["вопр.", qs], ["разраб.", les], ["методика", method ? "✓" : "—"]] };
  }

  /* ---------- ссылки «где найти» ---------- */
  const ya = q => `https://yandex.ru/search/?text=${encodeURIComponent(q)}`;
  const SERIES = {
    ru: [
      ["Е. А. Ефремова. Русский язык. Рабочая тетрадь", "к учебнику Т. А. Ладыженской"],
      ["Л. А. Тростенцова, А. И. Запорожец. Русский язык. Рабочая тетрадь", "к учебнику Т. А. Ладыженской"],
      ["Л. Г. Ларионова. Русский язык. Карточки-задания", "дифференцированные задания по темам"],
      ["Г. А. Богданова. Русский язык. Тестовые задания", "контроль по темам"],
      ["Поурочные разработки по русскому языку", "образцы конспектов уроков"]
    ],
    lit: [
      ["И. Н. Сухих. Литература. Рабочая тетрадь", "вопросы и задания к произведениям"],
      ["Р. Г. Ахмадуллина. Литература. Рабочая тетрадь", "к учебнику В. Я. Коровиной"],
      ["М. А. Аристова. Литература. Рабочая тетрадь", "к учебнику В. Я. Коровиной"],
      ["Н. В. Беляева. Уроки литературы. Поурочные разработки", "образцы конспектов уроков"],
      ["И. Н. Сухих. Литература. Книга для учителя", "методические рекомендации"]
    ]
  };
  function topicLinks(subj, t, grade, r) {
    const core = t.title.replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim().slice(0, 90);
    if (subj === "ru") return [
      [`упражнения`, ya(`${core} ${grade} класс упражнения рабочая тетрадь pdf`)],
      [`карточки`, ya(`${core} ${grade} класс карточки задания`)],
      [`конспект урока`, ya(`${core} ${grade} класс конспект урока технологическая карта ФГОС`)],
      [`РЭШ`, ya(`site:resh.edu.ru ${core} ${grade} класс`)]
    ];
    const out = [];
    for (const w of r.works.slice(0, 2)) {
      out.push([`текст «${w.length > 28 ? w.slice(0, 26) + "…" : w}»`, `https://ru.wikisource.org/w/index.php?search=${encodeURIComponent(w)}`]);
      out.push([`урок по «${w.length > 20 ? w.slice(0, 18) + "…" : w}»`, ya(`«${w}» урок литературы ${grade} класс конспект`)]);
    }
    if (!r.works.length) out.push([`урок`, ya(`${core} урок литературы ${grade} класс конспект`)]);
    out.push([`вопросы и задания`, ya(`${core} ${grade} класс литература рабочая тетрадь вопросы`)]);
    return out;
  }

  /* ---------- отрисовка ---------- */
  function grades(subj) { const s = new Set(); for (const d of FRP.list(subj)) for (const g of Object.keys(d.topics || {})) s.add(+g); return [...s].sort((a, b) => a - b); }
  const DOT = { ok: ["●", "есть", "ok"], part: ["◐", "мало", "warn"], none: ["○", "нет", "bad"], service: ["·", "контроль/повторение", "muted"] };
  function render(b, subj) {
    UI.subj = subj || UI.subj;
    const gs = grades(UI.subj);
    if (!gs.length) { b.innerHTML = `<section class="dev-card"><h2>Темы ФРП</h2><p>Программа по этому предмету не встроена.</p></section>`; return; }
    if (!gs.includes(UI.grade)) UI.grade = gs[0];
    b.innerHTML = `<section class="dev-card cov"><h2>Темы ФРП — ${UI.subj === "ru" ? "русский язык" : "литература"}</h2>
      <p class="hint">Все темы программы по классам и чем каждая обеспечена в базе сайта. ● — материалов достаточно, ◐ — мало, ○ — нет. Щёлкните по теме — увидите, чего не хватает и где это найти.</p>
      <nav class="dev-tabs" aria-label="Классы">${gs.map(g => `<button class="chip" data-g="${g}" aria-pressed="${g === UI.grade}">${g} класс</button>`).join("")}</nav>
      <div id="covBody"><p class="small">Считаю…</p></div></section>`;
    b.querySelectorAll("[data-g]").forEach(x => x.onclick = () => { UI.grade = +x.dataset.g; render(b, UI.subj); });
    setTimeout(() => paint(b.querySelector("#covBody"), UI.subj, UI.grade), 30);
  }
  function paint(box, subj, grade) {
    if (!box) return;
    const topics = FRP.topicsFor(subj, grade) || [];
    const rows = topics.map(t => ({ t, r: subj === "ru" ? ruTopic(t, grade) : litTopic(t, grade) }));
    const cnt = k => rows.filter(x => x.r.status === k).length;
    const real = rows.filter(x => x.r.status !== "service").length || 1;
    const pct = Math.round(cnt("ok") / real * 100);
    const sections = []; for (const x of rows) { const s = x.t.section || "Без раздела"; let g = sections.find(y => y.s === s); if (!g) sections.push(g = { s, items: [] }); g.items.push(x); }
    const miss = rows.filter(x => x.r.status === "none" || x.r.status === "part");
    const loaded = [...(window.state?.materials || []).filter(m => (m.subject || "ru") === subj && m.grade == grade && /workbook|textbook|lesson|method/.test((m.kind || "") + " " + (m.type || ""))).map(m => m.title || m.name),
      ...(typeof Base !== "undefined" && Base.summary ? (Base.summary() || []).filter(x => (x.subject || "ru") === subj && x.grade == grade).map(x => x.title || x.short) : [])].filter((x, i, a) => x && a.indexOf(x) === i);
    box.innerHTML = `<div class="cov-sum"><div class="cov-bar" role="img" aria-label="Обеспечено ${pct}% тем"><span class="ok" style="width:${cnt("ok") / real * 100}%"></span><span class="warn" style="width:${cnt("part") / real * 100}%"></span></div>
        <p><b>${grade} класс:</b> тем ${rows.length}; обеспечено ${cnt("ok")}, мало материалов ${cnt("part")}, нет ничего ${cnt("none")}${cnt("service") ? `, контроль и повторение ${cnt("service")}` : ""}.</p></div>
      ${sections.map(sec => `<details class="cov-sec" ${sec.items.some(x => x.r.status === "none") ? "open" : ""}><summary><b>${esc(sec.s)}</b> <span class="small">${sec.items.filter(x => x.r.status === "ok").length}/${sec.items.filter(x => x.r.status !== "service").length} обеспечено</span></summary>
        <ul class="cov-list">${sec.items.map(({ t, r }) => `<li class="cov-${DOT[r.status][2]}"><details><summary><span class="cov-dot" title="${DOT[r.status][1]}">${DOT[r.status][0]}</span> <span class="cov-n">${esc(t.num || t.n)}</span> ${esc(t.title)}${t.hours ? ` <span class="small">(${t.hours} ч)</span>` : ""}<span class="cov-cells">${r.cells.map(([k, v]) => `<span class="tag">${k}: ${v}</span>`).join("")}</span></summary>
          <div class="cov-more">${r.lacks.length ? `<p><b>Не хватает:</b> ${r.lacks.join(", ")}.</p><p class="small">Где найти: ${topicLinks(subj, t, grade, r).map(([n, u]) => `<a href="${u}" target="_blank" rel="noopener">${esc(n)}</a>`).join(" · ")}</p>` : `<p class="small">${r.status === "service" ? "Урок контроля или повторения: собирается из материалов изученных тем." : "Материалов достаточно."}</p>`}
          <button class="btn sm ghost" data-try="${esc(t.title)}">Собрать урок по теме</button></div></details></li>`).join("")}</ul></details>`).join("")}
      <details class="cov-rec"><summary><b>Рекомендации: что загрузить${miss.length ? ` (${miss.length} тем)` : ""}</b></summary>
        <div class="cov-recb">
          <p>Сайт не может сам скачивать файлы с чужих сайтов. Откройте ссылки, скачайте подходящие файлы (PDF с текстом или Word) и загрузите их кнопкой ниже — система очистит их, разложит по классу и темам и обучится на них.</p>
          <h3>Пособия для ${grade} класса</h3>
          ${loaded.length ? `<p class="small">Уже загружено для ${grade} класса: ${loaded.slice(0, 6).map(m => esc(String(m).slice(0, 90))).join("; ")}${loaded.length > 6 ? "…" : ""}</p>` : `<p class="small">Для ${grade} класса пособий в базе пока нет.</p>`}
          ${(() => { const sc = (window.state?.materials || []).filter(m => (m.subject || "ru") === subj && m.grade == grade && !(m.text || "").trim()); return sc.length ? `<p class="small"><b>Есть, но не прочитаны</b> (сканы без текста — система их не видит): ${sc.map(m => esc(String(m.title || m.name).slice(0, 70))).join("; ")}. Распознайте их (OCR в разделе «Материалы») или загрузите PDF с текстовым слоем.</p>` : ""; })()}
          <p class="small">Что можно добавить:</p><ul>${SERIES[subj].map(([n, d]) => `<li><a href="${ya(`${n} ${grade} класс pdf`)}" target="_blank" rel="noopener">${esc(n)}, ${grade} класс</a> <span class="small">— ${esc(d)}</span></li>`).join("")}</ul>
          ${miss.length ? `<h3>Темы без материалов</h3><ul class="cov-miss">${miss.filter(x => x.r.status === "none").concat(miss.filter(x => x.r.status === "part")).slice(0, 60).map(({ t, r }) => `<li><b>${esc(t.title.slice(0, 110))}</b> — нужно: ${r.lacks.join(", ")}. ${topicLinks(subj, t, grade, r).map(([n, u]) => `<a href="${u}" target="_blank" rel="noopener">${esc(n)}</a>`).join(" · ")}</li>`).join("")}</ul>` : `<p>Все темы ${grade} класса обеспечены.</p>`}
          <div class="mat-drop"><p>Перетащите сюда скачанные файлы (.pdf, .docx, .txt) — можно сразу несколько</p><label class="btn sm flame">Загрузить и обучить<input type="file" id="covAdd" multiple accept=".pdf,.docx,.txt,.md" hidden></label></div>
        </div></details>`;
    box.querySelectorAll("[data-try]").forEach(x => x.onclick = () => tryTopic(subj, grade, x.dataset.try));
    const inp = box.querySelector("#covAdd");
    const add = async files => { if (!files.length) return; await addMaterials(files); matCache = null; toast("Файлы встроены. Пересчитываю покрытие…"); paint(box, subj, grade); };
    inp.onchange = e => { add([...e.target.files]); e.target.value = ""; };
    const drop = box.querySelector(".mat-drop");
    ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", e => add([...(e.dataTransfer.files || [])]));
  }
  function tryTopic(subj, grade, title) {
    try {
      go("builder");
      document.querySelector(`#segSubject button[data-v=${subj}]`)?.click();
      const g = document.getElementById("grade"); if (g) { g.value = String(grade); g.dispatchEvent(new Event("change", { bubbles: true })); }
      const tp = document.getElementById("topic"); if (tp) { tp.value = title; tp.dispatchEvent(new Event("input", { bubbles: true })); tp.focus(); }
      toast("Тема подставлена. Нажмите «Создать урок».");
    } catch (e) { console.warn(e); }
  }
  return { render, ruTopic, litTopic, UI };
})();
window.DevCover = DevCover;
