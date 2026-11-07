(function () {
  "use strict";
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const q = new URLSearchParams(location.search);
  const subject = q.get("subject") || "", grade = q.get("grade") || "", n = q.get("n") || "";
  const root = new URL("../", location.href);
  const url = p => new URL("../" + String(p).replace(/^\/+/, ""), location.href).href;
  function md(t) { try { return window.marked?.parse ? marked.parse(t) : `<pre>${esc(t)}</pre>`; } catch { return `<pre>${esc(t)}</pre>`; } }
  async function load() {
    if (!subject || !grade || !n) { $("#lsBody").innerHTML = "<p>Не указан урок.</p>"; return; }
    try {
      const r = await fetch(`frp/${encodeURIComponent(subject)}/${encodeURIComponent(grade)}/${encodeURIComponent(n)}/lesson.json`, { cache: "no-store" });
      if (!r.ok) throw new Error("нет lesson.json");
      const L = await r.json();
      $("#lsTitle").textContent = L.topic || "Урок";
      $("#lsMeta").textContent = `${L.subject_title || subject} · ${L.grade} класс · ${L.section || "ФРП"}`;
      const img = $("#lsImage");
      if (L.image) {
        img.src = url(L.image); img.style.display = "block"; $("#lsEmpty").style.display = "none";
        img.onerror = () => { img.style.display = "none"; $("#lsEmpty").style.display = "block"; $("#lsCaption").textContent = "Файл изображения не найден."; };
        $("#lsCaption").textContent = L.table_title || L.topic || "";
        $("#lsSource").textContent = L.text_source ? "Текстовая база: " + L.text_source : "";
      } else {
        img.style.display = "none"; $("#lsEmpty").style.display = "block";
        $("#lsCaption").textContent = "Для этого урока изображение ещё не подобрано.";
      }
      if (L.text) {
        $("#lsBody").innerHTML = md(L.text);
      } else {
        $("#lsBody").innerHTML = `<div class="empty-base"><b>Текстовая база для этого урока ещё не заполнена.</b><br>Здесь будет таблица-подспорье после привязки готового текста. Сейчас изображение и структура урока уже созданы.</div>`;
      }
      $("#lsCounter").textContent = `${L.grade} класс · ${L.order} урок`;
    } catch (e) {
      $("#lsBody").innerHTML = `<p>Не удалось загрузить урок: ${esc(e.message)}</p>`;
    }
  }
  load();
})();
