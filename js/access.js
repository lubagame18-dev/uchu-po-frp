/* ===================================================================
   «Учу по ФРП» — доступ: тарифы и промокод.
   Коммерческая версия (UCHU_SITE.commercial = true):
     • без тарифа (бесплатно) — 3 урока без ИИ в месяц; ИИ сайта — по лимиту бесплатного уровня;
     • «Учитель» — уроки без ИИ без ограничений, облако;
     • «Учитель + ИИ», «Методист» — плюс ИИ сайта (расход считает сервер);
     • ПРОМОКОД — «свободная зона»: все тарифы обнуляются, всё бесплатно, а ИИ человек
       подключает сам («⚙ ИИ»: свои ключи, любые нейросети) — как в некоммерческой версии.
   Промокод проверяется по хэшу (data/promo.js); при входе в кабинет — ещё и на сервере.
   =================================================================== */
const Access = (() => {
  "use strict";
  const KEY = "uchu:access", SALT = "uchu-promo:";
  const site = () => window.UCHU_SITE || {};
  const commercial = () => site().commercial === true;
  let A = {}; try { A = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(A)); } catch { } paint(); };
  // регистр, пробелы и похожие русские буквы (Р, С, А, В, Е, К, М, Н, О, Т, Х, У) не важны
  const LOOK = { А: "A", В: "B", Е: "E", Ё: "E", К: "K", М: "M", Н: "H", О: "O", Р: "P", С: "C", Т: "T", Х: "X", У: "Y" };
  const norm = c => String(c || "").toUpperCase().replace(/\s+/g, "").replace(/^ФРП/, "FRP").replace(/[АВЕЁКМНОРСТХУ]/g, ch => LOOK[ch]).replace(/[–—]/g, "-");
  async function sha(t) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join(""); }
  const hashes = () => [].concat(window.UCHU_PROMO || []);
  const PLANS = {
    free: { name: "Бесплатный", price: 0, lessons: 3, ai: false, list: ["3 урока в месяц", "техкарта, презентация, рабочий лист", "уроки сохраняются в личном кабинете"] },
    basic: { name: "Учитель", price: 300, lessons: Infinity, ai: false, list: ["уроки без ограничений", "скачивание в Word, PDF, PowerPoint", "все уроки — в личном кабинете"] },
    ai: { name: "Учитель + ИИ", price: 500, lessons: Infinity, ai: true, list: ["всё из тарифа «Учитель»", "50 уроков с ИИ в месяц", "подробные конспекты и правки по запросу"] },
    pro: { name: "Методист", price: 900, lessons: Infinity, ai: true, list: ["всё из тарифа «Учитель + ИИ»", "120 уроков с ИИ в месяц", "приоритетная поддержка"] }
  };

  /* Текущий уровень: промокод > тариф кабинета > бесплатный. В некоммерческой версии — всё открыто. */
  /* Разработчик (вход по паролю разработчика, в том числе запомненный) — всё открыто без промокодов */
  const isDev = () => !!(window.Dev?.on || window.Dev?.remembered?.());
  const me = () => (window.Account?.session?.email || "").toLowerCase();
  function level() {
    if (!commercial() || isDev()) return "dev";
    const p = window.Account?.session?.plan;
    if (p === "promo" || (A.promo && me() && A.promo.email === me())) return "promo"; // промокод — только у вошедшего, за своей почтой
    return PLANS[p] ? p : "free";
  }
  const label = () => { const L = level(); return L === "dev" ? "разработчик" : L === "promo" ? "по промокоду" : `тариф «${PLANS[L].name}»`; };
  const free = () => level() === "dev" || level() === "promo";
  const ownAi = () => free();                   // свои ключи и любые нейросети — только в свободной зоне
  const aiAllowed = () => free() || !!PLANS[level()].ai;
  const month = () => new Date().toISOString().slice(0, 7);
  function lessonsLeft() { const L = level(); if (free()) return Infinity; const lim = PLANS[L].lessons; if (lim === Infinity) return Infinity; const used = A.month === month() ? A.used || 0 : 0; return Math.max(0, lim - used); }
  function countLesson() { if (free() || PLANS[level()].lessons === Infinity) return; if (A.month !== month()) { A.month = month(); A.used = 0; } A.used = (A.used || 0) + 1; save(); }
  /* Перед сборкой урока: можно ли? Если нет — показываем тарифы */
  function canBuild(useAi) {
    if (useAi && !aiAllowed()) { open("Уроки с ИИ — в тарифах «Учитель + ИИ» и «Методист»."); return false; }
    if (!useAi && lessonsLeft() <= 0) { open("Бесплатные уроки на этот месяц закончились. Выберите тариф."); return false; }
    return true;
  }
  async function applyPromo(code) {
    const h = await sha(SALT + norm(code));
    let ok = hashes().includes(h);
    // при входе в кабинет — проверка и на сервере (там промокод закрепляется за учётной записью)
    const fn = window.UCHU_AI_CFG?.yandexFn || site().yandexFunction, tok = window.Account?.session?.access;
    if (fn && tok) { try { const base = fn.replace(/\/+$/, ""), u = /functions\.yandexcloud\.net/.test(base) ? `${base}?path=${encodeURIComponent("/promo")}` : base + "/promo"; const r = await fetch(u, { method: "POST", headers: { "Content-Type": "application/json", "X-User-Token": tok }, body: JSON.stringify({ code: norm(code), messages: [] }) }); if (r.ok) ok = true; } catch { } }
    if (!ok) return false;
    A.promo = { at: new Date().toISOString(), h: h.slice(0, 12), email: me() }; save();
    return true;
  }
  function leavePromo() { delete A.promo; save(); }

  /* ---------- окно тарифов ---------- */
  function open(reason) {
    const L = level(), cur = L === "dev" || L === "promo" ? null : L;
    const m = openModal(`<div class="dialog wide tr-dlg"><div class="dlg-h"><h2>Тарифы</h2><button class="btn ghost x" data-close aria-label="Закрыть">×</button></div><div class="dlg-b">
      ${reason ? `<p class="tr-reason">${esc(reason)}</p>` : ""}
      ${L === "dev" ? `<p class="tr-now ok">Доступ разработчика.</p>` : L === "promo" ? `<p class="tr-now ok">Доступ по промокоду.</p>` : PLANS[L].lessons !== Infinity ? `<p class="tr-now">Осталось уроков в этом месяце: <b>${lessonsLeft()}</b></p>` : ""}
      <div class="tr-grid">${Object.entries(PLANS).map(([k, p]) => `<article class="tr-card ${k === cur ? "on" : ""}">${k === cur ? `<span class="tr-badge">ваш тариф</span>` : ""}<div class="tr-in"><h3>${p.name}</h3><div class="tr-price">${p.price ? `${p.price} ₽<small>/мес</small>` : "0 ₽"}</div><ul>${p.list.map(x => `<li>${esc(x)}</li>`).join("")}</ul>${k === cur ? `<span class="tr-cur">Подключён сейчас</span>` : k === "free" ? "" : `<button class="btn sm flame" data-buy="${k}">Выбрать</button>`}</div></article>`).join("")}</div>
      ${!me() ? `<div class="tr-promo"><b>Промокод</b><span class="small">Чтобы ввести промокод, войдите в личный кабинет.</span><button type="button" class="btn sm" id="trLogin">Войти или зарегистрироваться</button></div>` : L === "dev" || L === "promo" ? "" : `<form class="tr-promo" id="trPromo"><label for="trCode"><b>Промокод</b></label><div class="row-btn"><input type="text" id="trCode" autocomplete="off" spellcheck="false" placeholder="Введите промокод"><button class="btn sm" type="submit">Применить</button></div><span class="small" id="trMsg" role="status"></span></form>`}
    </div></div>`);
    m.querySelectorAll("[data-buy]").forEach(b => b.onclick = () => buy(b.dataset.buy, m));
    const lg = m.querySelector("#trLogin"); if (lg) lg.onclick = () => { closeModal(); Access.wantPromo = true; window.Account?.open(); };
    if (m.querySelector("#trPromo")) m.querySelector("#trPromo").onsubmit = async e => {
      e.preventDefault(); const msg = m.querySelector("#trMsg"), code = m.querySelector("#trCode").value;
      if (!code.trim()) return; msg.textContent = "Проверяю…";
      if (await applyPromo(code)) { closeModal(); toast("Промокод принят.", 5000); }
      else msg.textContent = "Такого промокода нет. Проверьте написание.";
    };
  }
  function buy(plan, m) {
    if (!window.Account?.ready()) { toast("Оплата появится, когда будет подключён личный кабинет. Пока можно пользоваться бесплатно или по промокоду.", 7000); return; }
    if (!window.Account.session) { closeModal(); window.Account.open(); toast("Сначала войдите в личный кабинет — тариф закрепляется за вашей почтой.", 6000); return; }
    const url = site().payUrl;
    if (!url) { toast("Оплата скоро появится. Пока можно пользоваться бесплатно или по промокоду.", 7000); return; }
    location.href = `${url}${url.includes("?") ? "&" : "?"}plan=${encodeURIComponent(plan)}&email=${encodeURIComponent(window.Account.session.email)}`;
  }
  /* ---------- шапка: кнопка «⚙ ИИ» только в свободной зоне; метка тарифа ---------- */
  function paint() {
    const ai = document.getElementById("btnAi"); if (ai) ai.hidden = commercial() && !ownAi();
    let b = document.getElementById("btnPlan");
    if (!b && commercial()) { b = document.createElement("button"); b.type = "button"; b.id = "btnPlan"; b.className = "btn sm ghost"; b.onclick = () => open(); document.querySelector(".account")?.prepend(b); }
    if (b) { const L = level(); b.textContent = L === "dev" ? "🔧 Разработчик" : L === "promo" ? "🎟 Промокод" : `💳 ${PLANS[L].name}`; b.title = "Тарифы и промокод"; b.hidden = !commercial(); }
  }
  document.addEventListener("DOMContentLoaded", () => setTimeout(paint, 0));
  document.addEventListener("uchu:ready", paint);
  return { level, label, isDev, wantPromo: false, ownAi, aiAllowed, canBuild, countLesson, lessonsLeft, applyPromo, leavePromo, open, paint, PLANS, sha: s => sha(SALT + norm(s)), commercial };
})();
window.Access = Access;
