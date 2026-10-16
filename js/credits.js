/* ===================================================================
   «Учу по ФРП» — методические источники и авторы.
   Неприметная серая ссылка внизу сайта открывает «книгу» с перелистыванием:
   учёные и методисты, учебники и пособия, разработки студентов, программы.
   =================================================================== */
const Credits = (() => {
  "use strict";
  const PAGES = [
    { kind: "cover", title: "С благодарностью", text: "Конспекты, вопросы и задания на этом сайте собраны с опорой на труды учёных-методистов, учителей и студентов. Их идеи, находки и разработки — основа каждого урока.", sign: "Перелистните страницу →" },
    { title: "Учёные и методисты", items: [
      ["Адаева Ольга Борисовна", "рабочие тетради по русскому языку для 5, 7, 8 классов"],
      ["Терентьева Нина Павловна", "методика преподавания литературы; статья «Эмоциональный интеллект на уроке лирики» (в соавторстве) — «Литература в школе», 2024, № 4"],
      ["Казачук И. Г., Глухих Н. В.", "«Русский язык. Морфология. Имя существительное», учебно-практическое пособие (ЮУрГГПУ, 2024)"]
    ] },
    { title: "Учебники и пособия", items: [
      ["Сухих И. Н.", "учебники, рабочие тетради и книги для учителя по литературе, 7–9 классы"],
      ["Фефилова Г. Е.", "«Литература. Планы-конспекты для 105 уроков», 10 и 11 классы"],
      ["Вовк С. М. и соавторы", "«Я иду на урок»: разработки уроков русского языка"],
      ["Ладыженская Т. А., Баранов М. Т.", "учебники русского языка, к которым составлены рабочие тетради"],
      ["Тростенцова Л. А.", "учебник русского языка, 8 класс"],
      ["Санникова М. Г.", "рабочие тетради по русскому языку, 8 класс (с О. Б. Адаевой)"],
      ["Шапиро", "«Тексты для занятий по синтаксису и пунктуации»"],
      ["«Парус и шёпот»", "материалы по литературе"],
      ["Исполнительский анализ", "методический материал: А. С. Пушкин, «Анчар»"]
    ] },
    { title: "Разработки студентов", note: "Конспекты, анализы и фрагменты уроков, на которых система училась строить уроки.", items: [
      ["Гладышева Л. И.", "фрагмент урока (презентация)"],
      ["Подорова Антонина Сергеевна", "монографический урок: В. В. Маяковский, «Послушайте!»"],
      ["Рожкова Елизавета", "комментированное чтение: А. С. Пушкин, «Капитанская дочка», глава «Сирота»"],
      ["Якимович Лада, Детинина Анастасия", "анализ стихотворения В. В. Маяковского «Во весь голос»; проект «Поэт в России — больше, чем поэт»"],
      ["Малыгина Алина", "исполнение стихотворения В. В. Маяковского в проекте о поэте и поэзии"],
      ["Лукьянова", "урок по любовной лирике А. А. Ахматовой («Песня последней встречи»)"]
    ] },
    { title: "Программы и открытые источники", items: [
      ["Федеральные рабочие программы", "основного и среднего общего образования: «Русский язык», «Литература» — результаты, темы, планирование"],
      ["Викитека", "тексты произведений"],
      ["Википедия", "справки об авторах и понятиях"],
      ["Викисклад", "иллюстрации с указанием художника и названия"]
    ], foot: "Если вы узнали здесь свою работу и хотите уточнить подпись — напишите автору сайта. Спасибо всем, чей труд вошёл в этот сайт." }
  ];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function pageHtml(p, i) {
    if (p.kind === "cover") return `<div class="cr-cover"><div class="cr-orn" aria-hidden="true">✦</div><h2>${esc(p.title)}</h2><p>${esc(p.text)}</p><p class="cr-sign">${esc(p.sign)}</p></div>`;
    return `<h2>${esc(p.title)}</h2>${p.note ? `<p class="cr-note">${esc(p.note)}</p>` : ""}<ul class="cr-list">${p.items.map(([n, d], k) => `<li style="--k:${k}"><b>${esc(n)}</b><span>${esc(d)}</span></li>`).join("")}</ul>${p.foot ? `<p class="cr-foot">${esc(p.foot)}</p>` : ""}<div class="cr-num">${i + 1}</div>`;
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
  function mount() {
    if (document.getElementById("creditsLink")) return;
    const f = document.createElement("footer"); f.className = "site-foot";
    f.innerHTML = `<button type="button" id="creditsLink" class="foot-link">Методические источники и авторы</button>`;
    document.body.appendChild(f);
    f.querySelector("#creditsLink").onclick = open;
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
  return { open, PAGES };
})();
window.Credits = Credits;
