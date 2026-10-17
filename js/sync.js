/* ===================================================================
   «Учу по ФРП» — автономная работа и доработка при подключении.
   Без интернета урок (техкарта, презентация, рабочий лист) собирается по
   локальным алгоритмам и встроенной базе — она хранится в браузере (sw.js).
   Что требует сети, ставится в очередь, и как только интернет появляется,
   сайт сам, по правилам ниже, дорабатывает уроки:
     • источники — Википедия и Викитека (только они: строгий белый список);
     • картинки — подбор через Яндекс для слайдов, где остались пустые места;
     • сверка фактов — заново, уже с открытыми источниками;
     • нейросеть — если урок просили собрать «С ИИ», а сети не было: ИИ
       собирает конспект и сохраняет его КОПИЕЙ (ручные правки не трогаются).
   Триггеры: событие «онлайн», открытие сайта, раз в 10 минут, кнопка вручную.
   =================================================================== */
const Sync = (() => {
  "use strict";
  const KEY = "uchu:sync";
  const RULES = { web: "Дополнять уроки источниками (Википедия, Викитека)", images: "Подбирать картинки для пустых мест на слайдах (Яндекс)", verify: "Сверять факты заново", ai: "Доделывать уроки нейросетью, если просили «С ИИ» (копией)" };
  function cfg() { let c = {}; try { c = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { } return { web: c.web !== false, images: c.images !== false, verify: c.verify !== false, ai: c.ai !== false, log: Array.isArray(c.log) ? c.log.slice(-30) : [] }; }
  function save(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { } }
  function note(msg) { const c = cfg(); c.log.push({ at: new Date().toISOString(), msg }); save(c); if (window.Log) Log.add("синхронизация", msg); }

  /* Что в уроке ещё ждёт сети */
  function inspect(L) {
    const p = new Set();
    const d = L.docs || {};
    if (/<!--(WEB|TEXT)-PENDING-->/.test((d.conspect || "") + (d.worksheet || "")) || (d.conspect && !L.web && navigator.onLine === false)) p.add("web");
    if (/\]\(search:[^)]*\)/.test(d.slides || "")) p.add("images");
    if (p.has("web") || (L.verify && L.verify.offline)) p.add("verify");
    if (L.wantAi && L.built !== "ai") p.add("ai");
    L.pending = [...p];
    paint();
    return L.pending;
  }
  const paramsOf = L => ({ ...L.params, plan: L.planFull || null, exFull: L.exFull || [] });

  let busy = false;
  async function processLesson(L, c) {
    const p = paramsOf(L), type = L.params.type || { id: "", name: "" }, done = [];
    let todo = new Set(L.pending || inspect(L));
    if (c.web && todo.has("web")) {
      L.web = null;
      const web = await webData(L, p, type).catch(() => null);
      if (web) {
        if (L.docs.conspect) { const m = L.docs.conspect; L.docs.conspect = m.includes("<!--WEB-PENDING-->") ? applyWeb(m.replace("<!--WEB-PENDING-->", "<!--WEB-->"), "conspect", web) : /## Из открытых источников/.test(m) ? m : applyWeb(m, "conspect", web); }
        if (L.docs.worksheet && L.docs.worksheet.includes("<!--TEXT-PENDING-->")) L.docs.worksheet = applyWeb(L.docs.worksheet.replace("<!--TEXT-PENDING-->", "<!--TEXT-->"), "worksheet", web);
        todo.delete("web"); done.push("источники");
      }
    }
    if (c.images && todo.has("images") && L.docs.slides) {
      const before = (L.docs.slides.match(/\]\(search:/g) || []).length;
      L.docs.slides = await Media.autoFill(L.docs.slides).catch(() => L.docs.slides);
      const after = (L.docs.slides.match(/\]\(search:/g) || []).length;
      if (after < before) done.push(`картинки (${before - after})`);
      if (!after) todo.delete("images");
    }
    if (c.verify && todo.has("verify") && window.Verify && !todo.has("web")) { await Verify.run(L, p).catch(() => null); todo.delete("verify"); done.push("сверка фактов"); }
    if (c.ai && todo.has("ai") && window.UCHU?.configured?.()) {
      try {
        const res = await caps.sample(promptConspect(p), { modelTier: "default", cache: false });
        let md = cleanMd(res.text); md = injectResults(md, p, type, "conspect");
        const copy = { ...JSON.parse(JSON.stringify(L)), id: L.id + "-ai" + Date.now().toString(36), title: L.title + " (доработано ИИ)", built: "ai", wantAi: false, pending: [], docs: { ...L.docs, conspect: md } };
        if (window.Verify) await Verify.run(copy, p).catch(() => null);
        await saveLesson(copy);
        todo.delete("ai"); L.wantAi = false; done.push("версия с ИИ (копией)");
      } catch (e) { console.warn("Sync AI", e); }
    }
    L.pending = [...todo];
    return done;
  }
  async function run({ manual = false } = {}) {
    if (busy || navigator.onLine === false) { if (manual) toast(navigator.onLine === false ? "Нет интернета: доработаю, когда сеть появится." : "Доработка уже идёт."); return; }
    busy = true; paint();
    try {
      const c = cfg(), lessons = await listLessons();
      const queue = lessons.filter(L => (L.pending && L.pending.length) || (manual && inspect(L).length));
      let n = 0;
      for (const L of queue) {
        const done = await processLesson(L, c);
        await saveLesson(L);
        if (done.length) { n++; note(`«${L.title}»: ${done.join(", ")}`); }
        if (state.lesson?.id === L.id) { Object.assign(state.lesson, L); renderLesson(); }
      }
      if (n) toast(`Уроки дополнены материалами из интернета: ${n}.`, 6000);
      else if (manual) toast("Дорабатывать нечего: всё уже собрано.");
    } finally { busy = false; paint(); }
  }

  /* Сохранить всё для работы без интернета: библиотеки Word/PowerPoint/PDF и файлы сайта */
  async function prepareOffline() {
    if (!navigator.serviceWorker?.controller) { toast("Офлайн-режим включится после следующего открытия сайта (нужен HTTPS, как на GitHub Pages)."); return; }
    const urls = Object.values(typeof LIBS !== "undefined" ? LIBS : {}).flat().filter(u => /^https:/.test(u));
    navigator.serviceWorker.controller.postMessage({ type: "precache", urls });
    toast("Сохраняю библиотеки для работы без интернета…", 5000);
  }

  /* Кнопка-индикатор в шапке и окно правил */
  const chip = document.createElement("button"); chip.className = "btn sm ghost"; chip.id = "btnSync"; chip.type = "button"; chip.onclick = () => open();
  async function paint() {
    const off = navigator.onLine === false;
    let n = 0; try { n = (await listLessons()).filter(L => L.pending?.length).length; } catch { }
    chip.textContent = busy ? "⟳ дорабатываю…" : off ? `⚡ без сети${n ? " · " + n : ""}` : n ? `⟳ ждут доработки: ${n}` : "⟳";
    chip.title = off ? "Нет интернета: уроки собираются по локальной базе, доработка — при подключении" : "Автодоработка уроков при подключении к интернету";
    chip.classList.toggle("flame", off);
  }
  function open() {
    const c = cfg();
    const m = openModal(`<div class="dialog"><div class="dlg-h"><h2>Работа без интернета и автодоработка</h2><button class="btn ghost x" data-close aria-label="Закрыть">×</button></div><div class="dlg-b">
      <p class="hint">Без интернета уроки собираются по встроенной базе, ФРП и вашим материалам — они хранятся в браузере. Что требует сети, ставится в очередь; когда интернет появится, сайт доработает уроки сам по правилам ниже. Сейчас: <b>${navigator.onLine === false ? "нет сети" : "сеть есть"}</b>${navigator.serviceWorker?.controller ? ", офлайн-режим включён" : ""}.</p>
      ${Object.entries(RULES).map(([k, t]) => `<label class="check"><input type="checkbox" data-rule="${k}" ${c[k] ? "checked" : ""}> ${t}</label>`).join("")}
      <p class="hint">Строгие рамки: источники — только Википедия и Викитека; картинки — Яндекс; тексты уроков, правленные вами, не перезаписываются (версия с ИИ сохраняется отдельной копией в «Моих уроках»).</p>
      <div class="mat-row"><button class="btn sm flame" id="syRun">Доработать сейчас</button><button class="btn sm ghost" id="syOff">Сохранить всё для работы без интернета</button></div>
      <h3>Журнал</h3>${c.log.length ? `<ul class="small">${c.log.slice().reverse().map(x => `<li>${new Date(x.at).toLocaleString("ru-RU")}: ${esc(x.msg)}</li>`).join("")}</ul>` : `<p class="small">Пока пусто.</p>`}
    </div></div>`);
    m.querySelectorAll("[data-rule]").forEach(i => i.onchange = () => { const n = cfg(); n[i.dataset.rule] = i.checked; save(n); });
    m.querySelector("#syRun").onclick = () => { closeModal(); run({ manual: true }); };
    m.querySelector("#syOff").onclick = prepareOffline;
  }

  // регистрация офлайн-режима (GitHub Pages — HTTPS; локально — localhost)
  if ("serviceWorker" in navigator && (location.protocol === "https:" || /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) && !/[?&]nosw/.test(location.search)) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(e => console.warn("SW", e)));
  }
  window.addEventListener("online", () => { paint(); setTimeout(() => run(), 1500); });
  window.addEventListener("offline", () => { paint(); toast("Нет интернета. Уроки продолжают собираться по встроенной базе; источники и картинки добавятся при подключении.", 7000); });
  // кнопка доработки видна только в режиме разработчика; учителям доработка идёт сама, незаметно
  document.addEventListener("DOMContentLoaded", () => { chip.hidden = true; document.querySelector(".account")?.prepend(chip); paint(); setInterval(() => { chip.hidden = !window.Dev?.on; }, 1500); });
  document.addEventListener("uchu:ready", () => { paint(); if (navigator.onLine !== false) setTimeout(() => run(), 4000); });
  setInterval(() => { if (navigator.onLine !== false) run(); }, 10 * 60 * 1000);
  return { inspect, run, cfg, open, prepareOffline, RULES };
})();
window.Sync = Sync;
