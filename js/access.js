/* ===================================================================
   «Учу по ФРП» — доступ: тарифы и промокод.
   Коммерческая версия (UCHU_SITE.commercial = true):
     • пробный доступ (2 дня) — 2 урока с ИИ за пробный период, ИИ доступен, картинки нет;
     • «С ИИ» — 400 ₽/мес или «С ИИ, год» — 3900 ₽/год: всё доступно (техкарта, контроль,
       памятки, домашние задания, конспекты и правки с ИИ, листы с картинками, доп. листы,
       выгрузка, облако), 50 уроков с ИИ в месяц; расход ИИ считает сервер;
     • докупка уроков с ИИ: пакеты и своё количество (1–200), цену считает только сервер;
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
  /* Привилегии тарифов: иконка + текст (иконки — яркие плоские значки в цветных кругах) */
  const F = {
    lesson: ["📘", "#6b2bd9", "Конспект урока — удобно печатать"], tech: ["📋", "#2f8f5b", "Технологическая карта по ФРП, контроль, памятки и домашние задания"], slides: ["🖥️", "#f05aa6", "Презентация — красивая, с анимацией"], sheet: ["📝", "#ff9f1c", "Рабочий лист, памятка, самостоятельная и д/з"],
    cloud: ["☁️", "#2fa6e8", "Все уроки — в личном кабинете"], download: ["⬇️", "#2f8f5b", "Скачивание: Word, PDF, PowerPoint"], unlim: ["♾️", "#6b2bd9", "Уроки без ограничений"],
    ai: ["✨", "#f05aa6", "ИИ пишет подробный конспект и правит листы по вашей просьбе"], ai50: ["🤖", "#a43fd0", "50 уроков с ИИ в месяц"],
    pics: ["🎨", "#f05aa6", "Красивые рабочие листы с картинками: 6 в месяц"],
    pics40: ["🎨", "#f05aa6", "Красивые рабочие листы с картинками: без ограничений"],
    more: ["➕", "#ff9f1c", "Докупка уроков с ИИ: пакеты или любое количество — 7 ₽ за урок"], own: ["🔑", "#a43fd0", "Своя нейросеть: подключаете свой ключ"], three: ["🎁", "#2f8f5b", "2 урока с ИИ за пробный период — со всеми функциями"]
  };
  const PLANS = {
  dev: { name: "Разработчик", price: 0, lessons: Infinity, extraSheets: 999, ai: true, img: true, imgQuota: 999, hidden: true, art: "🛠", tag: "разработчик", feats: ["unlim", "ai", "pics40", "more", "download", "cloud"] },
    free: { name: "Пробный доступ", price: 0, lessons: 2, trialDays: 2, extraSheets: 0, ai: true, img: false, imgQuota: 0, hidden: true, art: "🎁", tag: "2 урока с ИИ за пробный период", feats: ["three", "ai", "lesson", "slides", "sheet", "download", "cloud"] },
    ai: { name: "С ИИ", price: 400, period: "мес", lessons: 50, ai: true, img: true, imgQuota: 6, extraSheets: 20, art: "✨", tag: "всё с ИИ", feats: ["tech", "ai", "ai50", "pics", "more", "download", "cloud"] },
    aiYear: { name: "С ИИ, год", price: 3900, period: "год", days: 365, lessons: 50, ai: true, img: true, imgQuota: 6, extraSheets: 20, art: "✨", tag: "год, −19%", feats: ["tech", "ai", "ai50", "pics", "more", "download", "cloud"] }

  };
  const PACKS = { ai10: { name: "+10 уроков с ИИ", price: 70, lessons: 10 }, ai30: { name: "+30 уроков с ИИ", price: 190, lessons: 30 }, ai50: { name: "+50 уроков с ИИ", price: 300, lessons: 50 } };
  /* Докупка своего количества: 1–200 уроков, цена max(70, ceil(n×7)) ₽ — окончательную сумму считает сервер (proxy/payments.js) */
  const CUSTOM = { min: 1, max: 200, per: 7, minPrice: 70 }, CUSTOM_DEFAULT = 10;
  const customPrice = n => Math.max(CUSTOM.minPrice, Math.ceil(n * CUSTOM.per));
  /* Служебный «полный доступ» для промокода: все функции и без лимитов; в витрине тарифов не показывается */
  const FULL = { name: "Всё открыто", price: 0, lessons: Infinity, extraSheets: Infinity, ai: true, img: true, imgQuota: Infinity, tech: true, feats: [] };
  const planOf = k => PLANS[k] || (k === "promoFree" ? FULL : PLANS.free);
  try { const dc = JSON.parse(localStorage.getItem("uchu:dev:cfg") || "null"); if (dc) { for (const k of Object.keys(dc.prices || {})) if (PLANS[k] && +dc.prices[k] > 0) PLANS[k].price = +dc.prices[k]; window.UCHU_DEV_CFG = dc; } } catch { }


  /* Текущий уровень: промокод > тариф кабинета > бесплатный. В некоммерческой версии — всё открыто. */
  /* Разработчик (вход по паролю разработчика, в том числе запомненный) — всё открыто без промокодов */
  // «Посмотреть как учитель»: разработчик временно видит сайт как обычный учитель (до закрытия вкладки)
  const asTeacher = () => { try { return sessionStorage.getItem("uchu:as-teacher") === "1"; } catch { return false; } };
  const isDev = () => !asTeacher() && !!(window.Dev?.on || window.Dev?.remembered?.());
  const me = () => (window.Account?.session?.email || "").toLowerCase();
  /* Уровень = тариф (промокод скидки — отдельная отметка: свой процент и своя нейросеть; код бесплатного доступа — всё открыто) */
  function level() {
    if (!commercial() || isDev()) return "dev";
    if (window.Account?.session?.promoFree && me()) return "promoFree"; // бесплатный доступ по промокоду — все возможности (служебный уровень FULL, не тариф витрины)
    const p = window.Account?.session?.plan;
    // старые тарифы («Без ИИ» / «Без ИИ, год» / «Методист») переводим на «С ИИ»: действующие подписчики не теряют доступ
    if (p === "basic" || p === "basicYear" || p === "pro") return "ai";
    // отметка «скидка по промокоду»: тариф «С ИИ», ИИ — своя нейросеть (ключ требует isPromo)
    if (p === "promo") return "ai";
    return PLANS[p] ? p : "free";
  }
  // промокод — только у вошедшего, закреплён за его почтой
  const promoFree = () => !isDev() && !!me() && !!window.Account?.session?.promoFree;
  const isPromo = () => !isDev() && !!me() && !promoFree() && (!!window.Account?.session?.promo || window.Account?.session?.plan === "promo" || (!!A.promo && A.promo.email === me()));
  const pct = () => Math.max(1, Math.min(99, +window.Account?.session?.promoPct || +A.promo?.pct || 50)); // скидку задаёт тот, кто выдал код
  /* синхронизация бесплатного доступа с сервером (один аккаунт — один доступ) */
  async function syncTrial() {
    const tk = window.Account?.session?.access; if (!tk) return;
    try {
      const r = await fetch("https://functions.yandexcloud.net/d4ek0q8grbhn7q5muf24?path=/trial/status", { headers: { "X-User-Token": tk } });
      const j = await r.json();
      if (!r.ok || !j || !j.ok) return;
      if (j.startAt) { A.trialStart = j.startAt; A.day = j.dayIndex; A.dayUsed = j.usedToday; A.trialExpired = !!j.expired; save(); }
    } catch { }
  }
  document.addEventListener("uchu:auth", () => { syncTrial(); });
  if (document.readyState !== "loading") setTimeout(syncTrial, 1200); else document.addEventListener("DOMContentLoaded", () => setTimeout(syncTrial, 1200));

  /* живой счётчик пробного периода в окне тарифов */
  if (!window.__trialTick) {
    window.__trialTick = setInterval(() => {
      const el = document.getElementById("trialLeft"); if (!el) return;
      const st = A.trialStart, days = PLANS.free.trialDays || 2;
      if (!st) { el.textContent = "—"; return; }
      const ms = st + days * 86400000 - Date.now();
      if (ms <= 0) { el.textContent = "0"; el.closest("p")?.classList.add("expired"); return; }
      const h = Math.floor(ms / 3600000);
      el.textContent = h >= 24 ? Math.floor(h / 24) + " д " + (h % 24) + " ч" : h + " ч " + Math.floor(ms % 3600000 / 60000) + " мин";
    }, 30000);
  }

  const priceOf = k => { const P = PLANS[k] || PACKS[k]; return P ? (isPromo() ? Math.round(P.price * (1 - pct() / 100)) : P.price) : 0; };
  const label = () => { const L = level(); return L === "dev" ? "разработчик" : promoFree() ? "бесплатный доступ по промокоду" : `тариф «${planOf(L).name}»${isPromo() ? ` · промокод −${pct()}%` : ""}`; };
  const free = () => level() === "dev";
  // свои ключи: разработчику — любые; по промокоду — одна своя нейросеть на тарифе с ИИ
  const ownAi = () => free() || (isPromo() && !!planOf(level()).ai);
  const aiAllowed = () => free() || !!planOf(level()).ai;
  /* техкарта, контроль, памятки и д/з входят в «С ИИ» и «С ИИ, год» (а также разработчику и по промокоду) */
  const techAllowed = () => free() || promoFree() || !!planOf(level()).ai;
  const imagesAllowed = () => free() || !!planOf(level()).img;
  const month = () => new Date().toISOString().slice(0, 7);
  /* Пробные уроки: общий расход за весь пробный период, без суточного сброса */
  function trialUsed() {
    if (A.trialUsed === undefined) { A.trialUsed = A.dayUsed || 0; save(); }
    return Math.max(0, +A.trialUsed || 0);
  }
  function lessonsLeft() { const L = level(); if (L === "free") { const used = trialUsed(), max = PLANS.free.lessons || 2, days = PLANS.free.trialDays || 2; if (A.trialStart && Date.now() - A.trialStart >= days * 86400000) return 0; if (used >= max) return 0; return Math.max(0, max - used); } const lim = planOf(L).lessons; if (lim === Infinity) return Infinity; const used = A.month === month() ? A.used || 0 : 0; return Math.max(0, lim - used); }
  /* картинки для листов: лимит в месяц по тарифу (на сайте считается в браузере; настоящий лимит ставит серверная функция) */
  const imageLeft = () => { if (free()) return Infinity; const q = planOf(level()).imgQuota || 0; if (A.imgMonth !== month()) return q; return Math.max(0, q - (A.imgUsed || 0)); };
  function countImage(n = 1) { if (free()) return; if (A.imgMonth !== month()) { A.imgMonth = month(); A.imgUsed = 0; } A.imgUsed = (A.imgUsed || 0) + n; save(); }
  /* дополнительные листы сверх базовых двух страниц: свой месячный лимит (на сервере его ставят так же) */
  const sheetsLeft = () => { if (free()) return Infinity; const q = planOf(level()).extraSheets || 0; if (A.shMonth !== month()) return q; return Math.max(0, q - (A.shUsed || 0)); };
  function countSheet(n = 1) { if (free()) return; if (A.shMonth !== month()) { A.shMonth = month(); A.shUsed = 0; } A.shUsed = (A.shUsed || 0) + n; save(); }
  function countLesson() { if (free() || level() === "free") { const used = trialUsed(); if (!A.trialStart) { A.trialStart = Date.now(); A.day = 0; A.dayUsed = 0; } const d = Math.floor((Date.now() - A.trialStart) / 86400000); if (A.day !== d) { A.day = d; A.dayUsed = 0; } A.trialUsed = used + 1; A.dayUsed = (A.dayUsed || 0) + 1; save(); try { const tk = window.Account?.session?.access; if (tk) fetch("https://functions.yandexcloud.net/d4ek0q8grbhn7q5muf24?path=/trial/use", { method: "POST", headers: { "X-User-Token": tk } }).catch(() => null); } catch { } return; } if (planOf(level()).lessons === Infinity) return; if (A.month !== month()) { A.month = month(); A.used = 0; } A.used = (A.used || 0) + 1; save(); }
  /* Перед сборкой урока: можно ли? Если нет — показываем тарифы */
  function canBuild(useAi) {
    if (useAi && !aiAllowed()) { open("Уроки с ИИ входят в тариф «С ИИ» (400 ₽/мес или 3900 ₽/год). Пробный доступ — 2 дня и 2 урока с ИИ за пробный период."); return false; }
    if (useAi && isPromo() && !window.AI?.ownConfigured?.()) { toast("Подключите ключ своей нейросети — кнопка «⚙ Подключить ИИ» вверху.", 6000); window.AI?.openLite?.(); return false; }
    if (free() && !window.Account?.session) { toast("Чтобы создать урок, зарегистрируйтесь и войдите в кабинет. Бесплатный доступ — 2 дня и 2 урока с ИИ за пробный период.", 7000); window.Account?.open?.(); return false; }
    if (lessonsLeft() <= 0) { open(level() === "free" ? "Бесплатный доступ истёк: прошло 2 дня или израсходованы 2 урока с ИИ за пробный период. Подключите тариф, чтобы продолжать." : "Лимит уроков с ИИ на этот месяц закончился. Докупите уроки в «Тарифах» — или дождитесь нового месяца."); return false; }
    return true;
  }
  /* Бесплатный тариф: урок — только после входа в кабинет; счёт ведёт сервер (кабинет + устройство + сеть) */
  const DEVK = "uchu:dev-id";
  function deviceId() { try { let d = localStorage.getItem(DEVK); if (!d) { d = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now(); localStorage.setItem(DEVK, d); } return d; } catch { return ""; } }
  // отпечаток браузера: не меняется при очистке данных сайта и при входе с другой почты
  function fingerprint() {
    let gl = ""; try { const c = document.createElement("canvas").getContext("webgl"); const e = c && c.getExtension("WEBGL_debug_renderer_info"); gl = e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : ""; } catch { }
    let cv = ""; try { const c = document.createElement("canvas"); c.width = 220; c.height = 30; const x = c.getContext("2d"); x.textBaseline = "top"; x.font = "16px Arial"; x.fillStyle = "#f60"; x.fillRect(0, 0, 60, 20); x.fillStyle = "#069"; x.fillText("Учу по ФРП ✏ 2026", 2, 4); cv = c.toDataURL().slice(-80); } catch { }
    return [navigator.userAgent, navigator.language, navigator.hardwareConcurrency, navigator.platform, screen.width + "x" + screen.height + "x" + screen.colorDepth, Intl.DateTimeFormat().resolvedOptions().timeZone, gl, cv].join("|");
  }
  async function canBuildAsync(useAi) {
    if (!canBuild(useAi)) return false;
    if (useAi || !commercial() || level() !== "free") return true; // серверный учёт пробных уроков — только для бесплатного уровня
    if (!me()) { toast("Чтобы собрать урок, войдите или зарегистрируйтесь — это минута.", 6000); window.Account?.open(); return false; }
    const fn = window.UCHU_AI_CFG?.yandexFn || site().yandexFunction, tok = window.Account?.session?.access;
    if (!fn || !tok || window.Account?.session?.local) return true;
    try {
      await window.Account?.refreshPlan?.();
      const base = fn.replace(/\/+$/, ""), u = /functions\.yandexcloud\.net/.test(base) ? `${base}?path=${encodeURIComponent("/free/use")}` : base + "/free/use";
      const r = await fetch(u, { method: "POST", headers: { "Content-Type": "application/json", "X-User-Token": window.Account.session.access }, body: JSON.stringify({ dev: deviceId(), fp: await sha(fingerprint()) }) });
      if (r.status === 402) { const j = await r.json().catch(() => ({})); open(j.error || "Бесплатные уроки на этот месяц закончились. Выберите тариф."); return false; }
      if (r.status === 401) { toast("Войдите в личный кабинет заново.", 5000); window.Account?.open(); return false; }
    } catch { /* сервер недоступен — работает учёт в браузере */ }
    return true;
  }
  async function applyPromo(code) {
    const h = await sha(SALT + norm(code));
    let ok = hashes().includes(h), info = {};
    // при входе в кабинет — проверка только на сервере: коды хранятся в облаке, там же промокод закрепляется за почтой
    const fn = window.UCHU_AI_CFG?.yandexFn || site().yandexFunction, tok = window.Account?.session?.access;
    if (fn && tok) { ok = false; try { const base = fn.replace(/\/+$/, ""), u = /functions\.yandexcloud\.net/.test(base) ? `${base}?path=${encodeURIComponent("/promo")}` : base + "/promo"; const r = await fetch(u, { method: "POST", headers: { "Content-Type": "application/json", "X-User-Token": tok }, body: JSON.stringify({ code: norm(code), messages: [] }) }); if (r.ok) { ok = true; info = await r.json().catch(() => ({})); } } catch { } }
    if (!ok) return false;
    window.Account?.refreshPlan?.();
    if (info.free) { if (window.Account?.session) Object.assign(window.Account.session, { promoFree: true, promo: false }); delete A.promo; save(); window.Account?.refreshPlan?.(); return { free: true }; }
    A.promo = { at: new Date().toISOString(), h: h.slice(0, 12), email: me(), pct: info.pct || 50 }; save();
    return { pct: info.pct || 50 };
  }
  function leavePromo() { delete A.promo; save(); }

  /* ---------- окно тарифов ---------- */
  function open(reason) {
    const L = level(), cur = L === "dev" ? null : L, pr = isPromo();
    const noPics = f => !(/^pics/.test(f) && window.UCHU_SITE?.imageGenUi === false);
    const featsOf = (k, p) => (pr && p.ai ? p.feats.filter(f => !/^ai\d+$|^more$/.test(f)).concat("own") : p.feats).filter(noPics);
    const m = openModal(`<div class="dialog wide tr-dlg"><div class="dlg-h"><h2>Тарифы</h2><button class="btn ghost x" data-close aria-label="Закрыть">×</button></div><div class="dlg-b">
      ${reason ? `<p class="tr-reason">${esc(reason)}</p>` : ""}
      ${L === "dev" ? `<p class="tr-now ok">Доступ разработчика.</p>` : ""}${promoFree() ? `<p class="tr-now ok">У вас бесплатный доступ по промокоду: все возможности сайта открыты, оплачивать ничего не нужно.</p>` : ""}${pr ? `<p class="tr-now ok">По промокоду все тарифы — со скидкой ${pct()}%. В тарифах с ИИ работает ваша нейросеть: её ключ подключается при оформлении.</p>` : ""}${L === "free" && PLANS.free.trialDays ? `<p class="tr-now" id="trialBanner">⏳ <b>Пробный период: ${PLANS.free.trialDays} дня</b> · ${A.trialStart ? `осталось <b id="trialLeft">${(() => { const ms = A.trialStart + PLANS.free.trialDays * 86400000 - Date.now(); if (ms <= 0) return "0"; const h = Math.floor(ms / 3600000); return h >= 24 ? Math.floor(h / 24) + " д " + (h % 24) + " ч" : h + " ч " + Math.floor(ms % 3600000 / 60000) + " мин"; })()}</b> · 2 урока с ИИ за пробный период` : "начнётся с первого урока"}` + (lessonsLeft() === 0 ? " · <b>истёк</b> ⛔" : "") + `</p>` : L !== "dev" && planOf(L).lessons !== Infinity ? `<p class="tr-now">Осталось уроков в этом месяце: <b>${lessonsLeft()}</b></p>` : ""}
      <div class="tr-grid">${Object.entries(PLANS).filter(([, p]) => !p.hidden).map(([k, p]) => `<article class="tr-card ${k === cur ? "on" : ""} ${k === "ai" ? "hot" : ""}">${k === cur ? `<span class="tr-badge">${promoFree() ? "ваш доступ по промокоду" : "ваш тариф"}</span>` : ""}<div class="tr-in"><div class="tr-art" aria-hidden="true"><span>${p.art}</span><i></i><i></i></div>${p.price ? "" : `<h3>${p.name}</h3>`}<div class="tr-price">${promoFree() && k === cur ? `<s>${p.price}</s> 0 ₽` : p.price ? (pr ? `<s>${p.price}</s> ${priceOf(k)} ₽<small> в ${p.period === "год" ? "год" : "месяц"}</small>` : `${p.price} ₽<small> в ${p.period === "год" ? "год" : "месяц"}</small>`) : "0 ₽"}</div><ul class="tr-feats">${featsOf(k, p).map(f => `<li><span class="tr-ic" style="--c:${F[f][1]}">${F[f][0]}</span>${esc(F[f][2])}</li>`).join("")}</ul>${k === cur ? `<span class="tr-cur">${promoFree() ? "Всё открыто бесплатно" : "Подключён сейчас"}</span>` : k === "free" || promoFree() ? "" : `<button class="btn sm flame" data-buy="${k}">${cur && planOf(cur).price && p.price > planOf(cur).price ? "Повысить" : cur && planOf(cur).price ? "Сменить" : "Выбрать"}</button>`}</div></article>`).join("")}</div>
      ${!site().payments && me() && cur && cur !== "free" && !promoFree() ? `<p class="small tr-reset"><button type="button" class="btn plain" id="trReset">🧪 Тест: вернуть бесплатный тариф</button></p>` : ""}
      ${cur && planOf(cur).ai && !pr && !promoFree() ? `<div class="tr-packs"><b>Не хватает уроков с ИИ?</b> ${Object.entries(PACKS).map(([k, x]) => `<button class="btn sm" data-pack="${k}">${x.name} — ${x.price} ₽</button>`).join("")}
        <div style="flex:1 1 100%;display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:6px;border-top:1px dashed #e3d7b8;padding-top:8px">
          <label class="small" for="packN">Своё количество (${CUSTOM.min}–${CUSTOM.max}):</label>
          <input type="number" id="packN" min="${CUSTOM.min}" max="${CUSTOM.max}" step="1" value="${CUSTOM_DEFAULT}" inputmode="numeric" aria-label="Сколько уроков с ИИ докупить" style="width:96px;padding:6px 8px;border:1.5px solid #1b1b1b;border-radius:10px;font:inherit;background:#fff">
          <span class="small">уроков — <b id="packPrice">${customPrice(CUSTOM_DEFAULT)} ₽</b></span>
          <button class="btn sm flame" type="button" id="packBuy">Купить ${CUSTOM_DEFAULT} уроков</button>
        </div>
        <div class="small" style="flex:1 1 100%">Цена: 7 ₽ за урок, но не меньше 70 ₽ — можно взять и меньше 10 уроков. Итоговую сумму считает сервер.</div>
      </div>` : ""}
      ${promoFree() ? "" : !me() ? `<div class="tr-promo"><b>Промокод</b><span class="small">Чтобы ввести промокод, войдите в личный кабинет.</span><button type="button" class="btn sm" id="trLogin">Войти или зарегистрироваться</button></div>` : `<form class="tr-promo" id="trPromo"><label for="trCode"><b>${pr ? "Другой промокод" : "Промокод"}</b></label><div class="row-btn"><input type="text" id="trCode" autocomplete="off" spellcheck="false" placeholder="Введите промокод"><button class="btn sm" type="submit">Применить</button></div><span class="small" id="trMsg" role="status"></span></form>`}
    </div></div>`);
    m.querySelectorAll("[data-buy]").forEach(b => b.onclick = () => buy(b.dataset.buy));
    m.querySelectorAll("[data-pack]").forEach(b => b.onclick = () => buy(b.dataset.pack));
    // своё количество уроков: поле 1–200 и живой расчёт цены max(70, ceil(n×7)); сумму всё равно проверяет сервер
    const pn = m.querySelector("#packN");
    if (pn) {
      const clampN = v => { const n = Math.round(+v); return Number.isFinite(n) ? Math.max(CUSTOM.min, Math.min(CUSTOM.max, n)) : CUSTOM_DEFAULT; };
      const updPack = () => {
        const n = clampN(pn.value); pn.dataset.n = String(n);
        const pp = m.querySelector("#packPrice"), pb = m.querySelector("#packBuy");
        if (pp) pp.textContent = customPrice(n) + " ₽";
        if (pb) pb.textContent = `Купить ${n} уроков`;
      };
      pn.addEventListener("input", updPack);
      // ушли из поля — поправляем только выход за пределы 1..200; набранное «5» остаётся пятёркой
      pn.addEventListener("change", () => { pn.value = String(clampN(pn.value)); updPack(); });
      updPack();
      m.querySelector("#packBuy")?.addEventListener("click", () => buy("aiCustom:" + (pn.dataset.n || CUSTOM_DEFAULT)));
    }
    m.querySelector("#trReset")?.addEventListener("click", () => { closeModal(); const mm = openModal(`<div class="dialog narrow"><div class="dlg-h"><h2>Вернуть бесплатный тариф</h2><button class="btn ghost x" data-close aria-label="Закрыть">×</button></div><div class="dlg-b">${testBox("Вернуть бесплатный")}</div></div>`); bindTest(mm, "free"); });
    const lg = m.querySelector("#trLogin"); if (lg) lg.onclick = () => { closeModal(); Access.wantPromo = true; window.Account?.open(); };
    if (m.querySelector("#trPromo")) m.querySelector("#trPromo").onsubmit = async e => {
      e.preventDefault(); const msg = m.querySelector("#trMsg"), code = m.querySelector("#trCode").value;
      if (!code.trim()) return; msg.textContent = "Проверяю…";
      const ok = await applyPromo(code);
      if (ok?.free) { closeModal(); toast("Промокод принят: открыт бесплатный доступ ко всем возможностям сайта.", 6000); }
      else if (ok) { closeModal(); toast(`Промокод принят: тарифы — со скидкой ${ok.pct}%.`, 5000); open(); }
      else msg.textContent = "Такого промокода нет. Проверьте написание.";
    };
  }
  /* Покупка: сначала вход в кабинет → сразу после входа — оформление выбранного тарифа → оплата */
  function buy(item) {
    if (promoFree()) { closeModal(); toast("У вас бесплатный доступ по промокоду: все тарифы и функции уже открыты.", 5000); return; }
    if (!me()) { closeModal(); Access.wantBuy = item; try { localStorage.setItem("uchu:want-buy", item); } catch { } toast("Войдите или зарегистрируйтесь — после этого сразу перейдёте к оплате.", 5000); window.Account?.open(); return; }
    checkout(item);
  }
  function checkout(item) {
    if (promoFree()) { toast("У вас бесплатный доступ по промокоду: все тарифы и функции уже открыты.", 5000); return; }
    // докупка своего количества уроков: buy("aiCustom:30") — количество и цену всё равно проверит сервер
    const cm = /^aiCustom:(\d{1,3})$/.exec(String(item || ""));
    const cn = cm ? Math.max(CUSTOM.min, Math.min(CUSTOM.max, Math.round(+cm[1]))) : 0;
    const custom = cn ? { name: `${cn} уроков с ИИ`, price: customPrice(cn), n: cn } : null;
    const P = PLANS[item], K = PACKS[item] || custom, L = level(), pr = isPromo();
    const up = P && planOf(L).price && P.price > planOf(L).price;
    const needKey = pr && P?.ai && !window.AI?.ownConfigured?.();
    const feats = P ? (pr && P.ai ? P.feats.filter(f => !/^ai\d+$|^more$/.test(f)).concat("own") : P.feats).filter(f => !(/^pics/.test(f) && window.UCHU_SITE?.imageGenUi === false)) : [];
    const m = openModal(`<div class="dialog narrow"><div class="dlg-h"><h2>Оформление</h2><button class="btn ghost x" data-close aria-label="Закрыть">×</button></div><div class="dlg-b">
      <div class="co-item"><span class="co-art">${P ? P.art : "✨"}</span><div><b>${P ? `Тариф «${P.name}»` : K.name}</b><div class="co-price">${P ? (up ? "доплата за оставшиеся дни" : `${priceOf(item)} ₽ / ${P.period || "мес"}${pr ? ` <s>${P.price} ₽</s> · промокод −${pct()}%` : ""}`) : `${K.price} ₽`}</div></div></div>
      ${needKey ? `<div class="co-key"><b>Чтобы этот тариф работал, подключите ключ своей нейросети.</b><button type="button" class="btn sm flame" id="coKey">Подключить ключ</button></div>` : ""}
      ${P ? `<ul class="tr-feats">${feats.filter(f => !(/^pics/.test(f) && window.UCHU_SITE?.imageGenUi === false)).map(f => `<li><span class="tr-ic" style="--c:${F[f][1]}">${F[f][0]}</span>${esc(F[f][2])}</li>`).join("")}</ul>` : `<p>Уроки с ИИ добавятся к вашему тарифу и не сгорают до конца оплаченного периода.</p>`}
      ${P && !up && site().autopay && !pr ? `<label class="check"><input type="checkbox" id="coAuto" checked> Автоплатёж каждый месяц (отключить можно в любой момент по ссылке в письме)</label>` : ""}
      ${up ? `` : ""}
      ${site().payments ? `<p class="small">Оплата по СБП — через приложение вашего банка. Чек придёт на почту ${esc(me())}. Оплачивая, вы принимаете <a href="legal/oferta.html" target="_blank">договор-оферту</a>.</p>
      <div class="mat-row"><button class="btn flame" id="coPay" data-method="sbp" ${needKey ? "disabled" : ""}>Оплатить${(P ? (up ? 0 : priceOf(item)) : K.price) ? " " + (P ? priceOf(item) : K.price) + " ₽" : ""} по СБП</button><button type="button" class="btn plain" id="coPayAny" data-method="any" ${needKey ? "disabled" : ""}>Картой или SberPay</button></div><span class="small" id="coMsg" role="status"></span>` : testBox()}</div></div>`);
    bindTest(m, custom ? "aiCustom" : item, custom ? custom.n : 0);
    m.querySelector("#coKey")?.addEventListener("click", () => { closeModal(); Access.afterKey = item; window.AI?.openLite?.(); });
    const payBtns = [m.querySelector("#coPay"), m.querySelector("#coPayAny")].filter(Boolean);
    payBtns.forEach(btn => btn.onclick = async () => {
      const method = btn.dataset.method;
      const msg = m.querySelector("#coMsg"), fn = window.UCHU_AI_CFG?.yandexFn || site().yandexFunction, tok = window.Account?.session?.access;
      if (!site().payments || !fn) { msg.textContent = "Оплата открывается совсем скоро. Пока можно пользоваться бесплатным тарифом."; return; }
      if (!tok) { msg.textContent = "Войдите в личный кабинет заново."; return; }
      msg.textContent = "Готовлю оплату…";
      try {
        const base = fn.replace(/\/+$/, ""), u = /functions\.yandexcloud\.net/.test(base) ? `${base}?path=${encodeURIComponent("/pay/create")}` : base + "/pay/create";
        payBtns.forEach(b => b.disabled = true);
        const ask = async mt => { const r = await fetch(u, { method: "POST", headers: { "Content-Type": "application/json", "X-User-Token": tok }, body: JSON.stringify({ item: custom ? "aiCustom" : item, n: custom ? custom.n : undefined, method: mt, autopay: !!m.querySelector("#coAuto")?.checked }) }); const j = await r.json().catch(() => ({})); return r.ok && j.url ? j : { err: j.error || "оплата недоступна", status: r.status }; };
        let j = await ask(method);
        if (!j.url && method === "sbp" && ![401, 403, 503].includes(j.status)) { msg.textContent = "СБП сейчас недоступна — открываю оплату картой или SberPay…"; j = await ask("any"); } // СБП не вышла: сразу вторая страница, без лишних нажатий
        if (!j.url) throw new Error(j.err);
        location.href = j.url;
      } catch (e) { payBtns.forEach(b => b.disabled = false); msg.textContent = "Не получилось: " + (e.message || e) + (method === "sbp" ? " Попробуйте «Картой или SberPay»." : ""); }
    });
  }
  /* Пока оплата не подключена — тестовая оплата по коду разработчика: тариф включается без денег,
     чтобы посмотреть, что открывается на каждом тарифе */
  const testBox = (label = "🧪 Смоделировать оплату") => `<div class="co-test"><b>Оплата ещё не подключена — тестовый режим</b><span class="small">Только для разработчиков: введите код разработчика — тариф включится без денег, чтобы проверить, как всё работает.</span>
      <div class="row-btn"><input type="text" class="secret keep" id="coCode" placeholder="Код разработчика" autocomplete="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true"><button class="btn flame" type="button" id="coTest">${label}</button></div><span class="small" id="coTMsg" role="status"></span></div>`;
  function bindTest(m, item, n = 0) {
    const b = m.querySelector("#coTest"); if (!b) return;
    b.onclick = async () => {
      const msg = m.querySelector("#coTMsg"), code = m.querySelector("#coCode").value.trim(), fn = window.UCHU_AI_CFG?.yandexFn || site().yandexFunction, tok = window.Account?.session?.access;
      if (!code) { msg.textContent = "Введите код."; return; }
      if (!fn || !tok) { msg.textContent = "Войдите в личный кабинет."; return; }
      b.disabled = true; msg.textContent = "Включаю тариф…";
      // без ответа 30 с — понятная ошибка вместо вечного «Включаю тариф…»; тариф в кабинете обновляется фоном
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 30000);
      const slow = setTimeout(() => { msg.textContent = "Сервер просыпается (первый запрос после паузы бывает до 20 секунд)…"; }, 6000);
      try {
        const base = fn.replace(/\/+$/, ""), u = /functions\.yandexcloud\.net/.test(base) ? `${base}?path=${encodeURIComponent("/pay/test")}` : base + "/pay/test";
        const r = await fetch(u, { method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/json", "X-User-Token": window.Account.session.access }, body: JSON.stringify({ item, n: n || undefined, code }) });
        const j = await r.json().catch(() => ({}));
        if (r.status === 404 || /нужен массив messages|нет такого тарифа/.test(j.error || "") && item === "free") throw new Error("на сервере старая версия функции — загрузите новый архив");
        if (r.status === 401) throw new Error("сессия истекла — выйдите и войдите в кабинет заново");
        if (!r.ok) throw new Error(j.error || "HTTP " + r.status);
        // сразу показываем новый тариф (по ответу сервера), а из облака уточняем фоном
        const S = window.Account?.session; if (S && j.patch) { if (j.patch.plan) S.plan = j.patch.plan; if (typeof j.patch.tokens_limit === "number") S.tokens = { used: j.patch.tokens_used || 0, limit: j.patch.tokens_limit }; paint(); }
        window.Account?.refreshPlan?.().catch(() => null);
        closeModal();
        const nm = PLANS[item]?.name || PACKS[item]?.name || (n ? `${n} уроков с ИИ` : "Бесплатный");
        toast(`🧪 Тест: «${nm}» включён.${isDev() ? " Вы видите сайт как разработчик — чтобы увидеть, что видит учитель, нажмите «Посмотреть как учитель» в панели разработчика." : ""}`, 7000);
      } catch (e) { b.disabled = false; msg.textContent = "Не получилось: " + (e.name === "AbortError" ? "сервер не ответил за 30 секунд. Проверьте интернет и что в Яндекс Облаке загружен последний архив функции, затем нажмите ещё раз." : e instanceof TypeError ? "нет связи с сервером (интернет, VPN или адрес функции в настройках)." : (e.message || e)); }
      finally { clearTimeout(to); clearTimeout(slow); }
    };
  }
  /* Возврат с оплаты: ?pay=ok — обновить тариф из кабинета */
  function afterPay() {
    const q = new URLSearchParams(location.search).get("pay"); if (!q) return;
    history.replaceState(null, "", location.pathname + location.hash);
    if (q === "ok") { toast("Оплата прошла! Тариф подключается — это занимает несколько секунд.", 7000); setTimeout(() => window.Account?.refreshPlan?.(), 2500); setTimeout(() => window.Account?.refreshPlan?.(), 8000); }
    else toast("Оплата не завершена. Можно попробовать ещё раз в «Тарифах».", 6000);
  }
  document.addEventListener("uchu:ready", afterPay);
  /* ---------- шапка: кнопка «⚙ ИИ» только в свободной зоне; метка тарифа ---------- */
  function paint() {
    const ai = document.getElementById("btnAi"); if (ai) ai.hidden = !isDev(); /* ключи ИИ — только у разработчика */
    let b = document.getElementById("btnPlan");
    if (!b && commercial()) { b = document.createElement("button"); b.type = "button"; b.id = "btnPlan"; b.className = "btn sm ghost"; b.onclick = () => open(); document.querySelector(".nav")?.prepend(b); }
    // у разработчика и по промокоду кнопки тарифа в шапке нет (тарифы и промокод — в личном кабинете)
    // окошко расхода: сколько токенов потрачено и сколько осталось (только у вошедших, на платных и бесплатном тарифе)
    let tk = document.getElementById("tokBadge");
    const T = window.Account?.session?.tokens, show = commercial() && !isDev() && !promoFree() && !!window.Account?.session && ["ai", "aiYear"].includes(window.Account.session.plan);
    if (show && !tk) { tk = document.createElement("span"); tk.id = "tokBadge"; tk.className = "small"; tk.style.cssText = "padding:4px 10px;border:1.5px solid var(--ink,#333);border-radius:999px;white-space:nowrap;font-weight:600"; document.querySelector(".account")?.prepend(tk); }
    if (tk) { tk.hidden = !show; if (show) { const k = n => (n >= 1000 ? Math.round(n / 1000) + " тыс." : n); if (T) { const cr = n => Math.round(n / 4000 * 10) / 10, left = Math.max(0, T.limit - T.used); tk.textContent = `⚡ Осталось ${cr(left)} из ${cr(T.limit)}`; tk.title = `Кредиты ИИ в этом периоде: 1 ⚡ — примерно 2–3 страницы текста. Потрачено ${cr(T.used)}, осталось ${cr(left)}. Урок с ИИ — около 10 ⚡. Обновляется после каждой сборки.`; } else { tk.textContent = "⚡ Кредиты появятся после первой сборки"; tk.title = ""; } } }
    document.dispatchEvent(new Event("uchu:access"));
    if (b) { const L = level(); b.textContent = promoFree() ? "✨ Тариф «С ИИ» · всё открыто" : `💳 ${planOf(L)?.name || "Тарифы"}`; b.title = promoFree() ? "Бесплатный доступ по промокоду: все возможности сайта" : "Тарифы и промокод"; b.hidden = !commercial() || L === "dev"; }
  }
  document.addEventListener("DOMContentLoaded", () => setTimeout(paint, 0));
  document.addEventListener("uchu:ready", paint);
  return { sheetsLeft, countSheet, imageLeft, countImage, promoFree, asTeacher, canBuildAsync, techAllowed, imagesAllowed, level, label, isDev, isPromo, priceOf, afterKey: null, wantPromo: false, wantBuy: null, checkout, PACKS, customPrice, CUSTOM, ownAi, aiAllowed, canBuild, countLesson, lessonsLeft, applyPromo, leavePromo, open, paint, PLANS, sha: s => sha(SALT + norm(s)), commercial };
})();
window.Access = Access;
