/* ===================================================================
   «Учу по ФРП» — редактор презентаций (v5), по гибкости близкий к Gamma.
   • Читаемость с последних парт: крупный шрифт, автоподбор размера
     (много текста — немного меньше, мало — крупнее), обрезки нет: если
     слайд не помещается даже при минимальном шрифте, он делится на 2–3.
   • Шаблоны: титульный, разделитель, одна колонка, две колонки,
     заголовок + текст, список, цитата, сравнение, галерея, изображение
     на весь слайд. Смена шаблона не трогает содержимое.
   • Всё редактируется: заголовок отдельно, текст, порядок блоков
     (перетаскивание), фон (цвет или картинка), картинки (вставка,
     кадрирование, замена, удаление, размер и положение, Ctrl+V,
     перетаскивание своих файлов, «сделать фоном»).
   • Миниатюры слева: выбор, перетаскивание, добавление, дублирование,
     копирование и вставка, удаление. Отмена и повтор (Ctrl+Z / Ctrl+Y).
   • Темы оформления, ручные размер шрифта, отступы, межстрочный интервал.
   • Автосохранение; выгрузка в HTML (и PDF, PowerPoint — кнопки сверху).
   Формат хранения прежний — Markdown; настройки слайда лежат в служебном
   комментарии <!--@ {...} -->, заметки учителя — в обычном <!-- … -->.
   =================================================================== */
