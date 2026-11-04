/* «Учу по ФРП» — интерактив для учеников по QR-коду и «Результаты тестов» в кабинете.
   • Готовые интерактивы — в CATALOG (страница урока + тема, к которой он подходит). Пока готов «Тарас Бульба» (7 кл.);
     дальше сюда же добавляются новые страницы (в будущем — собранные нейросетью по уроку).
   • Учитель отмечает «📱 Интерактив с тестом» → при сборке презентации в облаке создаётся запись quizzes (владелец — учитель),
     в конец презентации ставится слайд с QR-кодом и ссылкой …?q=<код>.
   • Ученик вписывает фамилию, имя, класс; результат пишется в quiz_results и виден только владельцу (RLS, supabase_quizzes.sql).
   • Кабинет → «Результаты тестов»: уроки, ученики, баллы, ошибки, ответы своими словами; значок с числом новых результатов. */
const QuizLink = (() => {
  "use strict";
  const SITE = "https://uchu-po-frp.ru/";
  const CATALOG = [
    { id: "taras-bulba-2", title: "«Тарас Бульба»: сюжет, герои и их выбор, смысл повести", subject: "lit", grades: [7], match: /тарас\S*\s+бульб/i, page: "taras-bulba/index.html",
      parts: "история, сюжет в восьми кадрах, герои, выбор и решения, тема и идея, тест из 12 вопросов" },
  ];
  const KEY = "uchu:quiz", SEEN = "uchu:quiz-seen";
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } } };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const find = p => CATALOG.find(c => c.match.test(String(p?.topic || "") + " " + String(p?.work || "")));
  const base = () => /^https?:$/.test(location.protocol) && !/^(localhost|127\.)/.test(location.hostname) ? location.origin + location.pathname.replace(/[^/]*$/, "") : SITE;
  const linkOf = (t, id) => base() + t.page + (id ? "?q=" + id : "");
  const shortOf = url => url.replace(/^https?:\/\//, "");
  const newId = () => { const a = "abcdefghijkmnpqrstuvwxyz23456789"; const r = crypto.getRandomValues(new Uint8Array(10)); return [...r].map(x => a[x % a.length]).join(""); };
  const logged = () => !!(window.Account?.session && !Account.session.local);

  /* галочка в форме урока */
  function wanted() { const el = document.getElementById("xQuiz"); return el ? el.checked : !!ls.get(KEY, false); }
  function bindForm() {
    const el = document.getElementById("xQuiz"); if (!el || el.dataset.b) return; el.dataset.b = 1;
    el.checked = !!ls.get(KEY, false);
    el.addEventListener("change", () => { ls.set(KEY, el.checked); if (el.checked && !logged()) window.toast?.("Чтобы результаты учеников приходили вам, войдите в личный кабинет (вверху справа).", 5000); });
  }

  /* AI-тест по теме: учитель только выбирает промпт, тест собирается сам */
  async function aiTest(p) {
    if (!logged()) throw new Error("войдите в личный кабинет");
    if (!window.AI || !AI.configured || !AI.configured()) throw new Error("нейросеть не подключена");
    const prompt = `Ты — учитель и методист. Составь проверочный тест по теме «${p.topic}», предмет «${p.subject}», ${p.grade} класс.
Цель урока: ${p.goal || p.topic}. Проверяем именно приобретённые на уроке знания.
Верни ТОЛЬКО JSON без markdown:
{"title":"название теста","questions":[{"q":"вопрос","options":["А","Б","В","Г"],"answer":2,"explain":"почему верно"}]}
Правила: 6–10 вопросов; один правильный ответ; 4 варианта; answer — индекс с 0; неверные варианты правдоподобные; без подсказок; факты достоверные.`;
    const res = await AI.sample(prompt, { modelTier: "default" });
    let txt = String(res?.text || "").replace(/```json|```/gi, "").trim();
    const a = txt.indexOf("{"), b = txt.lastIndexOf("}");
    if (a < 0 || b < a) throw new Error("нейросеть вернула не JSON");
    const data = JSON.parse(txt.slice(a, b + 1));
    if (!data || !Array.isArray(data.questions) || data.questions.length < 3) throw new Error("в тесте нет вопросов");
    data.questions = data.questions.filter(x => x && x.q && Array.isArray(x.options) && x.options.length >= 2 && Number.isInteger(x.answer));
    if (data.questions.length < 3) throw new Error("в тесте слишком мало корректных вопросов");
    const id = newId();
    await Account.db("/rest/v1/quizzes", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ id, template: "ai-test", title: String(data.title || p.topic).slice(0, 200) }) });
    let warn = "";
    try { await Account.db("/rest/v1/quiz_questions", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ quiz_id: id, data: { title: data.title || p.topic, subject: p.subject, grade: p.grade, questions: data.questions } }) }); }
    catch (e) { warn = "Тест создан, но вопросы не сохранились: запустите supabase_quizzes_ai.sql в Supabase."; }
    return { id, url: base() + "test/index.html?q=" + id, data, warn };
  }

  /* запись интерактива в облаке: владелец — вошедший учитель */
  async function create(t, title) {
    const id = newId();
    await Account.db("/rest/v1/quizzes", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ id, template: t.id, title: String(title || t.title).slice(0, 200) }) });
    return id;
  }

  /* слайд для конца презентации: QR + ссылка */
  async function slideMd(p) {
    let a = null, t = find(p), id = null, url = null, warn = "";
    if (logged() && window.AI && AI.configured && AI.configured()) {
      try { a = await aiTest(p); id = a.id; url = a.url; warn = a.warn || ""; } catch (e) { warn = "Тест не создан: " + (e.message || e); }
    }
    if (!id && t) {
      try { id = await create(t, p.topic); url = linkOf(t, id); } catch (e) { warn = "Не получилось создать тест (" + e.message + "). Проверьте supabase_quizzes.sql."; }
    }
    if (!id) { if (warn) window.toast?.(warn, 6000); return null; }
    let img = "";
    if (window.QR && window.Store) { try { const b = await QR.png(url, 720); const k = "img-qr-" + (id || Date.now()); await Store.put("images", k, b); img = `![QR-код: проверка знаний](idb:${k})`; } catch { } }
    const set = { kind: "qr", acc: "right" };
    const parts = a ? `${a.data.questions.length} вопросов по теме` : (t ? t.parts : "");
    const md = [`## 🧪 Проверка знаний: тест по теме`, img, [
      "- Наведите камеру телефона на QR-код или откройте ссылку",
      "- Впишите фамилию, имя и класс",
      `- ${parts}`,
      "- Результат придёт учителю в личный кабинет",
      "", `[${shortOf(url)}](${url})`].filter(x => x !== null).join("\n"),
      `<!--@ ${JSON.stringify(set)} -->`,
      `<!-- Тест «${String(p.topic || "").slice(0, 80)}». Результаты: Личный кабинет → «Результаты тестов». Ссылка: ${url} -->`].filter(Boolean).join("\n\n");
    if (warn) window.toast?.(warn, 7000);
    return { md, id, url, warn, t: t || { title: p.topic } };
  }

  /* отдельный тест: создаётся независимо от презентации, ссылка прикрепляется к уроку */
  async function createTest(p) {
    const a = await aiTest(p);
    return { id: a.id, url: a.url, title: String(a.data.title || p.topic || "Тест"), warn: a.warn || "" };
  }

  /* QR-слайд в презентацию к уже созданному тесту */
  async function slideFor(p, qt) {
    if (!qt || !qt.url) return "";
    let img = "";
    if (window.QR && window.Store) { try { const b = await QR.png(qt.url, 720); const k = "img-qr-" + (qt.id || Date.now()); await Store.put("images", k, b); img = `![QR-код: тест по теме](idb:${k})`; } catch { } }
    const set = { kind: "qr", acc: "right" };
    return [`## 🧪 Проверка знаний: тест по теме`, img, [
      "- Наведите камеру телефона на QR-код или откройте ссылку",
      "- Впишите фамилию, имя и класс",
      `- ${qt.title || p.topic || "тест"}`,
      "- Результат придёт учителю в личный кабинет",
      "", `[${shortOf(qt.url)}](${qt.url})`].join("\n"), `<!--@ ${JSON.stringify(set)} -->`].filter(Boolean).join("\n\n");
  }

  /* при автоматической сборке урока */
  async function addToDeck(md, p) {
    if (!wanted()) return md;
    const r = await slideMd(p).catch(() => null);
    if (!r) { window.toast?.("Не удалось создать тест. Проверьте вход в кабинет и подключение нейросети.", 6000); return md; }
    return md.replace(/\s+$/, "") + "\n\n" + r.md;
  }

  /* ---------- кабинет: «Результаты тестов» ---------- */
  let cache = null;
  async function load() {
    const quizzes = await Account.db("/rest/v1/quizzes?select=id,template,title,created_at&order=created_at.desc&limit=200");
    const results = quizzes.length ? await Account.db("/rest/v1/quiz_results?select=id,quiz_id,student,klass,score,total,details,created_at&order=created_at.desc&limit=3000") : [];
    cache = { quizzes, results }; return cache;
  }
  const seen = () => ls.get(SEEN, {});
  function newCount(c = cache) { if (!c) return 0; const s = seen(); return c.results.filter(r => r.created_at > (s[r.quiz_id] || "")).length; }
  async function badge(el) { css(); if (!el || !logged()) return; try { await load(); const n = newCount(); el.textContent = n ? String(n) : ""; el.hidden = !n; } catch { el.hidden = true; } }

  function css() {
    if (document.getElementById("qzCss")) return;
    const s = document.createElement("style"); s.id = "qzCss";
    s.textContent = `.qz-badge{display:inline-block;min-width:18px;padding:0 6px;margin-left:6px;border-radius:999px;background:#c0392b;color:#fff;font-size:12px;line-height:18px;text-align:center}
.qz-list{display:flex;flex-direction:column;gap:8px;margin-top:8px}.qz-item{display:flex;justify-content:space-between;gap:10px;align-items:center;border:1px solid var(--line,#ddd);border-radius:12px;padding:10px 12px;cursor:pointer;background:var(--card,#fff)}
.qz-item b{display:block}.qz-item .small{opacity:.8}.qz-stats{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.qz-stat{border:1px solid var(--line,#ddd);border-radius:10px;padding:6px 10px}.qz-stat b{font-size:20px;display:block}
.qz-tab{width:100%;border-collapse:collapse;font-size:14px}.qz-tab th,.qz-tab td{border-bottom:1px solid var(--line,#ddd);padding:6px 5px;text-align:left;vertical-align:top}.qz-tab tr.qz-new td{background:rgba(201,164,92,.15)}.qz-det td{font-size:13.5px;opacity:.9}
.qz-qr{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.qz-qr svg{width:120px;height:120px}`;
    document.head.appendChild(s);
  }
  async function openResults() {
    css();
    if (!logged()) { window.toast?.("Войдите в личный кабинет, чтобы видеть результаты учеников.", 5000); return; }
    const m = openModal(`<div class="dialog wide"><div class="dlg-h"><h2>Результаты тестов</h2><button class="btn ghost x" data-close aria-label="Закрыть">×</button></div><div class="dlg-b" id="qzBody"><p class="small">Загружаю…</p></div></div>`);
    const body = m.querySelector("#qzBody");
    try { await load(); } catch (e) { body.innerHTML = `<p>Не получилось загрузить: ${esc(e.message)}.</p><p class="small">Если раздел открывается впервые, владельцу сайта нужно один раз запустить <b>supabase_quizzes.sql</b> в Supabase (SQL Editor).</p>`; return; }
    const list = () => {
      const { quizzes, results } = cache, s = seen();
      if (!quizzes.length) { body.innerHTML = `<p>Пока нет интерактивов.</p><p class="small">При создании урока отметьте «📱 Интерактив с тестом»: в конце презентации появится QR-код, а результаты учеников – здесь. Готовые интерактивы: ${CATALOG.map(c => esc(c.title)).join("; ")}.</p>`; return; }
      body.innerHTML = `<p class="small">Нажмите на урок, чтобы открыть результаты учеников.</p><div class="qz-list">${quizzes.map(q => {
        const rs = results.filter(r => r.quiz_id === q.id), nw = rs.filter(r => r.created_at > (s[q.id] || "")).length, avg = rs.length ? (rs.reduce((a, r) => a + (r.score || 0), 0) / rs.length).toFixed(1) : "—";
        return `<div class="qz-item" data-id="${esc(q.id)}"><div><b>${esc(q.title || q.template)}</b><span class="small">${new Date(q.created_at).toLocaleDateString("ru")} · учеников: ${rs.length} · средний балл: ${avg}</span></div>${nw ? `<span class="qz-badge">${nw} новых</span>` : ""}</div>`; }).join("")}</div>`;
      body.querySelectorAll(".qz-item").forEach(it => it.onclick = () => detail(it.dataset.id));
    };
    const detail = id => {
      const q = cache.quizzes.find(x => x.id === id), t = CATALOG.find(c => c.id === q.template) || null, url = q.template === "ai-test" ? base() + "test/index.html?q=" + id : linkOf(t || CATALOG[0], id);
      const prevSeen = seen()[id] || ""; const s = seen(); s[id] = new Date().toISOString(); ls.set(SEEN, s);
      let lastOnly = true; const open = new Set();
      const draw = () => {
        let rs = cache.results.filter(r => r.quiz_id === id);
        if (lastOnly) { const mm = new Map(); rs.forEach(r => { const k = (r.student + "|" + (r.klass || "")).toLowerCase(); if (!mm.has(k)) mm.set(k, r); }); rs = [...mm.values()]; }
        const n = rs.length, avg = n ? (rs.reduce((a, r) => a + (r.score || 0), 0) / n).toFixed(1) : "—", tot = rs[0]?.total || "—";
        const wr = {}; rs.forEach(r => (r.details?.wrong || []).forEach(x => wr[x] = (wr[x] || 0) + 1));
        const hard = Object.entries(wr).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, c]) => `№${k} (${c})`).join(", ") || "—";
        const secs = Object.keys(rs[0]?.details?.sections || {});
        body.innerHTML = `<div class="mat-row"><button class="btn sm ghost" id="qzBack">← Все уроки</button><button class="btn sm ghost" id="qzRe">Обновить</button><button class="btn sm ghost" id="qzCsv">Скачать таблицу</button><label class="check"><input type="checkbox" id="qzLast" ${lastOnly ? "checked" : ""}> только последняя попытка</label></div>
          <h3>${esc(q.title || (t && t.title) || "Тест")}</h3>
          <div class="qz-qr">${window.QR ? QR.svg(url) : ""}<div class="small">Ссылка для учеников:<br><a href="${esc(url)}" target="_blank" rel="noopener">${esc(shortOf(url))}</a><br><button class="btn sm ghost" id="qzCopy" style="margin-top:6px">Скопировать ссылку</button></div></div>
          <div class="qz-stats"><div class="qz-stat"><b>${n}</b><span class="small">учеников</span></div><div class="qz-stat"><b>${avg}</b><span class="small">средний балл из ${tot}</span></div><div class="qz-stat"><b style="font-size:15px">${hard}</b><span class="small">вопросы с ошибками</span></div></div>
          ${n ? `<div style="overflow-x:auto"><table class="qz-tab"><tr><th>Ученик</th><th>Класс</th><th>Тест</th>${secs.filter(x => !/Тест/.test(x)).map(x => `<th>${esc(x)}</th>`).join("")}<th>Время</th></tr>${rs.map(r => {
            const sc = r.details?.sections || {};
            return `<tr data-r="${esc(r.id)}" class="${r.created_at > prevSeen ? "qz-new" : ""}" style="cursor:pointer"><td><b>${esc(r.student)}</b></td><td>${esc(r.klass || "")}</td><td><b>${r.score}/${r.total}</b></td>${secs.filter(x => !/Тест/.test(x)).map(x => `<td>${esc(sc[x])}</td>`).join("")}<td>${new Date(r.created_at).toLocaleString("ru", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td></tr>` +
              (open.has(r.id) ? `<tr class="qz-det"><td colspan="${4 + secs.length}"><b>Ошибки в тесте:</b> ${(r.details?.wrong || []).join(", ") || "нет"}<br><b>Ответ своими словами:</b> ${esc(r.details?.own) || "<i>не написал</i>"}</td></tr>` : ""); }).join("")}</table></div><p class="small">Нажмите на строку — откроются ошибки и ответ ученика своими словами. Подсвечены новые результаты.</p>`
            : `<p>Пока никто не прошёл. Покажите ученикам QR-код со слайда или отправьте ссылку.</p>`}`;
        body.querySelector("#qzBack").onclick = list;
        body.querySelector("#qzRe").onclick = async () => { await load().catch(() => null); draw(); };
        body.querySelector("#qzLast").onchange = e => { lastOnly = e.target.checked; draw(); };
        body.querySelector("#qzCopy").onclick = () => { navigator.clipboard?.writeText(url).then(() => window.toast?.("Ссылка скопирована.")); };
        body.querySelector("#qzCsv").onclick = () => {
          const head = ["Ученик", "Класс", "Балл", "Из", ...secs, "Ошибки в тесте", "Ответ своими словами", "Время"];
          const lines = rs.map(r => [r.student, r.klass || "", r.score, r.total, ...secs.map(x => r.details?.sections?.[x] ?? ""), (r.details?.wrong || []).join(" "), r.details?.own || "", new Date(r.created_at).toLocaleString("ru")]);
          const csv = "﻿" + [head, ...lines].map(l => l.map(x => `"${String(x ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
          const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `${(q.title || "Интерактив").replace(/[\\/:*?"<>|«»]/g, "").slice(0, 60)} – результаты.csv`; a.click();
        };
        body.querySelectorAll("tr[data-r]").forEach(tr => tr.onclick = () => { const k = tr.dataset.r; open.has(k) ? open.delete(k) : open.add(k); draw(); });
      };
      draw();
    };
    list();
  }

  document.addEventListener("DOMContentLoaded", bindForm); setTimeout(bindForm, 0);
  return { CATALOG, find, wanted, createTest, slideFor, slideMd, addToDeck, openResults, badge, linkOf };
})();
window.QuizLink = QuizLink;
