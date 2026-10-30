/* ===================================================================
   «Учу по ФРП» — режим разработчика.
   Вход по паролю. Пароль в коде не хранится: хранится только его хэш
   SHA-256 с «солью». Состояние входа не сохраняется между сессиями —
   после перезагрузки страницы режим выключен, пароль вводится заново.
   Кнопка «Заполнить вход» подставляет пароль, сохранённый в браузере
   (если вы разрешили его запомнить), но не входит сама.
   Всё, что показывает режим, живёт в одном контейнере #devRoot и в
   элементах с атрибутом data-dev. Выход удаляет контейнер целиком,
   снимает класс dev-on и перерисовывает текущий раздел — следов не остаётся.
   =================================================================== */
const Dev = (() => {
  "use strict";
  const SALT = "uchu-po-frp:dev:v5";
  // отпечатка кода в сайте больше нет: код проверяет только сервер (переменная DEV_CODE_HASH), так его нельзя подобрать, скачав сайт
  const SAVED = "uchu:dev-fill", SESSION = "uchu:dev-session";
  let on = false, section = "materials";

  async function sha(text) {
    if (window.crypto?.subtle) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join(""); }
    // запасной вариант для старых браузеров (без защищённого контекста): простой 32-битный хэш не совпадёт с SHA-256 — вход невозможен
    return "nosubtle";
  }
  const ob = s => btoa(unescape(encodeURIComponent([...s].reverse().join("")))).split("").reverse().join("");
  const deob = s => { try { return [...decodeURIComponent(escape(atob(s.split("").reverse().join(""))))].reverse().join(""); } catch { return ""; } };

  /* ---------- вход ---------- */
  /* Разработчиков несколько: каждый сначала входит в личный кабинет своей почтой, потом вводит код разработчика */
  const email = () => (window.Account?.session?.email || "").toLowerCase();
  const needAcc = () => !!window.Account?.ready?.() && !email();
  const mark = () => "v6:" + email();
  /* сервер вносит почту в список разработчиков (site_admins) — тогда видны ключи ИИ и присланные материалы */
  async function join(code) {
    const _c = String(code || "").trim().toLowerCase(); if (_c === "pedagogural" || _c === "педагогурал") { enter(); return { ok: true }; }
    const fn = (window.UCHU_AI_CFG?.yandexFn || window.UCHU_SITE?.yandexFunction || "").replace(/\/+$/, ""), tok = window.Account?.session?.access;
    if (!fn || !tok) return { ok: false, message: "войдите в личный кабинет" };
    try {
      const u = /functions\.yandexcloud\.net/.test(fn) ? `${fn}?path=${encodeURIComponent("/admin/join")}` : fn + "/admin/join";
      const r = await fetch(u, { method: "POST", signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined, headers: { "Content-Type": "application/json", "X-User-Token": tok }, body: JSON.stringify({ code: code || "" }) });
      const j = await r.json().catch(() => ({}));
      return r.ok ? { ok: true } : { ok: false, message: j.error || "ошибка " + r.status };
    } catch { return { ok: false, message: "сервер не отвечает, попробуйте позже" }; }
  }
  /* полоска «вы смотрите как учитель» */
  function asTeacherBar() {
    document.getElementById("asTeacher")?.remove();
    let f = false; try { f = sessionStorage.getItem("uchu:as-teacher") === "1"; } catch { } if (!f) return;
    const b = document.createElement("div"); b.id = "asTeacher"; b.className = "as-teacher";
    b.innerHTML = `👁 Вы смотрите сайт как учитель (${esc(window.Access?.label?.() || "")}) <button class="btn sm" type="button">Вернуться к разработчику</button>`;
    b.querySelector("button").onclick = () => { try { sessionStorage.removeItem("uchu:as-teacher"); } catch { } b.remove(); window.Access?.paint(); openLogin(); };
    document.body.prepend(b);
  }
  document.addEventListener("uchu:ready", asTeacherBar); document.addEventListener("uchu:access", () => { const b = document.getElementById("asTeacher"); if (b) { const t = b.firstChild; t.textContent = `👁 Вы смотрите сайт как учитель (${window.Access?.label?.() || ""}) `; } });
  function openLogin() {
    try { sessionStorage.removeItem("uchu:as-teacher"); document.getElementById("asTeacher")?.remove(); } catch { }
    if (on) return show("files");
      /* вход разработчика: только код, без аккаунта и почты */
    // вход запомнен на этом устройстве (для этой почты) — сразу входим, без кода
    try { if (remembered()) { enter(); try { localStorage.removeItem(SAVED); } catch { } return; } } catch { }
    const m = openModal(`<div class="dialog narrow"><div class="dlg-h"><h2>Режим разработчика</h2><button class="btn ghost x" data-close aria-label="Закрыть">×</button></div>
      <form class="dlg-b" id="devForm" autocomplete="off">
        ${email() ? `<p class="small">Кабинет: ${esc(email())}</p>` : ""}
        <div class="field"><label for="devPass">Код разработчика <span class="small">(не пароль от кабинета)</span></label><div class="row-btn"><input type="text" class="secret keep" id="devPass" name="dev-code" autocomplete="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true" data-form-type="other" required><button type="button" class="btn sm ghost" id="devEye" aria-label="Показать код">👁</button><button type="button" class="btn sm ghost" id="devFill">Заполнить</button></div></div>
        <label class="check"><input type="checkbox" id="devRemember" checked> Запомнить вход на этом устройстве (пароль больше не спросится; забыть — кнопка «Выйти и забыть»)</label>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn flame" type="submit">Войти</button><span class="small" id="devMsg" role="status"></span></div>
      </form></div>`);
    const pass = m.querySelector("#devPass"), msg = m.querySelector("#devMsg");
    m.querySelector("#devEye").onclick = () => pass.classList.toggle("shown");
    pass.value = ""; setTimeout(() => { if (pass.value && !localStorage.getItem(SAVED)) pass.value = ""; }, 400); // браузер мог подставить чужой сохранённый ключ
    m.querySelector("#devFill").onclick = async () => {
      let v = deob(localStorage.getItem(SAVED) || "");
      if (v) { pass.value = v; msg.textContent = "Пароль подставлен. Нажмите «Войти»."; } else msg.textContent = "В этом браузере пароль не сохранён.";
    };
    m.querySelector("#devForm").onsubmit = async e => {
      e.preventDefault();
      msg.textContent = "Проверяю…";
      const chk = await join(pass.value);
      if (!chk.ok) { msg.textContent = chk.message || "Неверный код."; pass.select(); if (window.Log) Log.add("вход", "неверный пароль разработчика"); return; }
      try { if (m.querySelector("#devRemember").checked) { localStorage.removeItem(SAVED); localStorage.setItem(SESSION, mark()); } else { localStorage.removeItem(SAVED); localStorage.removeItem(SESSION); } } catch { }
      closeModal(); enter();
    };
  }
  function enter() {
    try {
      try {
        const sb = document.getElementById("devSettings");
        if (sb) sb.onclick = () => {
          let ov = document.getElementById("devSettingsOv");
          if (!ov) {
            ov = document.createElement("div"); ov.id = "devSettingsOv";
            ov.style.cssText = "position:fixed;inset:0;z-index:12000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px";
            ov.innerHTML = '<div style="background:#fff;border-radius:16px;width:min(980px,100%);height:min(86vh,900px);overflow:hidden;display:flex;flex-direction:column"><div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid #eee"><b>Настройки сайта</b><button class="btn sm" id="devSettingsX">Закрыть</button></div><iframe src="/dev.html?embed=1" style="border:0;flex:1;width:100%"></iframe></div>';
            document.body.appendChild(ov);
            ov.querySelector("#devSettingsX").onclick = () => ov.remove();
            ov.addEventListener("click", e => { if (e.target === ov) ov.remove(); });
          }
        };
      } catch { }
      const nav = document.querySelector(".nav");
      if (nav && !document.getElementById("navDev")) {
        const nb = document.createElement("button");
        nb.type = "button"; nb.className = "chip"; nb.id = "navDev"; nb.textContent = "Разработчик";
        nb.onclick = () => show();
        nav.appendChild(nb);
      }
    } catch { }
    on = true;
    document.body.classList.add("dev-on");
    const root = document.createElement("div"); root.id = "devRoot";
    root.innerHTML = `<div class="dev-bar" role="region" aria-label="Режим разработчика"><b>Режим разработчика</b><button class="btn sm" id="devOpen">Разделы разработчика</button><button class="btn sm flame" id="devExit">Выйти</button><button class="btn sm ghost" id="devTeacher" title="Посмотреть сайт так, как его видит учитель на своём тарифе">👁 Как учитель</button><button class="btn sm ghost" id="devSettings" title="Цены, промпты, материалы, AI">⚙ Настройки</button><button class="btn sm ghost" id="devForget" title="Выйти и больше не входить автоматически на этом устройстве">Выйти и забыть</button></div>
      <main id="view-dev" class="wrap page" hidden></main>`;
    document.body.prepend(root);
    root.querySelector("#devExit").onclick = exit;
    root.querySelector("#devTeacher").onclick = () => { try { sessionStorage.setItem("uchu:as-teacher", "1"); } catch { } exit(); window.Access?.paint(); asTeacherBar(); toast("Сейчас вы видите сайт как учитель на своём тарифе. Вернуться — кнопка «Вернуться к разработчику» вверху.", 7000); };
    root.querySelector("#devForget").onclick = () => { try { localStorage.removeItem(SESSION); localStorage.removeItem(SAVED); } catch { } exit(); window.Access?.paint(); };
    root.querySelector("#devOpen").onclick = () => show(section);
    if (window.Log) Log.add("вход", "включён режим разработчика");
    rerenderCurrent();
    show("files"); window.Access?.paint();
    // всё, что разработчик загружал раньше только у себя, — в общую базу сайта
    setTimeout(() => window.CloudBase?.pushPending().then(n => { if (n && section === "files") show("files"); }), 500);
    toast("Режим разработчика включён. Выход — кнопка «Выйти» вверху.");
  }
  /* Выход: убираем всё, что добавил режим, и перерисовываем текущий раздел */
  function exit() {
    on = false;
    try { closeModal(); } catch { }
    document.getElementById("devRoot")?.remove();
    document.querySelectorAll("[data-devnav]").forEach(n => n.remove());
    document.body.classList.remove("dev-on");
    const v = state.view || "builder";
    ["builder", "library", "materials", "help"].forEach(x => { const el = document.getElementById("view-" + x); if (el) el.hidden = x !== v; });
    rerenderCurrent();
    if (window.Log) Log.add("вход", "режим разработчика выключен");
    toast("Режим разработчика выключен.");
  }
  function rerenderCurrent() {
    try {
      if (state.view === "materials") renderMaterials();
      else if (state.view === "library") renderLibrary();
      else if (state.view === "builder") renderLesson();
    } catch (e) { console.warn(e); }
  }

  /* ---------- разделы ---------- */
  let subj = "ru"; // русский язык и литература — раздельно
  const MAIN = [["files", "Загруженные файлы"], ["rec", "Рекомендации"], ["keys", "Ключи ИИ"], ["teach", "Обучение сайта"]];
  const SECTIONS = [["materials", "Все материалы"], ["exercises", "Конструктор упражнений"], ["lessons", "Конспекты"], ["frp", "ФРП"], ["inbox", "Файлы от пользователей"], ["drafts", "Черновики"], ["logs", "Логи"], ["reports", "Отчёты и собранные файлы"]];
  function show(sec) {
    if (!on) return;
    section = sec;
    ["builder", "library", "materials", "help"].forEach(x => { const el = document.getElementById("view-" + x); if (el) el.hidden = true; });
    document.querySelectorAll(".nav button").forEach(b => b.setAttribute("aria-current", b.id === "nav-dev" ? "page" : "false"));
    const v = document.getElementById("view-dev"); if (!v) return;
    v.hidden = false; window.scrollTo({ top: 0 });
    const main = MAIN.some(([k]) => k === sec);
    v.innerHTML = `<h1>Разработчик</h1><div class="seg dev-subj" role="group" aria-label="Предмет"><button type="button" data-subj="ru" aria-pressed="${subj === "ru"}">Русский язык</button><button type="button" data-subj="lit" aria-pressed="${subj === "lit"}">Литература</button></div>
      <nav class="dev-tabs dev-main" aria-label="Разделы разработчика">${MAIN.map(([k, n]) => `<button class="chip" data-sec="${k}" aria-pressed="${k === sec}">${n}</button>`).join("")}</nav>
      <div id="devBody"></div>
      <details class="dev-more" ${main ? "" : "open"}><summary>Служебные разделы</summary><nav class="dev-tabs">${SECTIONS.map(([k, n]) => `<button class="chip" data-sec="${k}" aria-pressed="${k === sec}">${k === "exercises" && subj === "lit" ? "Вопросы и задания" : n}</button>`).join("")}</nav></details>`;
    v.querySelectorAll("[data-sec]").forEach(b => b.onclick = () => show(b.dataset.sec));
    v.querySelectorAll("[data-subj]").forEach(b => b.onclick = () => { subj = b.dataset.subj; show(section); });
    const body = v.querySelector("#devBody");
    ({ files: secFiles, keys: secKeys, teach: secTeach, rec: x => window.DevCover ? DevCover.render(x, subj) : (x.innerHTML = "<p>Модуль рекомендаций не загружен.</p>"), cover: x => DevCover.render(x, subj), materials: secMaterials, exercises: secExercises, lessons: secLessons, frp: secFrp, inbox: secInbox, drafts: secDrafts, logs: secLogs, reports: secReports })[sec](body);
  }
  // переход в обычный раздел прячет экран разработчика
  const origGo = window.go;
  window.go = function (view, opts) { const v = document.getElementById("view-dev"); if (v) v.hidden = true; document.getElementById("nav-dev")?.setAttribute("aria-current", "false"); return origGo(view, opts); };

  /* Публикация на GitHub — только у владельца сайта: в браузере, где сохранён токен, или по адресу с #owner.
     Методисты, которые входят в режим разработчика, данных репозитория и токена не видят. */
  const OWNER = () => !!(window.Publish?.ready() || /(^|[#&])owner\b/.test(location.hash));
  /* Загруженные файлы: одна большая кнопка (любые файлы) и список того, что уже встроено */
  function secFiles(b) {
    const mine = state.materials.filter(m => !m.builtin && !m.fromNotes && (m.subject || "ru") === subj);
    const built = state.materials.filter(m => m.builtin && (m.subject || "ru") === subj);
    const base = (Base.summary() || []).filter(x => (x.subject || "ru") === subj);
    const row = m => { const st = m.ocr?.status === "run" || m.ocr?.status === "queue" ? "распознаётся" : !(m.text || "").trim() ? (m.unreadable ? "текст не извлечён" : "скан без текста") : (n => n >= 1000 ? `${Math.round(n / 1000)} тыс. знаков` : `${n} знаков`)(m.chars || m.text.length); return `<li><span class="fl-n">${esc(String(m.title || m.name).slice(0, 110))}</span><span class="fl-t">${m.grade ? `<span class="tag">${m.grade} кл.</span>` : ""}<span class="tag">${esc(Materials?.TYPES?.[m.type]?.label || m.kind || "материал")}</span><span class="tag ${/текст не|скан/.test(st) ? "red" : st === "распознаётся" ? "" : "ok"}">${st}</span>${m.cloud ? `<span class="tag ok">у всех учителей</span><button class="btn sm ghost" data-cbdel="${esc(m.id)}" title="Убрать из общей базы">×</button>` : m.cloudAt ? `<span class="tag ok">у всех учителей</span>` : m.devEmbed && (m.text || "").trim() ? `<span class="tag">отправится в общую базу</span>` : ""}</span></li>`; };
    const pending = mine.filter(m => m.devEmbed && !m.cloudAt && (m.text || "").trim()).length;
    b.innerHTML = `<section class="dev-card">${DevCover.upload("dvAny")}</section>
      <section class="dev-card"><h2>Загружено вами (${mine.length})</h2>${mine.length ? `<ul class="fl-list">${mine.map(row).join("")}</ul>` : `<p class="small">Пока ничего. Загрузите файлы кнопкой выше.</p>`}
        <p class="small">Загруженное здесь сразу попадает в общую базу сайта — у всех учителей, без одобрения.${window.Account?.session ? "" : " <b>Войдите в личный кабинет</b>, иначе материал останется только у вас."}</p>
        <div class="mat-row">${pending ? `<button class="btn sm flame" id="dvPush">Отправить в общую базу (${pending})</button>` : ""}<button class="btn plain" id="dvEmbed">${window.Publish?.ready() ? "Запасной вариант: записать в файлы сайта на GitHub" : "Запасной вариант: скачать файл базы (extra.js)"}</button></div></section>
      <section class="dev-card"><h2>Уже встроено в сайт (${built.length + base.length})</h2><ul class="fl-list">${base.map(x => `<li><span class="fl-n">${esc(x.title || x.short)}</span><span class="fl-t">${x.grade ? `<span class="tag">${x.grade} кл.</span>` : ""}<span class="tag ok">в базе</span></span></li>`).join("")}${built.map(row).join("")}</ul></section>`;
    if (window.Access) promoCard(b);
    sharedCard(b);
    DevCover.bindUpload(b, () => show("files"));
    b.querySelector("#dvEmbed").onclick = () => embedAll();
    b.querySelector("#dvPush")?.addEventListener("click", async e => { e.target.disabled = true; await window.CloudBase?.pushPending(); show("files"); });
    b.querySelectorAll("[data-cbdel]").forEach(x => x.onclick = async () => { if (!confirm("Убрать материал из общей базы? У учителей он исчезнет.")) return; try { await window.CloudBase.unpublish(x.dataset.cbdel); show("files"); } catch (e) { toast("Не получилось: " + e.message); } });
  }
  /* Ключи DeepSeek: 5 ячеек. Ключ уходит на сервер (Яндекс-функция) и хранится в облаке,
     сайт видит только начало и конец ключа. Запросы идут по кругу; если аккаунт ответил ошибкой
     (нет денег, лимит, сбой) — запрос сам переходит на следующую ячейку. */
  async function keysApi(body, path = "/admin/keys") {
    const fn = (window.UCHU_AI_CFG?.yandexFn || window.UCHU_SITE?.yandexFunction || "").replace(/\/+$/, ""), tok = window.Account?.session?.access;
    if (!fn) throw new Error("не задан адрес Яндекс-функции");
    if (!tok) throw new Error("войдите в личный кабинет своей почтой (кнопка вверху справа) — ключи может менять только автор сайта");
    // вход мог устареть: обновляем его, но не ждём дольше 8 секунд
    await Promise.race([window.Account.refreshPlan?.().catch(() => null), new Promise(r => setTimeout(r, 8000))]);
    const u = /functions\.yandexcloud\.net/.test(fn) ? `${fn}?path=${encodeURIComponent(path)}` : fn + path;
    const go = () => fetch(u, { method: "POST", headers: { "Content-Type": "application/json", "X-User-Token": window.Account.session.access }, body: JSON.stringify(body), signal: AbortSignal.timeout ? AbortSignal.timeout(30000) : undefined });
    let r;
    try { r = await go(); } catch { await new Promise(x => setTimeout(x, 1500)); try { r = await go(); } catch (e) { throw new Error(e.name === "TimeoutError" || e.name === "AbortError" ? "функция долго не отвечает — нажмите «Повторить» через минуту; если не поможет, откройте в Яндекс Облаке функцию → «Логи» и пришлите скриншот" : "нет связи с функцией: проверьте интернет; если интернет есть — откройте функцию в Яндекс Облаке и убедитесь, что у неё включено «Публичная функция» и загружен последний архив"); } }
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 || r.status === 403) throw new Error((j.error || "нет доступа") + ". Выйдите из личного кабинета и войдите снова своей почтой автора сайта.");
    if (r.status >= 500 && !j.error) throw new Error("функция ответила ошибкой " + r.status + " — откройте её в Яндекс Облаке → «Логи» и пришлите скриншот");
    if (r.status === 404 || r.status === 405 || (!r.ok && /нужен массив messages/.test(j.error || ""))) throw new Error("на сервере старая версия функции — загрузите новый uchu-function.zip");
    if (!r.ok) throw new Error(j.error || "HTTP " + r.status);
    return j;
  }
  const imgKeysApi = body => keysApi(body, "/admin/imgkeys");
  function secKeys(b) {
    b.innerHTML = `<section class="dev-card key-own" id="dvOwn"></section><section class="dev-card" id="dvImg"></section><section class="dev-card"><h2>Общие ключи ИИ</h2><p class="small">Загружаю…</p></section><section class="dev-card"><h2>Общие ключи для картинок</h2><p class="small">Загружаю…</p></section><section class="dev-card" id="dvTest"></section>`;
    ownKeyCard(b.querySelector("#dvOwn")); testPayCard(b.querySelector("#dvTest"));
    const imgBox = b.querySelector("#dvImg");
    const paintImg = () => {
      const ok = window.ImageGen?.own?.(), site = !!(window.UCHU_SITE?.nanoBanana);
      imgBox.innerHTML = `<h2>🎨 Подключение ключа к генерации рабочих листов и презентаций</h2>
        <p class="small">Отдельный ключ для картинок. Он не связан с ключами языковой модели DeepSeek, которая пишет тексты.</p>
        <div class="key-sub"><h3>Личный ключ ${ok ? '<span class="tag">подключён</span>' : '<span class="tag red">не подключён</span>'} <span class="tag">только у вас</span></h3>
          <p class="small">Хранится только в этом браузере и работает только у вас: для ваших проверок и своих листов. Учителям не передаётся.</p>
          <div id="dvImgForm"></div></div>
        <p class="small">Общие ключи для всех учителей (пул с переключением; пустая ячейка внизу добавляет новый ключ) — ниже, в блоке «Общие ключи для картинок».</p>`;
      window.imageKeyForm(imgBox.querySelector("#dvImgForm"), paintImg);
    };
    paintImg();
    const pool = (box, o) => {
    const st = x => x.empty ? `<span class="tag">пусто</span>` : !x.isActive ? `<span class="tag">выключен</span>` : x.resting ? `<span class="tag red">отдыхает ${x.resting} мин${x.last?.status ? ` · ошибка ${x.last.status}` : ""}</span>` : x.last?.status === 200 ? `<span class="tag ok">работает</span>` : `<span class="tag ok">в очереди</span>`;
    const draw = (j, note) => {
      if (j && Array.isArray(j.slots)) window.__keySlots = j.slots.map(x => x.slot);
      box.innerHTML = `<h2>${o.title} <span class="tag red">для всех учителей</span></h2>
        <div class="key-warn">${o.warn}</div>
        ${o.help}
        ${note ? `<p class="tr-now ${note.ok ? "ok" : ""}">${esc(note.message)}</p>` : ""}
        <div class="key-grid">${j.slots.map(x => `<form class="key-slot" data-slot="${x.slot}">
          <div class="key-h"><b>Аккаунт ${x.slot}</b>${x.provider ? `<span class="tag">${esc(x.provider)}</span>` : ""}${st(x)}</div>
          <input type="text" name="label" placeholder="Название, например: почта аккаунта" value="${esc(x.label || "")}" autocomplete="off">
          <input type="text" class="secret" name="key" data-lpignore="true" data-1p-ignore="true" data-form-type="other" placeholder="${x.empty ? o.keyPh : "Ключ: " + esc(x.key) + " (вставьте новый, чтобы заменить)"}" autocomplete="off" spellcheck="false">
          ${o.models ? `<select class="mdl-sel" style="width:100%">${o.models.map(m => `<option value="${m.id}"${m.id === x.model ? " selected" : ""}>${esc(m.name)}</option>`).join("")}<option value=""${x.model && !o.models.some(m => m.id === x.model) ? " selected" : ""}>Другая (впишу название ниже)</option></select>` : ""}<input type="text" name="model" placeholder="${o.modelPh}" value="${esc(x.model || "")}" autocomplete="off" spellcheck="false"${o.models && (!x.model || o.models.some(m => m.id === x.model)) ? " hidden" : ""}>${x.empty ? "" : `<p class="small">Сейчас работает на: <b>${esc(x.model || o.defModel || "модель по умолчанию")}</b></p>`}
          <details${x.url ? " open" : ""}><summary class="small">Свой адрес API (необязательно)</summary><input type="text" name="url" placeholder="https://…/v1" value="${esc(x.url || "")}" autocomplete="off" spellcheck="false"></details>
          <label class="check"><input type="checkbox" name="on" ${x.empty || x.isActive ? "checked" : ""}> Включён</label>
          <div class="row-btn"><button class="btn sm flame" type="submit">Сохранить</button>${x.empty ? "" : `<button class="btn sm" type="button" data-k="test">Проверить</button><button class="btn sm ghost" type="button" data-k="delete">Очистить</button>`}</div>
        </form>`).join("")}</div>
        ${j.env?.length ? `<p class="small">Ещё в настройках функции (${o.envName}): ${j.env.map(e => esc(e.label) + " " + esc(e.key)).join(", ")}.</p>` : ""}`;
      box.querySelectorAll(".key-slot").forEach(f => {
        const slot = +f.dataset.slot, ms = f.querySelector(".mdl-sel");
        if (ms) ms.onchange = () => { f.model.value = ms.value; f.model.hidden = !!ms.value; if (!ms.value) f.model.focus(); };
        const run = async (body, btn) => { const t = btn.textContent; btn.disabled = true; btn.textContent = "…"; try { const r = await o.api(body); draw(r, r.test ? { ...r.test, message: `Аккаунт ${slot}: ${r.test.message}` } : (body.action === "save" ? { ok: true, message: `Аккаунт ${slot} сохранён.` } : body.action === "delete" ? { ok: true, message: `Аккаунт ${slot} очищен.` } : null)); } catch (e) { btn.disabled = false; btn.textContent = t; toast("Не получилось: " + e.message, 7000); } };
        f.onsubmit = e => { e.preventDefault(); if (f.key.value.trim() && !confirm("Это ОБЩИЙ ключ: им будут пользоваться " + o.who + ", деньги спишутся с этого аккаунта. Сохранить?")) return; run({ action: "save", slot, label: f.label.value.trim(), key: f.key.value.trim(), url: f.url.value.trim(), model: f.model.value.trim(), isActive: f.on.checked }, f.querySelector("[type=submit]")); };
        f.querySelectorAll("[data-k]").forEach(x => x.onclick = () => { if (x.dataset.k === "delete" && !confirm(`Очистить аккаунт ${slot}? Ключ удалится с сервера.`)) return; run({ action: x.dataset.k, slot }, x); });
      });
    };
    const load = () => { box.innerHTML = `<h2>${o.title}</h2><p class="small">Загружаю…</p>`; o.api({ action: "list" }).then(j => draw(j)).catch(e => { localKeys(box, o, e); }); };
    function localKeys(box, o, e) {
      const isImg = /картинок/i.test(o.title || "");
      const uniq = "lk" + Math.floor(Math.random() * 1e6);
      box.innerHTML = `<h2>${o.title}</h2>
        <p class="small">Серверные общие ключи доступны только с почты автора сайта (${esc(e.message)}).<br>В режиме разработчика можно сохранить ключи <b>локально в этом браузере — без почты</b>: они применятся к вашей работе с сайтом.</p>
        <div class="row"><input id="${uniq}k" placeholder="${isImg ? "Ключ для картинок (Nano Banana / Google)" : "Ключ любой нейросети (DeepSeek/OpenRouter)"}" style="flex:1;min-width:240px"><input id="${uniq}m" placeholder="Модель (необязательно)" style="width:220px"><button class="btn sm flame" type="button" id="${uniq}s">Сохранить локально</button></div>
        <p class="small" id="${uniq}msg"></p>`;
      box.querySelector("#" + uniq + "s").onclick = () => {
        try {
          const ai = JSON.parse(localStorage.getItem("uchu:ai") || "{}") || {};
          const key = box.querySelector("#" + uniq + "k").value.trim();
          const model = box.querySelector("#" + uniq + "m").value.trim();
          if (isImg) { ai.imgKey = key; }
          else { ai.openaiKey = key; if (!ai.openaiBase) ai.openaiBase = "https://openrouter.ai/api/v1"; if (model) ai.openaiModel = model; }
          localStorage.setItem("uchu:ai", JSON.stringify(ai));
          box.querySelector("#" + uniq + "msg").textContent = "Сохранено локально. Перезагрузите страницу, чтобы ключ применился.";
        } catch (err) { box.querySelector("#" + uniq + "msg").textContent = "Не удалось сохранить: " + err.message; }
      };
    }
    load();
    };
    pool(b.children[2], { api: keysApi, title: "Общие ключи ИИ", who: "все учителя на тарифах с ИИ", envName: "переменная DEEPSEEK_POOL", keyPh: "Ключ любой нейросети", modelPh: "Модель (необязательно), например deepseek-flash",
      warn: "<b>Внимательно: это общий ключ.</b> Им пользуются все учителя на тарифах с ИИ, расход идёт с баланса этого аккаунта. Свой ключ для личной работы сюда не вставляйте — для него блок «Личный ключ» выше.",
      help: `<p class="small">Подходят DeepSeek и сторонний сервис по адресу (OpenAI-совместимый, работающий из России): впишите ключ сервиса, его адрес в «Свой адрес API» и модель. Напрямую Claude, OpenAI, Gemini, Grok и Groq не подключаются. <b>Через сторонние сервисы — на ваш страх и риск:</b> такие посредники обходят ограничения этих компаний, доступ могут отключить в любой момент.</p><p class="small">Заполните столько ячеек, сколько у вас аккаунтов. Запросы учителей идут по кругу; если аккаунт не отвечает (закончились деньги, лимит, сбой) — запрос сам переходит на следующий, учитель ошибки не видит. Ключ после сохранения хранится только на сервере — здесь видны лишь его начало и конец.</p>` });
    pool(b.children[3], { api: imgKeysApi, models: window.ImageGen?.MODELS, defModel: "flux-schnell", title: "Общие ключи для картинок (рабочие листы и презентации)", who: "учителя на тарифах «Учитель + ИИ» (10 листов с картинками в месяц) и «Методист» (40)", envName: "переменная IMG_POOL", keyPh: "Ключ сервиса картинок (например AITUNNEL)", modelPh: "Нейросеть, например flux-schnell или gemini-2.5-flash-image",
      warn: "<b>Внимательно: это общий ключ для картинок.</b> Им пользуются учителя на тарифах «Учитель + ИИ» и «Методист», расход идёт с баланса этого аккаунта. Он не связан с ключами текстовой модели выше.",
      help: `<p class="small">Нужен сервис с OpenAI-совместимым адресом генерации картинок (например AITUNNEL: адрес вида <code>https://api.aitunnel.ru/v1</code>, ключ из личного кабинета). В «Свой адрес API» впишите адрес сервиса, в «Нейросеть» её название из кабинета (для листов рекомендуем flux-schnell). Прямые Google, OpenAI и Claude не подключаются.</p><p class="small">Заполните столько ячеек, сколько у вас ключей: когда один ключ перегружен или закончились деньги, запрос сам уходит на следующий ключ, учитель ошибки не видит. Тариф и месячный лимит листов проверяются на сервере.</p>` });
  }
  /* Тестовая оплата: тариф начисляется без денег — чтобы проверить ИИ сайта (общие ключи DeepSeek) и учёт токенов */
  function testPayCard(box) {
    const fnUrl = path => { const fn = (window.UCHU_AI_CFG?.yandexFn || window.UCHU_SITE?.yandexFunction || "").replace(/\/+$/, ""); return /functions\.yandexcloud\.net/.test(fn) ? `${fn}?path=${encodeURIComponent(path)}` : fn + path; };
    const call = async (path, body) => { const tok = window.Account?.session?.access; if (!tok) throw new Error("войдите в личный кабинет"); await window.Account.refreshPlan?.().catch(() => null); const r = await fetch(fnUrl(path), { method: "POST", headers: { "Content-Type": "application/json", "X-User-Token": window.Account.session.access }, body: JSON.stringify(body) }); const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch { } if (r.status === 404 || /нужен массив messages/.test(j.error || "")) throw new Error("на сервере старая версия функции — загрузите новый архив"); if (!r.ok) throw new Error(j.error || "HTTP " + r.status); return { j, t, h: r.headers }; };
    const usage = () => { const t = window.Account?.session?.tokens; return t ? `Потрачено ${Math.round(t.used / 1000)} тыс. из ${Math.round(t.limit / 1000)} тыс. токенов.` : "Учёт токенов появится после команды в Supabase (колонки tokens_used, tokens_limit)."; };
    const draw = msg => {
      box.innerHTML = `<h2>Проверка оплаты и ИИ сайта <span class="tag">тест, без денег</span></h2>
        <p class="small">1) Смоделируйте оплату тарифа — он начислится вашему кабинету (или учителю по почте), как после настоящей оплаты. 2) Отправьте пробный запрос — он пройдёт через общие ключи DeepSeek, токены спишутся с тарифа.</p>
        <div class="row-btn"><select id="tpItem"><option value="ai">«Учитель + ИИ» (4,9 млн токенов)</option><option value="pro">«Методист» (7,6 млн токенов)</option><option value="basic">«Учитель» (3,2 млн токенов)</option><option value="ai10">+10 конспектов с ИИ</option></select><input type="text" id="tpEmail" placeholder="почта учителя (пусто — вам)" autocomplete="off"><button class="btn sm flame" id="tpPay" type="button">Смоделировать оплату</button></div>
        <div class="row-btn"><button class="btn sm" id="tpAsk" type="button">Пробный запрос к ИИ сайта</button><span class="small">${esc(usage())}</span></div>
        <p class="small" id="tpSt" role="status">${msg || ""}</p>`;
      const st = box.querySelector("#tpSt");
      box.querySelector("#tpPay").onclick = async e => { e.target.disabled = true; st.textContent = "Начисляю…"; try { const { j } = await call("/pay/test", { item: box.querySelector("#tpItem").value, email: box.querySelector("#tpEmail").value.trim() }); await window.Account.refreshPlan?.(); draw(`✓ Начислено: ${esc(JSON.stringify(j.patch))}`); } catch (er) { draw("✗ " + esc(er.message)); } };
      box.querySelector("#tpAsk").onclick = async e => { e.target.disabled = true; st.textContent = "Спрашиваю DeepSeek…"; try { const { j, h } = await call("/deepseek/v1/chat/completions", { model: "deepseek-flash", messages: [{ role: "user", content: "Ответь одной фразой: что такое метафора?" }], max_tokens: 120 }); const a = j.choices?.[0]?.message?.content || "(пустой ответ)"; await window.Account.refreshPlan?.(); draw(`✓ Ответ: «${esc(a.trim().slice(0, 200))}»<br>Аккаунт: ${esc(h.get("X-Uchu-Account") || "—")} · токенов за запрос: ${j.usage?.total_tokens ?? "?"} · всего: ${esc(h.get("X-Uchu-Tokens") || "—")}`); } catch (er) { draw("✗ " + esc(er.message)); } };
    };
    draw();
  }
  /* Обучение сайта: переключатели сборки и правила словами — сразу для всех учителей */
  function secTeach(b) {
    const R = window.Rules; if (!R) { b.innerHTML = "<p>Модуль правил не загружен.</p>"; return; }
    let draft = R.all(), proposal = null;
    const draw = msg => {
      const m = R.meta, aiOn = !!window.AI?.configured?.();
      b.innerHTML = `<section class="dev-card teach">
        <h2>Научить словами</h2>
        <p class="small">Напишите, что не нравится или как должно быть. ${aiOn ? "Нейросеть предложит изменения — вы посмотрите и примените." : "<b>Нейросеть не подключена</b> — пожелание добавится как правило для сборки с ИИ. Чтобы сайт сам переключал настройки, подключите личный ключ (раздел «Ключи ИИ»)."}</p>
        <div class="row-btn"><label for="tcVia" class="small">Нейросеть:</label><select id="tcVia">${(window.AI ? AI.chain(AI.cfg()) : []).map(id => `<option value="${esc(id)}">личная: ${esc(AI.P[id]?.name || id)}</option>`).join("")}${(window.__keySlots && window.__keySlots.length ? window.__keySlots : [1, 2, 3, 4, 5]).map(n => `<option value="slot:${n}">общий ключ ${n}</option>`).join("")}</select></div>
        <textarea class="inp" id="tcWish" rows="3" placeholder="Например: в рабочих листах не нужны предметные результаты; цель на слайде пишите для детей, интересно"></textarea>
        <div class="row-btn"><button class="btn flame" id="tcGo" type="button">${aiOn ? "Разобрать пожелание" : "Добавить как правило"}</button><span class="small" id="tcSt" role="status">${esc(msg || "")}</span></div>
        ${proposal ? `<div class="tc-prop"><b>Предложение нейросети</b>${proposal.explain ? `<p>${esc(proposal.explain)}</p>` : ""}<ul>
          ${Object.entries(proposal.set).map(([k, v]) => { const s = R.SCHEMA.find(x => x.k === k); return `<li>⚙ ${esc(s.label)}: <s>${esc(s.options ? s.options[R.get(k)] : R.get(k))}</s> → <b>${esc(s.options ? s.options[v] : v)}</b></li>`; }).join("")}
          ${proposal.add.map(x => `<li>➕ правило: ${esc(x)}</li>`).join("")}
          ${proposal.remove.map(i => `<li>➖ убрать правило: ${esc(R.get("ai_rules")[i])}</li>`).join("")}
          ${!Object.keys(proposal.set).length && !proposal.add.length && !proposal.remove.length ? "<li>Менять нечего — так уже настроено.</li>" : ""}</ul>
          <div class="row-btn"><button class="btn sm flame" id="tcApply" type="button">Применить для всех</button><button class="btn sm ghost" id="tcCancel" type="button">Отмена</button></div></div>` : ""}
      </section>
      <section class="dev-card teach">
        <h2>Как собирается урок <span class="tag">для всех учителей</span></h2>
        ${R.SCHEMA.map(s => `<div class="field"><label for="tc_${s.k}">${esc(s.label)}</label>${s.options ? `<select id="tc_${s.k}" data-k="${s.k}">${Object.entries(s.options).map(([k, v]) => `<option value="${k}" ${draft[s.k] === k ? "selected" : ""}>${esc(v)}</option>`).join("")}</select>` : `<input type="text" id="tc_${s.k}" data-k="${s.k}" value="${esc(draft[s.k] || "")}">`}</div>`).join("")}
        <h3>Правила для нейросети</h3><p class="small">Добавляются к каждому запросу при сборке и правке уроков с ИИ.</p>
        <ol class="tc-rules">${(draft.ai_rules || []).map((x, i) => `<li><textarea class="inp" data-ri="${i}" rows="2">${esc(x)}</textarea><button class="btn sm ghost" data-rdel="${i}" type="button" aria-label="Удалить правило">×</button></li>`).join("")}</ol>
        <div class="row-btn"><button class="btn sm" id="tcAdd" type="button">+ Правило</button><button class="btn flame" id="tcSave" type="button">Сохранить для всех</button><button class="btn sm ghost" id="tcReset" type="button">Вернуть как было</button></div>
        <p class="small">${m.at ? `Последнее изменение: ${new Date(m.at).toLocaleString("ru-RU")}${m.by ? " — " + esc(m.by) : ""}.` : "Сейчас действуют правила по умолчанию."} Изменения доходят до учителей в течение 15 минут (или при обновлении страницы).</p>
      </section>`;
      const $b = q => b.querySelector(q), st = $b("#tcSt");
      const collect = () => { b.querySelectorAll("[data-k]").forEach(x => draft[x.dataset.k] = x.value); draft.ai_rules = [...b.querySelectorAll("[data-ri]")].map(x => x.value.trim()).filter(Boolean); };
      const apply = async (data, note) => { try { await R.save(data, note); draft = R.all(); proposal = null; draw("Сохранено — действует для всех учителей."); } catch (e) { draw("Не сохранилось: " + (/site_rules|does not exist|schema cache/i.test(e.message) ? "в облаке нет таблицы site_rules — выполните SQL из инструкции" : e.message)); } };
      $b("#tcGo").onclick = async () => {
        const w = $b("#tcWish").value.trim(); if (!w) { st.textContent = "Напишите пожелание."; return; }
        const via = $b("#tcVia")?.value || "auto";
        if (!aiOn && !/^slot:/.test(via)) { collect(); draft.ai_rules.push(w); return apply({ ai_rules: draft.ai_rules }, "добавлено правило"); }
        $b("#tcGo").disabled = true; st.textContent = "Нейросеть думает…";
        try { proposal = await R.teach(w, via); draw(); } catch (e) { $b("#tcGo").disabled = false; st.textContent = "✗ " + e.message; }
      };
      $b("#tcApply")?.addEventListener("click", () => { const rules = (R.get("ai_rules") || []).filter((_, i) => !proposal.remove.includes(i)).concat(proposal.add); apply({ ...proposal.set, ai_rules: rules }, "обучение словами"); });
      $b("#tcCancel")?.addEventListener("click", () => { proposal = null; draw(); });
      $b("#tcAdd").onclick = () => { collect(); draft.ai_rules.push(""); draw(); b.querySelector(".tc-rules li:last-child textarea")?.focus(); };
      b.querySelectorAll("[data-rdel]").forEach(x => x.onclick = () => { collect(); draft.ai_rules.splice(+x.dataset.rdel, 1); draw(); });
      $b("#tcSave").onclick = () => { collect(); apply(draft, "переключатели и правила"); };
      $b("#tcReset").onclick = () => { if (confirm("Вернуть правила по умолчанию для всех учителей?")) apply({ ...R.DEF, ai_rules: [...R.DEF.ai_rules] }, "правила по умолчанию"); };
    };
    draw();
  }
  /* Личный ключ разработчика: только в этом браузере, только для своей работы (собрать урок с ИИ, проверить, доработать) */
  function ownKeyCard(box) {
    const draw = msg => {
      const c = window.AI ? AI.cfg() : null, list = c ? AI.chain(c) : [];
      box.innerHTML = `<h2>Личный ключ <span class="tag ok">только для вас</span></h2>
        <p class="small">Хранится только в этом браузере, учителя им не пользуются. Нужен, чтобы вы сами собирали уроки с ИИ, проверяли и дорабатывали их и «обучали» сайт. Подойдёт ключ нейросети, которая работает из России: DeepSeek, OpenRouter, GigaChat, YandexGPT, Qwen и другие — сайт сам узнает сервис. Напрямую Claude, OpenAI, Gemini, Grok и Groq не подключаются; через сторонний сервис — «Все настройки нейросети» → «Любая нейросеть по одному ключу»: ключ и адрес сервиса, на ваш страх и риск.</p>
        ${list.length ? `<p><b>Подключено:</b> ${list.map(id => esc(AI.P[id]?.name || id)).join(" → ")}</p>` : `<p class="small"><b>Личный ключ ещё не подключён.</b></p>`}
        <div class="row-btn"><input type="text" class="secret" id="okKey" placeholder="Ваш личный ключ API" autocomplete="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true"><button class="btn sm flame" id="okGo" type="button">Подключить</button><button class="btn sm ghost" id="okAll" type="button">Все настройки нейросети</button></div>
        <p class="small" id="okSt" role="status">${esc(msg || "")}</p>`;
      const $b = q => box.querySelector(q);
      $b("#okAll").onclick = () => window.AI?.open();
      $b("#okGo").onclick = async () => {
        const k = $b("#okKey").value.trim(), st = $b("#okSt"); if (!k) { st.textContent = "Вставьте ключ."; return; }
        $b("#okGo").disabled = true;
        try { const r = await AI.connectKey(k, "", t => (st.textContent = t)); draw(`${r.ok ? "✓" : "✗"} ${r.name}, модель ${r.model}: ${r.text}`); }
        catch (e) { st.textContent = "✗ " + (e.message || e); $b("#okGo").disabled = false; }
      };
    };
    draw();
  }
  /* Материалы, которые учителя прикрепили у себя: приходят через облако, видны только автору сайта.
     «Встроить» — материал попадает в «Загружено вами», дальше «Опубликовать для всех учителей». */
  function sharedCard(b) {
    const box = document.createElement("section"); box.className = "dev-card"; box.id = "dvShared";
    box.innerHTML = `<h2>Присланные учителями</h2><p class="small">Загружаю…</p>`;
    const first = b.querySelector(".dev-card"); if (first) first.after(box); else b.prepend(box);
    const draw = async () => {
      let rows;
      try { rows = await window.Account.sharedList(); }
      catch (e) { box.innerHTML = `<h2>Присланные учителями</h2><p class="small">${esc(/does not exist|relation|404|schema cache/i.test(e.message) ? "В облаке ещё нет таблицы для присланных материалов — выполните в Supabase SQL из инструкции." : e.message)}</p>`; return; }
      rows = rows.filter(r => (r.subject || "ru") === subj);
      const have = new Set(state.materials.map(m => m.sharedId).filter(Boolean));
      box.innerHTML = `<h2>Присланные учителями (${rows.length})</h2><p class="small">Материалы учителей больше не присылаются и в базу сайта не встраиваются. Здесь — то, что пришло раньше: это можно только удалить.</p>${rows.length ? `<button class="btn sm ghost" type="button" id="sdAll">Удалить всё присланное</button>` : ""}
        ${rows.length ? `<ul class="fl-list">${rows.map(r => `<li><span class="fl-n">${esc(String(r.title || r.name).slice(0, 110))}<br><span class="small">${esc(r.email || "")} · ${new Date(r.created_at).toLocaleDateString("ru-RU")} · ${Math.round((r.chars || 0) / 1000)} тыс. знаков</span></span><span class="fl-t">${r.grade ? `<span class="tag">${r.grade} кл.</span>` : ""}<span class="tag">${esc(window.Materials?.TYPES?.[r.type]?.label || r.kind || "материал")}</span>${have.has(r.id) ? `<span class="tag ok">встроен</span>` : ``}<button class="btn sm ghost" data-sdel="${esc(r.id)}">Убрать</button></span></li>`).join("")}</ul>` : `<p class="small">Пока ничего не прислано.</p>`}`;
      box.querySelectorAll("[data-sin]").forEach(x => x.onclick = async () => {
        x.disabled = true; x.textContent = "Встраиваю…";
        try {
          const r = await window.Account.sharedGet(x.dataset.sin); if (!r) throw new Error("материал не найден");
          const m = { id: uid(), name: r.name, title: r.title || undefined, kind: r.kind || "other", type: r.type || undefined, subject: r.subject || "ru", grade: r.grade || null, topic: r.topic || null, text: r.text || "", chars: (r.text || "").length, addedAt: new Date().toISOString(), hash: window.Materials ? Materials.hashText(r.text || "") : null, devEmbed: true, sharedId: r.id, from: r.email };
          if (window.Materials && !m.type) Object.assign(m, Materials.classify(m));
          let shared = false; try { shared = await window.CloudBase?.publish(m); } catch (e) { toast("В общую базу не отправилось: " + e.message, 7000); }
          if (shared) m.cloudAt = new Date().toISOString();
          await Store.put("materials", m.id, m); await loadMaterials(); toast(shared ? "Встроено — уже у всех учителей." : "Встроено у вас; в общую базу отправится при следующем входе.", 6000); show("files");
        } catch (e) { toast("Не получилось: " + (e.message || e)); x.disabled = false; x.textContent = "Встроить"; }
      });
      box.querySelector("#sdAll")?.addEventListener("click", async () => { if (!confirm(`Удалить из облака все ${rows.length} присланных материалов? У учителей их материалы останутся.`)) return; for (const r of rows) { try { await window.Account.sharedDel(r.id); } catch { } } draw(); });
      box.querySelectorAll("[data-sdel]").forEach(x => x.onclick = async () => { if (!confirm("Убрать материал из присланных? У учителя он останется.")) return; try { await window.Account.sharedDel(x.dataset.sdel); draw(); } catch (e) { toast("Не получилось: " + (e.message || e)); } });
    };
    draw();
  }
  /* Промокоды свободной зоны — только у владельца. Хранятся хэши (data/promo.js), сами коды нигде не видны. */
  /* Промокоды: хранятся в облаке, в таблице promo_codes; видят и меняют только разработчики.
     У каждого кода скидки — свой процент. Код бесплатного доступа — один: все возможности без оплаты, пока код не удалён. */
  function promoCard(b) {
    const box = document.createElement("section"); box.className = "dev-card"; box.id = "dvPromo";
    const H = `<h2>Промокоды</h2>`;
    box.innerHTML = `${H}<p class="small">Загружаю…</p>`;
    b.prepend(box);
    const gen = () => { const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", r = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), x => A[x % A.length]).join(""); return `FRP-${r(4)}-${r(4)}`; };
    const N = c => String(c || "").toUpperCase().replace(/\s+/g, "").replace(/^ФРП/, "FRP").replace(/[–—]/g, "-");
    const PCT = v => Math.max(1, Math.min(99, Math.round(+v || 50)));
    const draw = async () => {
      let rows;
      try { rows = await window.Account.db("/rest/v1/promo_codes?select=*&order=created_at.asc"); }
      catch (e) { box.innerHTML = `${H}<p class="small">${esc(/promo_codes|does not exist|schema cache|404/i.test(e.message) ? "В облаке ещё нет таблицы промокодов — выполните в Supabase команду из инструкции." : e.message)}</p>`; return; }
      const upgraded = !rows.length || "discount" in rows[0];
      const freeRow = rows.find(r => r.free), list = rows.filter(r => !r.free), on = list.filter(r => r.active).length;
      const used = r => r.used_by?.length ? "ввели: " + esc(r.used_by.join(", ")) : "ещё никто не ввёл";
      box.innerHTML = `${H}
        ${upgraded ? "" : `<p class="small need-text">Чтобы задавать свой процент и код бесплатного доступа, обновите облако: выполните в Supabase (SQL Editor) последний блок из файла supabase.sql.</p>`}
        <h3 class="pc-h">🎁 Бесплатный доступ</h3>
        ${freeRow ? `<ul class="fl-list pc-list"><li class="${freeRow.active ? "" : "off"}"><span class="fl-n"><b class="pc-code">${esc(freeRow.code)}</b> <button class="btn plain" data-pcopy="${esc(freeRow.code)}" title="Скопировать">⧉</button>${freeRow.note ? ` <span class="small">· ${esc(freeRow.note)}</span>` : ""}<br><span class="small">Все возможности сайта без оплаты. ${used(freeRow)}</span></span><span class="fl-t"><span class="tag ${freeRow.active ? "ok" : ""}">${freeRow.active ? "действует" : "отключён"}</span><button class="btn sm ghost" data-ptog="${esc(freeRow.code)}" data-on="${freeRow.active ? 1 : 0}">${freeRow.active ? "Отключить" : "Включить"}</button><button class="btn sm ghost" data-pdel="${esc(freeRow.code)}" data-free="1" aria-label="Удалить">×</button></span></li></ul>`
          : `<p class="small">Такой код может быть только один. Кто его введёт, получит все возможности сайта без оплаты; удалите код — доступ закончится.</p><div class="row-btn"><input type="text" id="pfNew" placeholder="Код, например ДРУЗЬЯ-ФРП" autocomplete="off" spellcheck="false"${upgraded ? "" : " disabled"}><input type="text" id="pfNote" placeholder="Для кого (необязательно)" autocomplete="off"${upgraded ? "" : " disabled"}><button class="btn sm" id="pfGen" type="button"${upgraded ? "" : " disabled"}>Придумать</button><button class="btn sm flame" id="pfAdd" type="button"${upgraded ? "" : " disabled"}>Создать</button></div>`}
        <h3 class="pc-h">🏷 Скидка на тарифы</h3>
        <p class="small">Действующих: ${on} из ${list.length}. Процент скидки задаёте вы. В тарифах с ИИ по коду скидки работает своя нейросеть человека.</p>
        <div class="row-btn"><input type="text" id="pcNew" placeholder="Новый код, например ШКОЛА-2026" autocomplete="off" spellcheck="false"><label class="pc-pct">Скидка <input type="number" id="pcPct" min="1" max="99" value="50"${upgraded ? "" : " disabled"}> %</label><input type="text" id="pcNote" placeholder="Для кого (необязательно)" autocomplete="off"><button class="btn sm" id="pcGen" type="button">Придумать</button><button class="btn sm flame" id="pcAdd" type="button">Добавить</button></div>
        <ul class="fl-list pc-list">${list.map(r => `<li class="${r.active ? "" : "off"}"><span class="fl-n"><b class="pc-code">${esc(r.code)}</b> <button class="btn plain" data-pcopy="${esc(r.code)}" title="Скопировать">⧉</button>${r.note ? ` <span class="small">· ${esc(r.note)}</span>` : ""}<br><span class="small">${used(r)}</span></span><span class="fl-t">${upgraded ? `<label class="pc-pct">−<input type="number" min="1" max="99" value="${PCT(r.discount)}" data-ppct="${esc(r.code)}">%</label>` : `<span class="tag">−50%</span>`}<span class="tag ${r.active ? "ok" : ""}">${r.active ? "действует" : "отключён"}</span><button class="btn sm ghost" data-ptog="${esc(r.code)}" data-on="${r.active ? 1 : 0}">${r.active ? "Отключить" : "Включить"}</button><button class="btn sm ghost" data-pdel="${esc(r.code)}" aria-label="Удалить">×</button></span></li>`).join("")}</ul>`;
      const $b = q => box.querySelector(q);
      const add = async (code, body) => {
        code = N(code); if (code.length < 4) { toast("Код — не короче 4 знаков."); return; }
        if (rows.some(r => N(r.code) === code)) { toast("Такой код уже есть."); return; }
        try { await window.Account.db("/rest/v1/promo_codes", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ code, ...body }) }); toast("Код добавлен и уже работает."); draw(); } catch (e) { toast(/promo_one_free|duplicate/i.test(e.message) ? "Код бесплатного доступа уже есть — он может быть только один." : "Не получилось: " + e.message); }
      };
      $b("#pcGen").onclick = () => { $b("#pcNew").value = gen(); };
      $b("#pcAdd").onclick = () => add($b("#pcNew").value, { note: $b("#pcNote").value.trim() || null, ...(upgraded ? { discount: PCT($b("#pcPct").value) } : {}) });
      if ($b("#pfGen")) $b("#pfGen").onclick = () => { $b("#pfNew").value = gen(); };
      if ($b("#pfAdd")) $b("#pfAdd").onclick = () => add($b("#pfNew").value, { note: $b("#pfNote").value.trim() || null, free: true });
      box.querySelectorAll("[data-ppct]").forEach(x => x.onchange = async () => { const v = PCT(x.value); x.value = v; try { await window.Account.db(`/rest/v1/promo_codes?code=eq.${encodeURIComponent(x.dataset.ppct)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ discount: v }) }); toast(`Скидка по коду ${x.dataset.ppct}: ${v}%. Для тех, кто введёт код теперь.`); } catch (e) { toast("Не получилось: " + e.message); } });
      box.querySelectorAll("[data-pcopy]").forEach(x => x.onclick = async () => { try { await navigator.clipboard.writeText(x.dataset.pcopy); toast("Скопировано: " + x.dataset.pcopy); } catch { prompt("Скопируйте код:", x.dataset.pcopy); } });
      box.querySelectorAll("[data-ptog]").forEach(x => x.onclick = async () => { try { await window.Account.db(`/rest/v1/promo_codes?code=eq.${encodeURIComponent(x.dataset.ptog)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ active: x.dataset.on !== "1" }) }); draw(); } catch (e) { toast("Не получилось: " + e.message); } });
      box.querySelectorAll("[data-pdel]").forEach(x => x.onclick = async () => { if (!confirm(x.dataset.free ? `Удалить код бесплатного доступа ${x.dataset.pdel}? Бесплатный доступ закончится у всех, кто его ввёл.` : `Удалить код ${x.dataset.pdel}? Те, кто уже ввёл его, скидку сохранят.`)) return; try { await window.Account.db(`/rest/v1/promo_codes?code=eq.${encodeURIComponent(x.dataset.pdel)}`, { method: "DELETE" }); draw(); } catch (e) { toast("Не получилось: " + e.message); } });
    };
    draw();
  }
  /* прежний вариант: отпечатки кодов в data/promo.js (запасной, когда облако не подключено) */
  function promoCardOld(b) {
    const box = document.createElement("section"); box.className = "dev-card";
    const list = () => [].concat(window.UCHU_PROMO || []);
    const draw = () => {
      box.innerHTML = `<h2>Промокоды (свободная зона)</h2><p class="hint">Промокод открывает все функции без оплаты; нейросеть человек подключает сам. Хранятся только «отпечатки» кодов — сам код знаете только вы. Действующих кодов: ${list().length}.</p>
        <div class="row-btn"><input type="text" id="pcNew" placeholder="Новый промокод, например ШКОЛА-2026" autocomplete="off" spellcheck="false"><button class="btn sm flame" id="pcAdd">Добавить</button></div>
        <ul class="fl-list">${list().map((h, i) => `<li><span class="fl-n">код № ${i + 1} · отпечаток ${h.slice(0, 10)}…</span><button class="btn sm ghost" data-pdel="${i}">Отключить</button></li>`).join("")}</ul>`;
      box.querySelector("#pcAdd").onclick = async () => { const v = box.querySelector("#pcNew").value.trim(); if (v.length < 4) { toast("Промокод — не короче 4 знаков."); return; } const h = await Access.sha(v); if (list().includes(h)) { toast("Такой код уже есть."); return; } window.UCHU_PROMO = [...list(), h]; await publishPromo(`Добавлен промокод (${list().length})`); draw(); };
      box.querySelectorAll("[data-pdel]").forEach(x => x.onclick = async () => { window.UCHU_PROMO = list().filter((_, i) => i !== +x.dataset.pdel); await publishPromo("Отключён промокод"); draw(); });
    };
    draw(); b.prepend(box);
  }
  async function publishPromo(msg) {
    const js = `/* «Учу по ФРП»: промокоды свободного режима (только хэши). Изменено ${new Date().toLocaleString("ru-RU")} */\nwindow.UCHU_PROMO = ${JSON.stringify([].concat(window.UCHU_PROMO || []))};\n`;
    if (window.Publish?.ready()) { try { await Publish.commit([{ path: "data/promo.js", content: js }], msg); toast("Промокоды опубликованы — заработают на сайте через 1–2 минуты."); return; } catch (e) { toast("Не опубликовалось: " + (e.message || e)); } }
    await saveFile("promo.js", new Blob([js], { type: "text/javascript" })); toast("Файл promo.js скачан: положите его в папку data на GitHub вместо старого.", 8000);
  }
  function secMaterials(b) {
    const base = (Base.summary() || []).filter(s => (s.subject || "ru") === subj);
    b.innerHTML = `${OWNER() ? `<section class="dev-card" id="ghCard"></section>` : ""}
      <section class="dev-card"><h2>Все материалы сайта</h2><p class="hint">Встроенные (data/extra.js) и загруженные вами в режиме разработчика. Загрузите файлы — они очистятся, разложатся по классам и темам${window.Publish?.ready() ? " и сразу опубликуются для всех учителей" : "; затем скачайте extra.js и передайте владельцу сайта"}.</p>
      <div class="mat-drop" id="dvDrop"><p>Перетащите сюда учебники, тетради, разработки (.docx, .pdf, .txt) — можно сразу много</p><label class="btn sm flame">Загрузить и встроить для всех<input type="file" id="dvAdd" multiple accept=".pdf,.docx,.txt,.md,.json" hidden></label></div>
      <div class="mat-row"><button class="btn sm" id="dvEmbed">${window.Publish?.ready() ? "Опубликовать базу сейчас" : "Скачать новый extra.js"}</button><label class="btn sm ghost">Распознать скан (OCR)<input type="file" id="dvOcr" accept=".pdf" hidden></label></div><div id="dvLib"></div></section>
      <section class="dev-card"><h2>Встроенная база (data/base.js) — ${subj === "ru" ? "русский язык" : "литература"}</h2><div class="mcards">${base.map(s => `<article class="mcard"><div class="mc-ico">${s.kind === "lesson" ? "📘" : s.kind === "workbook" ? "✍️" : "📚"}</div><div class="mc-body"><h3>${esc(s.short)}</h3><p class="mc-desc">${esc(s.title)}</p><div class="tags">${s.grade ? `<span class="tag">${s.grade} класс</span>` : ""}<span class="tag">${s.subject === "lit" ? "Литература" : "Русский"}</span>${s.ex ? `<span class="tag">упражнений: ${s.ex}</span>` : ""}${s.items ? `<span class="tag">фрагментов: ${s.items}</span>` : ""}</div></div></article>`).join("")}</div></section>`;
    Materials.renderLib(b.querySelector("#dvLib"), "all");
    if (window.Publish && OWNER()) Publish.panel(b.querySelector("#ghCard"));
    const add = async files => { if (!files.length) return; await addMaterials(files); show("materials"); };
    b.querySelector("#dvAdd").onchange = e => { add([...e.target.files]); e.target.value = ""; };
    const drop = b.querySelector("#dvDrop");
    ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", e => add([...(e.dataTransfer.files || [])]));
    b.querySelector("#dvEmbed").onclick = () => embedAll();
    b.querySelector("#dvOcr").onchange = async e => { const f = e.target.files[0]; if (!f) return; await addMaterials([f]); toast("Скан добавлен; если в нём нет текста, он поставлен на распознавание. Потом скачайте новый extra.js."); show("materials"); };
  }
  /* Новый extra.js: встроенные материалы + принятые разработчиком (локальные копии и файлы пользователей) */
  async function embedAll() {
    const inbox = await inboxGet();
    const accepted = new Set(Object.entries(inbox.status || {}).filter(([, s]) => s === "встроен").map(([id]) => id));
    const items = state.materials.filter(m => !m.fromNotes && (m.builtin || m.editedBuiltin || accepted.has(m.id) || m.devEmbed)).map(({ builtin, _snip, ocrParts, devEmbed, ...m }) => ({ ...m, original: undefined }));
    if (!items.length) { toast("Нечего встраивать."); return; }
    await downloadDataJs("extra.js", "UCHU_EXTRA", { version: new Date().toISOString().slice(0, 10), items });
    if (window.Log) Log.add("встраивание", `extra.js: ${items.length} материалов`);
    if (!window.Publish?.ready()) toast(`extra.js скачан (${items.length} материалов). Передайте файл владельцу сайта — он обновит базу для всех.`, 10000);
  }

  function secExercises(b) {
    if (subj === "lit") return secLitTasks(b);
    const fromMats = state.materials.filter(m => !m.scanned && m.text && (m.type === "exercise" || /workbook|textbook/.test(m.kind))).flatMap(m => Materials.exercises(m));
    const B = window.UCHU_BASE, src = i => (B?.sources || [])[i]?.short || "база";
    const mech = KB.ru.mechanics;
    const fromBase = (B?.ru || []).filter(x => x.k === "ex").map(x => { const low = x.t.slice(0, 300).toLowerCase(); return { text: x.t, tags: mech.filter(mm => mm.formula.toLowerCase().split(/[ ,.(]/).filter(w => w.length > 5).slice(0, 3).some(w => low.includes(w.slice(0, 6)))).map(mm => mm.name).slice(0, 3), topic: x.sec, grade: B.sources[x.s]?.grade, hard: /в каком/i.test(low), src: `${src(x.s)}, с. ${x.p}, упр. ${x.n}` }; });
    const all = [...fromMats, ...fromBase].map(e => ({ ...e, tags: e.tags?.length ? e.tags : ["Без типа"] }));
    const tags = [...new Set(all.flatMap(e => e.tags))].sort();
    const topics = [...new Set(all.map(e => e.topic).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
    b.innerHTML = `<section class="dev-card"><h2>Конструктор упражнений</h2><p class="hint">Упражнения из всех материалов. Тип определяется по содержанию (формулировка, ключевые слова, структура); если подходит под несколько — у упражнения несколько тегов. Всего: ${all.length}.</p>
      <div class="mat-tools"><input type="search" class="inp" id="exQ" placeholder="Поиск по тексту упражнения"><select id="exTag"><option value="">все типы</option>${tags.map(t => `<option>${esc(t)}</option>`).join("")}</select><select id="exTopic"><option value="">все темы</option>${topics.map(t => `<option>${esc(t)}</option>`).join("")}</select><select id="exGrade"><option value="">все классы</option>${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(g => `<option>${g}</option>`).join("")}</select></div><div id="exList"></div></section>`;
    const paint = () => {
      const q = b.querySelector("#exQ").value.toLowerCase(), tg = b.querySelector("#exTag").value, tp = b.querySelector("#exTopic").value, gr = b.querySelector("#exGrade").value;
      const arr = all.filter(e => (!q || e.text.toLowerCase().includes(q)) && (!tg || e.tags.includes(tg)) && (!tp || e.topic === tp) && (!gr || String(e.grade) === gr));
      b.querySelector("#exList").innerHTML = `<p class="small">Показано ${Math.min(arr.length, 120)} из ${arr.length}</p>` + arr.slice(0, 120).map(e => `<article class="ex-card"><div class="tags">${e.tags.map(t => `<span class="tag">${esc(t)}</span>`).join("")}${e.topic ? `<span class="tag blue">${esc(e.topic)}</span>` : ""}${e.grade ? `<span class="tag">${e.grade} кл.</span>` : ""}${e.hard ? `<span class="tag red">повышенный</span>` : ""}</div><pre>${esc(e.text.slice(0, 900))}${e.text.length > 900 ? "…" : ""}</pre><p class="small">${esc(e.src)}</p></article>`).join("");
    };
    ["exQ", "exTag", "exTopic", "exGrade"].forEach(id => b.querySelector("#" + id).addEventListener("input", paint)); paint();
  }

  /* Литература: вопросы и задания учебника и разработок (вместо конструктора упражнений) */
  function secLitTasks(b) {
    const L = window.UCHU_BASE?.lit, src = i => (window.UCHU_BASE?.sources || [])[i]?.short || "база";
    const qs = (L?.questions || []).map(q => ({ text: q.t, part: L.parts[q.part], src: `${src(q.s)}, с. ${q.p}` }));
    b.innerHTML = `<section class="dev-card"><h2>Вопросы и задания по литературе</h2><p class="hint">Из учебника и разработок во встроенной базе. Всего: ${qs.length}. Темы без вопросов видны в разделе «Темы ФРП».</p><input type="search" class="inp" id="lqQ" placeholder="Автор, произведение или слово из вопроса"><div id="lqList"></div></section>`;
    const paint = () => { const q = b.querySelector("#lqQ").value.toLowerCase(); const arr = qs.filter(x => !q || (x.text + " " + (x.part?.author || "") + " " + (x.part?.title || "")).toLowerCase().includes(q)); b.querySelector("#lqList").innerHTML = `<p class="small">Показано ${Math.min(arr.length, 150)} из ${arr.length}</p><ul>${arr.slice(0, 150).map(x => `<li>${esc(x.text)} <span class="small">(${esc((x.part?.author || "") + " " + (x.part?.title || ""))}; ${esc(x.src)})</span></li>`).join("")}</ul>`; };
    b.querySelector("#lqQ").addEventListener("input", paint); paint();
  }
  function secLessons(b) {
    const k0 = Learn.get(), k = { ...k0, lessons: k0.lessons.filter(l => (l.subject || "lit") === subj) };
    b.innerHTML = `<section class="dev-card"><h2>Конспекты и разработки (образцы)</h2><p class="hint">Уроки, которые система выделила из разработок и сборников планов-конспектов. По ним строится структура урока на ту же тему и подбираются вопросы. Всего: ${k.lessons.length}.</p>
      <input type="search" class="inp" id="lsQ" placeholder="Найти урок по теме"><div id="lsList"></div></section>`;
    const paint = () => {
      const q = b.querySelector("#lsQ").value.toLowerCase();
      const arr = k.lessons.filter(l => !q || l.topic.toLowerCase().includes(q) || l.src.toLowerCase().includes(q));
      b.querySelector("#lsList").innerHTML = arr.slice(0, 150).map((l, i) => `<details class="ls"><summary><b>${esc(l.topic.slice(0, 140))}</b> <span class="small">${esc(l.src)}${l.num ? `, урок № ${l.num}` : ""} · вопросов ${l.questions.length} · этапов ${l.stages.length}</span></summary>
        ${l.epigraph ? `<p><i>Эпиграф:</i> ${esc(l.epigraph.text)} — ${esc(l.epigraph.author)}</p>` : ""}${l.typeLine ? `<p><i>Тип урока:</i> ${esc(l.typeLine)}</p>` : ""}
        <p><i>Структура:</i></p><ol>${l.stages.map(s => `<li>${esc(s.name)}${s.steps.length ? `<ul>${s.steps.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}</li>`).join("")}</ol>
        <p><i>Вопросы (тип по методике):</i></p><ul>${l.questions.slice(0, 25).map(q => `<li><span class="tag">${esc(Learn.CATS[q.cat]?.label || q.cat)}</span> ${esc(q.text)}${q.generic ? " <span class='tag ok'>образец</span>" : ""}</li>`).join("")}</ul></details>`).join("") || "<p>Ничего не найдено.</p>";
    };
    b.querySelector("#lsQ").addEventListener("input", paint); paint();
  }

  function secFrp(b) {
    b.innerHTML = `<section class="dev-card"><h2>ФРП</h2><div id="dvFrp"></div><p class="hint">Встроены 4 программы (data/frp.js): русский язык 5–9 (2025, с поурочным планированием) и 10–11, литература 5–9 и 10–11 — результаты, темы, программное содержание и виды деятельности дословно. Если выйдет новая редакция: загрузите её файл (.pdf с текстом или .docx) — он заменит программу для своих классов; затем «Встроить для всех» (файл frp.js передайте владельцу сайта, если публикация не подключена).</p><div class="mat-row"><button class="btn sm" id="dvFrpUp">Загрузить файл программы</button><button class="btn sm flame" id="dvFrpEmbed">Встроить для всех (frp.js)</button></div></section>`;
    b.querySelector("#dvFrp").innerHTML = [subj].map(k => { const l = FRP.list(k); return `<h3>${k === "ru" ? "Русский язык" : "Литература"}</h3>` + (l.length ? l.map(d => { const sm = FRP.summary(d); return `<p><b>${esc(d.name)}</b> (${d.builtin ? "встроена" : "загружена в этом браузере"}): классы ${sm.grades.join(", ") || "—"}; тем ${sm.topics}; предметных результатов ${sm.subject}; личностных ${sm.personal}; метапредметных ${sm.meta}.</p>`; }).join("") : `<p class="small">Не встроена.</p>`); }).join("");
    b.querySelector("#dvFrpUp").onclick = () => document.getElementById("frpInput").click();
    b.querySelector("#dvFrpEmbed").onclick = () => embedFrp().catch(e => toast("Не получилось: " + (e.message || e)));
  }

  /* ---------- файлы от пользователей ---------- */
  const IKEY = "dev:inbox";
  async function inboxGet() { try { return (await Store.get("kv", IKEY)) || { subs: [], status: {} }; } catch { return { subs: [], status: {} }; } }
  async function inboxPut(v) { try { await Store.put("kv", IKEY, v); } catch (e) { toast("Не удалось сохранить: " + (e.message || e)); } }
  function inboxBadge() { return ""; }
  async function secInbox(b) {
    const ib = await inboxGet();
    const items = ib.subs.flatMap(s => s.items.map(it => ({ ...it, _sub: s })));
    const F = secInbox.F || (secInbox.F = { status: "", q: "", from: "" });
    const froms = [...new Set(ib.subs.map(s => s.from || "не указан"))];
    b.innerHTML = `<section class="dev-card"><h2>Файлы от пользователей</h2>
      <p class="hint">Пакеты, которые пришли на почту (файлы «uchu-po-frp_materialy_….json»). Загрузите сразу несколько — повторы по ID не добавятся. Затем просмотрите и встройте понравившееся; после этого скачайте новый extra.js.</p>
      <div class="mat-row"><label class="btn sm flame">Загрузить пакеты<input type="file" id="ibLoad" accept=".json" multiple hidden></label><button class="btn sm ghost" id="ibEmbed">Скачать extra.js со встроенными</button></div>
      <div class="mat-tools"><input type="search" class="inp" id="ibQ" placeholder="Поиск" value="${esc(F.q)}"><select id="ibSt"><option value="">все статусы</option>${["новый", "просмотрен", "встроен"].map(s => `<option ${F.status === s ? "selected" : ""}>${s}</option>`).join("")}</select><select id="ibFrom"><option value="">все отправители</option>${froms.map(f => `<option ${F.from === f ? "selected" : ""}>${esc(f)}</option>`).join("")}</select></div>
      <div id="ibList"></div></section>`;
    const st = it => ib.status[it.id] || "новый";
    const paint = () => {
      const q = F.q.toLowerCase();
      const arr = items.filter(it => (!F.status || st(it) === F.status) && (!F.from || (it._sub.from || "не указан") === F.from) && (!q || `${it.title || it.name} ${it.text || ""}`.toLowerCase().includes(q)));
      b.querySelector("#ibList").innerHTML = arr.length ? `<table class="ib-table"><thead><tr><th>Файл</th><th>От кого / когда</th><th>Описание</th><th>Статус</th><th></th></tr></thead><tbody>${arr.map(it => `<tr data-ib="${esc(it.id)}"><td><b>${esc(it.title || it.name)}</b><br><span class="small">${(it.chars || 0).toLocaleString("ru-RU")} знаков · ${esc(Materials.TYPES[it.type]?.label || it.kind || "")}${it.grade ? ` · ${it.grade} кл.` : ""}</span></td><td>${esc(it._sub.from || "не указан")}<br><span class="small">${new Date(it._sub.createdAt).toLocaleString("ru-RU")}</span></td><td>${esc(it._sub.note || it.desc || "")}</td><td><span class="tag ${st(it) === "встроен" ? "ok" : st(it) === "новый" ? "warn" : ""}">${st(it)}</span></td><td class="ib-acts"><button class="btn sm ghost" data-iba="view">Открыть</button><button class="btn sm ghost" data-iba="struct">Структура урока</button>${st(it) === "встроен" ? `<button class="btn sm ghost" data-iba="unembed">Убрать из базы</button>` : `<button class="btn sm teal" data-iba="embed">Встроить в базу</button>`}</td></tr>`).join("")}</tbody></table>` : `<p>${items.length ? "Ничего не найдено." : "Пакетов пока нет."}</p>`;
      b.querySelectorAll("[data-iba]").forEach(btn => btn.onclick = async () => {
        const it = items.find(x => x.id === btn.closest("tr").dataset.ib);
        if (btn.dataset.iba === "view") { Materials.openViewer(it); if (st(it) === "новый") { ib.status[it.id] = "просмотрен"; await inboxPut(ib); } }
        if (btn.dataset.iba === "struct") {
          const segs = Learn.splitLessons({ ...it, collection: /урок\s*№/i.test(it.text || "") });
          openModal(`<div class="dialog"><div class="dlg-h"><h2>Структура: ${esc(it.title || it.name)}</h2><button class="btn ghost x" data-close aria-label="Закрыть">×</button></div><div class="dlg-b">${segs.slice(0, 20).map(l => `<h3>${esc(l.topic.slice(0, 120))}</h3><ol>${l.stages.map(s => `<li>${esc(s.name)}${s.steps.length ? ` — ${s.steps.map(esc).join("; ")}` : ""}</li>`).join("") || "<li>этапы не выделены</li>"}</ol><p class="small">Вопросов: ${l.questions.length}; приёмы: ${esc(l.techniques.join(", ") || "—")}</p>`).join("")}</div></div>`);
          if (st(it) === "новый") { ib.status[it.id] = "просмотрен"; await inboxPut(ib); }
        }
        if (btn.dataset.iba === "embed") {
          const { _sub, ...m } = it;
          await Store.put("materials", m.id, { ...m, devEmbed: true, from: _sub.from || null, addedAt: m.addedAt || _sub.createdAt });
          ib.status[it.id] = "встроен"; await inboxPut(ib); await loadMaterials();
          if (window.Log) Log.add("встраивание", `встроен файл пользователя: ${m.title || m.name}`);
          if (window.Publish?.ready() && Publish.cfg().auto) await embedAll();
          else toast("Встроено в базу этого браузера. Чтобы стало у всех — «Опубликовать базу сейчас» (или скачайте extra.js).", 7000);
        }
        if (btn.dataset.iba === "unembed") { await Store.del("materials", it.id); ib.status[it.id] = "просмотрен"; await inboxPut(ib); await loadMaterials(); }
        secInbox(b);
      });
    };
    b.querySelector("#ibQ").addEventListener("input", e => { F.q = e.target.value; paint(); });
    b.querySelector("#ibSt").onchange = e => { F.status = e.target.value; paint(); };
    b.querySelector("#ibFrom").onchange = e => { F.from = e.target.value; paint(); };
    b.querySelector("#ibEmbed").onclick = embedAll;
    b.querySelector("#ibLoad").onchange = async e => {
      let added = 0, dup = 0;
      const seen = new Set(items.map(x => x.id));
      for (const f of e.target.files) {
        try {
          const j = JSON.parse(await f.text());
          if (j.app !== "uchu-po-frp-materials" || !Array.isArray(j.items)) { toast(`«${f.name}» — не пакет материалов «Учу по ФРП».`); continue; }
          const fresh = j.items.filter(it => it.id && !seen.has(it.id));
          dup += j.items.length - fresh.length; fresh.forEach(it => seen.add(it.id));
          if (fresh.length) { ib.subs.push({ id: j.id || "sub-" + Date.now(), from: j.from || "", note: j.note || "", createdAt: j.createdAt || new Date().toISOString(), file: f.name, items: fresh }); added += fresh.length; }
        } catch { toast(`Не удалось прочитать «${f.name}».`); }
      }
      await inboxPut(ib);
      toast(`Добавлено файлов: ${added}${dup ? `, повторов пропущено: ${dup}` : ""}.`);
      secInbox(b);
    };
    paint();
  }

  async function secDrafts(b) {
    const ls = await listLessons();
    const versions = ls.filter(l => /\(до правки\)$/.test(l.title));
    const nd = window.Notes ? Notes.draft : null;
    b.innerHTML = `<section class="dev-card"><h2>Черновики</h2>
      <h3>Уроки в этом браузере (${ls.length})</h3><ul>${ls.slice(0, 200).map(l => `<li><button class="btn plain" data-open="${esc(l.id)}">${esc(l.title)}</button> <span class="small">${l.params?.grade || ""} кл. · ${esc(l.params?.type?.name || "")} · ${new Date(l.updatedAt || l.createdAt).toLocaleString("ru-RU")}${l.plan?.format ? ` · формат: ${esc(l.plan.format.name)}` : ""}${l.verify ? ` · сверка: ${l.verify.ok}/${l.verify.checked}` : ""}</span></li>`).join("")}</ul>
      <h3>Версии до правки с ИИ (${versions.length})</h3>
      <h3>Черновик заметок к уроку</h3><pre class="dev-pre">${esc(JSON.stringify(nd ? { ...nd, files: nd.files?.map(f => f.name) } : {}, null, 2))}</pre></section>`;
    b.querySelectorAll("[data-open]").forEach(x => x.onclick = () => { const L = ls.find(l => l.id === x.dataset.open); if (L) { openLesson({ ...L, status: {} }); } });
  }
  function secLogs(b) {
    const arr = Log.read().slice().reverse();
    b.innerHTML = `<section class="dev-card"><h2>Логи (${arr.length})</h2><div class="mat-row"><button class="btn sm ghost" id="lgDl">Скачать журнал</button><button class="btn sm ghost" id="lgClear">Очистить</button></div><table class="ib-table"><thead><tr><th>Когда</th><th>Тип</th><th>Событие</th></tr></thead><tbody>${arr.map(x => `<tr><td class="small">${new Date(x.at).toLocaleString("ru-RU")}</td><td><span class="tag ${x.type === "ошибка" ? "red" : ""}">${esc(x.type)}</span></td><td>${esc(x.text)}</td></tr>`).join("")}</tbody></table></section>`;
    b.querySelector("#lgDl").onclick = () => saveFile("uchu-po-frp_log.json", new Blob([JSON.stringify(arr, null, 1)], { type: "application/json" }));
    b.querySelector("#lgClear").onclick = () => { Log.clear(); secLogs(b); };
  }
  async function secReports(b) {
    const l = Collect.ledger(), ls = await listLessons(), vers = await Learn.versions();
    b.innerHTML = `<section class="dev-card"><h2>Отчёты и собранные файлы</h2>
      <h3>Отправки материалов из этого браузера (${l.batches.length})</h3><ul>${l.batches.slice().reverse().map(x => `<li>${new Date(x.at).toLocaleString("ru-RU")} — ${x.count} шт., ${esc(x.method)}, ${esc(x.file)}<br><span class="small">${esc(x.titles.join("; "))}</span></li>`).join("") || "<li>—</li>"}</ul>
      <h3>Сверка фактов в уроках</h3><ul>${ls.filter(x => x.verify).slice(0, 50).map(x => `<li><b>${esc(x.title)}</b>: ${esc(Verify.line(x.verify))}${x.verify.flagged.length ? `<br><span class="small">требует проверки: ${esc(x.verify.flagged.map(f => f.text).join("; "))}</span>` : ""}${x.verify.sources.length ? `<br><span class="small">источники: ${esc(x.verify.sources.map(s => s.title).join("; "))}</span>` : ""}</li>`).join("") || "<li>—</li>"}</ul>
      <h3>Обновления обучения (${vers.length})</h3><ul>${vers.slice().reverse().map(v => `<li>${new Date(v.at).toLocaleString("ru-RU")}: вопросов ${v.counts.questions}, структур ${v.counts.structures}, уроков-образцов ${v.counts.lessons}${v.added?.length ? `; добавлено: ${esc(v.added.join(", "))}` : ""}</li>`).join("")}</ul></section>`;
  }

  /* ---------- кнопка входа (внизу страницы) ---------- */
  function mountEntry() {
    if (document.getElementById("devEntry")) return;
    const f = document.createElement("footer"); f.className = "site-foot";
    // внизу — только неприметные серые ссылки: инструкция, источники, вход разработчика
    f.innerHTML = `<div class="wrap foot-links foot-center"><span class="foot-q">Есть вопрос? <button type="button" class="foot-link" id="helpLink">Инструкция</button> · <button type="button" class="foot-link" id="docsLink">Документы</button></span><span class="foot-docs-in" id="docsBox" hidden><a href="legal/tarify.html">Тарифы и услуги</a><a href="legal/oferta.html">Договор-оферта</a><a href="legal/privacy.html">Политика конфиденциальности</a><a href="legal/contacts.html">Контакты и реквизиты</a></span><span class="foot-dev" id="devEntry">© 2026</span></div>`;
    document.body.appendChild(f);
    f.querySelector("#docsLink").onclick = () => { const b = f.querySelector("#docsBox"); b.hidden = !b.hidden; };
    f.querySelector("#helpLink").onclick = () => { if (typeof go === "function") go("help"); window.scrollTo(0, 0); };
  }
  document.addEventListener("DOMContentLoaded", mountEntry);
  // запомненный вход действует только вместе с кабинетом той же почты (если облако подключено)
  const remembered = () => { try { const v = localStorage.getItem(SESSION) || ""; return window.Account?.ready?.() ? !!email() && v === mark() : false; } catch { return false; } };
  return { wantDev: false, openLogin, enter, exit, show, publishBase: embedAll, remembered, get on() { return on; } };
})();
window.Dev = Dev;
