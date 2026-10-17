/* ===================================================================
   «Учу по ФРП» — методические источники и авторы.
   Неприметная серая ссылка внизу сайта открывает «книгу» с перелистыванием:
   учёные и методисты, учебники и пособия, разработки студентов, программы.
   =================================================================== */
const Credits = (() => {
  "use strict";
  const PAGES = [
    { kind: "cover", title: "С благодарностью", text: "Конспекты, вопросы и задания на этом сайте собраны с опорой на методические наработки учёных, учителей и студентов. Их идеи и находки — основа каждого урока.", sign: "Перелистните страницу →" },
    { title: "Создатель сайта", items: [["Гладышева Любовь", "автор и создатель сайта «Учу по ФРП»"]] },
    { title: "Учёные и методисты", note: "Методические наработки.", items: [
      ["Адаева Ольга Борисовна", ""],
      ["Глухих Н.", ""],
      ["Казачук И.", ""],
      ["Терентьева Нина Павловна", ""]
    ] },
    { title: "Учебники и пособия", note: "Учебники, рабочие тетради и пособия.", items: [
      ["Баранов М.", ""],
      ["Вовк С.", ""],
      ["Ладыженская Т.", ""],
      ["Санникова М.", ""],
      ["Сухих И.", ""],
      ["Тростенцова Л.", ""],
      ["Фефилова Г.", ""]
    ] },
    { title: "Студенты", note: "Методические наработки.", items: [
      ["Детинина Анастасия", ""],
      ["Лукьянова Арина", ""],
      ["Малыгина Алина", ""],
      ["Подорова Антонина", ""],
      ["Рожкова Елизавета", ""],
      ["Якимович Лада", ""]
    ] },
    { title: "Программы и открытые источники", items: [
      ["Федеральные рабочие программы", "«Русский язык», «Литература»"],
      ["Викитека", "тексты произведений"],
      ["Википедия", "справки"],
      ["Викисклад", "иллюстрации"]
    ], foot: "Если вы узнали здесь свою работу и хотите уточнить подпись — напишите создателю сайта. Спасибо всем, чей труд вошёл в этот сайт." }
  ];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function pageHtml(p, i) {
    if (p.kind === "cover") return `<div class="cr-cover"><div class="cr-orn" aria-hidden="true">✦</div><h2>${esc(p.title)}</h2><p>${esc(p.text)}</p><p class="cr-sign">${esc(p.sign)}</p></div>`;
    return `<h2>${esc(p.title)}</h2>${p.note ? `<p class="cr-note">${esc(p.note)}</p>` : ""}<ul class="cr-list">${p.items.map(([n, d], k) => `<li style="--k:${k}"><b>${esc(n)}</b>${d ? `<span>${esc(d)}</span>` : ""}</li>`).join("")}</ul>${p.foot ? `<p class="cr-foot">${esc(p.foot)}</p>` : ""}<div class="cr-num">${i + 1}</div>`;
  }
  function open() {
    document.querySelector(".cr-wrap")?.remove();
    const w = document.createElement("div"); w.className = "cr-wrap"; w.setAttribute("role", "dialog"); w.setAttribute("aria-modal", "true"); w.setAttribute("aria-label", "Методические источники и авторы");
    w.innerHTML = `<div class="cr-book"><button class="cr-x" aria-label="Закрыть">×</button>
      <div class="cr-pages">${PAGES.map((p, i) => `<section class="cr-page" data-i="${i}">${pageHtml(p, i)}</section>`).join("")}</div>
      <div class="cr-nav"><button class="cr-prev" aria-label="Предыдущая страница">‹</button><span class="cr-dots">${PAGES.map((_, i) => `<button data-go="${i}" aria-label="Страница ${i + 1}"></button>`).join("")}</span><button class="cr-next" aria-label="Следующая страница">›</button></div></div>`;
    document.body.appendChild(w);
    let cur = 0;
    const pages = [...w.querySelectorAll(".cr-page")], dots = [...w.querySelectorAll("[data-go]")];
    const show = (k, dir) => {
      k = Math.max(0, Math.min(PAGES.length - 1, k)); if (k === cur && dir) return;
      pages.forEach((p, i) => { p.classList.toggle("on", i === k); p.classList.toggle("past", i < k); p.classList.toggle("flip-f", dir > 0 && i === k); p.classList.toggle("flip-b", dir < 0 && i === k); });
      dots.forEach((d, i) => d.setAttribute("aria-current", i === k ? "true" : "false"));
      w.querySelector(".cr-prev").disabled = k === 0; w.querySelector(".cr-next").disabled = k === PAGES.length - 1;
      cur = k;
    };
    const close = () => { w.classList.add("bye"); setTimeout(() => w.remove(), 220); document.removeEventListener("keydown", key); };
    const key = e => { if (e.key === "Escape") close(); if (e.key === "ArrowRight") show(cur + 1, 1); if (e.key === "ArrowLeft") show(cur - 1, -1); };
    document.addEventListener("keydown", key);
    w.querySelector(".cr-x").onclick = close;
    w.onclick = e => { if (e.target === w) close(); };
    w.querySelector(".cr-prev").onclick = () => show(cur - 1, -1);
    w.querySelector(".cr-next").onclick = () => show(cur + 1, 1);
    dots.forEach(d => d.onclick = () => show(+d.dataset.go, +d.dataset.go > cur ? 1 : -1));
    // перелистывание пальцем
    let x0 = null; const box = w.querySelector(".cr-pages");
    box.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; }, { passive: true });
    box.addEventListener("touchend", e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) show(cur + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1); x0 = null; });
    show(0, 0);
    w.querySelector(".cr-next").focus();
  }
  /* Ссылка — в общем подвале сайта (рядом с «Режим разработчика»); если подвала ещё нет — свой маленький подвал */
  function mount() {
    if (document.getElementById("creditsLink")) return;
    const b = document.createElement("button"); b.type = "button"; b.id = "creditsLink"; b.className = "foot-link"; b.textContent = "Методические источники и авторы"; b.onclick = open;
    const host = document.querySelector(".site-foot .wrap");
    if (host) { host.appendChild(b); return; }
    const f = document.createElement("footer"); f.className = "site-foot cr-foot-only"; f.appendChild(b); document.body.appendChild(f);
    setTimeout(() => { const h = document.querySelector(".site-foot:not(.cr-foot-only) .wrap"); if (h) { h.appendChild(b); f.remove(); } }, 0);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
  return { open, PAGES };
})();
window.Credits = Credits;
