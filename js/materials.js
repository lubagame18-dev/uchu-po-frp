/* ===================================================================
   «Учу по ФРП» — раздел «Материалы»: структура, поиск, фильтры,
   автосортировка, управление, очистка с откатом, OCR, обучение.
   Обычный пользователь видит только свои материалы и справку о ФРП.
   В режиме разработчика видна вся встроенная база и файлы пользователей.
   =================================================================== */
const Materials = (() => {
  "use strict";
  const TYPES = {
    exercise: { label: "Упражнения", icon: "✍️" },
    lesson: { label: "Конспекты и разработки", icon: "📘" },
    frp: { label: "ФРП и программы", icon: "📜" },
    general: { label: "Общие материалы", icon: "📚" }
  };
  const DEV = () => document.body.classList.contains("dev-on");

  /* ---------- автосортировка: тип, класс, тема, теги ---------- */
  const IMPER = /(вставьте|расставьте|подчеркните|выпишите|спишите|определите|укажите|найдите|составьте|замените|запишите|объясните|перестройте|восстановите|исправьте|распределите|подберите|закончите|решите|обозначьте|разберите)/g;
  const LESSON = /(ход урока|этап урока|организационный (момент|этап)|учитель\s*:|ученики\s*:|цель урока|тип урока|рефлексия|домашнее задание|технологическая карта|слово учителя|аналитическая беседа|планируемые результаты урока)/g;
  function topicCatalog(subject) {
    const out = [];
    if (typeof KB === "undefined") return out;
    const add = (src, g, title) => out.push({ g: +g, title, subject: src });
    if (!subject || subject === "ru") Object.entries(KB.ru.topics).forEach(([g, list]) => list.forEach(t => add("ru", g, t)));
    if (!subject || subject === "lit") Object.entries(KB.lit.works).forEach(([g, list]) => list.forEach(t => add("lit", g, t)));
    if (typeof FRP !== "undefined") ["ru", "lit"].forEach(k => { if (subject && subject !== k) return; [5, 6, 7, 8, 9, 10, 11].forEach(g => (FRP.topicsFor(k, g) || []).forEach(t => add(k, g, cleanTopic ? cleanTopic(t.title) : t.title))); });
    return out;
  }
  function classify(m) {
    const name = String(m.name || m.title || "");
    const text = String(m.text || "");
    const head = (name + "\n" + text.slice(0, 60000)).toLowerCase();
    const imper = (head.match(IMPER) || []).length, les = (head.match(LESSON) || []).length;
    const isFrp = /федеральн[а-яё]* рабоч[а-яё]* программ|(?<![а-яё])фрп(?![а-яё])/.test(head) && /планируемые результаты|предметные результаты/.test(head);
    const type = m.kind === "frp" || isFrp ? "frp" : m.kind === "lesson" || (les >= 3 && les * 4 >= imper) ? "lesson" : m.kind === "workbook" || imper >= 6 ? "exercise" : "general";
    const subject = m.subject || (typeof guessSubject === "function" ? guessSubject(name, text) : "ru");
    let grade = m.grade ?? (typeof guessGrade === "function" ? guessGrade(name, text) : null);
    // тема: лучшее совпадение с темами ФРП и примерного списка (основы слов в заглавии и начале текста)
    let topic = m.topic || null, tags = m.tags || [];
    if (!topic && typeof FRP !== "undefined") {
      const sample = (name.replace(/[_.-]+/g, " ") + " " + text.slice(0, 4000)).toLowerCase();
      const st = FRP.stems(sample);
      const cands = topicCatalog(subject).map(t => ({ ...t, s: FRP.score(t.title, st) * 2 + (grade && t.g === grade ? 1 : 0) })).filter(t => t.s >= 4).sort((a, b) => b.s - a.s);
      if (cands.length) { topic = cands[0].title; if (!grade && cands.filter(c => c.title === topic).length === 1) grade = cands[0].g; }
      tags = [...new Set(cands.slice(0, 4).map(c => c.title))].slice(0, 3);
    }
    const desc = m.desc || describe(text);
    return { type, subject, grade: grade || null, topic, tags, desc };
  }
  function describe(text) {
    const lines = String(text || "").split("\n").map(l => l.trim()).filter(l => l.length > 25 && !/^(isbn|удк|ббк|©|все права|подписано|формат|тираж|ооо|издательство)/i.test(l));
    const s = (lines[0] || "").replace(/\s+/g, " ");
    return s.length > 170 ? s.slice(0, 170).replace(/\s\S*$/, "") + "…" : s;
  }
  const hashText = t => { let h = 5381; const s = String(t || "").slice(0, 200000); for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0; return h.toString(36) + ":" + s.length; };

  /* ---------- состояние фильтров (запоминается в браузере) ---------- */
  const F = Object.assign({ q: "", grade: "", topic: "", type: "", date: "", sort: "date", view: "groups" }, (() => { try { return JSON.parse(localStorage.getItem("uchu:matfilter")) || {}; } catch { return {}; } })());
  const saveF = () => { try { localStorage.setItem("uchu:matfilter", JSON.stringify(F)); } catch { } };

  function list(scope) {
    return (state.materials || []).filter(m => m.kind !== "frp" && (scope === "all" || !m.builtin)).map(m => ({ ...m, ...(m.type ? {} : classify(m)) }));
  }
  function applyFilters(arr) {
    const q = F.q.trim().toLowerCase().replace(/ё/g, "е");
    const terms = q ? q.split(/\s+/).filter(Boolean) : [];
    const now = Date.now(), days = { week: 7, month: 31, year: 366 }[F.date];
    let out = arr.filter(m => (!F.grade || (F.grade === "all" ? !m.grade : String(m.grade) === F.grade)) && (!F.topic || m.topic === F.topic || (m.tags || []).includes(F.topic)) && (!F.type || m.type === F.type) && (!days || now - new Date(m.addedAt || 0).getTime() < days * 864e5));
    if (terms.length) out = out.map(m => {
      const hay = `${m.title || ""} ${m.name || ""} ${m.desc || ""} ${m.topic || ""} ${m.text || ""}`.toLowerCase().replace(/ё/g, "е");
      const ok = terms.every(t => hay.includes(t)); if (!ok) return null;
      const txt = String(m.text || ""), low = txt.toLowerCase().replace(/ё/g, "е"), i = low.indexOf(terms[0]);
      return { ...m, _snip: i >= 0 ? txt.slice(Math.max(0, i - 90), i + 140).replace(/\s+/g, " ") : "" };
    }).filter(Boolean);
    const by = { date: (a, b) => String(b.addedAt || "").localeCompare(String(a.addedAt || "")), name: (a, b) => String(a.title || a.name).localeCompare(String(b.title || b.name), "ru"), grade: (a, b) => (a.grade || 99) - (b.grade || 99) }[F.sort] || (() => 0);
    return out.sort(by);
  }
  const hi = (s, q) => { let h = esc(s); for (const t of q.trim().split(/\s+/).filter(x => x.length > 1)) h = h.replace(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), x => `<mark>${x}</mark>`); return h; };

  /* ---------- отрисовка библиотеки ---------- */
  function card(m) {
    const T = TYPES[m.type] || TYPES.general, ocr = window.OCR ? OCR.label(m) : null;
    return `<article class="mcard" data-id="${esc(m.id)}">
      <div class="mc-ico" aria-hidden="true">${T.icon}</div>
      <div class="mc-body"><h3 title="${esc(m.title || m.name)}">${esc(m.title || m.name)}</h3>
        ${m._snip ? `<p class="mc-snip">…${hi(m._snip, F.q)}…</p>` : m.desc ? `<p class="mc-desc">${esc(m.desc)}</p>` : ""}
        <div class="tags"><span class="tag">${esc(T.label)}</span><span class="tag">${m.grade ? m.grade + " класс" : "для всех классов"}</span>${m.topic ? `<span class="tag blue" title="тема">${esc(m.topic.length > 40 ? m.topic.slice(0, 40) + "…" : m.topic)}</span>` : ""}${m.builtin ? `<span class="tag sun">встроен в сайт</span>` : ""}${ocr ? `<span class="tag ${ocr.cls}">${esc(ocr.text)}</span>` : ""}${m.cleaned?.summary ? `<span class="tag ok" title="${esc(m.cleaned.summary)}">очищено</span>` : ""}</div>
        <p class="small mc-meta">${(m.chars || 0).toLocaleString("ru-RU")} знаков${m.pages ? ` · ${m.pages} стр.` : ""}${m.addedAt ? ` · ${new Date(m.addedAt).toLocaleDateString("ru-RU")}` : ""}</p>
        <div class="acts"><button class="btn sm ghost" data-mact="open">Открыть</button>${!m.builtin || DEV() ? `<button class="btn sm ghost" data-mact="edit">Изменить</button>` : ""}${m.cleaned || m.original ? `<button class="btn sm ghost" data-mact="clean">Очистка</button>` : ""}${m.scanned && !m.builtin ? `<button class="btn sm teal" data-mact="ocr">Распознать</button>` : ""}${!m.builtin ? `<button class="btn sm ghost" data-mact="del">Удалить</button>` : ""}</div>
      </div></article>`;
  }
  function renderLib(box, scope) {
    // обычному учителю — только поиск по своим материалам (без фильтров по классу, теме и типу); разработчику — всё
    const D = DEV(); if (!D) Object.assign(F, { grade: "", topic: "", type: "", date: "", view: "groups" });
    const all = list(scope), arr = applyFilters(all);
    const topics = [...new Set(all.flatMap(m => [m.topic, ...(m.tags || [])]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
    box.innerHTML = `<div class="mat-tools">
      <input type="search" class="inp" id="mfQ" placeholder="${D ? "Поиск по тексту всех материалов" : "🔍 Поиск по моим материалам"}" value="${esc(F.q)}" aria-label="Поиск по материалам">
      ${D ? `<select id="mfGrade" aria-label="Класс"><option value="">все классы</option>${[5, 6, 7, 8, 9, 10, 11].map(g => `<option value="${g}" ${F.grade === String(g) ? "selected" : ""}>${g} класс</option>`).join("")}<option value="all" ${F.grade === "all" ? "selected" : ""}>для всех классов</option></select>
      <select id="mfTopic" aria-label="Тема"><option value="">все темы</option>${topics.map(t => `<option ${F.topic === t ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>
      <select id="mfType" aria-label="Тип"><option value="">все типы</option>${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${F.type === k ? "selected" : ""}>${v.label}</option>`).join("")}</select>
      <select id="mfDate" aria-label="Дата"><option value="">за всё время</option><option value="week" ${F.date === "week" ? "selected" : ""}>за неделю</option><option value="month" ${F.date === "month" ? "selected" : ""}>за месяц</option><option value="year" ${F.date === "year" ? "selected" : ""}>за год</option></select>
      <select id="mfSort" aria-label="Сортировка"><option value="date" ${F.sort === "date" ? "selected" : ""}>сначала новые</option><option value="name" ${F.sort === "name" ? "selected" : ""}>по названию</option><option value="grade" ${F.sort === "grade" ? "selected" : ""}>по классу</option></select>
      <div class="seg mini" role="group" aria-label="Вид"><button type="button" data-view="groups" aria-pressed="${F.view === "groups"}">По группам</button><button type="button" data-view="flat" aria-pressed="${F.view === "flat"}">Списком</button></div>` : ""}
    </div>
    <p class="small mat-count">${arr.length === all.length ? `Материалов: ${all.length}` : `Найдено ${arr.length} из ${all.length}`}${F.q || F.grade || F.topic || F.type || F.date ? ` · <button type="button" class="btn plain" id="mfReset">${D ? "сбросить фильтры" : "очистить поиск"}</button>` : ""}</p>
    <div class="mat-groups">${!arr.length ? `<div class="lcard"><h3>${all.length ? "Ничего не найдено" : scope === "all" ? "Материалов нет" : "Своих материалов пока нет"}</h3><p class="small" style="margin:0">${all.length ? "Измените запрос или фильтры." : "Это необязательно: сайт работает на встроенной базе."}</p></div>` : F.view === "flat" ? `<div class="mcards">${arr.map(card).join("")}</div>` : groups(arr)}</div>`;
    const re = () => { saveF(); renderLib(box, scope); };
    const q = box.querySelector("#mfQ");
    q.addEventListener("input", (() => { let t; return () => { clearTimeout(t); t = setTimeout(() => { F.q = q.value; saveF(); const pos = q.selectionStart; renderLib(box, scope); const nq = box.querySelector("#mfQ"); nq.focus(); try { nq.setSelectionRange(pos, pos); } catch { } }, 300); }; })());
    [["mfGrade", "grade"], ["mfTopic", "topic"], ["mfType", "type"], ["mfDate", "date"], ["mfSort", "sort"]].filter(([id]) => box.querySelector("#" + id)).forEach(([id, k]) => box.querySelector("#" + id).onchange = e => { F[k] = e.target.value; re(); });
    box.querySelectorAll("[data-view]").forEach(b => b.onclick = () => { F.view = b.dataset.view; re(); });
    const rs = box.querySelector("#mfReset"); if (rs) rs.onclick = () => { Object.assign(F, { q: "", grade: "", topic: "", type: "", date: "" }); re(); };
    box.querySelectorAll(".mcard [data-mact]").forEach(b => b.onclick = () => action(b.dataset.mact, b.closest(".mcard").dataset.id, b, () => renderLib(box, scope)));
    box.querySelectorAll("details.mg").forEach(d => d.addEventListener("toggle", () => { const k = "uchu:mg:" + d.dataset.k; try { d.open ? localStorage.removeItem(k) : localStorage.setItem(k, "0"); } catch { } }));
  }
  /* Группировка: класс → тема → тип файла */
  function groups(arr) {
    const byG = new Map();
    for (const m of arr) { const g = m.grade ? m.grade + " класс" : "Для всех классов"; if (!byG.has(g)) byG.set(g, new Map()); const t = m.topic || "Без темы"; const tm = byG.get(g); if (!tm.has(t)) tm.set(t, []); tm.get(t).push(m); }
    const order = [...byG.keys()].sort((a, b) => (parseInt(a) || 99) - (parseInt(b) || 99));
    const isOpen = k => { try { return localStorage.getItem("uchu:mg:" + k) !== "0"; } catch { return true; } };
    return order.map(g => {
      const tm = byG.get(g), n = [...tm.values()].reduce((a, x) => a + x.length, 0);
      return `<details class="mg" data-k="${esc(g)}" ${isOpen(g) ? "open" : ""}><summary><b>${esc(g)}</b> <span class="small">${n}</span></summary>${[...tm.keys()].sort((a, b) => a === "Без темы" ? 1 : b === "Без темы" ? -1 : a.localeCompare(b, "ru")).map(t => {
        const items = tm.get(t), byT = {};
        items.forEach(m => (byT[m.type] = byT[m.type] || []).push(m));
        return `<div class="mg-topic"><h4>${esc(t)}</h4>${Object.keys(TYPES).filter(k => byT[k]).map(k => `<div class="mg-type"><span class="mg-tl">${TYPES[k].icon} ${TYPES[k].label}</span><div class="mcards">${byT[k].map(card).join("")}</div></div>`).join("")}</div>`;
      }).join("")}</details>`;
    }).join("");
  }

  /* ---------- действия с материалом ---------- */
  const find = id => (state.materials || []).find(m => m.id === id);
  async function persist(m) {
    // встроенный материал, изменённый разработчиком, сохраняется как локальная копия с тем же id
    const { builtin, _snip, ...rec } = m;
    await Store.put("materials", m.id, { ...rec, editedBuiltin: builtin || m.editedBuiltin || undefined, updatedAt: new Date().toISOString() });
    await loadMaterials();
  }
  async function action(act, id, btn, rerender) {
    const m0 = find(id); if (!m0) return;
    const m = { ...m0, ...(m0.type ? {} : classify(m0)) };
    if (act === "open") return openViewer(m);
    if (act === "edit") return openEdit(m, rerender);
    if (act === "clean") return openClean(m, rerender);
    if (act === "ocr") {
      if (!(await OCR.hasFile(m.id))) { toast("Исходный файл скана не сохранился. Прикрепите его ещё раз — распознавание начнётся само.", 7000); return; }
      await OCR.enqueue(m); toast("Скан поставлен в очередь на распознавание. Это может занять несколько минут.", 6000); return rerender();
    }
    if (act === "del") {
      if (!btn.dataset.sure) { btn.dataset.sure = 1; btn.textContent = "Точно удалить?"; return; }
      await Store.del("materials", id); try { await Store.del("kv", "blob:" + id); } catch { } await loadMaterials(); rerender();
      if (window.Collect) Collect.forget(id);
    }
  }
  function openViewer(m) {
    const md = openModal(`<div class="dialog"><div class="dlg-h"><h2>${esc(m.title || m.name)}</h2><button class="btn ghost x" data-close aria-label="Закрыть">×</button></div>
      <div class="dlg-b"><div class="row-btn"><input type="search" class="inp" id="mvQ" placeholder="Найти в тексте" value="${esc(F.q)}"><button class="btn sm ghost" id="mvCopy">Копировать текст</button></div>
      <p class="small">${(m.chars || 0).toLocaleString("ru-RU")} знаков${m.cleaned?.summary ? ` · очищено: ${esc(m.cleaned.summary)}` : ""}${m.scanned ? " · скан без текстового слоя — нажмите «Распознать»" : ""}</p>
      <div class="mv-text" id="mvText" tabindex="0"></div></div></div>`);
    const box = md.querySelector("#mvText"), q = md.querySelector("#mvQ");
    const paint = () => { const t = String(m.text || "").slice(0, 400000); box.innerHTML = q.value.trim() ? hi(t, q.value) : esc(t); const first = box.querySelector("mark"); if (first) first.scrollIntoView({ block: "center" }); };
    q.oninput = paint; paint();
    md.querySelector("#mvCopy").onclick = async () => { try { await navigator.clipboard.writeText(m.text || ""); toast("Текст скопирован."); } catch { toast("Не удалось скопировать: выделите текст вручную."); } };
  }
  function openEdit(m, rerender) {
    const topics = [...new Set(topicCatalog(m.subject).map(t => t.title))];
    const md = openModal(`<div class="dialog narrow"><div class="dlg-h"><h2>Материал</h2><button class="btn ghost x" data-close aria-label="Закрыть">×</button></div>
      <form class="dlg-b" id="meForm">
        <div class="field"><label for="meTitle">Название</label><input class="inp" id="meTitle" value="${esc(m.title || m.name)}"></div>
        <div class="field"><label for="meDesc">Описание</label><textarea class="inp" id="meDesc">${esc(m.desc || "")}</textarea></div>
        <div class="row2"><div class="field"><label for="meGrade">Класс</label><select id="meGrade"><option value="">для всех классов</option>${[5, 6, 7, 8, 9, 10, 11].map(g => `<option ${g === m.grade ? "selected" : ""}>${g}</option>`).join("")}</select></div>
        <div class="field"><label for="meSubj">Предмет</label><select id="meSubj"><option value="ru" ${m.subject !== "lit" ? "selected" : ""}>Русский язык</option><option value="lit" ${m.subject === "lit" ? "selected" : ""}>Литература</option></select></div></div>
        <div class="field"><label for="meType">Тип</label><select id="meType">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${m.type === k ? "selected" : ""}>${v.label}</option>`).join("")}</select></div>
        <div class="field"><label for="meTopic">Тема (перемещение между темами)</label><input class="inp" id="meTopic" list="meTopics" value="${esc(m.topic || "")}"><datalist id="meTopics">${topics.slice(0, 600).map(t => `<option value="${esc(t)}">`).join("")}</datalist></div>
        <div class="field"><label for="meTags">Теги (через запятую)</label><input class="inp" id="meTags" value="${esc((m.tags || []).join(", "))}"></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn flame" type="submit">Сохранить</button><button class="btn ghost" type="button" id="meAuto">Определить заново автоматически</button></div>
      </form></div>`);
    md.querySelector("#meAuto").onclick = () => { const c = classify({ ...m, type: null, topic: null, tags: null, desc: null, grade: null, kind: null }); md.querySelector("#meType").value = c.type; md.querySelector("#meGrade").value = c.grade || ""; md.querySelector("#meTopic").value = c.topic || ""; md.querySelector("#meTags").value = (c.tags || []).join(", "); md.querySelector("#meDesc").value = c.desc || ""; };
    md.querySelector("#meForm").onsubmit = async e => {
      e.preventDefault();
      const kindOf = { exercise: "workbook", lesson: "lesson", general: m.kind === "workbook" || m.kind === "lesson" ? "other" : m.kind || "other", frp: "frp" };
      await persist({ ...m, title: md.querySelector("#meTitle").value.trim() || m.name, desc: md.querySelector("#meDesc").value.trim(), grade: md.querySelector("#meGrade").value ? +md.querySelector("#meGrade").value : null, subject: md.querySelector("#meSubj").value, type: md.querySelector("#meType").value, kind: kindOf[md.querySelector("#meType").value], topic: md.querySelector("#meTopic").value.trim() || null, tags: md.querySelector("#meTags").value.split(",").map(x => x.trim()).filter(Boolean) });
      closeModal(); toast("Сохранено."); rerender();
    };
  }
  function openClean(m, rerender) {
    const rep = m.cleaned?.report || [];
    const md = openModal(`<div class="dialog narrow"><div class="dlg-h"><h2>Очистка текста</h2><button class="btn ghost x" data-close aria-label="Закрыть">×</button></div><div class="dlg-b">
      <p>${m.cleaned ? `Удалено: ${esc(m.cleaned.summary || "—")}.` : "Текст ещё не очищался."}</p>
      ${rep.length ? `<ul class="clean-rep">${rep.map(r => `<li><b>${esc(r.type)}</b> — ${r.count}${r.samples?.length ? `<br><span class="small">например: ${r.samples.map(x => "«" + esc(x) + "»").join(", ")}</span>` : ""}</li>`).join("")}</ul>` : ""}
      <p class="hint">Осталось ${(m.chars || 0).toLocaleString("ru-RU")} знаков${m.original ? `, в исходнике было ${m.original.length.toLocaleString("ru-RU")}` : ""}. Содержательный текст, абзацы и авторская пунктуация не трогаются.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap">${m.original ? `<button class="btn ghost" id="mcUndo">Откатить: вернуть исходный текст</button>` : ""}${m.original || DEV() ? `<button class="btn" id="mcRedo">Очистить ${m.original ? "заново" : ""}</button>` : ""}</div></div></div>`);
    const undo = md.querySelector("#mcUndo"); if (undo) undo.onclick = async () => { await persist({ ...m, text: m.original, chars: m.original.length, cleaned: null, cleanedUndone: true }); closeModal(); toast("Исходный текст возвращён."); rerender(); };
    const redo = md.querySelector("#mcRedo"); if (redo) redo.onclick = async () => { const src = m.original || m.text; const r = Cleaner.clean(src, { pdf: /\.pdf$/i.test(m.name || "") }); await persist({ ...m, original: m.original || (src.length < 2.5e6 ? src : undefined), text: r.text, chars: r.text.length, cleaned: { summary: Cleaner.summary(r.report), report: r.report, at: new Date().toISOString() } }); closeModal(); toast("Текст очищен: " + Cleaner.summary(r.report)); rerender(); };
  }

  /* ---------- «Чему научилась система» ---------- */
  async function renderLearn(box) {
    if (!box || !window.Learn) return;
    const k = Learn.get(), vers = (await Learn.versions()).slice().reverse(), ex = await Learn.excludedNow();
    const srcs = Object.entries(k.sources);
    const own = srcs.filter(([, s]) => !s.builtin);
    box.innerHTML = `<h2>Чему научилась система</h2>
      <p class="hint" style="font-size:14px">Сайт сам изучает разработки уроков и методички: типы вопросов, структуру уроков, приёмы. Новые файлы учитываются автоматически, каждое обновление можно откатить.</p>
      <div class="learn-stats"><div><b>${k.counts.lessons}</b><span>уроков-образцов</span></div><div><b>${k.counts.questions}</b><span>вопросов изучено</span></div><div><b>${k.counts.generic}</b><span>вопросов-образцов по типам</span></div><div><b>${k.counts.structures}</b><span>структур уроков</span></div><div><b>${k.counts.techniques}</b><span>приёмов</span></div></div>
      <details><summary>Типы вопросов (из методических файлов)</summary><ul class="learn-cats">${Object.entries(Learn.CATS).map(([c, v]) => `<li><b>${esc(v.label)}</b> — ${(k.byCat[c] || []).length} образцов <span class="small">(${esc(v.src)})</span>${(k.byCat[c] || [])[0] ? `<br><span class="small">например: «${esc(k.byCat[c][0].text)}»</span>` : ""}</li>`).join("")}</ul></details>
      <details><summary>Приёмы, найденные в файлах</summary><p>${k.techniques.map(t => esc(t.name)).join(" · ") || "—"}</p></details>
      <details><summary>Источники обучения</summary><ul>${DEV() ? srcs.map(([id, s]) => `<li>${esc(s.title)} — вопросов ${s.questions}, структур ${s.structures}${s.lessons > 1 ? `, уроков ${s.lessons}` : ""} <button class="btn plain" data-lex="${esc(id)}">не учитывать</button></li>`).join("") : `<li>встроенная база сайта — ${srcs.length - own.length} файлов</li>${own.map(([id, s]) => `<li>${esc(s.title)} — вопросов ${s.questions} <button class="btn plain" data-lex="${esc(id)}">не учитывать</button></li>`).join("")}`}</ul>${ex.length ? `<p class="small">Не учитываются: ${ex.length}. <button class="btn plain" id="lexAll">Вернуть все</button></p>` : ""}</details>
      <details><summary>История обновлений (${vers.length})</summary><ol class="learn-vers">${vers.map((v, i) => `<li><b>${new Date(v.at).toLocaleString("ru-RU")}</b> — вопросов ${v.counts.questions}, структур ${v.counts.structures}${v.added?.length ? `; добавлено: ${esc((DEV() ? v.added : v.added.filter(x => own.some(([, s]) => s.title === x))).slice(0, 5).join(", ") || v.added.length + " файл(ов)")}` : ""}${v.removed?.length ? `; убрано: ${v.removed.length}` : ""}${i > 0 ? ` <button class="btn plain" data-lrb="${v.v}">откатить к этой версии</button>` : " <span class='tag ok'>текущая</span>"}</li>`).join("")}</ol></details>`;
    box.querySelectorAll("[data-lex]").forEach(b => b.onclick = async () => { await Learn.exclude(b.dataset.lex); toast("Файл больше не учитывается в обучении."); renderLearn(box); });
    box.querySelectorAll("[data-lrb]").forEach(b => b.onclick = async () => { await Learn.rollback(+b.dataset.lrb); toast("Обучение откатено: файлы, изученные позже, больше не учитываются (сами файлы не удалены)."); renderLearn(box); });
    const la = box.querySelector("#lexAll"); if (la) la.onclick = async () => { for (const id of ex) await Learn.include(id); renderLearn(box); };
  }

  /* ---------- страница «Материалы» целиком ---------- */
  function renderPage() {
    const lib = document.getElementById("matLib");
    if (lib) renderLib(lib, DEV() ? "own" : "own");
    renderFrp();
    renderLearn(document.getElementById("learnCard"));
    if (window.Collect) Collect.render(document.getElementById("sendCard"));
    Store.usage().then(u => { const el = document.getElementById("matUsage"); if (el && u) el.textContent = `Занято в браузере: ${(u.used / 1048576).toFixed(1)} МБ из ${(u.quota / 1048576 / 1024).toFixed(1)} ГБ.`; });
    document.dispatchEvent(new Event("uchu:materials-rendered"));
  }
  /* Справка о ФРП: обычный пользователь видит только общее — что всё разработано по ФРП */
  function renderFrp() {
    const box = document.getElementById("frpBox"); if (!box) return;
    const rows = ["ru", "lit"].map(k => {
      const l = FRP.list(k), name = k === "ru" ? "ФРП по русскому языку" : "ФРП по литературе";
      if (!l.length) return `<div class="frp-row"><b>${name}</b> — уроки строятся по структуре ФРП; дословные формулировки результатов появятся, когда текст программы будет встроен в сайт.</div>`;
      return l.map(d => { const sm = FRP.summary(d); return `<div class="frp-row"><b>${name}${sm.grades.length ? `, ${sm.grades.length > 1 ? sm.grades[0] + "–" + sm.grades[sm.grades.length - 1] : sm.grades[0]} кл.` : ""}</b> — ${d.builtin ? "встроена в сайт" : `своя программа «${esc(d.name)}»`}<span data-dev> · тем ${sm.topics}, предметных результатов ${sm.subject}, личностных ${sm.personal}, метапредметных ${sm.meta}</span>.${d.builtin ? "" : ` <button class="btn plain" data-frpdel="${k}">Вернуть встроенную</button>`}</div>`; }).join("");
    }).join("");
    box.innerHTML = `<p class="hint" style="font-size:14px;margin:0 0 6px">Все уроки на сайте разработаны по федеральным рабочим программам (ФРП).</p>${rows}`;
    box.querySelectorAll("[data-frpdel]").forEach(b => b.onclick = async () => { await FRP.remove(b.dataset.frpdel); renderFrp(); refreshTopics(); });
  }

  /* ---------- упражнения для конструктора (используется в режиме разработчика) ---------- */
  function exercises(m) {
    if (!m.text || typeof Engine === "undefined") return [];
    const parts = String(m.text).split(/\n(?=\s*(?:Упражнение\s*)?\d{1,3}\.\s+[А-ЯЁ])/);
    const mech = typeof KB !== "undefined" ? KB.ru.mechanics : [];
    return parts.map(p => p.trim()).filter(p => p.length > 60 && p.length < 3000 && /(вставьте|расставьте|подчеркните|выпишите|определите|укажите|найдите|спишите|составьте|замените|прочитайте|в каком|запишите|объясните|перестройте|восстановите|исправьте|распределите|подберите|закончите|решите)/i.test(p.slice(0, 300))).map(p => {
      const low = p.slice(0, 400).toLowerCase();
      const tags = mech.filter(x => { const f = x.formula.toLowerCase().split(/[ ,.(]/).filter(w => w.length > 5).slice(0, 3); return f.some(w => low.includes(w.slice(0, 6))); }).map(x => x.name).slice(0, 3);
      const cl = classify({ name: "", text: p, subject: "ru" });
      return { text: p, tags: tags.length ? tags : ["Без типа"], topic: cl.topic, alt: cl.tags, grade: m.grade || cl.grade, hard: /^\s*!|в каком (ряду|предложении)|укажите (номер|вариант)/i.test(p), src: m.title || m.name, srcId: m.id };
    });
  }

  return { TYPES, classify, describe, hashText, renderPage, renderLib, renderLearn, openViewer, openEdit, exercises, list, F };
})();
window.Materials = Materials;
/* «Материалы» в ядре теперь рисует этот модуль */
window.renderMaterials = () => Materials.renderPage();
