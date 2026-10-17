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
  /* Привилегии тарифов: иконка + текст (иконки — яркие плоские значки в цветных кругах) */
  const F = {
    lesson: ["📘", "#6b2bd9", "Конспект урока — удобно печатать"], tech: ["📋", "#2f8f5b", "Технологическая карта по ФРП — для проверки и сдачи"], slides: ["🖥️", "#f05aa6", "Презентация — красивая, с анимацией"], sheet: ["📝", "#ff9f1c", "Рабочий лист, памятка, самостоятельная и д/з"],
    cloud: ["☁️", "#2fa6e8", "Все уроки — в личном кабинете"], download: ["⬇️", "#2f8f5b", "Скачивание: Word, PDF, PowerPoint"], unlim: ["♾️", "#6b2bd9", "Уроки без ограничений"],
    ai: ["✨", "#f05aa6", "ИИ пишет подробный конспект и правит листы по вашей просьбе"], ai50: ["🤖", "#a43fd0", "50 уроков с ИИ в месяц"], ai120: ["🚀", "#a43fd0", "120 уроков с ИИ в месяц"],
    more: ["➕", "#ff9f1c", "Можно докупить уроки с ИИ недорого"], help: ["💬", "#2fa6e8", "Приоритетная поддержка"], own: ["🔑", "#a43fd0", "Своя нейросеть: подключаете свой ключ"], three: ["🎁", "#2f8f5b", "3 урока в месяц — попробовать"]
  };
  const PLANS = {
    free: { name: "Бесплатный", price: 0, lessons: 3, ai: false, art: "🎁", tag: "попробовать", feats: ["three", "lesson", "slides", "sheet", "cloud"] },
    basic: { name: "Учитель", price: 300, lessons: Infinity, ai: false, art: "📚", tag: "для каждого урока", feats: ["unlim", "lesson", "slides", "sheet", "download", "cloud"] },
    ai: { name: "Учитель + ИИ", price: 500, lessons: Infinity, ai: true, art: "✨", tag: "самый популярный", feats: ["unlim", "ai", "ai50", "more", "download", "cloud"] },
    pro: { name: "Методист", price: 900, lessons: Infinity, ai: true, art: "🚀", tag: "максимум", feats: ["unlim", "tech", "ai", "ai120", "more", "help", "cloud"] }
  };
  const PACKS = { ai10: { name: "+10 уроков с ИИ", price: 50 }, ai30: { name: "+30 уроков с ИИ", price: 140 } };


  /* Текущий уровень: промокод > тариф кабинета > бесплатный. В некоммерческой версии — всё открыто. */
  /* Разработчик (вход по паролю разработчика, в том числе запомненный) — всё открыто без промокодов */
  // «Посмотреть как учитель»: разработчик временно видит сайт как обычный учитель (до закрытия вкладки)
  const asTeacher = () => { try { return sessionStorage.getItem("uchu:as-teacher") === "1"; } catch { return false; } };
  const isDev = () => !asTeacher() && !!(window.Dev?.on || window.Dev?.remembered?.());
  const me = () => (window.Account?.session?.email || "").toLowerCase();
  /* Уровень = тариф (промокод — отдельная отметка: скидка 50% и своя нейросеть вместо ИИ сайта) */
  function level() {
    if (!commercial() || isDev()) return "dev";
    const p = window.Account?.session?.plan;
    return PLANS[p] ? p : "free";
  }
  // промокод — только у вошедшего, закреплён за его почтой
  const isPromo = () => !isDev() && !!me() && (!!window.Account?.session?.promo || window.Account?.session?.plan === "promo" || (!!A.promo && A.promo.email === me()));
  const DISCOUNT = 0.5;
  const priceOf = k => { const P = PLANS[k] || PACKS[k]; return P ? (isPromo() ? Math.round(P.price * DISCOUNT) : P.price) : 0; };
  const label = () => { const L = level(); return L === "dev" ? "разработчик" : `тариф «${PLANS[L].name}»${isPromo() ? " · промокод −50%" : ""}`; };
  const free = () => level() === "dev";
  // свои ключи: разработчику — любые; по промокоду — одна своя нейросеть на тарифе с ИИ
  const ownAi = () => free() || (isPromo() && !!PLANS[level()]?.ai);
  const aiAllowed = () => free() || !!PLANS[level()].ai;
  const techAllowed = () => free() || level() === "pro";
  const month = () => new Date().toISOString().slice(0, 7);
  function lessonsLeft() { const L = level(); if (free()) return Infinity; const lim = PLANS[L].lessons; if (lim === Infinity) return Infinity; const used = A.month === month() ? A.used || 0 : 0; return Math.max(0, lim - used); }
  function countLesson() { if (free() || PLANS[level()].lessons === Infinity) return; if (A.month !== month()) { A.month = month(); A.used = 0; } A.used = (A.used || 0) + 1; save(); }
  /* Перед сборкой урока: можно ли? Если нет — показываем тарифы */
  function canBuild(useAi) {
    if (useAi && !aiAllowed()) { open("Уроки с ИИ — в тарифах «Учитель + ИИ» и «Методист»."); return false; }
    if (useAi && isPromo() && !window.AI?.ownConfigured?.()) { toast("Подключите ключ своей нейросети — кнопка «⚙ Подключить ИИ» вверху.", 6000); window.AI?.openLite?.(); return false; }
    if (!useAi && lessonsLeft() <= 0) { open("Бесплатные уроки на этот месяц закончились. Выберите тариф."); return false; }
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
    if (useAi || !commercial() || free() || PLANS[level()].lessons === Infinity) return true;
    if (!me()) { toast("Чтобы собрать урок бесплатно, войдите или зарегистрируйтесь — это минута.", 6000); window.Account?.open(); return false; }
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
    let ok = hashes().includes(h);
    // при входе в кабинет — проверка только на сервере: коды хранятся в облаке, там же промокод закрепляется за почтой
    const fn = window.UCHU_AI_CFG?.yandexFn || site().yandexFunction, tok = window.Account?.session?.access;
    if (fn && tok) { ok = false; try { const base = fn.replace(/\/+$/, ""), u = /functions\.yandexcloud\.net/.test(base) ? `${base}?path=${encodeURIComponent("/promo")}` : base + "/promo"; const r = await fetch(u, { method: "POST", headers: { "Content-Type": "application/json", "X-User-Token": tok }, body: JSON.stringify({ code: norm(code), messages: [] }) }); if (r.ok) ok = true; } catch { } }
    if (!ok) return false;
    window.Account?.refreshPlan?.();
    A.promo = { at: new Date().toISOString(), h: h.slice(0, 12), email: me() }; save();
    return true;
  }
  function leavePromo() { delete A.promo; save(); }

  /* ---------- окно тарифов ---------- */
  function open(reason) {
    const L = level(), cur = L === "dev" ? null : L, pr = isPromo();
    const featsOf = (k, p) => pr && p.ai ? p.feats.filter(f => !/^ai\d+$|^more$/.test(f)).concat("own") : p.feats;
    const m = openModal(`<div class="dialog wide tr-dlg"><div class="dlg-h"><h2>Тарифы</h2><button class="btn ghost x" data-close aria-label="Закрыть">×</button></div><div class="dlg-b">
      ${reason ? `<p class="tr-reason">${esc(reason)}</p>` : ""}
      ${L === "dev" ? `<p class="tr-now ok">Доступ разработчика.</p>` : ""}${pr ? `<p class="tr-now ok">По промокоду все тарифы — со скидкой 50%. В тарифах с ИИ работает ваша нейросеть: её ключ подключается при оформлении.</p>` : ""}${L !== "dev" && PLANS[L].lessons !== Infinity ? `<p class="tr-now">Осталось уроков в этом месяце: <b>${lessonsLeft()}</b></p>` : ""}
      <div class="tr-grid">${Object.entries(PLANS).map(([k, p]) => `<article class="tr-card ${k === cur ? "on" : ""} ${k === "ai" ? "hot" : ""}">${k === cur ? `<span class="tr-badge">ваш тариф</span>` : k === "ai" ? `<span class="tr-badge hot">${p.tag}</span>` : ""}<div class="tr-in"><div class="tr-art" aria-hidden="true"><span>${p.art}</span><i></i><i></i></div><h3>${p.name}</h3><div class="tr-price">${p.price ? (pr ? `<s>${p.price}</s> ${priceOf(k)} ₽<small>/мес</small>` : `${p.price} ₽<small>/мес</small>`) : "0 ₽"}</div><ul class="tr-feats">${featsOf(k, p).map(f => `<li><span class="tr-ic" style="--c:${F[f][1]}">${F[f][0]}</span>${esc(F[f][2])}</li>`).join("")}</ul>${k === cur ? `<span class="tr-cur">Подключён сейчас</span>` : k === "free" ? "" : `<button class="btn sm flame" data-buy="${k}">${cur && PLANS[cur].price && p.price > PLANS[cur].price ? "Повысить" : cur && PLANS[cur].price ? "Сменить" : "Выбрать"}</button>`}</div></article>`).join("")}</div>
      ${!site().payments && me() && cur && cur !== "free" ? `<p class="small tr-reset"><button type="button" class="btn plain" id="trReset">🧪 Тест: вернуть бесплатный тариф</button></p>` : ""}
      ${cur && PLANS[cur].ai && !pr ? `<div class="tr-packs"><b>Не хватает уроков с ИИ?</b> ${Object.entries(PACKS).map(([k, x]) => `<button class="btn sm" data-pack="${k}">${x.name} — ${x.price} ₽</button>`).join("")}</div>` : ""}
      ${!me() ? `<div class="tr-promo"><b>Промокод</b><span class="small">Чтобы ввести промокод, войдите в личный кабинет.</span><button type="button" class="btn sm" id="trLogin">Войти или зарегистрироваться</button></div>` : pr ? "" : `<form class="tr-promo" id="trPromo"><label for="trCode"><b>Промокод</b></label><div class="row-btn"><input type="text" id="trCode" autocomplete="off" spellcheck="false" placeholder="Введите промокод"><button class="btn sm" type="submit">Применить</button></div><span class="small" id="trMsg" role="status"></span></form>`}
    </div></div>`);
    m.querySelectorAll("[data-buy]").forEach(b => b.onclick = () => buy(b.dataset.buy));
    m.querySelectorAll("[data-pack]").forEach(b => b.onclick = () => buy(b.dataset.pack));
    m.querySelector("#trReset")?.addEventListener("click", () => { closeModal(); const mm = openModal(`<div class="dialog narrow"><div class="dlg-h"><h2>Вернуть бесплатный тариф</h2><button class="btn ghost x" data-close aria-label="Закрыть">×</button></div><div class="dlg-b">${testBox("Вернуть бесплатный")}</div></div>`); bindTest(mm, "free"); });
    const lg = m.querySelector("#trLogin"); if (lg) lg.onclick = () => { closeModal(); Access.wantPromo = true; window.Account?.open(); };
    if (m.querySelector("#trPromo")) m.querySelector("#trPromo").onsubmit = async e => {
      e.preventDefault(); const msg = m.querySelector("#trMsg"), code = m.querySelector("#trCode").value;
      if (!code.trim()) return; msg.textContent = "Проверяю…";
      if (await applyPromo(code)) { closeModal(); toast("Промокод принят: тарифы — со скидкой 50%.", 5000); open(); }
      else msg.textContent = "Такого промокода нет. Проверьте написание.";
    };
  }
  /* Покупка: сначала вход в кабинет → сразу после входа — оформление выбранного тарифа → оплата */
  function buy(item) {
    if (!me()) { closeModal(); Access.wantBuy = item; try { localStorage.setItem("uchu:want-buy", item); } catch { } toast("Войдите или зарегистрируйтесь — после этого сразу перейдёте к оплате.", 5000); window.Account?.open(); return; }
    checkout(item);
  }
  function checkout(item) {
    const P = PLANS[item], K = PACKS[item], L = level(), pr = isPromo();
    const up = P && PLANS[L]?.price && P.price > PLANS[L].price;
    const needKey = pr && P?.ai && !window.AI?.ownConfigured?.();
    const feats = P ? (pr && P.ai ? P.feats.filter(f => !/^ai\d+$|^more$/.test(f)).concat("own") : P.feats) : [];
    const m = openModal(`<div class="dialog narrow"><div class="dlg-h"><h2>Оформление</h2><button class="btn ghost x" data-close aria-label="Закрыть">×</button></div><div class="dlg-b">
      <div class="co-item"><span class="co-art">${P ? P.art : "✨"}</span><div><b>${P ? `Тариф «${P.name}»` : K.name}</b><div class="co-price">${P ? (up ? "доплата за оставшиеся дни" : `${priceOf(item)} ₽ в месяц${pr ? ` <s>${P.price} ₽</s> · промокод −50%` : ""}`) : `${K.price} ₽`}</div></div></div>
      ${needKey ? `<div class="co-key"><b>Чтобы этот тариф работал, подключите ключ своей нейросети.</b><span class="small">Подойдёт ключ DeepSeek, OpenRouter, Gemini и других — сайт сам узнает сервис.</span><button type="button" class="btn sm flame" id="coKey">Подключить ключ</button></div>` : ""}
      ${P ? `<ul class="tr-feats">${feats.map(f => `<li><span class="tr-ic" style="--c:${F[f][1]}">${F[f][0]}</span>${esc(F[f][2])}</li>`).join("")}</ul>` : `<p>Уроки с ИИ добавятся к вашему тарифу и не сгорают до конца оплаченного периода.</p>`}
      ${P && !up && site().autopay && !pr ? `<label class="check"><input type="checkbox" id="coAuto" checked> Автоплатёж каждый месяц (отключить можно в любой момент по ссылке в письме)</label>` : ""}
      ${up ? `<p class="small">При повышении тарифа вы доплачиваете только разницу за оставшиеся дни текущего месяца.</p>` : ""}
      ${site().payments ? `<p class="small">Оплата картой или по СБП. Чек придёт на почту ${esc(me())}.</p>
      <div class="mat-row"><button class="btn flame" id="coPay" ${needKey ? "disabled" : ""}>Перейти к оплате</button><span class="small" id="coMsg" role="status"></span></div>` : testBox()}</div></div>`);
    bindTest(m, item);
    m.querySelector("#coKey")?.addEventListener("click", () => { closeModal(); Access.afterKey = item; window.AI?.openLite?.(); });
    if (m.querySelector("#coPay")) m.querySelector("#coPay").onclick = async () => {
      const msg = m.querySelector("#coMsg"), fn = window.UCHU_AI_CFG?.yandexFn || site().yandexFunction, tok = window.Account?.session?.access;
      if (!site().payments || !fn) { msg.textContent = "Оплата открывается совсем скоро. Пока можно пользоваться бесплатным тарифом."; return; }
      if (!tok) { msg.textContent = "Войдите в личный кабинет заново."; return; }
      msg.textContent = "Готовлю оплату…";
      try {
        const base = fn.replace(/\/+$/, ""), u = /functions\.yandexcloud\.net/.test(base) ? `${base}?path=${encodeURIComponent("/pay/create")}` : base + "/pay/create";
        const r = await fetch(u, { method: "POST", headers: { "Content-Type": "application/json", "X-User-Token": tok }, body: JSON.stringify({ item, autopay: !!m.querySelector("#coAuto")?.checked }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.url) throw new Error(j.error || "оплата недоступна");
        location.href = j.url;
      } catch (e) { msg.textContent = "Не получилось: " + (e.message || e); }
    };
  }
  /* Пока оплата не подключена — тестовая оплата по коду разработчика: тариф включается без денег,
     чтобы посмотреть, что открывается на каждом тарифе */
  const testBox = (label = "🧪 Смоделировать оплату") => `<div class="co-test"><b>Оплата ещё не подключена — тестовый режим</b><span class="small">Только для разработчиков: введите код разработчика — тариф включится без денег, чтобы проверить, как всё работает.</span>
      <div class="row-btn"><input type="text" class="secret keep" id="coCode" placeholder="Код разработчика" autocomplete="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true"><button class="btn flame" type="button" id="coTest">${label}</button></div><span class="small" id="coTMsg" role="status"></span></div>`;
  function bindTest(m, item) {
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
        const r = await fetch(u, { method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/json", "X-User-Token": window.Account.session.access }, body: JSON.stringify({ item, code }) });
        const j = await r.json().catch(() => ({}));
        if (r.status === 404 || /нужен массив messages|нет такого тарифа/.test(j.error || "") && item === "free") throw new Error("на сервере старая версия функции — загрузите новый архив");
        if (r.status === 401) throw new Error("сессия истекла — выйдите и войдите в кабинет заново");
        if (!r.ok) throw new Error(j.error || "HTTP " + r.status);
        // сразу показываем новый тариф (по ответу сервера), а из облака уточняем фоном
        const S = window.Account?.session; if (S && j.patch) { if (j.patch.plan) S.plan = j.patch.plan; if (typeof j.patch.tokens_limit === "number") S.tokens = { used: j.patch.tokens_used || 0, limit: j.patch.tokens_limit }; paint(); }
        window.Account?.refreshPlan?.().catch(() => null);
        closeModal();
        const nm = PLANS[item]?.name || PACKS[item]?.name || "Бесплатный";
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
    const ai = document.getElementById("btnAi"); if (ai) ai.hidden = commercial() && !ownAi();
    let b = document.getElementById("btnPlan");
    if (!b && commercial()) { b = document.createElement("button"); b.type = "button"; b.id = "btnPlan"; b.className = "btn sm ghost"; b.onclick = () => open(); document.querySelector(".account")?.prepend(b); }
    // у разработчика и по промокоду кнопки тарифа в шапке нет (тарифы и промокод — в личном кабинете)
    document.dispatchEvent(new Event("uchu:access"));
    if (b) { const L = level(); b.textContent = `💳 ${PLANS[L]?.name || "Тарифы"}`; b.title = "Тарифы и промокод"; b.hidden = !commercial() || L === "dev"; }
  }
  document.addEventListener("DOMContentLoaded", () => setTimeout(paint, 0));
  document.addEventListener("uchu:ready", paint);
  return { asTeacher, canBuildAsync, techAllowed, level, label, isDev, isPromo, priceOf, afterKey: null, wantPromo: false, wantBuy: null, checkout, PACKS, ownAi, aiAllowed, canBuild, countLesson, lessonsLeft, applyPromo, leavePromo, open, paint, PLANS, sha: s => sha(SALT + norm(s)), commercial };
})();
window.Access = Access;
