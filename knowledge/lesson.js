(function () {
  "use strict";
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const q = new URLSearchParams(location.search);
  const subject = q.get("subject") || "", grade = q.get("grade") || "", n = q.get("n") || "";
  const url = p => new URL("../" + String(p).replace(/^\/+/, ""), location.href).href;
  let imgs = [], idx = 0;
  const md = t => { try { return window.marked?.parse ? marked.parse(t) : `<pre>${esc(t)}</pre>`; } catch { return `<pre>${esc(t)}</pre>`; } };
  function paintImage() {
    const im = $("#lsImage"), empty = $("#lsEmpty");
    if (!imgs.length) { im.style.display = "none"; empty.style.display = "block"; $("#lsCounter").textContent = "0 / 0"; $("#lsCaption").textContent = "Для этого урока изображения ещё не подобраны."; $("#lsSource").textContent = ""; return; }
    const it = imgs[idx]; im.style.display = "none"; empty.style.display = "none";
    if (it.image) {
      im.src = url(it.image); im.style.display = "block";
      im.onerror = () => { im.style.display = "none"; empty.style.display = "block"; $("#lsCaption").textContent = "Файл изображения не найден."; };
    } else {
      empty.style.display = "block";
    }
    $("#lsCounter").textContent = `${idx + 1} / ${imgs.length}`;
    $("#lsCaption").textContent = it.caption || it.role || "Изображение к уроку";
    $("#lsSource").textContent = it.table_title ? "Готовая таблица: " + it.table_title : (it.role === "table" ? "" : "Планируемое изображение по теме урока");
  }
  async function load() {
    if (!subject || !grade || !n) { $("#lsBody").innerHTML = "<p>Не указан урок.</p>"; return; }
    try {
      const r = await fetch(`frp/${encodeURIComponent(subject)}/${encodeURIComponent(grade)}/${encodeURIComponent(n)}/lesson.json`, { cache: "no-store" });
      if (!r.ok) throw new Error("нет lesson.json");
      const L = await r.json();
      $("#lsTitle").textContent = L.topic || "Урок";
      $("#lsMeta").textContent = `${L.subject_title || subject} · ${L.grade} класс · ${L.section || "ФРП"}`;
      imgs = Array.isArray(L.images) && L.images.length ? L.images : (L.image ? [{ order: 1, image: L.image, caption: L.table_title || L.topic }] : []);
      idx = 0; paintImage();
      $("#lsBody").innerHTML = L.text ? md(L.text) : `<div class="empty-base"><b>Текстовая база для этого урока ещё не заполнена.</b><br>Здесь будет таблица-подспорье после привязки готового текста. Сейчас изображение и структура урока уже созданы.</div>`;
    } catch (e) { $("#lsBody").innerHTML = `<p>Не удалось загрузить урок: ${esc(e.message)}</p>`; }
  }
  $("#lsPrev").onclick = () => { if (imgs.length) { idx = (idx - 1 + imgs.length) % imgs.length; paintImage(); } };
  $("#lsNext").onclick = () => { if (imgs.length) { idx = (idx + 1) % imgs.length; paintImage(); } };
  load();
})();
