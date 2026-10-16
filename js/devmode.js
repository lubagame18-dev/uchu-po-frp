/* ===================================================================
   «Учу по ФРП» — режим разработчика.
   Вход по паролю. Пароль в коде не хранится: хранится только его хэш
   SHA-256 с «солью». Состояние входа не сохраняется между сессиями —
   после перезагрузки страницы режим выключен, пароль вводится заново.
   Кнопка «Заполнить вход» подставляет пароль, сохранённый в браузере
   (если вы разрешили его запомнить), но не входит сама.
   Всё, что показывает режим, живёт в одном контейнере #devRoot и в
   элементах с атрибутом data-dev. Выход удаляет контейнер целиком,
   снимает класс dev-on и перерисовывает текущий раздел — следов не остаётся.
   =================================================================== */
const Dev = (() => {
  "use strict";
  const SALT = "uchu-po-frp:dev:v5";
  const HASH = "7c22fbd5e2f15b7e42bc033064a7e36016d49d7e6f1300dab2bb1fdd3dd31c1e"; // SHA-256(SALT + пароль); подставляется при сборке, сам пароль в коде не хранится
  const SAVED = "uchu:dev-fill";
  let on = false, section = "materials";

  async function sha(text) {
    if (window.crypto?.subtle) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join(""); }
    // запасной вариант для старых браузеров (без защищённого контекста): простой 32-битный хэш не совпадёт с SHA-256 — вход невозможен
    return "nosubtle";
  }
  const ob = s => btoa(unescape(encodeURIComponent([...s].reverse().join("")))).split("").reverse().join("");
  const deob = s => { try { return [...decodeURIComponent(escape(atob(s.split("").reverse().join(""))))].reverse().join(""); } catch { return ""; } };

  /* ---------- вход ---------- */
  function openLogin() {
    if (on) return show("materials");
    const m = openModal(`<div class="dialog narrow"><div class="dlg-h"><h2>Режим разработчика</h2><button class="btn ghost x" data-close aria-label="Закрыть">×</button></div>
      <form class="dlg-b" id="devForm" autocomplete="on">
        <input type="text" name="username" value="разработчик" autocomplete="username" hidden>
        <div class="field"><label for="devPass">Пароль</label><div class="row-btn"><input type="password" id="devPass" name="password" autocomplete="current-password" required><button type="button" class="btn sm ghost" id="devFill">Заполнить вход</button></div></div>
        <label class="check"><input type="checkbox" id="devRemember"> Запомнить пароль в этом браузере (для кнопки «Заполнить вход»; сам вход всё равно каждый раз вручную)</label>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn flame" type="submit">Войти</button><span class="small" id="devMsg" role="status"></span></div>
      </form></div>`);
    const pass = m.querySelector("#devPass"), msg = m.querySelector("#devMsg");
    m.querySelector("#devRemember").checked = !!localStorage.getItem(SAVED);
    m.querySelector("#devFill").onclick = async () => {
      let v = deob(localStorage.getItem(SAVED) || "");
      if (!v && navigator.credentials && window.PasswordCredential) { try { const c = await navigator.credentials.get({ password: true, mediation: "optional" }); if (c?.password) v = c.password; } catch { } }
      if (v) { pass.value = v; msg.textContent = "Пароль подставлен. Нажмите «Войти»."; } else msg.textContent = "В этом браузере пароль не сохранён.";
    };
    m.querySelector("#devForm").onsubmit = async e => {
      e.preventDefault();
      const ok = (await sha(SALT + pass.value)) === HASH;
      if (!ok) { msg.textContent = "Неверный пароль."; pass.select(); if (window.Log) Log.add("вход", "неверный пароль разработчика"); return; }
      try { m.querySelector("#devRemember").checked ? localStorage.setItem(SAVED, ob(pass.value)) : localStorage.removeItem(SAVED); } catch { }
      if (window.PasswordCredential && m.querySelector("#devRemember").checked) { try { await navigator.credentials.store(new PasswordCredential({ id: "разработчик", password: pass.value })); } catch { } }
      closeModal(); enter();
    };
  }
  function enter() {
    on = true;
    document.body.classList.add("dev-on");
    const root = document.createElement("div"); root.id = "devRoot";
    root.innerHTML = `<div class="dev-bar" role="region" aria-label="Режим разработчика"><b>Режим разработчика</b><button class="btn sm" id="devOpen">Разделы разработчика</button><button class="btn sm flame" id="devExit">Выйти</button></div>
      <main id="view-dev" class="wrap page" hidden></main>`;
    document.body.prepend(root);
    root.querySelector("#devExit").onclick = exit;
    root.querySelector("#devOpen").onclick = () => show(section);
    const chip = document.createElement("button"); chip.className = "chip"; chip.id = "nav-dev"; chip.textContent = "Разработчик"; chip.dataset.devnav = "1";
    chip.onclick = () => show(section);
    document.querySelector(".nav")?.appendChild(chip);
    if (window.Log) Log.add("вход", "включён режим разработчика");
    rerenderCurrent();
    show("materials");
    toast("Режим разработчика включён. Выход — кнопка «Выйти» вверху.");
  }
  /* Выход: убираем всё, что добавил режим, и перерисовываем текущий раздел */
  function exit() {
    on = false;
    try { closeModal(); } catch { }
    document.getElementById("devRoot")?.remove();
    document.querySelectorAll("[data-devnav]").forEach(n => n.remove());
    document.body.classList.remove("dev-on");
    const v = state.view || "builder";
    ["builder", "library", "materials", "help"].forEach(x => { const el = document.getElementById("view-" + x); if (el) el.hidden = x !== v; });
    rerenderCurrent();
    if (window.Log) Log.add("вход", "режим разработчика выключен");
    toast("Режим разработчика выключен.");
  }
  function rerenderCurrent() {
    try {
      if (state.view === "materials") renderMaterials();
      else if (state.view === "library") renderLibrary();
      else if (state.view === "builder") renderLesson();
    } catch (e) { console.warn(e); }
  }

  /* ---------- разделы ---------- */
  const SECTIONS = [["materials", "Материалы"], ["exercises", "Конструктор упражнений"], ["lessons", "Конспекты"], ["frp", "ФРП"], ["inbox", "Файлы от пользователей"], ["drafts", "Черновики"], ["logs", "Логи"], ["reports", "Отчёты и собранные файлы"]];
  function show(sec) {
    if (!on) return;
    section = sec;
    ["builder", "library", "materials", "help"].forEach(x => { const el = document.getElementById("view-" + x); if (el) el.hidden = true; });
    document.querySelectorAll(".nav button").forEach(b => b.setAttribute("aria-current", b.id === "nav-dev" ? "page" : "false"));
    const v = document.getElementById("view-dev"); if (!v) return;
    v.hidden = false; window.scrollTo({ top: 0 });
    v.innerHTML = `<h1>Разработчик</h1><nav class="dev-tabs" aria-label="Разделы разработчика">${SECTIONS.map(([k, n]) => `<button class="chip" data-sec="${k}" aria-pressed="${k === sec}">${n}${k === "inbox" ? inboxBadge() : ""}</button>`).join("")}</nav><div id="devBody"></div>`;
    v.querySelectorAll("[data-sec]").forEach(b => b.onclick = () => show(b.dataset.sec));
    const body = v.querySelector("#devBody");
    ({ materials: secMaterials, exercises: secExercises, lessons: secLessons, frp: secFrp, inbox: secInbox, drafts: secDrafts, logs: secLogs, reports: secReports })[sec](body);
  }
  // переход в обычный раздел прячет экран разработчика
  const origGo = window.go;
  window.go = function (view, opts) { const v = document.getElementById("view-dev"); if (v) v.hidden = true; document.getElementById("nav-dev")?.setAttribute("aria-current", "false"); return origGo(view, opts); };

  function secMaterials(b) {
    const base = Base.summary() || [];
    b.innerHTML = `<section class="dev-card" id="ghCard"></section>
      <section class="dev-card"><h2>Все материалы сайта</h2><p class="hint">Встроенные (data/extra.js) и загруженные вами в режиме разработчика. Загрузите файлы — они очистятся, разложатся по классам и темам${window.Publish?.ready() ? " и сразу опубликуются для всех учителей" : "; затем нажмите «Опубликовать» (или скачайте extra.js)"}.</p>
      <div class="mat-drop" id="dvDrop"><p>Перетащите сюда учебники, тетради, разработки (.docx, .pdf, .txt) — можно сразу много</p><label class="btn sm flame">Загрузить и встроить для всех<input type="file" id="dvAdd" multiple accept=".pdf,.docx,.txt,.md,.json" hidden></label></div>
      <div class="mat-row"><button class="btn sm" id="dvEmbed">${window.Publish?.ready() ? "Опубликовать базу сейчас" : "Скачать новый extra.js"}</button><label class="btn sm ghost">Распознать скан (OCR)<input type="file" id="dvOcr" accept=".pdf" hidden></label></div><div id="dvLib"></div></section>
      <section class="dev-card"><h2>Встроенная база (data/base.js)</h2><div class="mcards">${base.map(s => `<article class="mcard"><div class="mc-ico">${s.kind === "lesson" ? "📘" : s.kind === "workbook" ? "✍️" : "📚"}</div><div class="mc-body"><h3>${esc(s.short)}</h3><p class="mc-desc">${esc(s.title)}</p><div class="tags">${s.grade ? `<span class="tag">${s.grade} класс</span>` : ""}<span class="tag">${s.subject === "lit" ? "Литература" : "Русский"}</span>${s.ex ? `<span class="tag">упражнений: ${s.ex}</span>` : ""}${s.items ? `<span class="tag">фрагментов: ${s.items}</span>` : ""}</div></div></article>`).join("")}</div></section>`;
    Materials.renderLib(b.querySelector("#dvLib"), "all");
    if (window.Publish) Publish.panel(b.querySelector("#ghCard"));
    const add = async files => { if (!files.length) return; await addMaterials(files); show("materials"); };
    b.querySelector("#dvAdd").onchange = e => { add([...e.target.files]); e.target.value = ""; };
    const drop = b.querySelector("#dvDrop");
    ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", e => add([...(e.dataTransfer.files || [])]));
    b.querySelector("#dvEmbed").onclick = () => embedAll();
    b.querySelector("#dvOcr").onchange = async e => { const f = e.target.files[0]; if (!f) return; await addMaterials([f]); toast("Скан добавлен; если в нём нет текста, он поставлен на распознавание. Потом скачайте новый extra.js."); show("materials"); };
  }
  /* Новый extra.js: встроенные материалы + принятые разработчиком (локальные копии и файлы пользователей) */
  async function embedAll() {
    const inbox = await inboxGet();
    const accepted = new Set(Object.entries(inbox.status || {}).filter(([, s]) => s === "встроен").map(([id]) => id));
    const items = state.materials.filter(m => !m.fromNotes && (m.builtin || m.editedBuiltin || accepted.has(m.id) || m.devEmbed)).map(({ builtin, _snip, ocrParts, devEmbed, ...m }) => ({ ...m, original: undefined }));
    if (!items.length) { toast("Нечего встраивать."); return; }
    await downloadDataJs("extra.js", "UCHU_EXTRA", { version: new Date().toISOString().slice(0, 10), items });
    if (window.Log) Log.add("встраивание", `extra.js: ${items.length} материалов`);
    if (!window.Publish?.ready()) toast(`extra.js скачан (${items.length} материалов). Загрузите его в папку data на GitHub вместо старого — или вставьте токен GitHub в «Публикация на сайт», и это будет происходить само.`, 10000);
  }

  function secExercises(b) {
    const fromMats = state.materials.filter(m => !m.scanned && m.text && (m.type === "exercise" || /workbook|textbook/.test(m.kind))).flatMap(m => Materials.exercises(m));
    const B = window.UCHU_BASE, src = i => (B?.sources || [])[i]?.short || "база";
    const mech = KB.ru.mechanics;
    const fromBase = (B?.ru || []).filter(x => x.k === "ex").map(x => { const low = x.t.slice(0, 300).toLowerCase(); return { text: x.t, tags: mech.filter(mm => mm.formula.toLowerCase().split(/[ ,.(]/).filter(w => w.length > 5).slice(0, 3).some(w => low.includes(w.slice(0, 6)))).map(mm => mm.name).slice(0, 3), topic: x.sec, grade: B.sources[x.s]?.grade, hard: /в каком/i.test(low), src: `${src(x.s)}, с. ${x.p}, упр. ${x.n}` }; });
    const all = [...fromMats, ...fromBase].map(e => ({ ...e, tags: e.tags?.length ? e.tags : ["Без типа"] }));
    const tags = [...new Set(all.flatMap(e => e.tags))].sort();
    const topics = [...new Set(all.map(e => e.topic).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
    b.innerHTML = `<section class="dev-card"><h2>Конструктор упражнений</h2><p class="hint">Упражнения из всех материалов. Тип определяется по содержанию (формулировка, ключевые слова, структура); если подходит под несколько — у упражнения несколько тегов. Всего: ${all.length}.</p>
      <div class="mat-tools"><input type="search" class="inp" id="exQ" placeholder="Поиск по тексту упражнения"><select id="exTag"><option value="">все типы</option>${tags.map(t => `<option>${esc(t)}</option>`).join("")}</select><select id="exTopic"><option value="">все темы</option>${topics.map(t => `<option>${esc(t)}</option>`).join("")}</select><select id="exGrade"><option value="">все классы</option>${[5, 6, 7, 8, 9, 10, 11].map(g => `<option>${g}</option>`).join("")}</select></div><div id="exList"></div></section>`;
    const paint = () => {
      const q = b.querySelector("#exQ").value.toLowerCase(), tg = b.querySelector("#exTag").value, tp = b.querySelector("#exTopic").value, gr = b.querySelector("#exGrade").value;
      const arr = all.filter(e => (!q || e.text.toLowerCase().includes(q)) && (!tg || e.tags.includes(tg)) && (!tp || e.topic === tp) && (!gr || String(e.grade) === gr));
      b.querySelector("#exList").innerHTML = `<p class="small">Показано ${Math.min(arr.length, 120)} из ${arr.length}</p>` + arr.slice(0, 120).map(e => `<article class="ex-card"><div class="tags">${e.tags.map(t => `<span class="tag">${esc(t)}</span>`).join("")}${e.topic ? `<span class="tag blue">${esc(e.topic)}</span>` : ""}${e.grade ? `<span class="tag">${e.grade} кл.</span>` : ""}${e.hard ? `<span class="tag red">повышенный</span>` : ""}</div><pre>${esc(e.text.slice(0, 900))}${e.text.length > 900 ? "…" : ""}</pre><p class="small">${esc(e.src)}</p></article>`).join("");
    };
    ["exQ", "exTag", "exTopic", "exGrade"].forEach(id => b.querySelector("#" + id).addEventListener("input", paint)); paint();
  }

  function secLessons(b) {
    const k = Learn.get();
    b.innerHTML = `<section class="dev-card"><h2>Конспекты и разработки (образцы)</h2><p class="hint">Уроки, которые система выделила из разработок и сборников планов-конспектов. По ним строится структура урока на ту же тему и подбираются вопросы. Всего: ${k.lessons.length}.</p>
      <input type="search" class="inp" id="lsQ" placeholder="Найти урок по теме"><div id="lsList"></div></section>`;
    const paint = () => {
      const q = b.querySelector("#lsQ").value.toLowerCase();
      const arr = k.lessons.filter(l => !q || l.topic.toLowerCase().includes(q) || l.src.toLowerCase().includes(q));
      b.querySelector("#lsList").innerHTML = arr.slice(0, 150).map((l, i) => `<details class="ls"><summary><b>${esc(l.topic.slice(0, 140))}</b> <span class="small">${esc(l.src)}${l.num ? `, урок № ${l.num}` : ""} · вопросов ${l.questions.length} · этапов ${l.stages.length}</span></summary>
        ${l.epigraph ? `<p><i>Эпиграф:</i> ${esc(l.epigraph.text)} — ${esc(l.epigraph.author)}</p>` : ""}${l.typeLine ? `<p><i>Тип урока:</i> ${esc(l.typeLine)}</p>` : ""}
        <p><i>Структура:</i></p><ol>${l.stages.map(s => `<li>${esc(s.name)}${s.steps.length ? `<ul>${s.steps.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}</li>`).join("")}</ol>
        <p><i>Вопросы (тип по методике):</i></p><ul>${l.questions.slice(0, 25).map(q => `<li><span class="tag">${esc(Learn.CATS[q.cat]?.label || q.cat)}</span> ${esc(q.text)}${q.generic ? " <span class='tag ok'>образец</span>" : ""}</li>`).join("")}</ul></details>`).join("") || "<p>Ничего не найдено.</p>";
    };
    b.querySelector("#lsQ").addEventListener("input", paint); paint();
  }

  function secFrp(b) {
    b.innerHTML = `<section class="dev-card"><h2>ФРП</h2><div id="dvFrp"></div><p class="hint">Встроены 4 программы (data/frp.js): русский язык 5–9 (2025, с поурочным планированием) и 10–11, литература 5–9 и 10–11 — результаты, темы, программное содержание и виды деятельности дословно. Если выйдет новая редакция: загрузите её файл (.pdf с текстом или .docx) — он заменит программу для своих классов; затем «Встроить для всех» (с токеном GitHub публикуется сразу, без токена скачивается frp.js).</p><div class="mat-row"><button class="btn sm" id="dvFrpUp">Загрузить файл программы</button><button class="btn sm flame" id="dvFrpEmbed">Встроить для всех (frp.js)</button></div></section>`;
    b.querySelector("#dvFrp").innerHTML = ["ru", "lit"].map(k => { const l = FRP.list(k); return `<h3>${k === "ru" ? "Русский язык" : "Литература"}</h3>` + (l.length ? l.map(d => { const sm = FRP.summary(d); return `<p><b>${esc(d.name)}</b> (${d.builtin ? "встроена" : "загружена в этом браузере"}): классы ${sm.grades.join(", ") || "—"}; тем ${sm.topics}; предметных результатов ${sm.subject}; личностных ${sm.personal}; метапредметных ${sm.meta}.</p>`; }).join("") : `<p class="small">Не встроена.</p>`); }).join("");
    b.querySelector("#dvFrpUp").onclick = () => document.getElementById("frpInput").click();
    b.querySelector("#dvFrpEmbed").onclick = () => embedFrp().catch(e => toast("Не получилось: " + (e.message || e)));
  }

  /* ---------- файлы от пользователей ---------- */
  const IKEY = "dev:inbox";
  async function inboxGet() { try { return (await Store.get("kv", IKEY)) || { subs: [], status: {} }; } catch { return { subs: [], status: {} }; } }
  async function inboxPut(v) { try { await Store.put("kv", IKEY, v); } catch (e) { toast("Не удалось сохранить: " + (e.message || e)); } }
  function inboxBadge() { return ""; }
  async function secInbox(b) {
    const ib = await inboxGet();
    const items = ib.subs.flatMap(s => s.items.map(it => ({ ...it, _sub: s })));
    const F = secInbox.F || (secInbox.F = { status: "", q: "", from: "" });
    const froms = [...new Set(ib.subs.map(s => s.from || "не указан"))];
    b.innerHTML = `<section class="dev-card"><h2>Файлы от пользователей</h2>
      <p class="hint">Пакеты, которые пришли на почту (файлы «uchu-po-frp_materialy_….json»). Загрузите сразу несколько — повторы по ID не добавятся. Затем просмотрите и встройте понравившееся; после этого скачайте новый extra.js.</p>
      <div class="mat-row"><label class="btn sm flame">Загрузить пакеты<input type="file" id="ibLoad" accept=".json" multiple hidden></label><button class="btn sm ghost" id="ibEmbed">Скачать extra.js со встроенными</button></div>
      <div class="mat-tools"><input type="search" class="inp" id="ibQ" placeholder="Поиск" value="${esc(F.q)}"><select id="ibSt"><option value="">все статусы</option>${["новый", "просмотрен", "встроен"].map(s => `<option ${F.status === s ? "selected" : ""}>${s}</option>`).join("")}</select><select id="ibFrom"><option value="">все отправители</option>${froms.map(f => `<option ${F.from === f ? "selected" : ""}>${esc(f)}</option>`).join("")}</select></div>
      <div id="ibList"></div></section>`;
    const st = it => ib.status[it.id] || "новый";
    const paint = () => {
      const q = F.q.toLowerCase();
      const arr = items.filter(it => (!F.status || st(it) === F.status) && (!F.from || (it._sub.from || "не указан") === F.from) && (!q || `${it.title || it.name} ${it.text || ""}`.toLowerCase().includes(q)));
      b.querySelector("#ibList").innerHTML = arr.length ? `<table class="ib-table"><thead><tr><th>Файл</th><th>От кого / когда</th><th>Описание</th><th>Статус</th><th></th></tr></thead><tbody>${arr.map(it => `<tr data-ib="${esc(it.id)}"><td><b>${esc(it.title || it.name)}</b><br><span class="small">${(it.chars || 0).toLocaleString("ru-RU")} знаков · ${esc(Materials.TYPES[it.type]?.label || it.kind || "")}${it.grade ? ` · ${it.grade} кл.` : ""}</span></td><td>${esc(it._sub.from || "не указан")}<br><span class="small">${new Date(it._sub.createdAt).toLocaleString("ru-RU")}</span></td><td>${esc(it._sub.note || it.desc || "")}</td><td><span class="tag ${st(it) === "встроен" ? "ok" : st(it) === "новый" ? "warn" : ""}">${st(it)}</span></td><td class="ib-acts"><button class="btn sm ghost" data-iba="view">Открыть</button><button class="btn sm ghost" data-iba="struct">Структура урока</button>${st(it) === "встроен" ? `<button class="btn sm ghost" data-iba="unembed">Убрать из базы</button>` : `<button class="btn sm teal" data-iba="embed">Встроить в базу</button>`}</td></tr>`).join("")}</tbody></table>` : `<p>${items.length ? "Ничего не найдено." : "Пакетов пока нет."}</p>`;
      b.querySelectorAll("[data-iba]").forEach(btn => btn.onclick = async () => {
        const it = items.find(x => x.id === btn.closest("tr").dataset.ib);
        if (btn.dataset.iba === "view") { Materials.openViewer(it); if (st(it) === "новый") { ib.status[it.id] = "просмотрен"; await inboxPut(ib); } }
        if (btn.dataset.iba === "struct") {
          const segs = Learn.splitLessons({ ...it, collection: /урок\s*№/i.test(it.text || "") });
          openModal(`<div class="dialog"><div class="dlg-h"><h2>Структура: ${esc(it.title || it.name)}</h2><button class="btn ghost x" data-close aria-label="Закрыть">×</button></div><div class="dlg-b">${segs.slice(0, 20).map(l => `<h3>${esc(l.topic.slice(0, 120))}</h3><ol>${l.stages.map(s => `<li>${esc(s.name)}${s.steps.length ? ` — ${s.steps.map(esc).join("; ")}` : ""}</li>`).join("") || "<li>этапы не выделены</li>"}</ol><p class="small">Вопросов: ${l.questions.length}; приёмы: ${esc(l.techniques.join(", ") || "—")}</p>`).join("")}</div></div>`);
          if (st(it) === "новый") { ib.status[it.id] = "просмотрен"; await inboxPut(ib); }
        }
        if (btn.dataset.iba === "embed") {
          const { _sub, ...m } = it;
          await Store.put("materials", m.id, { ...m, devEmbed: true, from: _sub.from || null, addedAt: m.addedAt || _sub.createdAt });
          ib.status[it.id] = "встроен"; await inboxPut(ib); await loadMaterials();
          if (window.Log) Log.add("встраивание", `встроен файл пользователя: ${m.title || m.name}`);
          if (window.Publish?.ready() && Publish.cfg().auto) await embedAll();
          else toast("Встроено в базу этого браузера. Чтобы стало у всех — «Опубликовать базу сейчас» (или скачайте extra.js).", 7000);
        }
        if (btn.dataset.iba === "unembed") { await Store.del("materials", it.id); ib.status[it.id] = "просмотрен"; await inboxPut(ib); await loadMaterials(); }
        secInbox(b);
      });
    };
    b.querySelector("#ibQ").addEventListener("input", e => { F.q = e.target.value; paint(); });
    b.querySelector("#ibSt").onchange = e => { F.status = e.target.value; paint(); };
    b.querySelector("#ibFrom").onchange = e => { F.from = e.target.value; paint(); };
    b.querySelector("#ibEmbed").onclick = embedAll;
    b.querySelector("#ibLoad").onchange = async e => {
      let added = 0, dup = 0;
      const seen = new Set(items.map(x => x.id));
      for (const f of e.target.files) {
        try {
          const j = JSON.parse(await f.text());
          if (j.app !== "uchu-po-frp-materials" || !Array.isArray(j.items)) { toast(`«${f.name}» — не пакет материалов «Учу по ФРП».`); continue; }
          const fresh = j.items.filter(it => it.id && !seen.has(it.id));
          dup += j.items.length - fresh.length; fresh.forEach(it => seen.add(it.id));
          if (fresh.length) { ib.subs.push({ id: j.id || "sub-" + Date.now(), from: j.from || "", note: j.note || "", createdAt: j.createdAt || new Date().toISOString(), file: f.name, items: fresh }); added += fresh.length; }
        } catch { toast(`Не удалось прочитать «${f.name}».`); }
      }
      await inboxPut(ib);
      toast(`Добавлено файлов: ${added}${dup ? `, повторов пропущено: ${dup}` : ""}.`);
      secInbox(b);
    };
    paint();
  }

  async function secDrafts(b) {
    const ls = await listLessons();
    const versions = ls.filter(l => /\(до правки\)$/.test(l.title));
    const nd = window.Notes ? Notes.draft : null;
    b.innerHTML = `<section class="dev-card"><h2>Черновики</h2>
      <h3>Уроки в этом браузере (${ls.length})</h3><ul>${ls.slice(0, 200).map(l => `<li><button class="btn plain" data-open="${esc(l.id)}">${esc(l.title)}</button> <span class="small">${l.params?.grade || ""} кл. · ${esc(l.params?.type?.name || "")} · ${new Date(l.updatedAt || l.createdAt).toLocaleString("ru-RU")}${l.plan?.format ? ` · формат: ${esc(l.plan.format.name)}` : ""}${l.verify ? ` · сверка: ${l.verify.ok}/${l.verify.checked}` : ""}</span></li>`).join("")}</ul>
      <h3>Версии до правки с ИИ (${versions.length})</h3>
      <h3>Черновик заметок к уроку</h3><pre class="dev-pre">${esc(JSON.stringify(nd ? { ...nd, files: nd.files?.map(f => f.name) } : {}, null, 2))}</pre></section>`;
    b.querySelectorAll("[data-open]").forEach(x => x.onclick = () => { const L = ls.find(l => l.id === x.dataset.open); if (L) { openLesson({ ...L, status: {} }); } });
  }
  function secLogs(b) {
    const arr = Log.read().slice().reverse();
    b.innerHTML = `<section class="dev-card"><h2>Логи (${arr.length})</h2><div class="mat-row"><button class="btn sm ghost" id="lgDl">Скачать журнал</button><button class="btn sm ghost" id="lgClear">Очистить</button></div><table class="ib-table"><thead><tr><th>Когда</th><th>Тип</th><th>Событие</th></tr></thead><tbody>${arr.map(x => `<tr><td class="small">${new Date(x.at).toLocaleString("ru-RU")}</td><td><span class="tag ${x.type === "ошибка" ? "red" : ""}">${esc(x.type)}</span></td><td>${esc(x.text)}</td></tr>`).join("")}</tbody></table></section>`;
    b.querySelector("#lgDl").onclick = () => saveFile("uchu-po-frp_log.json", new Blob([JSON.stringify(arr, null, 1)], { type: "application/json" }));
    b.querySelector("#lgClear").onclick = () => { Log.clear(); secLogs(b); };
  }
  async function secReports(b) {
    const l = Collect.ledger(), ls = await listLessons(), vers = await Learn.versions();
    b.innerHTML = `<section class="dev-card"><h2>Отчёты и собранные файлы</h2>
      <h3>Отправки материалов из этого браузера (${l.batches.length})</h3><ul>${l.batches.slice().reverse().map(x => `<li>${new Date(x.at).toLocaleString("ru-RU")} — ${x.count} шт., ${esc(x.method)}, ${esc(x.file)}<br><span class="small">${esc(x.titles.join("; "))}</span></li>`).join("") || "<li>—</li>"}</ul>
      <h3>Сверка фактов в уроках</h3><ul>${ls.filter(x => x.verify).slice(0, 50).map(x => `<li><b>${esc(x.title)}</b>: ${esc(Verify.line(x.verify))}${x.verify.flagged.length ? `<br><span class="small">требует проверки: ${esc(x.verify.flagged.map(f => f.text).join("; "))}</span>` : ""}${x.verify.sources.length ? `<br><span class="small">источники: ${esc(x.verify.sources.map(s => s.title).join("; "))}</span>` : ""}</li>`).join("") || "<li>—</li>"}</ul>
      <h3>Обновления обучения (${vers.length})</h3><ul>${vers.slice().reverse().map(v => `<li>${new Date(v.at).toLocaleString("ru-RU")}: вопросов ${v.counts.questions}, структур ${v.counts.structures}, уроков-образцов ${v.counts.lessons}${v.added?.length ? `; добавлено: ${esc(v.added.join(", "))}` : ""}</li>`).join("")}</ul></section>`;
  }

  /* ---------- кнопка входа (внизу страницы) ---------- */
  function mountEntry() {
    if (document.getElementById("devEntry")) return;
    const f = document.createElement("footer"); f.className = "site-foot";
    f.innerHTML = `<div class="wrap"><span>«Учу по ФРП» — уроки по ФРП</span><button class="btn plain" id="devEntry">Режим разработчика</button></div>`;
    document.body.appendChild(f);
    f.querySelector("#devEntry").onclick = openLogin;
  }
  document.addEventListener("DOMContentLoaded", mountEntry);
  return { openLogin, enter, exit, show, publishBase: embedAll, get on() { return on; } };
})();
window.Dev = Dev;