const SlideEditor = (() => {
  "use strict";
  const LAYOUTS = {
    title: "Титульный", section: "Разделитель", one: "Одна колонка", titleText: "Заголовок + текст", two: "Две колонки",
    list: "Список", quote: "Цитата", compare: "Сравнение", gallery: "Галерея", image: "Изображение на весь слайд",
    cards: "Карточки с тезисами", steps: "Шаги", big: "Крупный вопрос", task: "Упражнение (дословно)", poem: "Стихотворение (дословно)", video: "Видеофрагмент"
  };
  const ACC = { "": "Без картинки-акцента", left: "Картинка слева", right: "Картинка справа", top: "Картинка сверху", bg: "Картинка фоном" };
  const OV = { frosted: "Матовое стекло", faded: "Затемнение к тексту", clear: "Без наложения" };
  const VA = { top: "Текст сверху", center: "Текст по центру", bottom: "Текст снизу" };
  const HA = { "": "По умолчанию", left: "⯇ По левому краю", center: "≡ По центру", right: "⯈ По правому краю" };
  const INSERT = [["text", "Т", "Текст"], ["head", "H", "Подзаголовок"], ["list", "•", "Список"], ["num", "1.", "Нумерация"], ["quote", "❝", "Цитата"], ["callout", "💡", "Выноска"], ["table", "▦", "Таблица"], ["button", "➜", "Кнопка-переход"], ["photo", "🖼", "Фото с компьютера"], ["yandex", "🔍", "Картинка из Яндекса"], ["video", "▶", "Видео"], ["sticker", "★", "Стикер"], ["hr", "—", "Разделитель"]];
  const NEWSLIDE = [["cards", "▤", "Карточки"], ["steps", "①", "Шаги"], ["big", "?", "Крупный вопрос"], ["quote", "❝", "Цитата"], ["two", "◫", "Две колонки"], ["image", "▣", "Фото на весь слайд"], ["title", "★", "Раздел / титул"], ["board", "▭", "На доске"], ["video", "▶", "Видеофрагмент"]];
  const SNIP = {
    text: "Новый текст — щёлкните, чтобы изменить.", head: "### Подзаголовок", list: "- Первый пункт\n- Второй пункт", num: "1. Первый шаг\n2. Второй шаг",
    quote: "> «Цитата»\n\n— Автор", callout: "> 💡 Важно: …", table: "| Столбец 1 | Столбец 2 |\n|---|---|\n| | |\n| | |", button: "[Продолжить →](#next)", hr: "* * *"
  };
  const NEWBODY = {
    cards: ["Новый слайд", "- Тезис\n- Тезис\n- Тезис"], steps: ["Новый слайд", "1. Шаг\n2. Шаг\n3. Шаг"], big: ["Вопрос", "Сформулируйте главный вопрос?"],
    quote: ["Цитата", "> «Слова автора»\n\n— Автор"], two: ["Новый слайд", "- Левая колонка\n\n- Правая колонка"], image: ["", "![Картинка](search:)"], title: ["Новый раздел", "Подзаголовок"],
    board: ["Тема урока", "Число, месяц.  \nКлассная работа.\n\n**Правило / схема**\n\n- Пример: *выделите орфограмму*"], video: ["Видеофрагмент", "Смотрим и отвечаем: …"]
  };
  let selBlock = -1, moreOpen = false;
  const MIN_VB = 0.56; // для дословных блоков (упражнение, цитата, стихи): шрифт можно уменьшить сильнее, но не меньше ~18 pt
  const THEMES = { bordo: "Бордо + светлая плашка (фирменная)", navy: "Тёмно-синяя рамка + плашка", forest: "Зелёная рамка + плашка", light: "Светлая", warm: "Тёплая бумага", sea: "Морская", sage: "Шалфей", contrast: "Контрастная (чёрное на белом)", ...Object.fromEntries(Object.entries(window.ThemeKit?.META || {}).map(([k, v]) => [k, "✦ " + v.name])) };
  /* Шрифты: заголовки + текст. Все с кириллицей; Google Fonts подгружаются по выбору */
  const FONTS = {
    classic: { name: "Georgia + Arial (классика)", h: "Georgia", b: "Arial" },
    montserrat: { name: "Montserrat + Inter (современный)", h: "Montserrat", b: "Inter", g: ["Montserrat:wght@600;700;800", "Inter:wght@400;600;700"] },
    playfair: { name: "Playfair Display + Inter (журнальный)", h: "Playfair Display", b: "Inter", g: ["Playfair+Display:wght@600;700", "Inter:wght@400;600;700"] },
    cormorant: { name: "Cormorant Garamond + Montserrat (премиум)", h: "Cormorant Garamond", b: "Montserrat", g: ["Cormorant+Garamond:wght@600;700", "Montserrat:wght@400;600"] },
    pt: { name: "PT Serif + PT Sans (школьный)", h: "PT Serif", b: "PT Sans", g: ["PT+Serif:wght@400;700", "PT+Sans:wght@400;700"] },
    lora: { name: "Lora + Open Sans (книжный)", h: "Lora", b: "Open Sans", g: ["Lora:wght@600;700", "Open+Sans:wght@400;600;700"] },
    oswald: { name: "Oswald + Roboto (плакатный)", h: "Oswald", b: "Roboto", g: ["Oswald:wght@500;700", "Roboto:wght@400;700"] },
    marck: { name: "Marck Script + Lora (сказочный)", h: "Marck Script", b: "Lora", g: ["Marck+Script", "Lora:wght@400;600;700"] },
    russo: { name: "Russo One + Rubik (ретро-плакат)", h: "Russo One", b: "Rubik", g: ["Russo+One", "Rubik:wght@400;600;700"] },
    caveat: { name: "Caveat + PT Sans (от руки)", h: "Caveat", b: "PT Sans", g: ["Caveat:wght@600;700", "PT+Sans:wght@400;700"] },
    forum: { name: "Forum + PT Serif (музейный)", h: "Forum", b: "PT Serif", g: ["Forum", "PT+Serif:wght@400;700"] },
    yeseva: { name: "Yeseva One + Lora (винтаж)", h: "Yeseva One", b: "Lora", g: ["Yeseva+One", "Lora:wght@400;600;700"] },
    kurale: { name: "Kurale + PT Serif (галерея)", h: "Kurale", b: "PT Serif", g: ["Kurale", "PT+Serif:wght@400;700"] },
    oranien: { name: "Oranienbaum + PT Serif (усадьба)", h: "Oranienbaum", b: "PT Serif", g: ["Oranienbaum", "PT+Serif:wght@400;700"] },
    oldstd: { name: "Old Standard TT + PT Serif (хроника)", h: "Old Standard TT", b: "PT Serif", g: ["Old+Standard+TT:wght@400;700", "PT+Serif:wght@400;700"] },
    prata: { name: "Prata + Lora (ночная)", h: "Prata", b: "Lora", g: ["Prata", "Lora:wght@400;600;700"] },
    alice: { name: "Alice + PT Sans (акварель)", h: "Alice", b: "PT Sans", g: ["Alice", "PT+Sans:wght@400;700"] },
    mblack: { name: "Montserrat Black (плакатный гротеск)", h: "Montserrat", b: "Montserrat", g: ["Montserrat:wght@600;700;900"] },
    jost: { name: "Jost Light + Caveat (брендбук)", h: "Jost", b: "Caveat", g: ["Jost:wght@300;400", "Caveat:wght@500;600"] },
    playcorm: { name: "Playfair Display + Cormorant (ренессанс)", h: "Playfair Display", b: "Cormorant Garamond", g: ["Playfair+Display:wght@400;600", "Cormorant+Garamond:wght@500;600;700"] },
    unbounded: { name: "Unbounded + Manrope (модерн)", h: "Unbounded", b: "Manrope", g: ["Unbounded:wght@500;700", "Manrope:wght@400;600;700"] }
  };
  const fontKey = () => FONTS[L()?.slideFonts] ? L().slideFonts : (window.ThemeKit?.META[theme()]?.font || "classic");
  const fontSet = () => FONTS[fontKey()] || FONTS.classic;
  const loadedFonts = new Set();
  function ensureFonts(key) {
    const f = FONTS[key]; if (!f?.g || loadedFonts.has(key)) return Promise.resolve();
    loadedFonts.add(key);
    const l = document.createElement("link"); l.rel = "stylesheet"; l.href = `https://fonts.googleapis.com/css2?${f.g.map(x => "family=" + x).join("&")}&display=swap`;
    document.head.appendChild(l);
    return new Promise(r => { l.onload = () => (document.fonts?.ready || Promise.resolve()).then(r); l.onerror = r; setTimeout(r, 4000); });
  }
  const fontCss = (fk) => { const f = (fk && FONTS[fk]) || fontSet(); return `--sx-fh:'${f.h}', Georgia, serif;--sx-fb:'${f.b}', Arial, sans-serif;`; }; // одинарные кавычки: стиль стоит внутри атрибута style="…"
  const MIN = 0.72, MAX = 1.3; // пределы автоподбора шрифта
  let cur = 0, clipboard = null;
  const undo = [], redo = [];

  /* ---------- разбор и сборка Markdown ---------- */
  function headOf(md) { return (md.match(/^\s*---\s*\n[\s\S]*?\n---\s*\n/) || [""])[0]; }
  function parse(raw) {
    let set = {};
    const s = raw.replace(/<!--@\s*([\s\S]*?)\s*-->/g, (m, j) => { try { set = { ...set, ...JSON.parse(j) }; } catch { } return ""; });
    const notes = [...s.matchAll(/<!--([\s\S]*?)-->/g)].map(m => m[1].trim()).filter(Boolean).join(" ");
    const content = s.replace(/<!--[\s\S]*?-->/g, "").trim();
    const lines = content.split("\n"), ti = lines.findIndex(l => /^#{1,2}\s/.test(l));
    const title = ti >= 0 ? lines[ti].replace(/^#{1,2}\s+/, "") : "";
    const level = ti >= 0 ? (lines[ti].startsWith("## ") ? 2 : 1) : 2;
    const body = lines.filter((_, i) => i !== ti).join("\n").trim();
    return { title, level, body, notes, set };
  }
  function build(sl) {
    const set = Object.fromEntries(Object.entries(sl.set || {}).filter(([, v]) => v !== undefined && v !== null && v !== ""));
    return [sl.title ? `${sl.level === 1 ? "#" : "##"} ${sl.title}` : "", sl.body, Object.keys(set).length ? `<!--@ ${JSON.stringify(set)} -->` : "", sl.notes ? `<!-- ${sl.notes.replace(/-->/g, "—>")} -->` : ""].filter(Boolean).join("\n\n");
  }
  const L = () => state.lesson;
  function slides() { return splitSlides(L().docs.slides || "").map(parse); }
  function write(arr, { record = true } = {}) {
    const Ls = L(), head = headOf(Ls.docs.slides || "");
    if (record) { undo.push(Ls.docs.slides); if (undo.length > 60) undo.shift(); redo.length = 0; }
    Ls.docs.slides = (/marp\s*:/.test(head) ? head.trim() + "\n\n" : "") + arr.map(build).join("\n\n---\n\n") + "\n";
    if (Ls.sample && typeof forkSample === "function") forkSample();
    $("#md").value = state.lesson.docs.slides;
    saveLesson(state.lesson);
  }
  /* Шаблон по умолчанию — по содержимому слайда */
  function autoLayout(sl, i) {
    if (sl.set.layout) return sl.set.layout;
    const pics = (sl.body.match(Media.RE) || []).length; Media.RE.lastIndex = 0;
    const text = sl.body.replace(Media.RE, "").trim(); Media.RE.lastIndex = 0;
    if (i === 0 || sl.level === 1) return "title";
    if (pics >= 2) return "gallery";
    if (pics === 1 && !text) return "image";
    if (/^>\s/m.test(text) && text.split("\n").filter(l => l.trim()).every(l => /^>/.test(l) || l.length < 70)) return "quote";
    if (/^\s*([-*]|\d+\.)\s/m.test(text)) return pics ? "two" : "list";
    if (/\|.*\|/.test(text)) return "one";
    return pics ? "two" : "titleText";
  }
  const ANIMS = { soft: "Мягкая", bright: "Яркая", none: "Без анимации" };
  const anim = () => ({ mode: "soft", cut: false, deco: true, ix: true, step: false, ...(L()?.slideAnim || {}) });
  const theme = () => (L()?.slideTheme && THEMES[L().slideTheme]) ? L().slideTheme : "bordo";
  /* Смена темы: у художественных тем свой шрифт заголовков (ручной выбор шрифта сбрасывается) */
  function applyTheme(k, { auto = false } = {}) {
    const Ls = L(); if (!Ls || !THEMES[k]) return;
    Ls.slideTheme = k; Ls.slideThemeAuto = auto;
    if (window.ThemeKit?.has(k)) Ls.slideFonts = null;
    Ls.slidesFitted = false; saveLesson(Ls);
  }

  /* ---------- отрисовка слайда ---------- */
  /* Кнопки-переходы: ссылка на #next, #prev, #first, #last или #slide-N становится кнопкой */
  const NAV = /^#(next|prev|first|last|slide-\d+)$/;
  function linkify(html) { return html.replace(/<a href="#g"(?: title="([^"]*)")?>/g, (m, t) => `<a class="sx-gl" href="#g" data-tip="${t || ""}" title="${t || ""}" tabindex="0">`).replace(/<a href="(#(?:next|prev|first|last|slide-\d+))"/g, (m, h) => `<a class="sx-btn${h === "#prev" ? " back" : ""}" href="${h}"`); }
  function navTarget(href, i, n) { const m = String(href).match(NAV); if (!m) return null; const v = m[1]; const t = v === "next" ? i + 1 : v === "prev" ? i - 1 : v === "first" ? 0 : v === "last" ? n - 1 : +v.slice(6) - 1; return Math.max(0, Math.min(n - 1, t)); }
  /* Блоки слайда (без картинки-акцента) — для вставки, перестановки, удаления */
  function blocksOf(sl) { const p = sl.set.acc ? splitAcc(sl.body) : { acc: "", rest: sl.body || "" }; return { acc: p.acc, toks: window.marked.lexer(p.rest || "").filter(t => t.type !== "space").map(t => t.raw.replace(/\n+$/, "")) }; }
  function setBlocks(sl, acc, toks) { sl.body = [acc, toks.join("\n\n")].filter(Boolean).join("\n\n"); sl.set.afs = undefined; }

  /* Картинка-акцент (как у Gamma): первая картинка слайда стоит отдельно — слева, справа, сверху или фоном */
  function splitAcc(body) {
    const re = new RegExp(Media.RE.source); const m = re.exec(body || "");
    if (!m) return { acc: "", rest: body || "" };
    return { acc: m[0], rest: ((body || "").slice(0, m.index) + (body || "").slice(m.index + m[0].length)).replace(/^\s+/, "").replace(/\n{3,}/g, "\n\n") };
  }
  function slideHtml(sl, i, { edit = false, fs = null, th = null } = {}) {
    const lay = autoLayout(sl, i), st = sl.set, T = window.ThemeKit ? ThemeKit.resolve(th || theme(), i) : (th || theme()), TK = window.ThemeKit?.has(T);
    const accPos = st.acc && lay !== "image" && lay !== "gallery" ? st.acc : "";
    const parts = accPos ? splitAcc(sl.body) : { acc: "", rest: sl.body || "" };
    const acc = accPos && parts.acc ? accPos : "";
    const bg = st.bgimg ? "" : st.bg ? `background:${esc(st.bg)};` : "";
    const tkv = TK ? ThemeKit.vars(T, L()?.slidePalette) : "";
    const tw = Math.max(6, ...String(sl.title || "").split(/\s+/).map(w => w.length));
    const style = `--tw:${tw};${tkv}${fontCss(th && th !== theme() ? (window.ThemeKit?.META[th]?.font || "classic") : null)}--fs:${fs || st.fs || st.afs || 1};--pad:${st.pad || 1};--lh:${st.lh || (lay === "poem" ? 1.25 : 1.3)};--ovi:${(st.ovi ?? 70) / 100};${bg}`;
    const vid = (st.kind === "video" || lay === "video" || st.video) && window.VideoKit ? VideoKit.html(st.video || { q: st.vq || sl.title }) : "";
    const body = vid + linkify(mdToHtml(acc ? parts.rest : sl.body || ""));
    const lines = lay === "poem" ? (sl.body.match(/ {2}\n|\n\n/g) || []).length + 1 : 0;
    const cls = [`sx lay-${lay}`, TK ? `tk tk-${T}` : "", st.photo ? "has-photo" : "", st.kind ? `k-${st.kind}` : "", st.bgimg ? "has-bgimg" : "", st.free ? "free" : "", acc ? `acc acc-${acc} ov-${st.ov || "frosted"}` : "", st.va ? `va-${st.va}` : "", st.ha ? `ha-${st.ha}` : "", st.vb ? "vb" : "", lines > 16 ? "cols2" : ""].filter(Boolean).join(" ");
    const H = sl.level === 1 || lay === "title" ? "h1" : "h2";
    const stk = [...(TK && !st.nostk ? ThemeKit.autoStickers(T, st.kind || lay, i).map(x => ({ ...x, auto: 1 })) : []), ...(st.stk || [])];
    const html = `<div class="${cls}" data-i="${i}" style="${style}">${TK ? ThemeKit.decoHtml(T, i, lay === "title" || lay === "section" ? lay : "", ThemeKit.sideOf(lay, acc || (st.photo ? "right" : "")), L()?.slidePalette) : ""}${st.bgimg ? `<img class="sx-bgimg" data-src="${esc(st.bgimg)}" alt="">` : ""}${acc ? `<div class="sx-acc">${mdToHtml(parts.acc)}</div>` : ""}${T === "glow" ? `<div class="sx-glow" aria-hidden="true">${[[12, 18, 0], [78, 12, 1.1], [64, 82, .5], [30, 70, 2], [90, 52, 1.6], [48, 30, 2.4], [8, 88, .8]].map(([x, y, d]) => `<i style="left:${x}%;top:${y}%;animation-delay:${d}s"></i>`).join("")}</div>` : ""}${TK && T !== "board" ? ThemeKit.paperHtml(T, i, lay === "title" || lay === "section" ? lay : "", ThemeKit.sideOf(lay, acc || (st.photo ? "right" : "")), L()?.slidePalette) : ""}
      <div class="sx-inner"><${H} class="sx-title" ${edit ? 'contenteditable="true" spellcheck="true"' : ""} data-ph="Заголовок">${esc(sl.title)}</${H}>
      <div class="sx-body" ${edit ? 'contenteditable="true" spellcheck="true"' : ""} data-ph="Текст слайда">${body}</div></div>${window.ThemeKit && stk.length ? ThemeKit.stickersHtml(stk, edit) : ""}</div>`;
    return st.free ? applyFree(html, st) : html;
  }
  /* Свободная вёрстка: заголовок и каждый блок текста стоят там, куда их поставил учитель (координаты в % слайда) */
  function applyFree(html, st) {
    const t = document.createElement("template"); t.innerHTML = html.trim();
    const pos = st.pos || {};
    const place = (el, p) => { if (!el || !p) return; el.classList.add("fx"); el.style.left = p.x + "%"; el.style.top = p.y + "%"; el.style.width = p.w + "%"; };
    place(t.content.querySelector(".sx-title"), pos.t);
    [...t.content.querySelectorAll(".sx-body > *")].forEach((el, k) => place(el, pos[k]));
    return t.innerHTML;
  }
  /* Включить свободную вёрстку: запоминаем, где блоки стоят сейчас */
  function measurePositions(fr) {
    const inner = fr.querySelector(".sx-inner").getBoundingClientRect(), out = {};
    const rel = el => { const r = el.getBoundingClientRect(); return { x: Math.round((r.left - inner.left) / inner.width * 1000) / 10, y: Math.round((r.top - inner.top) / inner.height * 1000) / 10, w: Math.round(r.width / inner.width * 1000) / 10 }; };
    out.t = rel(fr.querySelector(".sx-title"));
    [...fr.querySelectorAll(".sx-body > *")].forEach((el, k) => { out[k] = rel(el); });
    return out;
  }
  async function hydrateBg(root) {
    for (const img of root.querySelectorAll("img.sx-bgimg, img.stk-img")) { const s = img.dataset.src; img.src = s.startsWith("idb:") ? (await idbUrl(s.slice(4))) || "" : s; }
  }
  const urlCache = new Map();
  async function idbUrl(id) { if (urlCache.has(id)) return urlCache.get(id); const b = await Store.get("images", id).catch(() => null); if (!b) return null; const u = URL.createObjectURL(b); urlCache.set(id, u); return u; }

  /* ---------- автоподбор шрифта и проверка, помещается ли слайд ---------- */
  let meter = null;
  function measureBox() {
    if (!meter) { meter = document.createElement("div"); meter.className = "sx-meter " + "theme-" + theme(); meter.setAttribute("aria-hidden", "true"); document.body.appendChild(meter); }
    meter.className = "sx-meter theme-" + theme();
    return meter;
  }
  function fits(el) {
    const inner = el.querySelector(".sx-inner");
    if (inner.scrollHeight > inner.clientHeight + 2 || inner.scrollWidth > inner.clientWidth + 2) return false;
    // длинное слово в заголовке или тексте не должно вылезать за край (иначе его пришлось бы рвать посередине)
    if ([...el.querySelectorAll(".sx-title, .sx-body > p, .sx-body li, .sx-body blockquote")].some(x => x.scrollWidth > x.clientWidth + 2)) return false;
    // текст не должен заходить на нижнее поле плашки: проверяем низ каждого блока относительно внутренней границы
    const ib = inner.getBoundingClientRect(), cs = getComputedStyle(inner), limit = ib.bottom - parseFloat(cs.paddingBottom) + 1;
    const body = el.querySelector(".sx-body");
    if (body && body.scrollHeight > body.clientHeight + 2) return false;
    return ![el.querySelector(".sx-title"), ...(body ? body.children : [])].some(x => x && x.getBoundingClientRect().bottom > limit);
  }
  /* Подбор: бинарный поиск масштаба шрифта в пределах MIN…MAX */
  function autoScale(sl, i) {
    const box = measureBox();
    box.innerHTML = slideHtml(sl, i, { fs: 1 });
    const el = box.firstElementChild;
    const lay = autoLayout(sl, i);
    const max = ["title", "section", "quote", "big"].includes(lay) ? 1.15 : MAX;
    const min = ["title", "section"].includes(lay) ? 0.45 : sl.set.vb || lay === "task" || lay === "poem" ? MIN_VB : MIN;
    let lo = min, hi = max, best = min;
    el.style.setProperty("--fs", max); if (fits(el)) return { fs: max, ok: true };
    for (let k = 0; k < 8; k++) { const mid = (lo + hi) / 2; el.style.setProperty("--fs", mid); if (fits(el)) { best = mid; lo = mid; } else hi = mid; }
    el.style.setProperty("--fs", best);
    return { fs: Math.round(best * 100) / 100, ok: fits(el) };
  }
  /* Деление слайда, который не помещается даже при минимальном шрифте */
  function splitSlide(sl, i) {
    const vb = !!(sl.set.vb || ["task", "poem"].includes(autoLayout(sl, i)));
    const accPart = sl.set.acc ? splitAcc(sl.body) : { acc: "", rest: sl.body || "" };
    if (vb) return splitVerbatim({ ...sl, body: accPart.rest }, i, accPart.acc);
    const toks = window.marked.lexer(sl.body || "");
    let blocks = toks.filter(t => t.type !== "space").map(t => t.raw.trim());
    // длинные списки и абзацы режем на части: пункты, предложения, строки таблицы
    const expand = [];
    for (const t of toks) {
      if (t.type === "space") continue;
      if (t.type === "list" && t.items.length > 2) { const ord = t.ordered; let n = t.start || 1; t.items.forEach(it => expand.push((ord ? `${n++}. ` : "- ") + it.text.replace(/\n/g, " "))); }
      else if (t.type === "paragraph" && t.raw.length > 260) { (t.raw.match(/[^.!?…]+[.!?…]+[»"]?\s*/g) || [t.raw]).reduce((acc, s) => { if (acc.length && (acc[acc.length - 1] + s).length < 240) acc[acc.length - 1] += s; else acc.push(s); return acc; }, []).forEach(x => expand.push(x.trim())); }
      else if (t.type === "table" && t.rows.length > 3) { const head = t.raw.split("\n").slice(0, 2).join("\n"); const rows = t.raw.trim().split("\n").slice(2); for (let k = 0; k < rows.length; k += 3) expand.push(head + "\n" + rows.slice(k, k + 3).join("\n")); }
      else expand.push(t.raw.trim());
    }
    blocks = expand;
    const parts = []; let curB = [];
    const box = measureBox();
    const test = arr => { const s = { ...sl, body: arr.join("\n\n"), set: { ...sl.set, fs: MIN } }; box.innerHTML = slideHtml(s, i, { fs: MIN }); return fits(box.firstElementChild); };
    for (const b of blocks) {
      if (test([...curB, b]) || !curB.length) curB.push(b);
      else { parts.push(curB); curB = [b]; }
    }
    if (curB.length) parts.push(curB);
    if (parts.length < 2) return null;
    const base = sl.title.replace(/\s*\(продолжение(?: \d)?\)$/, "");
    return parts.map((p, k) => ({ ...sl, title: k ? `${base} (продолжение${parts.length > 2 ? " " + k : ""})` : sl.title, body: p.join("\n\n"), notes: k ? "" : sl.notes, set: { ...sl.set, afs: undefined } }));
  }
  /* Дословный текст делим только по границам: пункты, абзацы, строфы, строки — слова не меняются и не теряются */
  function splitVerbatim(sl, i, accMd) {
    // если делить всё равно придётся, делим при удобном шрифте (не мельче 80%), чтобы каждую часть было видно с последней парты
    const min = 0.8, box = measureBox();
    const test = arr => { const s = { ...sl, body: arr.join("\n\n"), set: { ...sl.set, acc: undefined } }; box.innerHTML = slideHtml(s, i, { fs: min }); return fits(box.firstElementChild); };
    const units = [];
    for (const t of window.marked.lexer(sl.body || "")) {
      if (t.type === "space") continue;
      const raw = t.raw.replace(/\n+$/, "");
      if (test([raw])) { units.push(raw); continue; }
      if (t.type === "list") { let n = t.start || 1; t.items.forEach(it => units.push((t.ordered ? `${n++}. ` : "- ") + it.raw.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").trim())); continue; }
      // абзац или цитата не помещается целиком: по строкам (стих), затем по предложениям
      const quote = t.type === "blockquote" ? "> " : "";
      const inner = quote ? raw.replace(/^>\s?/gm, "") : raw;
      let pieces = inner.split(/ {2}\n/);
      if (pieces.length < 2) pieces = inner.match(/[^.!?…]+[.!?…]+[»")]*\s*|[^.!?…]+$/g) || [inner];
      let acc = "";
      for (const pc of pieces) {
        const cand = acc ? acc + (inner.includes("  \n") ? "  \n" : " ") + pc.trim() : pc.trim();
        if (acc && !test([quote + cand.replace(/\n/g, "\n" + quote)])) { units.push(quote + acc.replace(/\n/g, "\n" + quote)); acc = pc.trim(); }
        else acc = cand;
      }
      if (acc) units.push(quote + acc.replace(/\n/g, "\n" + quote));
    }
    let parts = []; let cur = [];
    for (const u of units) { if (!cur.length || test([...cur, u])) cur.push(u); else { parts.push(cur); cur = [u]; } }
    if (cur.length) parts.push(cur);
    if (parts.length < 2) return null;
    // выравниваем части по объёму, чтобы на последнем слайде не осталась одна строчка
    const K = parts.length, total = units.reduce((a, u) => a + u.length, 0), target = total / K;
    const bal = []; let acc = [], len = 0;
    units.forEach((u, idx) => { const left = units.length - idx; if (acc.length && (len + u.length / 2 > target) && bal.length < K - 1 && left >= 1) { bal.push(acc); acc = []; len = 0; } acc.push(u); len += u.length; });
    if (acc.length) bal.push(acc);
    if (bal.length === K && bal.every(b => test(b))) parts = bal;
    const base = sl.title.replace(/\s*\(продолжение(?: \d)?\)$/, "");
    return parts.map((p, k) => ({ ...sl, title: k ? `${base} (продолжение)` : sl.title, body: (k === 0 && accMd ? accMd + "\n\n" : "") + p.join("\n\n"), notes: k ? "" : sl.notes, set: { ...sl.set, afs: undefined, acc: k === 0 ? sl.set.acc : undefined } }));
  }
  /* Проход по всем слайдам: подобрать шрифт, разделить непомещающиеся (без обрезки текста) */
  function fitAll({ allowSplit = true } = {}) {
    const arr = slides(); let changed = false, splits = 0;
    const out = [];
    arr.forEach((sl, i) => {
      if (sl.set.fs || sl.set.free) { out.push(sl); return; } // шрифт или вёрстка заданы вручную — не трогаем
      const r = autoScale(sl, i);
      const vbSmall = (sl.set.vb || ["task", "poem"].includes(autoLayout(sl, i))) && r.fs < 0.7;
      const noSplit = ["title", "section", "big", "image", "gallery"].includes(autoLayout(sl, i)); // титульный и крупный вопрос не делим — только уменьшаем шрифт
      if ((!r.ok || vbSmall) && allowSplit && !noSplit && sl.set.fit !== "off") {
        const parts = splitSlide(sl, i);
        if (parts) { parts.forEach(p => { const rr = autoScale(p, i); out.push({ ...p, set: { ...p.set, afs: rr.fs } }); }); changed = true; splits++; return; }
      }
      if (sl.set.afs !== r.fs) { changed = true; }
      out.push({ ...sl, set: { ...sl.set, afs: r.fs } });
    });
    if (changed) write(out, { record: splits > 0 });
    if (splits) toast(`Длинные слайды разделены, чтобы весь текст был виден (${splits}).`, 5000);
    return out;
  }

  /* ---------- редактор ---------- */
  function render(sheet, md, editable) {
    { const fk = fontKey(); if (FONTS[fk]?.g && !loadedFonts.has(fk)) ensureFonts(fk).then(() => { L().slidesFitted = false; rerender(); }); }
    if (/mix34|brandbook/.test(theme()) && !loadedFonts.has("jost")) ensureFonts("jost").then(() => { L().slidesFitted = false; rerender(); });
    if (/mix34|brutal/.test(theme()) && !loadedFonts.has("mblack")) ensureFonts("mblack").then(() => { L().slidesFitted = false; rerender(); });
    sheet.className = "sxed theme-" + theme(); sheet.removeAttribute("contenteditable");
    if (!editable) { // идёт генерация — простой просмотр
      sheet.innerHTML = `<div class="sx-view">${splitSlides(md).map((s, i) => `<div class="sx-frame">${slideHtml(parse(s), i)}</div>`).join("")}</div>`;
      sheet.querySelectorAll(".sx-body, .sx-acc").forEach(decorate); return;
    }
    if (!L().slidesFitted) { L().slidesFitted = true; fitAll(); }
    const arr = slides();
    if (cur >= arr.length) cur = Math.max(0, arr.length - 1);
    const sl = arr[cur] || { title: "", body: "", set: {}, notes: "" };
    const lay = autoLayout(sl, cur);
    sheet.innerHTML = `<div class="sx-topbar" role="toolbar" aria-label="Презентация">
        <button class="btn sm flame" id="sxDesign" title="Тема оформления и шрифты всей презентации">🎨 Оформление</button>
        <button class="btn sm" id="sxLayPick" title="Шаблон этого слайда">▦ Шаблон слайда</button>
        <button class="btn sm" id="sxMenuTop" title="Все действия со слайдом">⋯ Слайд</button>
        <button class="btn sm" id="sxPlan2" title="Как в Gamma: план слайдов по конспекту и пересборка">☰ План презентации</button>
        <button class="btn sm teal" id="sxPlay2" title="Показ на весь экран, кнопки-переходы работают">▶ Показ</button>
        <span class="sx-grp"><button class="btn sm ghost" id="sxUndo2" ${undo.length ? "" : "disabled"} title="Отменить (Ctrl+Z)">↶</button><button class="btn sm ghost" id="sxRedo2" ${redo.length ? "" : "disabled"} title="Повторить (Ctrl+Y)">↷</button></span>
        <button class="btn sm ghost" id="sxMoreBtn" aria-expanded="${moreOpen}" title="Тонкие настройки: размер шрифта, поля, интервал, фон, свободная вёрстка">⚙ Ещё настройки</button>
      </div>
      <div class="sx-tools" role="toolbar" aria-label="Тонкие настройки слайда" ${moreOpen ? "" : "hidden"} id="sxMore">
        <label class="sx-tl">Шаблон <select id="sxLay">${Object.entries(LAYOUTS).map(([k, n]) => `<option value="${k}" ${k === lay ? "selected" : ""}>${n}</option>`).join("")}</select></label>
        <button class="btn sm ghost" id="sxLayAll" title="Применить этот шаблон ко всем слайдам">ко всем</button>
        <label class="sx-tl">Шрифты <select id="sxFonts">${Object.entries(FONTS).map(([k, f]) => `<option value="${k}" ${k === fontKey() ? "selected" : ""}>${f.name}</option>`).join("")}</select></label>
        <label class="sx-tl">Тема <select id="sxTheme">${Object.entries(THEMES).map(([k, n]) => `<option value="${k}" ${k === theme() ? "selected" : ""}>${n}</option>`).join("")}</select></label>
        <span class="sx-grp" aria-label="Шрифт"><button class="btn sm ghost" id="sxFsM" title="Мельче">A−</button><button class="btn sm ghost" id="sxFsA" title="Подобрать автоматически" aria-pressed="${!sl.set.fs}">Авто ${Math.round((sl.set.fs || sl.set.afs || 1) * 100)}%</button><button class="btn sm ghost" id="sxFsP" title="Крупнее">A+</button></span>
        <span class="sx-grp" aria-label="Отступы"><button class="btn sm ghost" id="sxPadM" title="Отступы меньше">⇤</button><span class="small">поля</span><button class="btn sm ghost" id="sxPadP" title="Отступы больше">⇥</button></span>
        <span class="sx-grp" aria-label="Интервал"><button class="btn sm ghost" id="sxLhM" title="Интервал меньше">≡−</button><span class="small">интервал</span><button class="btn sm ghost" id="sxLhP" title="Интервал больше">≡+</button></span>
        <label class="sx-tl">Фон <input type="color" id="sxBg" value="${esc(sl.set.bg || "#ffffff")}"></label><button class="btn sm ghost" id="sxBgImg">Картинка-фон</button>${sl.set.bg || sl.set.bgimg ? `<button class="btn sm ghost" id="sxBgClr">Убрать фон</button>` : ""}
        <label class="sx-tl">Картинка <select id="sxAcc">${Object.entries(ACC).map(([k, n]) => `<option value="${k}" ${k === (sl.set.acc || "") ? "selected" : ""}>${n}</option>`).join("")}</select></label>
        ${sl.set.acc === "bg" ? `<label class="sx-tl">Наложение <select id="sxOv">${Object.entries(OV).map(([k, n]) => `<option value="${k}" ${k === (sl.set.ov || "frosted") ? "selected" : ""}>${n}</option>`).join("")}</select></label><input type="range" id="sxOvi" min="0" max="100" step="5" value="${sl.set.ovi ?? 70}" title="Сила наложения" aria-label="Сила наложения">` : ""}
        <span class="sx-ha" role="group" aria-label="Выравнивание текста">${[["left", "⯇", "По левому краю"], ["center", "≡", "По центру"], ["right", "⯈", "По правому краю"]].map(([k, ic, t]) => `<button type="button" class="btn sm ${sl.set.ha === k ? "flame" : "ghost"}" data-ha="${k}" title="${t}" aria-pressed="${sl.set.ha === k}">${ic}</button>`).join("")}<label class="check small"><input type="checkbox" id="sxHaAll"> на всех</label></span>
        <label class="sx-tl">Текст <select id="sxVa">${Object.entries(VA).map(([k, n]) => `<option value="${k}" ${k === (sl.set.va || "top") ? "selected" : ""}>${n}</option>`).join("")}</select></label>
        <button class="btn sm ${sl.set.free ? "flame" : "ghost"}" id="sxFree" title="Блоки и заголовок можно ставить в любое место слайда и менять их ширину">${sl.set.free ? "Свободная вёрстка: вкл" : "Свободная вёрстка"}</button>
        <button class="btn sm teal" id="sxPic">+ Картинка</button><button class="btn sm ghost" id="sxYa" title="Открыть Яндекс Картинки по теме слайда">Яндекс Картинки ↗</button>
        <button class="btn sm ghost" id="sxSplit">Разделить</button><button class="btn sm ghost" id="sxMerge" ${cur >= arr.length - 1 ? "disabled" : ""}>Объединить со следующим</button>
        <button class="btn sm ghost" id="sxUndo" ${undo.length ? "" : "disabled"} title="Отменить (Ctrl+Z)">↶</button><button class="btn sm ghost" id="sxRedo" ${redo.length ? "" : "disabled"} title="Повторить (Ctrl+Y)">↷</button>
        <button class="btn sm ghost" id="sxHtml">Скачать HTML</button>
        <button class="btn sm flame" id="sxPlan" title="Как в Gamma: план слайдов по конспекту, объём текста, картинки — и пересборка">План презентации</button>
      </div>
      ${sl.set.vb ? `<p class="sx-vbnote">🔒 Дословный текст (упражнение, цитата, правило или стихи): слова не сокращаются. Если не помещается — шрифт меньше, затем деление на слайды.</p>` : ""}
      <div class="sx-main has-rail">
        <ol class="sx-thumbs" aria-label="Слайды">${arr.map((s, i) => `<li class="sx-th${i === cur ? " on" : ""}" draggable="true" data-i="${i}" tabindex="0" aria-current="${i === cur}"><span class="sx-n">${i + 1}</span><div class="sx-mini">${slideHtml(s, i)}</div><button type="button" class="sx-thdots" data-dots="${i}" title="Меню слайда" aria-label="Меню слайда ${i + 1}">⋯</button></li>`).join("")}</ol>
        <aside class="sx-rail" aria-label="Вставить на слайд">
          <b class="sx-rail-h">Вставить</b>
          ${INSERT.map(([k, ic, n]) => `<button type="button" class="sx-ins" data-ins="${k}" title="${n}"><span class="ic">${ic}</span><span>${n}</span></button>`).join("")}
          <b class="sx-rail-h">Слайд</b>
          ${NEWSLIDE.map(([k, ic, n]) => `<button type="button" class="sx-ins" data-new="${k}" title="Новый слайд: ${n}"><span class="ic">${ic}</span><span>${n}</span></button>`).join("")}
          <button type="button" class="sx-ins play" id="sxPlay" title="Показ: полноэкранный режим, кнопки-переходы работают"><span class="ic">▶</span><span>Показ</span></button>
        </aside>
        <div class="sx-stage"><div class="sx-eltools" id="sxEl" hidden role="toolbar" aria-label="Выбранный блок"><button data-el="up" title="Выше">↑</button><button data-el="down" title="Ниже">↓</button><button data-el="dup" title="Дублировать">⧉</button><button data-el="bold" title="Жирный (Ctrl+B)"><b>Ж</b></button><button data-el="ital" title="Курсив (Ctrl+I)"><i>К</i></button><button data-el="link" title="Сделать кнопкой-переходом">➜</button><button data-el="del" title="Удалить блок">🗑</button></div>
          <div class="sx-frame big" id="sxFrame"><button type="button" class="sx-dots" id="sxDots" title="Действия со слайдом: шаблон, картинка, оформление, дублировать, удалить" aria-label="Меню слайда">⋯</button>${slideHtml(sl, cur, { edit: true })}</div>
          <p class="sx-warn" id="sxWarn" hidden>Текст не помещается даже при минимальном шрифте. Нажмите «Разделить» — слайд разделится на 2–3, весь текст останется.</p>
          <div class="sx-slidebar"><button class="btn sm ghost" id="sxAdd">+ Слайд после</button><button class="btn sm ghost" id="sxDup">Дублировать</button><button class="btn sm ghost" id="sxCopy">Копировать</button><button class="btn sm ghost" id="sxPaste" ${clipboard ? "" : "disabled"}>Вставить</button><button class="btn sm ghost" id="sxUp" ${cur ? "" : "disabled"}>↑</button><button class="btn sm ghost" id="sxDown" ${cur < arr.length - 1 ? "" : "disabled"}>↓</button><button class="btn sm ghost" id="sxDel" ${arr.length > 1 ? "" : "disabled"}>Удалить слайд</button></div>
          <section class="sx-sugg" aria-label="Картинки к слайду"><div class="sx-sugg-h"><b>Картинки Яндекса к этому слайду</b><input type="text" id="sxQ" class="mini-q" value="${esc(suggestQuery(sl))}" aria-label="Запрос для поиска картинок"><button class="btn sm ghost" id="sxQGo">Найти</button><button class="btn sm ghost" id="sxQYa">Открыть в Яндексе ↗</button></div><div class="sx-sugg-grid" id="sxSugg"><p class="small">Ищу…</p></div><p class="small" id="sxSuggNote">Щёлкните по картинке, чтобы вставить её на слайд. Потом по ней можно щёлкнуть ещё раз: обрезать, заменить, сделать фоном.</p></section>
          <details class="slide-notes"><summary><b>Заметки для учителя</b> — на слайде не показываются, в PowerPoint попадают в заметки докладчика</summary><span class="nt" contenteditable="true" id="sxNotes">${esc(sl.notes)}</span></details>
          <p class="hint">Картинку можно вставить из буфера (Ctrl+V) или перетащить файл на слайд. Блоки текста перетаскиваются за значок ⠿ слева; «Свободная вёрстка» позволяет ставить заголовок и блоки в любое место слайда (значок ✥) и менять их ширину (правый край). Щёлкните по картинке, чтобы заменить, обрезать или сделать фоном; потяните за картинку, чтобы передвинуть, за уголок — чтобы изменить размер.</p>
        </div></div>`;
    sheet.querySelectorAll(".sx-body, .sx-acc").forEach(decorate);
    hydrateBg(sheet);
    bindStage(sheet, arr);
    checkWarn();
  }
  /* Подстраховка: если на большом слайде текст всё же не влез (другие шрифты, загрузка картинок), подбираем шрифт прямо на нём */
  function fitLive() {
    const fr = $("#sxFrame .sx"); if (!fr || fits(fr)) return;
    const a = slides(), sl = a[cur]; if (!sl || sl.set.fs || sl.set.free) return;
    const min = sl.set.vb ? MIN_VB : MIN; let lo = min, hi = +(sl.set.afs || 1), best = min;
    for (let k = 0; k < 7; k++) { const mid = (lo + hi) / 2; fr.style.setProperty("--fs", mid); if (fits(fr)) { best = mid; lo = mid; } else hi = mid; }
    fr.style.setProperty("--fs", best); sl.set.afs = Math.round(best * 100) / 100; write(a, { record: false });
  }
  function checkWarn() {
    const fr = $("#sxFrame .sx"); if (!fr) return;
    fitLive();
    requestAnimationFrame(() => { const w = $("#sxWarn"); if (w) w.hidden = fits(fr) || !!fr.querySelector(".sx-inner:focus-within"); });
  }
  function rerender() { renderPreview(); }
  function set(patch, { all = false } = {}) {
    const arr = slides();
    (all ? arr : [arr[cur]]).forEach(s => { s.set = { ...s.set, ...patch }; });
    write(arr); rerender();
  }
  /* Текст из редактируемого слайда → Markdown */
  const commit = debounce(async () => {
    try { await ensureTurndown(); } catch { return; }
    const fr = $("#sxFrame .sx"); if (!fr) return;
    const arr = slides(), sl = arr[cur]; if (!sl) return;
    const tEl = fr.querySelector(".sx-title").cloneNode(true); tEl.querySelectorAll(".fx-move, .fx-size").forEach(g => g.remove());
    sl.title = tEl.textContent.replace(/\s+/g, " ").trim();
    const bodyEl = fr.querySelector(".sx-body").cloneNode(true);
    bodyEl.querySelectorAll(".sx-grip, .fx-move, .fx-size, .sx-resize").forEach(g => g.remove());
    const keepAcc = sl.set.acc ? splitAcc(sl.body).acc : "";
    sl.body = [keepAcc, htmlToMd(bodyEl.innerHTML).trim()].filter(Boolean).join("\n\n");
    sl.notes = ($("#sxNotes")?.textContent || "").trim();
    if (!sl.set.fs) { const r = autoScale(sl, cur); sl.set.afs = r.fs; fr.style.setProperty("--fs", r.fs); }
    write(arr, { record: true });
    const th = document.querySelector(`.sx-th[data-i="${cur}"] .sx-mini`); if (th) { th.innerHTML = slideHtml(sl, cur); th.querySelectorAll(".sx-body, .sx-acc").forEach(decorate); }
    checkWarn();
  }, 500);

  function bindStage(sheet, arr) {
    const $s = s => sheet.querySelector(s);
    { const fr0 = sheet.querySelector("#sxFrame"); if (fr0) { bindStickers(fr0); window.VideoKit?.bind(fr0); fr0.querySelector(".sx-video.empty")?.addEventListener("click", () => openVideo(cur)); } }
    // миниатюры: выбор, перетаскивание
    sheet.querySelectorAll(".sx-th").forEach(li => {
      li.onclick = () => { cur = +li.dataset.i; selBlock = -1; rerender(); };
      li.onkeydown = e => { if (e.key === "Enter") li.click(); if ((e.ctrlKey || e.metaKey) && e.key === "c") { clipboard = arr[+li.dataset.i]; toast("Слайд скопирован."); } };
      li.addEventListener("dragstart", e => { e.dataTransfer.setData("text/x-slide", li.dataset.i); li.classList.add("drag"); });
      li.addEventListener("dragend", () => li.classList.remove("drag"));
      li.addEventListener("dragover", e => { if (e.dataTransfer.types.includes("text/x-slide")) { e.preventDefault(); li.classList.add("over"); } });
      li.addEventListener("dragleave", () => li.classList.remove("over"));
      li.addEventListener("drop", e => { const from = +e.dataTransfer.getData("text/x-slide"); if (isNaN(from)) return; e.preventDefault(); const to = +li.dataset.i; const a = slides(); const [m] = a.splice(from, 1); a.splice(to, 0, m); cur = to; write(a); rerender(); });
    });
    $s("#sxLay").onchange = e => set({ layout: e.target.value, afs: undefined });
    $s("#sxLayAll").onclick = () => { const v = $s("#sxLay").value; set({ layout: v, afs: undefined }, { all: true }); toast(`Шаблон «${LAYOUTS[v]}» применён ко всем слайдам.`); };
    $s("#sxTheme").onchange = e => { applyTheme(e.target.value); rerender(); };
    $s("#sxFonts").onchange = async e => { const k = e.target.value; toast("Подключаю шрифты…", 2500); await ensureFonts(k); L().slideFonts = k; saveLesson(L()); L().slidesFitted = false; rerender(); toast("Шрифты применены ко всей презентации; размер текста подобран заново."); };
    const sl = arr[cur];
    const fsNow = () => sl.set.fs || sl.set.afs || 1;
    $s("#sxFsM").onclick = () => set({ fs: Math.max(0.6, Math.round((fsNow() - 0.08) * 100) / 100) });
    $s("#sxFsP").onclick = () => set({ fs: Math.min(1.6, Math.round((fsNow() + 0.08) * 100) / 100) });
    $s("#sxFsA").onclick = () => { const a = slides(); a[cur].set.fs = undefined; a[cur].set.afs = autoScale(a[cur], cur).fs; write(a); rerender(); };
    $s("#sxPadM").onclick = () => set({ pad: Math.max(0.4, (sl.set.pad || 1) - 0.2) });
    $s("#sxPadP").onclick = () => set({ pad: Math.min(2, (sl.set.pad || 1) + 0.2) });
    $s("#sxLhM").onclick = () => set({ lh: Math.max(1, Math.round(((sl.set.lh || 1.3) - 0.1) * 10) / 10) });
    $s("#sxLhP").onclick = () => set({ lh: Math.min(2, Math.round(((sl.set.lh || 1.3) + 0.1) * 10) / 10) });
    $s("#sxBg").onchange = e => set({ bg: e.target.value });
    const clr = $s("#sxBgClr"); if (clr) clr.onclick = () => set({ bg: undefined, bgimg: undefined });
    $s("#sxBgImg").onclick = () => pickImage(res => set({ bgimg: res.src }));
    $s("#sxPic").onclick = () => addPicture(cur);
    $s("#sxAcc").onchange = e => { const v = e.target.value; const a = slides(); const has = new RegExp(Media.RE.source).test(a[cur].body); a[cur].set.acc = v || undefined; a[cur].set.afs = undefined; write(a); if (v && !has) { toast("Выберите картинку ниже, в «Картинках Яндекса», — она встанет на это место."); } rerender(); };
    const ov = $s("#sxOv"); if (ov) ov.onchange = e => set({ ov: e.target.value });
    const ovi = $s("#sxOvi"); if (ovi) ovi.onchange = e => set({ ovi: +e.target.value });
    sheet.querySelectorAll("[data-ha]").forEach(b => b.onclick = () => { const k = slides()[cur].set.ha === b.dataset.ha ? undefined : b.dataset.ha; set({ ha: k }, { all: $s("#sxHaAll")?.checked }); });
    $s("#sxVa").onchange = e => set({ va: e.target.value === "top" ? undefined : e.target.value });
    $s("#sxPlan").onclick = () => { if (window.Deck) Deck.openOutline(); };
    $s("#sxFree").onclick = () => {
      const a = slides();
      if (a[cur].set.free) { a[cur].set.free = undefined; a[cur].set.pos = undefined; write(a); rerender(); toast("Свободная вёрстка выключена: блоки снова идут по шаблону."); return; }
      a[cur].set.pos = measurePositions($s("#sxFrame .sx")); a[cur].set.free = true; a[cur].set.fs = a[cur].set.fs || a[cur].set.afs || 1;
      write(a); rerender(); toast("Свободная вёрстка: тяните блок за значок ✥, ширину — за правый край.", 6000);
    };
    $s("#sxYa").onclick = () => window.open(Media.yandexUrl(`${(sl.title || L().title).replace(/^[^\wА-ЯЁа-яё]+/, "")} ${L().title}`.trim()), "_blank", "noopener");
    $s("#sxSplit").onclick = () => { const a = slides(); const parts = splitSlide({ ...a[cur], set: { ...a[cur].set } }, cur) || halve(a[cur]); if (!parts) { toast("Делить нечего: на слайде один блок."); return; } a.splice(cur, 1, ...parts); write(a); rerender(); };
    $s("#sxMerge").onclick = () => { const a = slides(); if (cur >= a.length - 1) return; const n = a[cur + 1]; a[cur].body = [a[cur].body, n.body].filter(Boolean).join("\n\n"); a[cur].notes = [a[cur].notes, n.notes].filter(Boolean).join(" "); a[cur].set.afs = undefined; a.splice(cur + 1, 1); write(a); L().slidesFitted = false; rerender(); };
    $s("#sxUndo").onclick = doUndo; $s("#sxRedo").onclick = doRedo;
    $s("#sxHtml").onclick = () => exportHtml().catch(e => toast("Не получилось: " + (e.message || e)));
    $s("#sxAdd").onclick = () => { const a = slides(); a.splice(cur + 1, 0, { title: "Новый слайд", level: 2, body: "- ", notes: "", set: {} }); cur++; write(a); rerender(); };
    $s("#sxDup").onclick = () => { const a = slides(); a.splice(cur + 1, 0, JSON.parse(JSON.stringify(a[cur]))); cur++; write(a); rerender(); };
    $s("#sxCopy").onclick = () => { clipboard = JSON.parse(JSON.stringify(slides()[cur])); toast("Слайд скопирован. «Вставить» — после текущего."); rerender(); };
    $s("#sxPaste").onclick = () => { if (!clipboard) return; const a = slides(); a.splice(cur + 1, 0, JSON.parse(JSON.stringify(clipboard))); cur++; write(a); rerender(); };
    $s("#sxUp").onclick = () => { const a = slides(); if (!cur) return; [a[cur - 1], a[cur]] = [a[cur], a[cur - 1]]; cur--; write(a); rerender(); };
    $s("#sxDown").onclick = () => { const a = slides(); if (cur >= a.length - 1) return; [a[cur + 1], a[cur]] = [a[cur], a[cur + 1]]; cur++; write(a); rerender(); };
    $s("#sxDel").onclick = e => { if (!e.target.dataset.sure) { e.target.dataset.sure = 1; e.target.textContent = "Точно удалить?"; return; } const a = slides(); a.splice(cur, 1); cur = Math.max(0, cur - 1); write(a); rerender(); };
    // картинки Яндекса к слайду: поиск предлагает, учитель решает, вставлять ли
    const runSugg = q => suggest(q, $s("#sxSugg"), $s("#sxSuggNote"));
    $s("#sxQGo").onclick = () => runSugg($s("#sxQ").value.trim());
    $s("#sxQ").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); runSugg($s("#sxQ").value.trim()); } });
    $s("#sxQYa").onclick = () => window.open(Media.yandexUrl($s("#sxQ").value.trim()), "_blank", "noopener");
    runSugg($s("#sxQ").value.trim());
    // редактирование текста
    const fr = $s("#sxFrame .sx");
    fr.querySelectorAll("[contenteditable]").forEach(el => { el.addEventListener("input", commit); el.addEventListener("focusout", () => setTimeout(autoSplitIfNeeded, 650)); });
    $s("#sxNotes").addEventListener("input", commit);
    // вставка картинки из буфера и перетаскивание своих файлов
    fr.addEventListener("paste", async e => {
      const it = [...(e.clipboardData?.items || [])].find(x => x.type.startsWith("image/"));
      if (it) { e.preventDefault(); await insertBlob(it.getAsFile()); return; }
      if (e.target.closest("[contenteditable]")) { e.preventDefault(); document.execCommand("insertText", false, e.clipboardData.getData("text/plain")); }
    });
    fr.addEventListener("dragover", e => { if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); fr.classList.add("drop"); } });
    fr.addEventListener("dragleave", () => fr.classList.remove("drop"));
    fr.addEventListener("drop", async e => { const f = [...(e.dataTransfer.files || [])].find(x => x.type.startsWith("image/")); fr.classList.remove("drop"); if (f) { e.preventDefault(); await insertBlob(f); } });
    // перетаскивание блоков: по порядку (шаблон) или в любое место (свободная вёрстка)
    if (sl.set.free) freeDrag(fr); else blockDrag(fr);
    // картинки: щелчок — окно подбора; перетаскивание — положение; уголок — размер
    imageTools(fr);
    bindInsert(sheet, fr);
    bindMenus(sheet);
  }
  /* ---------- меню «⋯», выбор шаблона и оформления (как в Gamma) ---------- */
  let pop = null;
  function closePop() { if (pop) { pop.remove(); pop = null; document.removeEventListener("mousedown", outside, true); document.removeEventListener("keydown", escPop, true); } }
  function outside(e) { if (pop && !pop.contains(e.target) && !e.target.closest("[data-pop-anchor]")) closePop(); }
  function escPop(e) { if (e.key === "Escape") closePop(); }
  function popover(anchor, html, cls = "") {
    closePop();
    pop = document.createElement("div"); pop.className = "sx-pop " + cls; pop.setAttribute("role", "menu"); pop.innerHTML = html;
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    let x = Math.min(window.innerWidth - w - 8, Math.max(8, r.right - w)), y = r.bottom + 6;
    if (y + h > window.innerHeight - 8) y = Math.max(8, r.top - h - 6);
    pop.style.left = x + window.scrollX + "px"; pop.style.top = y + window.scrollY + "px";
    setTimeout(() => { document.addEventListener("mousedown", outside, true); document.addEventListener("keydown", escPop, true); }, 0);
    return pop;
  }
  const ICON_ACC = { "": "▭", left: "◧", right: "◨", top: "⬒", bg: "▣" };
  function slideMenu(anchor, i) {
    if (i !== cur) { cur = i; selBlock = -1; rerender(); anchor = $("#sxDots") || anchor; }
    const a = slides(), sl = a[cur], n = a.length;
    const p = popover(anchor, `
      <div class="pm-h">Слайд ${cur + 1}: ${esc((sl.title || "без заголовка").slice(0, 40))}</div>
      <button class="pm-i" data-m="layout">▦ Сменить шаблон слайда…</button>
      <button class="pm-i" data-m="design">🎨 Оформление презентации…</button>
      <div class="pm-sep">Картинка</div>
      <div class="pm-row">${Object.entries(ACC).map(([k, t]) => `<button class="pm-chip ${(sl.set.acc || "") === k ? "on" : ""}" data-acc="${k}" title="${t}">${ICON_ACC[k]}<small>${k ? t.replace("Картинка ", "") : "нет"}</small></button>`).join("")}</div>
      <button class="pm-i" data-m="pic">🔍 Подобрать картинку в Яндексе</button>
      <div class="pm-sep">Текст</div>
      <div class="pm-row">${Object.entries(VA).map(([k, t]) => `<button class="pm-chip ${(sl.set.va || "top") === k ? "on" : ""}" data-va="${k}">${t.replace("Текст ", "")}</button>`).join("")}</div>
      <div class="pm-row"><button class="pm-chip" data-fs="-">A− мельче</button><button class="pm-chip ${sl.set.fs ? "" : "on"}" data-fs="auto">Авто</button><button class="pm-chip" data-fs="+">A+ крупнее</button></div>
      <button class="pm-i" data-m="free">${sl.set.free ? "✥ Выключить свободную вёрстку" : "✥ Свободная вёрстка (двигать блоки куда угодно)"}</button>
      <div class="pm-sep">Слайд</div>
      <button class="pm-i" data-m="add">＋ Новый слайд после</button>
      <button class="pm-i" data-m="dup">⧉ Дублировать</button>
      <button class="pm-i" data-m="up" ${cur ? "" : "disabled"}>↑ Переместить выше</button>
      <button class="pm-i" data-m="down" ${cur < n - 1 ? "" : "disabled"}>↓ Переместить ниже</button>
      <button class="pm-i" data-m="split">✂ Разделить на два</button>
      <button class="pm-i" data-m="merge" ${cur < n - 1 ? "" : "disabled"}>⤓ Объединить со следующим</button>
      <button class="pm-i danger" data-m="del" ${n > 1 ? "" : "disabled"}>🗑 Удалить слайд</button>`, "pm");
    const click = id => { const b = $("#" + id); if (b) b.click(); };
    p.querySelectorAll("[data-acc]").forEach(b => b.onclick = () => { closePop(); const sel = $("#sxAcc"); if (sel) { sel.value = b.dataset.acc; sel.dispatchEvent(new Event("change")); } });
    p.querySelectorAll("[data-va]").forEach(b => b.onclick = () => { closePop(); set({ va: b.dataset.va === "top" ? undefined : b.dataset.va }); });
    p.querySelectorAll("[data-fs]").forEach(b => b.onclick = () => { closePop(); click({ "-": "sxFsM", "+": "sxFsP", auto: "sxFsA" }[b.dataset.fs]); });
    p.querySelectorAll("[data-m]").forEach(b => b.onclick = () => {
      const m = b.dataset.m; closePop();
      if (m === "layout") layoutPicker($("#sxLayPick") || anchor);
      else if (m === "design") designPicker($("#sxDesign") || anchor);
      else if (m === "pic") { const q = $("#sxQ"); if (q) { q.scrollIntoView({ block: "center", behavior: "smooth" }); q.focus(); } }
      else click({ free: "sxFree", add: "sxAdd", dup: "sxDup", up: "sxUp", down: "sxDown", split: "sxSplit", merge: "sxMerge" }[m] || "");
      if (m === "del") { const a2 = slides(); a2.splice(cur, 1); cur = Math.max(0, cur - 1); write(a2); rerender(); toast("Слайд удалён. Вернуть: ↶."); }
    });
  }
  /* Выбор шаблона: живые миниатюры этого же слайда в каждом шаблоне */
  function layoutPicker(anchor) {
    const a = slides(), sl = a[cur], curLay = autoLayout(sl, cur);
    const p = popover(anchor, `<div class="pm-h">Шаблон слайда — щёлкните, чтобы применить</div>
      <div class="lp-grid">${Object.entries(LAYOUTS).map(([k, t]) => `<button class="lp-item ${k === curLay ? "on" : ""}" data-lay="${k}"><div class="lp-mini theme-${theme()}">${slideHtml({ ...sl, set: { ...sl.set, layout: k, fs: undefined, afs: 0.9, free: undefined } }, cur)}</div><span>${t}</span></button>`).join("")}</div>
      <label class="check"><input type="checkbox" id="lpAll"> применить ко всем слайдам</label>`, "pm wide");
    const A = anim();
    p.insertAdjacentHTML("beforeend", `<div class="pm-h">Показ: анимация</div><div class="an-opts">${Object.entries(ANIMS).map(([k, n]) => `<button class="chip ${k === A.mode ? "on" : ""}" data-anim="${k}">${n}</button>`).join("")}</div>
      <label class="check"><input type="checkbox" id="anCut" ${A.cut ? "checked" : ""}> Заголовок титульного слайда — «вырезан» в картинке</label>
      <label class="check"><input type="checkbox" id="anDeco" ${A.deco ? "checked" : ""}> Полупрозрачные детали на фоне</label>
      <label class="check"><input type="checkbox" id="anIx" ${A.ix ? "checked" : ""}> Интерактив: карточки-перевороты («термин — значение»), объём при наведении, подсветка за курсором, полоса прогресса</label>
      <label class="check"><input type="checkbox" id="anStep" ${A.step ? "checked" : ""}> Пошагово: пункты появляются по щелчку (пробел / →)</label>
      <p class="hint">Анимация видна в «▶ Показ» и в HTML; в PowerPoint — плавные переходы между слайдами.</p>`);
    const saveA = ch => { L().slideAnim = { ...anim(), ...ch }; saveLesson(L()); };
    p.querySelectorAll("[data-anim]").forEach(b => b.onclick = () => { saveA({ mode: b.dataset.anim }); p.querySelectorAll("[data-anim]").forEach(x => x.classList.toggle("on", x === b)); });
    p.querySelector("#anCut").onchange = e => saveA({ cut: e.target.checked });
    p.querySelector("#anDeco").onchange = e => saveA({ deco: e.target.checked });
    p.querySelector("#anIx").onchange = e => saveA({ ix: e.target.checked });
    p.querySelector("#anStep").onchange = e => saveA({ step: e.target.checked });
    p.querySelectorAll(".lp-mini .sx-body, .lp-mini .sx-acc").forEach(decorate); hydrateBg(p);
    p.querySelectorAll("[data-lay]").forEach(b => b.onclick = () => { const all = p.querySelector("#lpAll").checked; closePop(); set({ layout: b.dataset.lay, afs: undefined }, { all }); L().slidesFitted = false; toast(`Шаблон «${LAYOUTS[b.dataset.lay]}» применён${all ? " ко всем слайдам" : ""}.`); });
  }
  /* Оформление: темы (живые превью титульного слайда) и пары шрифтов */
  function designPicker(anchor) {
    const a = slides(), first = a[0] || { title: L().title, body: "", set: {}, level: 1 };
    const sample = { ...first, set: { ...first.set, afs: 0.8, fs: undefined } };
    const p = popover(anchor, `<div class="pm-h">Тема оформления</div>
      <div class="lp-grid themes">${Object.entries(THEMES).map(([k, t]) => `<button class="lp-item ${k === theme() ? "on" : ""}" data-theme="${k}"><div class="lp-mini theme-${k}">${slideHtml(sample, 0, { th: k })}</div><span>${t}</span></button>`).join("")}</div>
      <div class="pm-h">Шрифты (заголовок + текст)</div>
      <div class="fp-grid">${Object.entries(FONTS).map(([k, f]) => `<button class="fp-item ${k === fontKey() ? "on" : ""}" data-font="${k}"><b style="font-family:'${f.h}',Georgia,serif">Аа Заголовок</b><span style="font-family:'${f.b}',Arial,sans-serif">Текст слайда</span><small>${f.name}</small></button>`).join("")}</div>`, "pm wide");
    p.querySelectorAll(".lp-mini .sx-body, .lp-mini .sx-acc").forEach(decorate); hydrateBg(p);
    Object.keys(FONTS).forEach(k => ensureFonts(k));
    p.querySelectorAll("[data-theme]").forEach(b => b.onclick = () => { closePop(); const sel = $("#sxTheme"); sel.value = b.dataset.theme; sel.dispatchEvent(new Event("change")); });
    p.querySelectorAll("[data-font]").forEach(b => b.onclick = () => { closePop(); const sel = $("#sxFonts"); sel.value = b.dataset.font; sel.dispatchEvent(new Event("change")); });
  }
  function bindMenus(sheet) {
    const $s = q => sheet.querySelector(q);
    const anch = el => { if (el) el.setAttribute("data-pop-anchor", ""); return el; };
    anch($s("#sxDots")).onclick = e => { e.stopPropagation(); slideMenu(e.currentTarget, cur); };
    anch($s("#sxMenuTop")).onclick = e => slideMenu(e.currentTarget, cur);
    anch($s("#sxLayPick")).onclick = e => layoutPicker(e.currentTarget);
    anch($s("#sxDesign")).onclick = e => designPicker(e.currentTarget);
    $s("#sxPlan2").onclick = () => { if (window.Deck) Deck.openOutline(); };
    $s("#sxPlay2").onclick = () => exportHtml({ open: true }).catch(e => toast("Не получилось: " + (e.message || e)));
    $s("#sxUndo2").onclick = doUndo; $s("#sxRedo2").onclick = doRedo;
    $s("#sxMoreBtn").onclick = () => { moreOpen = !moreOpen; $s("#sxMore").hidden = !moreOpen; $s("#sxMoreBtn").setAttribute("aria-expanded", moreOpen); };
    sheet.querySelectorAll("[data-dots]").forEach(b => { anch(b); b.onclick = e => { e.stopPropagation(); slideMenu(b, +b.dataset.dots); }; });
  }
  /* ---------- вставка элементов и действия с выбранным блоком ---------- */
  function insertMd(md, { after = selBlock } = {}) {
    const a = slides(), sl = a[cur], { acc, toks } = blocksOf(sl);
    const at = after >= 0 && after < toks.length ? after + 1 : toks.length;
    toks.splice(at, 0, md); setBlocks(sl, acc, toks);
    if (sl.set.free && sl.set.pos) { // свободная вёрстка: новый блок ставим ниже остальных
      const pos = {}; Object.entries(sl.set.pos).forEach(([k, v]) => { if (k === "t") pos.t = v; else pos[+k >= at ? +k + 1 : k] = v; });
      const maxY = Math.max(10, ...Object.entries(pos).filter(([k]) => k !== "t").map(([, v]) => v.y)); pos[at] = { x: 6, y: Math.min(85, maxY + 10), w: 60 }; sl.set.pos = pos;
    }
    selBlock = at; write(a); rerender();
    setTimeout(() => { const el = $("#sxFrame .sx-body")?.children[at]; if (el) { el.scrollIntoView({ block: "nearest" }); placeCaret(el); } }, 60);
  }
  function placeCaret(el) { try { const r = document.createRange(); r.selectNodeContents(el); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); el.closest("[contenteditable]")?.focus(); } catch { } }
  /* Видео: на видеослайд — заменить ролик; на обычный — новый слайд после текущего */
  function openVideo(at) {
    const a = slides(), sl = a[cur] || {}, isV = sl.set?.kind === "video" || sl.set?.layout === "video";
    const tp = L().params?.topic || "", q = sl.set?.vq || (tp ? (L().params.subject === "lit" ? `${(tp.match(/«([^»]+)»/) || [])[1] || tp} экранизация фрагмент` : `${tp} видеоурок`) : sl.title || "");
    VideoKit.openDialog({ q, v: isV ? sl.set.video || {} : {}, onDone: v => {
      const b = slides();
      if (isV && at !== null) { b[cur].set.video = v; b[cur].set.vq = v.q; }
      else { b.splice(cur + 1, 0, { title: "Видеофрагмент", level: 2, body: "Смотрим и отвечаем: что важного вы заметили?", notes: `Фрагмент: ${v.c || ""} ${VideoKit.span(v)}. ${VideoKit.watchUrl(v)}`.trim(), set: { layout: "video", kind: "video", video: v, vq: v.q } }); cur++; }
      selBlock = -1; write(b); rerender(); toast("Видео на слайде. В показе нажмите ▶ — проиграется только выбранный отрезок.", 5000);
    } });
  }
  /* Стикеры: палитра, добавление, перетаскивание, поворот колёсиком, двойной щелчок — убрать */
  function stickerPicker(anchor) {
    const sl = slides()[cur];
    const p = popover(anchor, `<div class="pm-h">Стикеры поверх слайда</div><div class="stk-grid">${Object.entries(ThemeKit.STK).map(([k, v]) => `<button class="stk-it" data-stk="${k}" title="${v.n}">${ThemeKit.stkSvg(k)}<small>${v.n}</small></button>`).join("")}</div>
      <div class="pm-h">Фото-наклейка (вырезка, рваная бумага, полароид, скотч, марка)</div>
      <div class="pm-row"><button class="btn sm teal" id="psFile">📷 Своё фото</button><button class="btn sm ghost" id="psSlide">🖼 Картинка со слайда</button><button class="btn sm ghost" id="psYa">🔍 Найти картинку</button></div>
      <div class="pm-row"><label class="check"><input type="checkbox" id="stkAuto" ${sl.set.nostk ? "" : "checked"}> Стикеры темы на ключевых слайдах</label></div><p class="small" style="padding:0 6px">Стикер можно перетащить; колёсико или Shift+стрелки — повернуть; +/− — размер; двойной щелчок — убрать.</p>`, "pm wide");
    p.querySelectorAll("[data-stk]").forEach(b => b.onclick = () => { const a = slides(); a[cur].set.stk = [...(a[cur].set.stk || []), { n: b.dataset.stk, x: 70 + Math.round(Math.random() * 12), y: 8 + Math.round(Math.random() * 10), s: 11, r: Math.round(Math.random() * 16 - 8) }]; write(a); closePop(); rerender(); });
    p.querySelector("#psFile").onclick = () => { closePop(); const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*"; inp.onchange = () => { const f = inp.files[0]; if (f) photoSticker(f, ""); }; inp.click(); };
    p.querySelector("#psSlide").onclick = async () => {
      closePop(); const m = (sl.body.match(Media.RE) || []).map(x => x.match(/\]\(\s*([^)\s"]+)/)?.[1]).filter(x => x && !/^(search|commons):/.test(x)); Media.RE.lastIndex = 0;
      const src = sl.set.bgimg || m[0]; if (!src) { toast("На этом слайде нет картинки. Выберите «Своё фото» или «Найти картинку»."); return; }
      const b = src.startsWith("idb:") ? await Store.get("images", src.slice(4)) : await Media.toBlob(src).catch(() => null);
      if (b) photoSticker(b, sl.title); else toast("Не получилось взять картинку.");
    };
    p.querySelector("#psYa").onclick = () => { closePop(); pickImage(async res => { const b = res.src.startsWith("idb:") ? await Store.get("images", res.src.slice(4)) : await Media.toBlob(res.src).catch(() => null); if (b) photoSticker(b, res.cap || ""); else toast("Не получилось скачать картинку — попробуйте другую."); }); };
    p.querySelector("#stkAuto").onchange = e => { const a = slides(); a[cur].set.nostk = e.target.checked ? undefined : 1; write(a); rerender(); };
  }
  /* Фото-наклейка: окно выбора вида → PNG в хранилище → стикер на текущем слайде */
  function photoSticker(blob, caption = "") {
    PhotoStk.openDialog(blob, { caption: String(caption).slice(0, 40), onDone: async r => {
      const id = "img-" + uid(); await Store.put("images", id, r.blob);
      const a = slides(); const s0 = r.ar >= 1 ? 30 : 22;
      a[cur].set.stk = [...(a[cur].set.stk || []), { img: "idb:" + id, ar: Math.round(r.ar * 1000) / 1000, x: 62 - Math.round(Math.random() * 8), y: 18 + Math.round(Math.random() * 10), s: s0, r: Math.round(Math.random() * 10 - 5) }];
      write(a); rerender(); toast("Наклейка вклеена. Перетащите её; колёсико — повернуть, +/− — размер.", 5000);
    } });
  }
  /* После сборки: палитра «По картине» из главной иллюстрации и вырезанные портреты-наклейки (фон убран, белая обводка) */
  const wantCut = () => { try { const v = localStorage.getItem("uchu:cutout"); if (v) return v === "1"; } catch { } return !/Mobi|Android/i.test(navigator.userAgent) && (navigator.deviceMemory || 8) >= 4; };
  async function stickerize(md, { onStep } = {}) {
    if (!window.ThemeKit) return md;
    const head = headOf(md), arr = splitSlides(md).map(parse);
    const idbOf = sl => { const m = new RegExp(Media.RE.source).exec(sl.body || ""); return m && /^idb:/.test(m[2]) ? { m, id: m[2].slice(4) } : null; };
    // 1) палитра из первой найденной иллюстрации
    const first = arr.map(idbOf).find(Boolean);
    if (first) { const b = await Store.get("images", first.id).catch(() => null); if (b) { try { L().slidePalette = await ThemeKit.paletteFrom(b); } catch { } } }
    // 1б) полароид на титуле — в «тёплых» тематических оформлениях (как вклеенная фотография)
    let changed = false;
    const POL = { poster: "polaroid", sketch: "polaroid", haze: "polaroid", aqua: "polaroid", collage: "torn", botanic: "tape", night: "stamp" }[theme()];
    if (POL && window.PhotoStk && arr[0]?.set.acc) {
      const hit = idbOf(arr[0]); const b = hit ? await Store.get("images", hit.id).catch(() => null) : null;
      if (b) { try { const r = await PhotoStk.make(b, POL, { caption: POL === "polaroid" ? String(arr[0].title).replace(/[«»]/g, "").slice(0, 30) : "" }); const id = "img-" + uid(); await Store.put("images", id, r.blob); const sl = arr[0]; sl.body = sl.body.replace(hit.m[0], "").trim(); sl.set.acc = undefined; sl.set.photo = 1; const w = r.ar >= 1 ? 38 : 28; sl.set.stk = [...(sl.set.stk || []), { img: "idb:" + id, ar: Math.round(r.ar * 1000) / 1000, x: 56, y: Math.max(4, Math.round(50 - (w * 16 / 9 / r.ar) / 2)), s: w, r: 3 }]; changed = true; } catch { } }
    }
    // 2) портрет писателя — вырезанной наклейкой (если устройство тянет модель удаления фона)
    if (wantCut() && window.PhotoStk && ThemeKit.has(theme()) && theme() !== "board") {
      for (const sl of arr.filter(x => x.set.kind === "author").slice(0, 1)) {
        const hit = idbOf(sl); if (!hit) continue;
        const b = await Store.get("images", hit.id).catch(() => null); if (!b) continue;
        try {
          onStep?.("Вырезаю портрет для наклейки…");
          const r = await PhotoStk.make(b, "cut", { cut: true });
          const id = "img-" + uid(); await Store.put("images", id, r.blob);
          sl.body = sl.body.replace(hit.m[0], "").trim(); sl.set.acc = undefined; sl.set.photo = 1;
          const w = r.ar >= 1 ? 44 : Math.min(40, 30 * r.ar + 12);
          sl.set.stk = [...(sl.set.stk || []), { img: "idb:" + id, ar: Math.round(r.ar * 1000) / 1000, x: 54, y: Math.max(2, Math.round(50 - (w * 16 / 9 / r.ar) / 2)), s: Math.round(w), r: 2 }];
          changed = true;
        } catch (e) { console.warn("cutout", e); }
      }
    }
    return changed ? (/marp\s*:/.test(head) ? head.trim() + "\n\n" : "") + arr.map(build).join("\n\n---\n\n") + "\n" : md;
  }
  function bindStickers(fr) {
    const sx = fr.querySelector(".sx"); if (!sx) return;
    const own = () => { // авто-стикеры становятся своими при первом изменении
      const a = slides(), st = a[cur].set;
      if (!st.nostk && window.ThemeKit?.has(theme())) { st.stk = [...ThemeKit.autoStickers(theme(), st.kind || autoLayout(a[cur], cur), cur), ...(st.stk || [])]; st.nostk = 1; }
      return a;
    };
    sx.querySelectorAll(".stk").forEach(el => {
      const idx = () => [...sx.querySelectorAll(".stk")].indexOf(el);
      el.addEventListener("pointerdown", e => {
        e.preventDefault(); e.stopPropagation(); el.setPointerCapture(e.pointerId); el.focus();
        const R = sx.getBoundingClientRect(), x0 = parseFloat(el.style.left), y0 = parseFloat(el.style.top), sx0 = e.clientX, sy0 = e.clientY;
        const mv = ev => { el.style.left = Math.max(-5, Math.min(97, x0 + (ev.clientX - sx0) / R.width * 100)) + "%"; el.style.top = Math.max(-5, Math.min(95, y0 + (ev.clientY - sy0) / R.height * 100)) + "%"; };
        const up = () => { el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up); const a = own(), k = idx(); const it = a[cur].set.stk[k]; if (it) { it.x = Math.round(parseFloat(el.style.left) * 10) / 10; it.y = Math.round(parseFloat(el.style.top) * 10) / 10; delete it.auto; } write(a); };
        el.addEventListener("pointermove", mv); el.addEventListener("pointerup", up);
      });
      const tweak = fn => { const a = own(), it = a[cur].set.stk[idx()]; if (!it) return; fn(it); delete it.auto; write(a); rerender(); };
      el.addEventListener("dblclick", e => { e.stopPropagation(); const a = own(); a[cur].set.stk.splice(idx(), 1); write(a); rerender(); });
      el.addEventListener("wheel", e => { e.preventDefault(); tweak(it => { it.r = ((it.r || 0) + (e.deltaY > 0 ? 6 : -6)) % 360; }); }, { passive: false });
      el.addEventListener("keydown", e => {
        if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); const a = own(); a[cur].set.stk.splice(idx(), 1); write(a); rerender(); }
        else if (e.key === "+" || e.key === "=") tweak(it => { it.s = Math.min(40, (it.s || 10) + 1.5); });
        else if (e.key === "-") tweak(it => { it.s = Math.max(4, (it.s || 10) - 1.5); });
        else if (e.shiftKey && /Arrow(Left|Right)/.test(e.key)) { e.preventDefault(); tweak(it => { it.r = (it.r || 0) + (e.key === "ArrowLeft" ? -6 : 6); }); }
      });
    });
  }
  function bindInsert(sheet, fr) {
    sheet.querySelectorAll("[data-ins]").forEach(b => b.onclick = () => {
      const k = b.dataset.ins;
      if (k === "photo") { const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*"; inp.onchange = () => { const f = inp.files[0]; if (f) insertBlob(f, f.name.replace(/\.[^.]+$/, "")); }; inp.click(); return; }
      if (k === "yandex") { const q = $("#sxQ"); if (q) { q.scrollIntoView({ block: "center", behavior: "smooth" }); q.focus(); q.select(); toast("Введите запрос и щёлкните по картинке — она встанет на слайд."); } return; }
      if (k === "button") { linkDialog(null, md => insertMd(md)); return; }
      if (k === "video") { openVideo(cur); return; }
      if (k === "sticker") { stickerPicker(b); return; }
      insertMd(SNIP[k]);
    });
    sheet.querySelectorAll("[data-new]").forEach(b => b.onclick = () => {
      const k = b.dataset.new, [t, body] = NEWBODY[k], a = slides();
      const set = k === "board" ? { layout: "one", kind: "board" } : k === "video" ? { layout: "video", kind: "video" } : { layout: k === "title" ? "section" : k };
      if (k === "video") { openVideo(null); return; }
      a.splice(cur + 1, 0, { title: t, level: k === "title" ? 1 : 2, body, notes: k === "board" ? "Запись на доске: дата, «Классная работа», тема, опорная схема, примеры с выделенной орфограммой." : "", set }); cur++; selBlock = -1; write(a); rerender();
    });
    const play = $("#sxPlay"); if (play) play.onclick = () => exportHtml({ open: true }).catch(e => toast("Не получилось: " + (e.message || e)));
    // выбор блока щелчком
    const body = fr.querySelector(".sx-body"), tools = $("#sxEl");
    const show = () => {
      [...body.children].forEach((c, i) => c.classList.toggle("sel", i === selBlock));
      const el = body.children[selBlock]; if (!el || !tools) { if (tools) tools.hidden = true; return; }
      const r = el.getBoundingClientRect(), st = tools.parentElement.getBoundingClientRect();
      tools.hidden = false; tools.style.left = Math.max(0, r.left - st.left) + "px"; tools.style.top = Math.max(0, r.top - st.top - 38) + "px";
    };
    body.addEventListener("click", e => {
      const g = e.target.closest("a.sx-gl"); if (g && body.contains(g)) { e.preventDefault(); glossTip(g); return; }
      const a = e.target.closest("a"); if (a && body.contains(a)) { e.preventDefault(); linkDialog(a, null); return; }
      const blk = [...body.children].find(c => c.contains(e.target)); selBlock = blk ? [...body.children].indexOf(blk) : -1; show();
    });
    show();
    tools?.querySelectorAll("[data-el]").forEach(b => b.onmousedown = e => {
      e.preventDefault();
      const act = b.dataset.el;
      if (act === "bold" || act === "ital") { document.execCommand(act === "bold" ? "bold" : "italic"); commit(); return; }
      const a = slides(), sl = a[cur], { acc, toks } = blocksOf(sl); const i = selBlock; if (i < 0 || i >= toks.length) return;
      if (act === "link") { const txt = toks[i].replace(/^[#>\-*\d.\s]+/, "").replace(/[*_]/g, "").slice(0, 40) || "Продолжить"; linkDialog(null, md => { toks[i] = md; setBlocks(sl, acc, toks); write(a); rerender(); }, txt); return; }
      if (act === "up" && i > 0) { [toks[i - 1], toks[i]] = [toks[i], toks[i - 1]]; selBlock = i - 1; }
      else if (act === "down" && i < toks.length - 1) { [toks[i + 1], toks[i]] = [toks[i], toks[i + 1]]; selBlock = i + 1; }
      else if (act === "dup") { toks.splice(i + 1, 0, toks[i]); selBlock = i + 1; }
      else if (act === "del") { toks.splice(i, 1); selBlock = Math.min(i, toks.length - 1); }
      else return;
      setBlocks(sl, acc, toks); write(a); rerender();
    });
  }
  /* Слово с пояснением: щелчок показывает объяснение рядом; можно поправить или убрать */
  function glossTip(g) {
    document.querySelectorAll(".sx-tip.ed").forEach(x => x.remove());
    const tip = document.createElement("div"); tip.className = "sx-tip ed"; tip.setAttribute("role", "dialog");
    tip.innerHTML = `<b>${esc(g.textContent)}</b><textarea rows="3" aria-label="Пояснение">${esc(g.dataset.tip || g.title || "")}</textarea><div class="mat-row"><button class="btn sm flame" data-k="ok">Сохранить</button><button class="btn sm ghost" data-k="del">Убрать пояснение</button><button class="btn sm ghost" data-k="x">×</button></div>`;
    document.body.appendChild(tip);
    const r = g.getBoundingClientRect(); tip.style.left = Math.min(innerWidth - 300, Math.max(8, r.left)) + scrollX + "px"; tip.style.top = r.bottom + scrollY + 6 + "px";
    const close = () => { tip.remove(); document.removeEventListener("mousedown", out, true); };
    const out = e => { if (!tip.contains(e.target)) close(); };
    setTimeout(() => document.addEventListener("mousedown", out, true), 0);
    tip.onclick = e => {
      const k = e.target.dataset.k; if (!k) return;
      if (k === "ok") { const v = tip.querySelector("textarea").value.trim().replace(/"/g, "«").replace(/[\[\]]/g, ""); g.setAttribute("title", v); g.dataset.tip = v; }
      if (k === "del") g.replaceWith(document.createTextNode(g.textContent));
      close(); if (k !== "x") { commit(); setTimeout(rerender, 650); }
    };
  }
  /* Кнопка-переход: текст и куда ведёт (следующий, предыдущий, слайд №, ссылка) */
  function linkDialog(aEl, onMd, text0) {
    const arr = slides(), href0 = aEl ? aEl.getAttribute("href") : "#next", t0 = aEl ? aEl.textContent.trim() : (text0 || "Продолжить →");
    const m = openModal(`<div class="dialog narrow"><div class="dlg-h"><h2>Кнопка-переход</h2><button class="btn ghost x" data-close aria-label="Закрыть">×</button></div><div class="dlg-b">
      <div class="field"><label for="lkT">Текст на кнопке</label><input type="text" id="lkT" value="${esc(t0)}"></div>
      <div class="field"><label for="lkTo">Куда ведёт</label><select id="lkTo"><option value="#next">Следующий слайд</option><option value="#prev">Предыдущий слайд (кнопка «Вернуться»)</option><option value="#first">Первый слайд</option><option value="#last">Последний слайд</option>${arr.map((x, i) => `<option value="#slide-${i + 1}">Слайд ${i + 1}: ${esc((x.title || "без заголовка").slice(0, 50))}</option>`).join("")}<option value="url">Ссылка на сайт…</option></select></div>
      <div class="field" id="lkUrlF" hidden><label for="lkUrl">Адрес</label><input type="url" id="lkUrl" placeholder="https://…"></div>
      <p class="hint">В режиме «Показ», в HTML и в PowerPoint кнопка работает: щелчок переводит на выбранный слайд. Так можно собрать квест или игру-тренажёр.</p>
      <div class="mat-row"><button class="btn flame" id="lkOk">Готово</button>${aEl ? `<button class="btn ghost" id="lkDel">Убрать кнопку (оставить текст)</button>` : ""}</div></div></div>`);
    const to = m.querySelector("#lkTo"); if (href0) { if ([...to.options].some(o => o.value === href0)) to.value = href0; else if (/^https?:/.test(href0)) { to.value = "url"; m.querySelector("#lkUrlF").hidden = false; m.querySelector("#lkUrl").value = href0; } }
    to.onchange = () => { m.querySelector("#lkUrlF").hidden = to.value !== "url"; };
    m.querySelector("#lkOk").onclick = () => {
      const t = m.querySelector("#lkT").value.trim() || "Продолжить", href = to.value === "url" ? m.querySelector("#lkUrl").value.trim() : to.value; closeModal();
      if (aEl) { aEl.textContent = t; aEl.setAttribute("href", href); commit(); setTimeout(rerender, 650); }
      else onMd && onMd(`[${t.replace(/[\[\]]/g, "")}](${href})`);
    };
    const d = m.querySelector("#lkDel"); if (d) d.onclick = () => { closeModal(); aEl.replaceWith(document.createTextNode(aEl.textContent)); commit(); setTimeout(rerender, 650); };
  }
  function halve(sl) {
    const toks = window.marked.lexer(sl.body || "").filter(t => t.type !== "space").map(t => t.raw.trim());
    if (toks.length < 2) return null;
    const h = Math.ceil(toks.length / 2);
    return [{ ...sl, body: toks.slice(0, h).join("\n\n"), set: { ...sl.set, afs: undefined } }, { ...sl, title: sl.title.replace(/\s*\(продолжение.*\)$/, "") + " (продолжение)", body: toks.slice(h).join("\n\n"), notes: "", set: { ...sl.set, afs: undefined } }];
  }
  function autoSplitIfNeeded() {
    if (document.activeElement?.closest?.("#sxFrame")) return;
    const a = slides(), sl = a[cur]; if (!sl || sl.set.fs || sl.set.fit === "off") return;
    const r = autoScale(sl, cur); if (r.ok || ["title", "section", "big", "image", "gallery"].includes(autoLayout(sl, cur))) return;
    const parts = splitSlide(sl, cur); if (!parts) return;
    a.splice(cur, 1, ...parts); write(a); rerender();
    toast("Слайд не помещался — он разделён, весь текст сохранён. Отменить: ↶.", 6000);
  }
  function doUndo() { if (!undo.length) return; redo.push(L().docs.slides); L().docs.slides = undo.pop(); $("#md").value = L().docs.slides; saveLesson(L()); rerender(); }
  function doRedo() { if (!redo.length) return; undo.push(L().docs.slides); L().docs.slides = redo.pop(); $("#md").value = L().docs.slides; saveLesson(L()); rerender(); }
  document.addEventListener("keydown", e => {
    if (state?.active !== "slides" || !document.querySelector(".sxed")) return;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z" && !e.target.closest("[contenteditable]")) { e.preventDefault(); doUndo(); }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z")) && !e.target.closest("[contenteditable]")) { e.preventDefault(); doRedo(); }
  });

  /* ---------- блоки: перетаскивание ---------- */
  function blockDrag(fr) {
    const body = fr.querySelector(".sx-body");
    [...body.children].forEach((blk, k) => {
      if (blk.classList.contains("sx-grip")) return;
      const g = document.createElement("span"); g.className = "sx-grip"; g.contentEditable = "false"; g.textContent = "⠿"; g.title = "Перетащите, чтобы поменять порядок"; g.draggable = true;
      if (!blk.matches("figure.pic")) blk.style.position = blk.style.position || "relative"; blk.prepend(g);
      g.addEventListener("dragstart", e => { e.dataTransfer.setData("text/x-block", String(k)); blk.classList.add("drag"); });
      g.addEventListener("dragend", () => blk.classList.remove("drag"));
      blk.addEventListener("dragover", e => { if (e.dataTransfer.types.includes("text/x-block")) { e.preventDefault(); blk.classList.add("over"); } });
      blk.addEventListener("dragleave", () => blk.classList.remove("over"));
      blk.addEventListener("drop", e => {
        const from = +e.dataTransfer.getData("text/x-block"); if (isNaN(from)) return; e.preventDefault(); blk.classList.remove("over");
        const a = slides(), { acc, toks } = blocksOf(a[cur]);
        if (from >= toks.length || k >= toks.length) return;
        const [m] = toks.splice(from, 1); toks.splice(k, 0, m); setBlocks(a[cur], acc, toks); write(a); rerender();
      });
    });
  }
  /* ---------- свободная вёрстка: перемещение и ширина блоков ---------- */
  function freeDrag(fr) {
    const inner = fr.querySelector(".sx-inner");
    const items = [["t", fr.querySelector(".sx-title")], ...[...fr.querySelectorAll(".sx-body > *")].map((el, k) => [k, el])];
    for (const [key, el] of items) {
      if (!el || el.matches("figure.pic")) continue; // картинки двигаются своими ручками
      el.classList.add("fx");
      const mv = document.createElement("span"); mv.className = "fx-move"; mv.contentEditable = "false"; mv.textContent = "✥"; mv.title = "Перетащите блок";
      const rs = document.createElement("span"); rs.className = "fx-size"; rs.contentEditable = "false"; rs.title = "Потяните, чтобы изменить ширину";
      el.append(mv, rs);
      let d = null;
      const down = mode => e => { e.preventDefault(); const b = inner.getBoundingClientRect(), r = el.getBoundingClientRect(); d = { mode, sx: e.clientX, sy: e.clientY, x: (r.left - b.left) / b.width * 100, y: (r.top - b.top) / b.height * 100, w: r.width / b.width * 100, bw: b.width, bh: b.height }; e.target.setPointerCapture(e.pointerId); };
      const move = e => { if (!d) return; const dx = (e.clientX - d.sx) / d.bw * 100, dy = (e.clientY - d.sy) / d.bh * 100; if (d.mode === "move") { el.style.left = Math.max(-5, Math.min(95, d.x + dx)) + "%"; el.style.top = Math.max(-5, Math.min(95, d.y + dy)) + "%"; } else el.style.width = Math.max(8, Math.min(110, d.w + dx)) + "%"; };
      const up = () => { if (!d) return; d = null; const a = slides(); const pos = { ...(a[cur].set.pos || {}) }; pos[key] = { x: Math.round(parseFloat(el.style.left) * 10) / 10, y: Math.round(parseFloat(el.style.top) * 10) / 10, w: Math.round(parseFloat(el.style.width) * 10) / 10 }; a[cur].set.pos = pos; write(a); const th = document.querySelector(`.sx-th[data-i="${cur}"] .sx-mini`); if (th) { th.innerHTML = slideHtml(a[cur], cur); th.querySelectorAll(".sx-body, .sx-acc").forEach(decorate); } };
      mv.addEventListener("pointerdown", down("move")); mv.addEventListener("pointermove", move); mv.addEventListener("pointerup", up);
      rs.addEventListener("pointerdown", down("size")); rs.addEventListener("pointermove", move); rs.addEventListener("pointerup", up);
    }
  }

  /* ---------- картинки ---------- */
  function imageTools(fr) {
    fr.querySelectorAll("figure.pic").forEach((fig, idx) => {
      const d = fig.dataset;
      if (fig.closest(".sx-acc")) { fig.style.cursor = "pointer"; fig.title = "Щёлкните: заменить, обрезать, убрать фон, переставить"; fig.onclick = e => { e.preventDefault(); pictureMenu(fig, idx); }; return; }
      if (d.px) { fig.classList.add("free"); fig.style.left = d.px + "%"; fig.style.top = d.py + "%"; fig.style.width = d.pw + "%"; }
      const grip = document.createElement("span"); grip.className = "sx-resize"; grip.title = "Потяните, чтобы изменить размер"; fig.appendChild(grip);
      let drag = null, moved = false;
      fig.addEventListener("pointerdown", e => {
        if (e.button) return; const box = fr.getBoundingClientRect(), r = fig.getBoundingClientRect();
        drag = { mode: e.target === grip ? "size" : "move", sx: e.clientX, sy: e.clientY, l: (r.left - box.left) / box.width * 100, t: (r.top - box.top) / box.height * 100, w: r.width / box.width * 100, bw: box.width, bh: box.height };
        moved = false; fig.setPointerCapture(e.pointerId);
      });
      fig.addEventListener("pointermove", e => {
        if (!drag) return; const dx = (e.clientX - drag.sx) / drag.bw * 100, dy = (e.clientY - drag.sy) / drag.bh * 100;
        if (Math.abs(dx) + Math.abs(dy) < 1.5 && !moved) return; moved = true; fig.classList.add("free");
        if (drag.mode === "move") { fig.style.left = Math.max(0, Math.min(95, drag.l + dx)) + "%"; fig.style.top = Math.max(0, Math.min(95, drag.t + dy)) + "%"; fig.style.width = drag.w + "%"; }
        else { fig.style.left = drag.l + "%"; fig.style.top = drag.t + "%"; fig.style.width = Math.max(10, Math.min(100, drag.w + dx)) + "%"; }
      });
      fig.addEventListener("pointerup", () => {
        if (!drag) return; drag = null;
        if (!moved) { pictureMenu(fig, idx); return; }
        const pos = { px: Math.round(parseFloat(fig.style.left)), py: Math.round(parseFloat(fig.style.top)), pw: Math.round(parseFloat(fig.style.width)) };
        patchImage(idx, o2 => ({ ...o2, ...pos }));
      });
      fig.onclick = e => e.preventDefault();
    });
  }
  function patchImage(idx, fn, newSrc, newCap) {
    const a = slides(); let k = -1;
    a[cur].body = a[cur].body.replace(Media.RE, (m, cap, src, opt) => { if (++k !== idx) return m; const o = fn(Media.parseOpts(opt)); if (newSrc) { delete o.z; delete o.x; delete o.y; } return Media.mdImage(newCap ? String(newCap).replace(/[\[\]()]/g, "").slice(0, 80) : cap, newSrc || src, o); });
    write(a); rerender();
  }
  function pictureMenu(fig, idx) {
    const a0 = slides(), st0 = a0[cur].set, isAcc = !!fig.closest(".sx-acc");
    const q0 = fig.dataset.q || suggestQuery(a0[cur]);
    const m = openModal(`<div class="dialog"><div class="dlg-h"><h2>Картинка</h2><button class="btn ghost x" data-close aria-label="Закрыть">×</button></div><div class="dlg-b">
      <div class="mat-row"><button class="btn sm" id="pmEdit">Обрезать или заменить</button><button class="btn sm ghost" id="pmCut">Убрать фон</button><button class="btn sm ghost" id="pmBg">Сделать фоном слайда</button><button class="btn sm ghost" id="pmStk">Сделать наклейкой</button>${isAcc ? "" : `<button class="btn sm ghost" id="pmReset">Вернуть на место (по сетке)</button>`}<button class="btn sm ghost" id="pmDel">Удалить картинку</button></div>
      <div class="mat-row"><span class="small"><b>Положение:</b></span>${Object.entries(ACC).filter(([k]) => k).map(([k, n]) => `<button class="btn sm ${st0.acc === k ? "flame" : "ghost"}" data-acc="${k}">${n.replace("Картинка ", "")}</button>`).join("")}<button class="btn sm ${!st0.acc ? "flame" : "ghost"}" data-acc="">в тексте</button></div>
      <div class="sx-sugg-h"><b>Другая картинка из Яндекса</b><input type="text" id="pmQ" class="mini-q" value="${esc(q0)}"><button class="btn sm ghost" id="pmGo">Найти</button></div>
      <div class="sx-sugg-grid" id="pmSugg"><p class="small">Ищу…</p></div>
      <p class="small" id="pmMsg">Щёлкните по картинке — она сразу заменит текущую.</p></div></div>`);
    m.querySelectorAll("[data-acc]").forEach(b => b.onclick = () => { closeModal(); const a = slides(); let body = a[cur].body; const k = idx; let n = -1, picked = "";
      body = body.replace(Media.RE, mm => (++n === k ? (picked = mm, "") : mm)); a[cur].body = b.dataset.acc ? `${picked}\n\n${body.trim()}`.trim() : `${body.trim()}\n\n${picked}`.trim(); a[cur].set.acc = b.dataset.acc || undefined; a[cur].set.afs = undefined; write(a); rerender(); });
    const replaceWith = async (blob, r) => { const id = "img-" + uid(); await Store.put("images", id, blob); patchImage(idx, () => ({ q: m.querySelector("#pmQ").value.trim() }), `idb:${id}`, r?.title); closeModal(); toast("Картинка заменена."); };
    const runQ = () => suggest(m.querySelector("#pmQ").value.trim(), m.querySelector("#pmSugg"), m.querySelector("#pmMsg"), async (blob, r) => replaceWith(blob, r));
    m.querySelector("#pmGo").onclick = runQ; m.querySelector("#pmQ").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); runQ(); } }); runQ();
    m.querySelector("#pmCut").onclick = async () => {
      const src = fig.dataset.src; if (!src || src.startsWith("search:")) { toast("Сначала выберите картинку."); return; }
      const msg = m.querySelector("#pmMsg"); msg.textContent = "Убираю фон… Первый раз загружается модель (около 40 МБ), это может занять минуту.";
      try {
        const blob = src.startsWith("idb:") ? await Store.get("images", src.slice(4)) : await Media.toBlob(src);
        const lib = await import("https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.4.5/+esm");
        const out = await lib.removeBackground(blob);
        await replaceWith(out); toast("Фон убран.");
      } catch (e) { msg.textContent = "Не получилось убрать фон: " + (e.message || e); }
    };
    m.querySelector("#pmStk").onclick = async () => {
      const src = fig.dataset.src; if (!src || src.startsWith("search:")) { toast("Сначала выберите картинку."); return; }
      const b = src.startsWith("idb:") ? await Store.get("images", src.slice(4)) : await Media.toBlob(src).catch(() => null);
      if (!b) { toast("Не получилось взять картинку."); return; }
      closeModal(); photoSticker(b, fig.dataset.cap || "");
    };
    m.querySelector("#pmEdit").onclick = () => { closeModal(); Media.openPicker(fig, res => { const a = slides(); let k = -1; a[cur].body = a[cur].body.replace(Media.RE, (mm, cap, src, opt) => { if (++k !== idx) return mm; const old = Media.parseOpts(opt); const o = { q: res.q, ...(old.px ? { px: old.px, py: old.py, pw: old.pw } : {}) }; if (res.z && +res.z !== 1) { o.z = (+res.z).toFixed(2); o.x = res.x; o.y = res.y; } return Media.mdImage(res.cap, res.src, o); }); write(a); rerender(); }); };
    m.querySelector("#pmBg").onclick = () => { const src = fig.dataset.src; closeModal(); if (!src || src.startsWith("search:")) { toast("Сначала выберите картинку."); return; } const a = slides(); let k = -1; a[cur].body = a[cur].body.replace(Media.RE, mm => ++k === idx ? "" : mm).trim(); a[cur].set.bgimg = src; write(a); rerender(); };
    const rs = m.querySelector("#pmReset"); if (rs) rs.onclick = () => { closeModal(); patchImage(idx, o => { const { px, py, pw, ...rest } = o; return rest; }); };
    m.querySelector("#pmDel").onclick = () => { closeModal(); const a = slides(); let k = -1; a[cur].body = a[cur].body.replace(Media.RE, mm => ++k === idx ? "" : mm).replace(/\n{3,}/g, "\n\n").trim(); if (isAcc) a[cur].set.acc = undefined; a[cur].set.afs = undefined; write(a); rerender(); };
  }
  /* Запрос для картинок: заголовок слайда без значков + тема урока */
  function suggestQuery(sl) {
    const t = String(sl.title || "").replace(/[^\p{L}\p{N}\s«»"().,-]/gu, "").replace(/\(продолжение.*\)/, "").trim();
    const topic = String(L().params?.topic || L().title || "").replace(/[«»]/g, "");
    const generic = /^(цель урока|мотивация|рефлексия|домашнее задание|актуализация знаний|закрепление|повторение|план работы|в чём затруднение\??|самостоятельная работа|проверка по эталону|итог|задача урока)$/i.test(t);
    return (generic || !t ? topic : `${t} ${topic.split(/[.\s]/).filter(w => w.length > 3).slice(-2).join(" ")}`).replace(/\s+/g, " ").trim().slice(0, 120);
  }
  const suggCache = new Map();
  async function suggest(q, box, note, onPick) {
    if (!box || !q) return;
    box.innerHTML = `<p class="small">Ищу в Яндекс Картинках…</p>`;
    let res = suggCache.get(q);
    if (!res) { res = await Media.search(q, 12); suggCache.set(q, res); }
    if (!document.body.contains(box)) return;
    const ya = res.filter(r => r.src === "Яндекс");
    if (note) note.textContent = ya.length ? "Картинки из Яндекс Картинок. Щёлкните по картинке, чтобы вставить её на слайд; потом её можно обрезать, заменить или сделать фоном." : `Поиск Яндекса сейчас недоступен (${Media.yandexState || "нет ответа"}). Показаны картинки Википедии и Викисклада. Можно открыть Яндекс Картинки, скопировать картинку и нажать Ctrl+V на слайде.`;
    box.innerHTML = res.length ? res.slice(0, 12).map((r, i) => `<button class="sx-sg" data-k="${i}" title="${esc(r.cap || r.title || "")} · ${esc(r.src)}">${r.cap ? `<span class="pk-cap">с подписью</span>` : ""}<img src="${esc(r.thumb)}" alt="${esc(r.title || "")}" loading="lazy" referrerpolicy="no-referrer"></button>`).join("") : `<p class="small">Ничего не нашлось — измените запрос.</p>`;
    box.querySelectorAll(".sx-sg").forEach(b => b.onclick = async () => {
      const r = res[+b.dataset.k]; b.disabled = true; b.classList.add("busy");
      const blob = await Media.toBlob(r.url);
      if (blob && onPick) { await onPick(blob, r); return; }
      if (blob) { await insertBlob(blob, r.cap || r.title); }
      else { const a = slides(); a[cur].body = (a[cur].body + `\n\n${Media.mdImage(r.title || a[cur].title, r.url, { q })}`).trim(); write(a); rerender(); toast("Картинка вставлена ссылкой: сохранить её копию не удалось, в PowerPoint она может не попасть."); }
    });
  }
  /* Щелчок по картинке Яндекса: как в Gamma — если у слайда уже есть картинка-акцент, она заменяется; если нет — встаёт акцентом справа (или по шаблону) */
  async function insertBlob(blob, cap) {
    const id = "img-" + uid(); await Store.put("images", id, blob);
    const a = slides(), sl = a[cur], c = String(cap || sl.title).replace(/[\[\]()]/g, "").slice(0, 80);
    const lay = autoLayout(sl, cur);
    const hasAcc = sl.set.acc && new RegExp(Media.RE.source).test(sl.body);
    if (hasAcc) { let k = -1; sl.body = sl.body.replace(Media.RE, (m, cp, src, opt) => ++k === 0 ? Media.mdImage(c, `idb:${id}`, { q: Media.parseOpts(opt).q }) : m); toast("Картинка заменена. Щёлкните по ней, чтобы обрезать, убрать фон или переставить."); }
    else if (["gallery", "image"].includes(lay) || sl.set.free) { sl.body = (sl.body + `\n\n![${c}](idb:${id})`).trim(); toast("Картинка вставлена."); }
    else { sl.body = `![${c}](idb:${id})\n\n${sl.body}`.trim(); sl.set.acc = sl.set.acc || (lay === "title" ? "right" : sl.set.vb ? "top" : "right"); toast("Картинка вставлена справа. Положение можно поменять: «Картинка» на панели или щелчок по картинке."); }
    sl.set.afs = undefined;
    write(a); rerender();
  }
  function pickImage(onPick) {
    const fake = document.createElement("figure"); Object.assign(fake.dataset, { src: "search:" + (slides()[cur].title || L().title), q: slides()[cur].title || L().title, z: "1", x: "50", y: "50", cap: "" });
    Media.openPicker(fake, res => { if (res.src && !res.src.startsWith("search:")) onPick(res); });
  }

  /* ---------- выгрузка в HTML (самостоятельная страница, стрелки — листать) ---------- */
  async function exportHtml(opts = {}) {
    toast(opts.open ? "Открываю показ…" : "Готовлю HTML…", 6000);
    const arr = slides(), css = [...document.styleSheets].flatMap(ss => { try { return [...ss.cssRules].map(r => r.cssText).filter(t => /\.sx|theme-|figure\.pic|\.blank|\.uline|\.tblwrap|@font-face|@keyframes (glowA|glowB|twinkle|shimmer)/.test(t)); } catch { return []; } }).join("\n");
    const fontLinks = [...document.querySelectorAll('link[href^="https://fonts.googleapis.com"]')].map(l => `<link rel="stylesheet" href="${l.href}">`).join("");
    const toData = async src => { try { const b = src.startsWith("idb:") ? await Store.get("images", src.slice(4)) : await (await fetch(src, { mode: "cors" })).blob(); return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }); } catch { return src.startsWith("idb:") ? "" : src; } };
    const box = document.createElement("div");
    box.innerHTML = arr.map((s, i) => `<section class="deck-s">${slideHtml(s, i)}</section>`).join("");
    // видеослайд без ссылки в показ не попадает; пустой плеер на обычном слайде убирается
    box.querySelectorAll(".sx-video.empty").forEach(v => { const sec = v.closest(".deck-s"); if (sec?.querySelector(".sx.k-video, .sx.lay-video")) sec.remove(); else v.remove(); });
    box.querySelectorAll(".sx-body, .sx-acc").forEach(decorate);
    await new Promise(r => setTimeout(r, 300));
    // в показе пустых мест «Нет картинки» не бывает: незаполненная картинка убирается
    box.querySelectorAll("figure.pic").forEach(f => { if (/^(search|commons):/.test(f.dataset.src || "") || !f.querySelector("img")) { const acc = f.closest(".sx-acc"); (acc || f).remove(); } });
    for (const fig of box.querySelectorAll("figure.pic")) { const img = fig.querySelector("img"); if (img) img.src = await toData(fig.dataset.src); }
    for (const img of box.querySelectorAll("img.sx-bgimg, img.stk-img")) img.src = await toData(img.dataset.src);
    box.querySelectorAll("[contenteditable]").forEach(e => e.removeAttribute("contenteditable"));
    const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(L().title)}</title>${fontLinks}<style>
${css}
html,body{margin:0;height:100%;background:#222}body{font-family:Arial,"Segoe UI",sans-serif}
.deck{height:100%;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden}.deck-s{display:none;width:min(100vw,177.78vh)}.deck-s.on{display:block}.deck-s .sx{border-radius:0;box-shadow:none}
${anCss(anim())}
${ixCss(anim())}
.nav{position:fixed;bottom:12px;right:16px;color:#fff;font:14px Arial;opacity:.7}
.sx-tip{position:fixed;z-index:9;max-width:340px;background:#fffdf7;color:#1a1a1a;border:2px solid #7a0f1c;border-radius:10px;padding:10px 14px;font:17px/1.4 Arial,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.35)}.sx-tip b{display:block;color:#7a0f1c;margin-bottom:4px}
${trCss()}
</style></head><body class="theme-${theme()} tr-${TRANS[theme()] || "mix"} an-${anim().mode}${anim().cut ? " an-cut" : ""}${anim().deco ? " an-deco" : ""}${anim().ix ? " ix-on" : ""}"><div class="deck theme-${theme()}">${box.innerHTML}</div><div class="nav">← → листать · F — во весь экран · подчёркнутые слова — щёлкните для пояснения${anim().ix ? " · карточки переворачиваются по щелчку" : ""}</div>${anim().ix ? '<div class="ix-prog"><i></i></div><div class="ix-spot"></div>' : ""}
<script>${window.VideoKit ? VideoKit.SHOW_JS : ""}
const s=[...document.querySelectorAll('.deck-s')];let i=0;s.forEach((x,j)=>x.classList.add('t'+(j%4)));
document.querySelectorAll('.lay-title').forEach(t=>{const im=t.closest('.deck-s').querySelector('figure.pic img,img.sx-bgimg');if(im&&im.src){t.classList.add('has-cut');t.style.setProperty('--cut','url("'+im.src+'")');}});
const IX=${anim().ix ? 1 : 0},STEP=${anim().step ? 1 : 0};
const isTerm=li=>{if(li.querySelector('img,table,a'))return null;const t=li.textContent.trim(),k=t.indexOf(' — ');if(k<2||k>44||t.length-k<3)return null;const a=t.slice(0,k);if(a.split(' ').length>6||a!==a.replace(/[.!?:;]/g,''))return null;return [a,t.slice(k+3)];};
if(IX){document.querySelectorAll('.deck-s .sx-body ul').forEach(ul=>{const items=[...ul.children].filter(x=>x.tagName==='LI');const ok=items.filter(isTerm),ttl=(ul.closest('.deck-s')?.querySelector('.sx-title')?.textContent||'').toLowerCase(),quiz=/переверни|проверь себя|термин/.test(ttl);if(ok.length<2||(!quiz&&ok.length<items.length))return;ok.forEach(li=>{const [a,b]=isTerm(li);li.classList.add('ix-flip');li.innerHTML='';const f=document.createElement('span');f.className='ix-f';f.textContent=a;const bk=document.createElement('span');bk.className='ix-b';bk.textContent=b;li.append(f,bk);li.title='Щёлкните, чтобы перевернуть';li.addEventListener('click',e=>{e.stopPropagation();li.classList.toggle('flipped');});});});
document.querySelectorAll('.deck-s .sx-body li:not(.ix-flip),.deck-s figure.pic,.deck-s .sx-body blockquote').forEach(el=>{el.classList.add('ix-tilt');el.addEventListener('pointermove',e=>{const r=el.getBoundingClientRect();el.style.setProperty('--ry',((e.clientX-r.left)/r.width-.5)*10+'deg');el.style.setProperty('--rx',(.5-(e.clientY-r.top)/r.height)*10+'deg');});el.addEventListener('pointerleave',()=>{el.style.setProperty('--rx','0deg');el.style.setProperty('--ry','0deg');});});
const sp=document.querySelector('.ix-spot');addEventListener('pointermove',e=>{if(sp){sp.style.setProperty('--mx',e.clientX+'px');sp.style.setProperty('--my',e.clientY+'px');}});}
const prep=x=>{if(!STEP)return;x.querySelectorAll('.sx-body li,.sx-body>p,.sx-body>blockquote').forEach((b,j)=>{if(j>0||b.tagName==='LI')b.classList.add('ix-hide');b.classList.remove('ix-show');});};
const go0=k=>{i=Math.max(0,Math.min(s.length-1,k));s.forEach((x,j)=>{x.classList.remove('on');if(j===i){void x.offsetWidth;x.classList.add('on');}});const pg=document.querySelector('.ix-prog i');if(pg)pg.style.width=((i+1)/s.length*100)+'%';prep(s[i]);};
const go=k=>{if(STEP&&k===i+1){const h=s[i].querySelector('.ix-hide');if(h){h.classList.remove('ix-hide');h.classList.add('ix-show');return;}}go0(k);};go0(${opts.open ? cur : 0});
addEventListener('keydown',e=>{if(e.key==='Escape'&&tp){hideTip();return;}if(tp)hideTip();if(['ArrowRight','PageDown',' '].includes(e.key))go(i+1);if(['ArrowLeft','PageUp'].includes(e.key))go(i-1);if(e.key==='f'||e.key==='F')document.documentElement.requestFullscreen?.();});let tp=null;const hideTip=()=>{if(tp){tp.remove();tp=null;}};addEventListener('click',e=>{const g=e.target.closest('a.sx-gl');if(g){e.preventDefault();const was=tp&&tp._g===g;hideTip();if(was)return;tp=document.createElement('div');tp.className='sx-tip';tp._g=g;tp.innerHTML='<b></b><span></span>';tp.firstChild.textContent=g.textContent;tp.lastChild.textContent=g.dataset.tip||g.title||'';document.body.appendChild(tp);const r=g.getBoundingClientRect();tp.style.left=Math.min(innerWidth-tp.offsetWidth-8,Math.max(8,r.left))+'px';tp.style.top=(r.bottom+tp.offsetHeight+12>innerHeight?r.top-tp.offsetHeight-8:r.bottom+8)+'px';return;}if(tp&&e.target.closest('.sx-tip'))return;if(tp){hideTip();return;}const a=e.target.closest('a');if(a){const h=a.getAttribute('href')||'';const m=h.match(/^#(next|prev|first|last|slide-(\\d+))$/);if(m){e.preventDefault();go(m[1]==='next'?i+1:m[1]==='prev'?i-1:m[1]==='first'?0:m[1]==='last'?s.length-1:+m[2]-1);}return;}go(e.clientX>innerWidth/2?i+1:i-1);});<\/script></body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    if (opts.open) { const w = window.open(URL.createObjectURL(blob), "_blank"); if (!w) { toast("Браузер не дал открыть окно показа — разрешите всплывающие окна или скачайте HTML."); } return; }
    await saveFile(`${slug(L().title)}_${L().params.grade}kl_prezentaciya.html`, blob);
  }
  /* Анимация показа: переходы между слайдами (по кругу: появление, сдвиг, приближение),
     поочерёдное появление блоков, полупрозрачные детали и заголовок-«вырезка» из картинки */
  function anCss(A) {
    if (A.mode === "none") return "";
    const d = A.mode === "bright" ? 1 : 0.6;
    return `@keyframes anFade{from{opacity:0}to{opacity:1}}@keyframes anUp{from{opacity:0;transform:translateY(${40 * d}px)}to{opacity:1;transform:none}}
@keyframes anLeft{from{opacity:0;transform:translateX(${90 * d}px)}to{opacity:1;transform:none}}@keyframes anZoom{from{opacity:0;transform:scale(${1 - 0.12 * d})}to{opacity:1;transform:none}}
@keyframes anBlock{from{opacity:0;transform:translateY(${18 * d}px);filter:blur(${4 * d}px)}to{opacity:1;transform:none;filter:none}}
@keyframes anFloat{50%{transform:translate(12px,-14px) scale(1.04)}}
.deck-s.on.t0{animation:anFade ${0.5 + d * 0.3}s ease both}.deck-s.on.t1{animation:anLeft ${0.5 + d * 0.3}s cubic-bezier(.2,.8,.2,1) both}.deck-s.on.t2{animation:anZoom ${0.5 + d * 0.3}s cubic-bezier(.2,.8,.2,1) both}.deck-s.on.t3{animation:anUp ${0.5 + d * 0.3}s cubic-bezier(.2,.8,.2,1) both}
.deck-s.on .sx-title{animation:anBlock .7s .1s cubic-bezier(.2,.8,.2,1) both}
.deck-s.on .sx-body>*{animation:anBlock .6s cubic-bezier(.2,.8,.2,1) both}
${Array.from({ length: 10 }, (_, i) => `.deck-s.on .sx-body>*:nth-child(${i + 1}){animation-delay:${(0.25 + i * (A.mode === "bright" ? 0.18 : 0.12)).toFixed(2)}s}`).join("")}
.deck-s.on .sx-acc{animation:anZoom .9s .15s cubic-bezier(.2,.8,.2,1) both}
.an-deco .deck::before,.an-deco .deck::after{content:"";position:absolute;border-radius:50%;pointer-events:none;z-index:2;mix-blend-mode:screen;animation:anFloat 9s ease-in-out infinite}
.an-deco .deck::before{width:34vmin;height:34vmin;left:-8vmin;top:-10vmin;background:radial-gradient(circle,rgba(255,255,255,.22),rgba(255,255,255,0) 70%)}
.an-deco .deck::after{width:26vmin;height:26vmin;right:-6vmin;bottom:-8vmin;background:radial-gradient(circle,rgba(255,215,120,.22),rgba(255,215,120,0) 70%);animation-delay:-4s}
.an-cut .deck-s .lay-title.has-cut .sx-title{background:var(--cut) center/cover;-webkit-background-clip:text;background-clip:text;color:transparent!important;-webkit-text-stroke:.08cqw rgba(0,0,0,.35);font-weight:900;filter:saturate(1.25) contrast(1.15)}
@media (prefers-reduced-motion:reduce){.deck-s.on,.deck-s.on *{animation:none!important}}`;
  }
  /* Переходы под характер темы: перелистывание страницы, падающий лист, диафрагма, туман, мел */
  const TRANS = { night: "dream", haze: "blur", botanic: "slide", salon: "page", poster: "push", sketch: "slide", collage: "drop", museum: "dark", mystic: "iris", board: "wipe" };
  function trCss() { // переходы простые и спокойные: мягкое растворение без перелистываний и сдвигов
    if (anim().mode === "none") return "";
    return `.deck-s.on{animation:anFade .45s ease both!important}.deck-s.on .stk{animation:anFade .6s .2s ease both}`;
  }
  /* Интерактив в показе: карточки-перевороты, объём при наведении, подсветка за курсором, прогресс, пошаговый показ */
  function ixCss(A) {
    if (!A.ix && !A.step) return "";
    return `.ix-on ul:has(.ix-flip){display:grid!important;grid-template-columns:repeat(auto-fit,minmax(min(100%,30%),1fr));gap:.5em .6em;padding:0;margin:0;font-size:1em}
.ix-on .ix-flip{position:relative;cursor:pointer;perspective:900px;list-style:none;min-height:2.4em;margin:0!important}
.ix-on .ix-flip::before{display:none!important}
.ix-on .ix-flip .ix-f,.ix-on .ix-flip .ix-b{display:block;backface-visibility:hidden;-webkit-backface-visibility:hidden;transition:transform .6s cubic-bezier(.2,.8,.2,1);border-radius:.6em;padding:.6em .7em;font-size:.9em}
.ix-on .ix-flip .ix-f{font-weight:800;background:rgba(255,255,255,.12);box-shadow:inset 0 0 0 2px currentColor}
.ix-on .ix-flip .ix-b{position:absolute;inset:0;transform:rotateY(180deg);background:rgba(255,255,255,.92);color:#1a1a1a;overflow:auto;font-size:.9em}
.ix-on .ix-flip.flipped .ix-f{transform:rotateY(-180deg)}.ix-on .ix-flip.flipped .ix-b{transform:rotateY(0)}
.ix-on .ix-flip::after{content:"⟲";position:absolute;right:.4em;top:.2em;font-size:.7em;opacity:.55}
.ix-on .ix-tilt{transition:transform .25s ease,box-shadow .25s ease;transform:perspective(900px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg))}
.ix-on .ix-tilt:hover{box-shadow:0 14px 34px rgba(0,0,0,.22)}
.ix-prog{position:fixed;left:0;top:0;right:0;height:4px;background:rgba(255,255,255,.12);z-index:8}.ix-prog i{display:block;height:100%;width:0;background:linear-gradient(90deg,#8a4bff,#f05aa6,#ffcf3f);transition:width .5s cubic-bezier(.2,.8,.2,1)}
.ix-spot{position:fixed;inset:0;pointer-events:none;z-index:7;background:radial-gradient(circle 22vmin at var(--mx,-50vw) var(--my,-50vh),rgba(255,255,255,.13),transparent 70%);mix-blend-mode:soft-light}
.ix-hide{opacity:0!important;transform:translateY(14px)!important;animation:none!important}.ix-show{animation:anBlock .55s cubic-bezier(.2,.8,.2,1) both!important}
@media (prefers-reduced-motion:reduce){.ix-on .ix-tilt{transform:none}.ix-spot{display:none}}`;
  }
  /* Для PDF: те же слайды, что в редакторе */
  function stageHtml(md) { return `<div class="sx-print theme-${theme()}">${splitSlides(md).map((s, i) => `<div class="sx-frame print" style="page-break-after:always">${slideHtml(parse(s), i)}</div>`).join("")}</div>`; }
  function settingsOf(raw) { return parse(raw).set; }
  /* ---------- PowerPoint: слайд за слайдом «как на экране» ----------
     Каждый слайд рисуется в скрытом окне 1280×720, а затем каждый блок
     (заголовок, абзац, карточка, шаг, цитата, таблица, картинка) переносится
     в PowerPoint редактируемой надписью или картинкой в том же месте и того же
     размера. Поэтому шаблоны, картинки-акценты, свободная вёрстка и подобранный
     шрифт выглядят так же, как в редакторе. 1 px = 0,75 pt. */
  const PX = 1280, PY = 720, IN = 96; let glSlide = null, pxCur = 0;
  const hex = c => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null; const v = m[1].split(/[,\s/]+/).filter(Boolean).map(Number); if (v.length > 3 && v[3] === 0) return null; return v.slice(0, 3).map(x => Math.round(x).toString(16).padStart(2, "0")).join("").toUpperCase(); };
  const alpha = c => { const m = String(c).match(/rgba\(([^)]+)\)/); if (!m) return 1; const v = m[1].split(/[,\s/]+/).filter(Boolean).map(Number); return v[3] ?? 1; };
  async function imgCanvas(src, o, w, h, fit, pos) {
    const d = await Media.exportData(src, o || {}).catch(() => null); if (!d) return null;
    const im = await new Promise(r => { const x = new Image(); x.onload = () => r(x); x.onerror = () => r(null); x.src = d.data; }); if (!im) return null;
    const k = Math.min(2, 1600 / Math.max(w, h)), c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k);
    const g = c.getContext("2d"), r = im.width / im.height, R = w / h;
    const [px, py] = (pos || "50% 50%").split(" ").map(v => parseFloat(v) / 100 || .5);
    if (fit === "cover") { let sw = im.width, sh = im.height; if (r > R) sw = sh * R; else sh = sw / R; g.drawImage(im, (im.width - sw) * px, (im.height - sh) * py, sw, sh, 0, 0, c.width, c.height); }
    else { let dw = c.width, dh = c.height; if (r > R) dh = dw / r; else dw = dh * r; g.drawImage(im, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh); }
    return c.toDataURL("image/png");
  }
  function runsOf(el, base) {
    const out = [];
    const walk = (n, f) => {
      if (n.nodeType === 3) { let t = n.textContent.replace(/\s+/g, " "); if (f.upper) t = t.toUpperCase(); if (t) out.push({ text: t, options: { ...f, upper: undefined } }); return; }
      if (n.nodeType !== 1) return;
      if (n.matches(".sx-grip,.fx-move,.fx-size,.sx-resize,figure,script,style,a.sx-btn")) return;
      if (n.matches("a.sx-gl")) { const g = { ...f, underline: { style: "dotted" }, hyperlink: { slide: (glSlide ?? pxCur) + 1, tooltip: (n.dataset.tip || n.title || "").slice(0, 250) } }; n.childNodes.forEach(c => walk(c, g)); return; }
      if (n.tagName === "A" && /^https?:/.test(n.getAttribute("href") || "")) { const g = { ...f, hyperlink: { url: n.href } }; n.childNodes.forEach(c => walk(c, g)); return; }
      if (n.tagName === "BR") { if (out.length) out[out.length - 1].options.breakLine = true; else out.push({ text: "", options: { ...f, breakLine: true } }); return; }
      if (n.matches(".blank")) { out.push({ text: "________", options: { ...f } }); return; }
      if (n.matches(".uline")) { out.push({ text: "_".repeat(Math.min(40, +n.dataset.n || 8)), options: { ...f } }); return; }
      const cs = getComputedStyle(n), g = { ...f };
      if (cs.textTransform === "uppercase") g.upper = true;
      if (/^(STRONG|B)$/.test(n.tagName) || +cs.fontWeight >= 600) g.bold = true;
      if (/^(EM|I)$/.test(n.tagName) || cs.fontStyle === "italic") g.italic = true;
      const col = hex(cs.color); if (col) g.color = col;
      n.childNodes.forEach(c => walk(c, g));
    };
    walk(el, { ...base, upper: getComputedStyle(el).textTransform === "uppercase" || undefined });
    if (out.length) { out[0].text = out[0].text.replace(/^\s+/, ""); out[out.length - 1].text = out[out.length - 1].text.replace(/\s+$/, ""); }
    return out.filter(r => r.text || r.options.breakLine);
  }
  function textStyle(el) {
    const cs = getComputedStyle(el), fsz = parseFloat(cs.fontSize);
    const fam = (cs.fontFamily.split(",")[0] || "Arial").replace(/["']/g, "").trim() || "Arial";
    const lhPx = cs.lineHeight === "normal" ? fsz * 1.2 : parseFloat(cs.lineHeight);
    const k = PX / (el.closest(".sx")?.getBoundingClientRect().width || PX);
    // межстрочный интервал — точно в пунктах, как на экране (у PowerPoint «множитель» считается иначе, чем в браузере)
    return { fontFace: fam, fontSize: Math.round(fsz * k * 0.75 * 10) / 10, color: hex(cs.color) || "000000", bold: +cs.fontWeight >= 600, italic: cs.fontStyle === "italic", align: /center/.test(cs.textAlign) ? "center" : /right|end/.test(cs.textAlign) ? "right" : "left", lineSpacing: Math.round(lhPx * k * 0.75 * 10) / 10 };
  }
  async function pptxSlide(pptx, sl, i, host, total) {
    host.innerHTML = slideHtml(sl, i);
    const sx = host.firstElementChild;
    sx.querySelectorAll(".sx-body, .sx-acc").forEach(decorate);
    await hydrateBg(host);
    await new Promise(r => setTimeout(r, 60));
    await Promise.all([...host.querySelectorAll("img")].map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; setTimeout(r, 4000); })));
    const B = sx.getBoundingClientRect(), k = PX / B.width;
    const box = el => { const r = el.getBoundingClientRect(); return { x: (r.left - B.left) * k / IN, y: (r.top - B.top) * k / IN, w: r.width * k / IN, h: r.height * k / IN, pw: r.width * k, ph: r.height * k }; };
    const s = pptx.addSlide();
    const bgc = hex(getComputedStyle(sx).backgroundColor) || "FFFFFF";
    s.background = { color: bgc };
    // художественный фон темы — картинкой под всем остальным (текст поверх остаётся редактируемым)
    if (sx.querySelector(".sx-deco") && window.ThemeKit) {
      const lay = autoLayout(sl, i), side = ThemeKit.sideOf(lay, sx.matches(".acc") ? (sl.set.acc || "") : sl.set.photo ? "right" : ""), bgData = await ThemeKit.rasterSvg(ThemeKit.svg(ThemeKit.resolve(theme(), i), i, lay === "title" || lay === "section" ? lay : "", side, L()?.slidePalette, "bg"), 1280, 720, "image/jpeg");
      if (bgData) s.addImage({ data: bgData, x: 0, y: 0, w: PX / IN, h: PY / IN });
    }
    const addImg = async (img, fig) => {
      const b = box(img); if (b.w < .05 || b.h < .05) return;
      const o = Media.parseOpts ? { z: fig?.dataset.z, x: fig?.dataset.x, y: fig?.dataset.y } : {};
      const cs = getComputedStyle(img);
      const data = await imgCanvas(fig ? fig.dataset.src : img.dataset.src, o, b.pw, b.ph, cs.objectFit === "cover" ? "cover" : "contain", cs.objectPosition);
      if (data) s.addImage({ data, x: b.x, y: b.y, w: b.w, h: b.h });
    };
    // фон-картинка слайда и картинка-акцент
    const bgImg = sx.querySelector("img.sx-bgimg"); if (bgImg && bgImg.dataset.src) await addImg(bgImg, null);
    for (const fig of sx.querySelectorAll(".sx-acc figure.pic")) { const img = fig.querySelector("img"); if (img) await addImg(img, fig); else { const b = box(fig); s.addShape(pptx.ShapeType.rect, { x: b.x, y: b.y, w: b.w, h: b.h, fill: { color: "EEEEEE" }, line: { color: "BBBBBB", dashType: "dash" } }); } }
    // бумага под текст (рваный край поверх картинки) — прозрачной картинкой
    if (sx.querySelector(".sx-paper") && window.ThemeKit) {
      const lay = autoLayout(sl, i), side = ThemeKit.sideOf(lay, sx.matches(".acc") ? (sl.set.acc || "") : sl.set.photo ? "right" : "");
      const pd = await ThemeKit.rasterSvg(ThemeKit.svg(ThemeKit.resolve(theme(), i), i, lay === "title" || lay === "section" ? lay : "", side, L()?.slidePalette, "paperflat"), 1280, 720);
      if (pd) s.addImage({ data: pd, x: 0, y: 0, w: PX / IN, h: PY / IN });
    }
    // подложка текста (наложение на фоновую картинку)
    const inner = sx.querySelector(".sx-inner"), ib = getComputedStyle(inner).backgroundColor;
    if (hex(ib)) {
      const b = box(inner), ics = getComputedStyle(inner), rad = Math.min(0.5, parseFloat(ics.borderTopLeftRadius) * k / IN / Math.min(b.w, b.h));
      s.addShape(rad > 0.005 ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, { x: b.x, y: b.y, w: b.w, h: b.h, rectRadius: rad, fill: { color: hex(ib), transparency: Math.round((1 - alpha(ib)) * 100) }, line: { type: "none" }, shadow: ics.boxShadow !== "none" ? { type: "outer", blur: 6, offset: 2, angle: 90, color: "000000", opacity: 0.3 } : undefined });
      // тонкая внутренняя рамка плашки (премиальная деталь)
      if (ics.outlineStyle !== "none" && parseFloat(ics.outlineWidth) > 0) { const off = -parseFloat(ics.outlineOffset) * k / IN; s.addShape(pptx.ShapeType.roundRect, { x: b.x + off, y: b.y + off, w: b.w - 2 * off, h: b.h - 2 * off, rectRadius: rad, fill: { type: "none" }, line: { color: hex(ics.outlineColor) || "B9A07A", width: Math.max(0.5, parseFloat(ics.outlineWidth) * k * 0.75) } }); }
    }
    const text = (el, extra = {}) => {
      const runs = runsOf(el, {}); if (!runs.some(r => r.text.trim())) return;
      const b = box(el), st = textStyle(el);
      s.addText(runs, { x: b.x, y: b.y, w: b.w * 1.04 + 0.05, h: b.h + 0.08, margin: 0, valign: "top", fit: "none", wrap: true, ...st, ...extra });
    };
    const shape = (el, opts) => { const b = box(el); s.addShape(pptx.ShapeType.roundRect, { x: b.x, y: b.y, w: b.w, h: b.h, rectRadius: 0.1, line: { type: "none" }, ...opts }); };
    const title = sx.querySelector(".sx-title"); if (title && title.textContent.trim()) {
      text(title);
      if (sx.matches(".lay-title")) { const cs = getComputedStyle(title, "::after"); if (cs.content !== "none") { const b = box(title); s.addShape(pptx.ShapeType.rect, { x: sx.matches(".acc") ? b.x : b.x + b.w / 2 - 0.6, y: b.y + b.h + 0.02, w: 1.2, h: 0.05, fill: { color: hex(cs.backgroundColor) || "2F5D8A" }, line: { type: "none" } }); } }
      if (sx.matches(".lay-section")) { const b = box(title); s.addShape(pptx.ShapeType.rect, { x: b.x, y: b.y, w: 0.1, h: b.h, fill: { color: hex(getComputedStyle(title).borderLeftColor) || "2F5D8A" }, line: { type: "none" } }); }
    }
    const body = sx.querySelector(".sx-body");
    for (const blk of body.children) {
      if (blk.matches(".sx-video")) {
        const b = box(blk), v = sl.set.video || {}, yt = window.VideoKit && VideoKit.parse(v.u)?.kind === "youtube";
        if (!v.u) continue;
        if (yt) { try { s.addMedia({ type: "online", link: `https://www.youtube.com/embed/${VideoKit.parse(v.u).id}${VideoKit.sec(v.s) ? "?start=" + VideoKit.sec(v.s) : ""}`, x: b.x, y: b.y, w: b.w, h: b.h }); continue; } catch { } }
        s.addShape(pptx.ShapeType.rect, { x: b.x, y: b.y, w: b.w, h: b.h, fill: { color: "111111" }, line: { type: "none" } });
        const th = VideoKit.thumb(v); if (th) { const d = await imgCanvas(th, {}, b.pw, b.ph, "cover").catch(() => null); if (d) s.addImage({ data: d, x: b.x, y: b.y, w: b.w, h: b.h, transparency: 40 }); }
        s.addText([{ text: "▶  Смотреть фрагмент", options: { bold: true, fontSize: 28, color: "FFFFFF", hyperlink: { url: VideoKit.watchUrl(v), tooltip: "Открыть видео" }, breakLine: true } }, { text: `${v.c || ""}${VideoKit.span(v) ? " · " + VideoKit.span(v) : ""}`, options: { fontSize: 16, color: "DDDDDD" } }], { x: b.x, y: b.y, w: b.w, h: b.h, align: "center", valign: "middle", fontFace: "Arial" });
        continue;
      }
      if (blk.matches("figure.pic")) { const img = blk.querySelector("img"); if (img) await addImg(img, blk); const cap = blk.querySelector("figcaption"); if (cap && cap.textContent.trim() && getComputedStyle(cap).display !== "none") text(cap); continue; }
      if (blk.matches(".tblwrap")) {
        const t = blk.querySelector("table"), b = box(t), st = textStyle(t.querySelector("td,th") || t);
        const rows = [...t.rows].map(r => [...r.cells].map(c => ({ text: c.textContent.trim(), options: { bold: c.tagName === "TH", fill: c.tagName === "TH" ? { color: hex(getComputedStyle(c).backgroundColor) || "F3F6FA" } : undefined } })));
        const colW = [...(t.rows[0]?.cells || [])].map(c => box(c).w);
        s.addTable(rows, { x: b.x, y: b.y, w: b.w, colW, fontFace: st.fontFace, fontSize: st.fontSize, color: st.color, border: { type: "solid", color: "999999", pt: 1 }, valign: "top", margin: 3 });
        continue;
      }
      if (blk.matches("ul,ol")) {
        const cards = sx.matches(".lay-cards"), steps = sx.matches(".lay-steps");
        const items = [...blk.children].filter(li => li.tagName === "LI");
        if (cards || steps) {
          for (const li of items) {
            const cs = getComputedStyle(li);
            if (cards) { shape(li, { fill: { color: hex(cs.backgroundColor) || "F3F6FA" } }); const b = box(li); s.addShape(pptx.ShapeType.rect, { x: b.x + 0.06, y: b.y, w: b.w - 0.12, h: 0.06, fill: { color: hex(cs.borderTopColor) || "2F5D8A" }, line: { type: "none" } }); }
            if (steps) { const be = getComputedStyle(li, "::before"); const lb = box(li), fs = parseFloat(be.fontSize) * 0.75, d = parseFloat(be.width) * k / IN; s.addShape(pptx.ShapeType.ellipse, { x: lb.x, y: lb.y + 0.02, w: d, h: d, fill: { color: hex(be.backgroundColor) || "2F5D8A" }, line: { type: "none" } }); s.addText(String(items.indexOf(li) + 1), { x: lb.x, y: lb.y + 0.02, w: d, h: d, align: "center", valign: "middle", fontFace: "Arial", fontSize: fs, bold: true, color: hex(be.color) || "FFFFFF", margin: 0 }); }
            // текст карточки — по внутреннему полю
            const range = document.createRange(); range.selectNodeContents(li); const rr = range.getBoundingClientRect();
            const runs = runsOf(li, {}); if (!runs.length) continue;
            const st = textStyle(li), xx = (rr.left - B.left) * k / IN, yy = (rr.top - B.top) * k / IN;
            s.addText(runs, { x: xx, y: yy, w: rr.width * k / IN * 1.04 + 0.05, h: rr.height * k / IN + 0.08, margin: 0, valign: "top", wrap: true, ...st });
          }
          continue;
        }
        // обычный список: одна надпись с маркерами или номерами
        const b = box(blk), st = textStyle(items[0] || blk);
        const runs = [];
        items.forEach((li, n) => { const r = runsOf(li, {}); if (!r.length) return; r[0].options = { ...r[0].options, bullet: blk.tagName === "OL" ? { type: "number", startAt: +blk.getAttribute("start") || 1 } : { code: "25CF" }, indentLevel: 0 }; r[r.length - 1].options = { ...r[r.length - 1].options, breakLine: true, paraSpaceAfter: Math.round(parseFloat(getComputedStyle(li).marginBottom) * 0.75) }; runs.push(...r); });
        if (runs.length) s.addText(runs, { x: b.x - 0.05, y: b.y, w: b.w * 1.04 + 0.1, h: b.h + 0.1, margin: 0, valign: "top", wrap: true, ...st });
        continue;
      }
      if (blk.matches("blockquote")) {
        const cs = getComputedStyle(blk), b = box(blk);
        if (hex(cs.backgroundColor)) s.addShape(pptx.ShapeType.rect, { x: b.x, y: b.y, w: b.w, h: b.h, fill: { color: hex(cs.backgroundColor) }, line: { type: "none" } });
        if (parseFloat(cs.borderLeftWidth) > 0) s.addShape(pptx.ShapeType.rect, { x: b.x, y: b.y, w: parseFloat(cs.borderLeftWidth) * k / IN, h: b.h, fill: { color: hex(cs.borderLeftColor) || "2F5D8A" }, line: { type: "none" } });
        const ps = [...blk.children]; const runs = [];
        ps.forEach((pp, n) => { const r = runsOf(pp, {}); if (r.length) { r[r.length - 1].options.breakLine = n < ps.length - 1; runs.push(...r); } });
        const range = document.createRange(); range.selectNodeContents(blk); const rr = range.getBoundingClientRect();
        if (runs.length) s.addText(runs, { x: (rr.left - B.left) * k / IN, y: (rr.top - B.top) * k / IN, w: rr.width * k / IN * 1.04 + 0.05, h: rr.height * k / IN + 0.08, margin: 0, valign: "top", wrap: true, ...textStyle(ps[0] || blk) });
        continue;
      }
      text(blk);
    }
    // кнопки-переходы: отдельная надпись-кнопка со ссылкой на слайд (работает в режиме показа PowerPoint)
    for (const a of sx.querySelectorAll("a.sx-btn")) {
      const b = box(a), cs = getComputedStyle(a), t = navTarget(a.getAttribute("href"), i, total);
      s.addText([{ text: cs.textTransform === "uppercase" ? a.textContent.trim().toUpperCase() : a.textContent.trim(), options: t !== null ? { hyperlink: { slide: t + 1, tooltip: "Перейти" } } : {} }], { x: b.x, y: b.y, w: b.w * 1.06 + 0.06, h: b.h, shape: pptx.ShapeType.roundRect, rectRadius: 0.2, fill: { color: hex(cs.backgroundColor) || "7A0F1C" }, line: cs.outlineStyle !== "none" ? { color: hex(cs.outlineColor) || "7A0F1C", width: 1.5 } : { type: "none" }, color: hex(cs.color) || "FFFFFF", bold: true, fontFace: textStyle(a).fontFace, fontSize: Math.round(parseFloat(cs.fontSize) * 0.75), align: "center", valign: "middle", margin: 2 });
    }
    // стикеры — картинками (в PowerPoint их можно двигать и поворачивать)
    if (window.ThemeKit) for (const el of sx.querySelectorAll(".stk")) {
      const pim = el.querySelector("img.stk-img");
      if (pim) { const st1 = el.style.transform; el.style.transform = "none"; const b = box(el); el.style.transform = st1; const bl = await (pim.dataset.src.startsWith("idb:") ? Store.get("images", pim.dataset.src.slice(4)) : Media.toBlob(pim.dataset.src)).catch(() => null); if (bl) { const d = await new Promise(r => { const fr2 = new FileReader(); fr2.onload = () => r(fr2.result); fr2.readAsDataURL(bl); }); s.addImage({ data: d, x: b.x, y: b.y, w: b.w, h: b.h, rotate: parseFloat((st1.match(/-?[\d.]+/) || [0])[0]) || 0 }); } continue; }
      const svgEl = el.querySelector("svg"); if (!svgEl) continue;
      const st0 = el.style.transform; el.style.transform = "none"; const b = box(el); el.style.transform = st0;
      const xml = new XMLSerializer().serializeToString(svgEl).replace("<svg ", '<svg width="400" height="400" ');
      const d = await ThemeKit.rasterSvg(xml, 400, 400);
      if (d) s.addImage({ data: d, x: b.x, y: b.y, w: b.w, h: b.h, rotate: parseFloat((st0.match(/-?[\d.]+/) || [0])[0]) || 0 });
    }
    if (sl.notes || sl.set.video?.u) s.addNotes([sl.notes, sl.set.video?.u ? `Видео: ${window.VideoKit ? VideoKit.watchUrl(sl.set.video) : sl.set.video.u} ${window.VideoKit ? VideoKit.span(sl.set.video) : ""}` : ""].filter(Boolean).join("\n"));
  }
  async function toPptxBlob(md, title) {
    const pptx = new window.PptxGenJS(); pptx.layout = "LAYOUT_WIDE"; pptx.title = title || "";
    const host = document.createElement("div"); host.className = "sx-export theme-" + theme(); document.body.appendChild(host);
    try {
      const arr = splitSlides(md).map(parse);
      const gi = arr.findIndex(x => ["glossary", "terms"].includes(x.set?.kind)); glSlide = gi >= 0 ? gi : null;
      for (let i = 0; i < arr.length; i++) await (pxCur = i, pptxSlide)(pptx, arr[i], i, host, arr.length);
    } finally { host.remove(); }
    const blob = await pptx.write({ outputType: "blob" });
    return anim().mode === "none" ? blob : addTransitions(blob).catch(() => blob);
  }
  /* PowerPoint: плавные переходы между слайдами (по кругу: появление, выталкивание, сдвиг, растворение) */
  async function addTransitions(blob) {
    if (!window.JSZip) await loadScript("jszip");
    const z = await window.JSZip.loadAsync(blob);
    const kinds = ['<p:fade/>'];
    const names = Object.keys(z.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n));
    for (const n of names) {
      let x = await z.file(n).async("string"); if (/<p:transition/.test(x)) continue;
      const k = +n.match(/(\d+)\.xml/)[1] - 1, tr = `<p:transition spd="${anim().mode === "bright" ? "med" : "slow"}">${kinds[k % kinds.length]}</p:transition>`;
      x = /<\/p:clrMapOvr>/.test(x) ? x.replace("</p:clrMapOvr>", "</p:clrMapOvr>" + tr) : x.replace("</p:cSld>", "</p:cSld>" + tr);
      z.file(n, x);
    }
    return z.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
  }

  /* Заменить всю презентацию (сборка по плану «как в Gamma»): с отменой через ↶ */
  function replaceAll(md) {
    const Ls = L(); undo.push(Ls.docs.slides || ""); redo.length = 0;
    Ls.docs.slides = md; Ls.slidesFitted = false; cur = 0;
    $("#md").value = md; saveLesson(Ls); rerender();
  }
  return { render, stickerize, applyTheme, fontKey, parse, build, slides, fitAll, exportHtml, stageHtml, settingsOf, autoLayout, splitAcc, slideHtml, replaceAll, toPptxBlob, LAYOUTS, THEMES, reset() { cur = 0; undo.length = 0; redo.length = 0; } };
})();
window.SlideEditor = SlideEditor;
