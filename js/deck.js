/* ===================================================================
   «Учу по ФРП» — презентация по конспекту «как в Gamma».
   Как это устроено у Gamma и что взято:
   1) Сначала ПЛАН (outline): список карточек-слайдов с заголовками и
      тезисами. Его можно поправить до сборки: переименовать, убрать,
      переставить, поменять вид карточки, включить или выключить картинку.
   2) Объём текста: «минимум» / «кратко» / «подробнее» (у Gamma — brief,
      medium, detailed). Работает только для обычных слайдов.
   3) Режим «сохранить дословно» (у Gamma — preserve): упражнения учебника,
      эпиграфы, цитаты, правила, текст стихотворения переносятся без единого
      изменения. Если текста много, уменьшается шрифт, а если и это не
      помогает, слайд делится на 2–3 с пометкой «(продолжение)».
   4) Умные шаблоны: карточки с тезисами, шаги, крупный вопрос, цитата,
      упражнение, стихотворение, титульный с картинкой.
   5) Картинка-акцент (у Gamma — accent image): слева, справа, сверху или
      фоном с наложением (матовое, затемнение, прозрачное). Подбор — через
      Яндекс Картинки; щелчок по картинке — заменить, обрезать, убрать фон,
      переставить, удалить.
   Источник содержания — только конспект (техкарта) этого урока и тексты,
   на которые он опирается; ничего не придумывается.
   =================================================================== */
const Deck = (() => {
  "use strict";
  const KEY = "uchu:deck";
  const AMOUNT = {
    brief: { label: "Минимум текста", max: 2, slides: 10, paren: false, len: 90 },
    medium: { label: "Кратко", max: 5, slides: 18, paren: false, len: 220 },
    detailed: { label: "Подробнее", max: 7, slides: 28, paren: true, len: 260 }
  };
  const IMAGES = { key: "Картинки на ключевых слайдах", all: "Картинка почти на каждом слайде", none: "Без картинок" };
  const KINDS = {
    title: "Титульный", author: "Автор (портрет)", goal: "Цель урока", steps: "Шаги / план", cards: "Карточки с тезисами",
    list: "Список", big: "Крупный вопрос", quote: "Цитата (дословно)", poem: "Стихотворение (дословно)",
    task: "Упражнение (дословно)", rule: "Правило (дословно)", hw: "Домашнее задание", image: "Картинка во весь слайд",
    fragment: "Фрагмент текста (дословно)", glossary: "Словарная работа", terms: "Работа с терминами", table: "Таблица для заполнения", concl: "Выводы",
    board: "На доске (что записать)", mnemo: "«Запомни» (мнемоника)", scheme: "Схема-опора", check: "«Проверь себя» (вопросы)",
    art: "«Картина» (репродукция)", algo: "Алгоритм", appendix: "Приложение (справка/словарь/карта/ответы)", quiz: "Викторина (задание → ответ)",
    flip: "Проверь себя (карточки)", video: "Видеофрагмент", section: "Разделитель"
  };
  const VERBATIM = new Set(["quote", "poem", "task", "rule", "fragment"]);
  const CREATIVE = new Set(["izo", "mhk", "mus", "lit"]);
  /* Предметные группы для методических добавок (справки, карты, схема «вспомним → образец → …»). */
  const TECH = new Set(["math", "phys", "chem", "inf"]);
  const HUMAN = new Set(["lit", "hist", "soc", "geo", "mhk"]);
  const MAPS = new Set(["hist", "geo"]);
  const levelOf = p => (["weak", "medium", "high"].includes(p && p.level) ? p.level : "medium");
  const hashOf = s => { let h = 0; for (const ch of String(s || "")) h = (h * 31 + ch.codePointAt(0)) | 0; return Math.abs(h); };
  /* Внутренние ссылки на слайды-приложения: тексты строго по контракту slides.js. */
  const APPX = { hist: "📖 Историческая справка", terms: "📚 Словарь", map: "🗺 Карта", answers: "🔑 Ответы", bio: "👤 Биография" };
  const linkMd = k => `[${APPX[k]}](#a:${k})`;
  const clip = (s, n = 220) => { const t = String(s == null ? "" : s).replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1).replace(/\s\S*$/, "") + "…" : t; };
  function addLink(card, keys) {
    if (!card) return;
    const list = Array.isArray(keys) ? keys : [keys];
    card.links = [...new Set([...(card.links || []), ...list])];
  }
  function opts() { let o = {}; try { o = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { } return { amount: AMOUNT[o.amount] ? o.amount : "medium", images: IMAGES[o.images] ? o.images : "all" }; }
  function saveOpts(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { } }

  /* ---------- текст: очистка и лаконичные формулировки ---------- */
  const unbr = s => String(s || "").replace(/<br\s*\/?>/gi, "\n");
  const plainMd = s => String(s || "").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1").replace(/`/g, "").trim();
  // убрать ожидаемые ответы *(…)* и служебные пометки, тире реплики
  const cleanLine = s => plainMd(String(s || "").replace(/\*\([^)]*\)\*/g, "").replace(/\*\(.*?\)\*/g, "").replace(/\s*\*[^*]*\*\s*$/, ""))
    .replace(/^[\s—–-]+/, "").replace(/⟦[^⟧]*⟧/g, "").replace(/\s+/g, " ").trim();
  const capF = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const PREAMBLE = /^(?:итак|ребята|друзья|давайте(?: подумаем| вспомним| посмотрим| порассуждаем)?|а теперь|скажите(?:,? пожалуйста)?|как вы думаете|как вы считаете|подумайте|попробуйте ответить|ответьте на вопрос|вопрос к классу)[,:!\s—–-]+/i;
  /* Лаконично, но без обрезки посередине мысли: убираем вводные слова и (при «минимуме») пояснения в скобках.
     Всё, что в «кавычках», не трогаем — это слова автора. */
  function tight(s, amt) {
    let t = cleanLine(s);
    for (let k = 0; k < 2; k++) t = t.replace(PREAMBLE, "");
    if (!amt.paren) t = t.replace(/\s*\((?![^)]*«)[^()]{3,80}\)/g, "");
    t = t.replace(/\s+([,.?!:;])/g, "$1").replace(/\s{2,}/g, " ").trim();
    return capF(t);
  }
  const isQ = s => /\?\s*(?:[»"])?\s*$/.test(s) || /\?\s/.test(s);
  /* Выбор тезисов: сначала опирающиеся на текст (с цитатой), потом короткие; порядок — как в конспекте */
  let curTopic = "", curKit = null;
  function pickPoints(list, amt) {
    list = list.filter(x => !(typeof Learn !== "undefined" && Learn.offTopic && Learn.offTopic(x, curTopic)));
    const uniq = []; const seen = new Set();
    for (const x of list) { const k = x.toLowerCase().replace(/[^а-яёa-z0-9]/g, "").slice(0, 60); if (x && !seen.has(k)) { seen.add(k); uniq.push(x); } }
    if (uniq.length <= amt.max) return uniq;
    const scored = uniq.map((x, i) => ({ x, i, s: (/«[^»]{3,}»/.test(x) ? 2 : 0) + (x.length <= amt.len ? 1 : 0) - x.length / 400 }));
    return scored.sort((a, b) => b.s - a.s).slice(0, amt.max).sort((a, b) => a.i - b.i).map(o => o.x);
  }
  /* Дословный текст (упражнение, стихотворение) → Markdown без изменения слов:
     склеиваем только строки, разорванные вёрсткой посреди фразы; строки стиха сохраняем */
  function verbatimMd(text, { verse = false } = {}) {
    let lines = String(text || "").replace(/\r/g, "").split("\n").map(l => l.replace(/\s+$/, ""));
    while (lines.length && (/^\s*\d{1,3}\s*$/.test(lines[lines.length - 1]) || !lines[lines.length - 1].trim())) lines.pop(); // номер страницы в конце
    const out = [];
    for (const raw of lines) {
      const l = raw.trim();
      if (!l) { out.push(""); continue; }
      if (/^\d{1,3}$/.test(l)) continue; // номер страницы пособия посреди упражнения — не текст задания
      const prev = out.length ? out[out.length - 1] : "";
      // строка, разорванная вёрсткой посреди фразы: следующая начинается со строчной буквы или скобки
      const joinable = !verse && prev && !/^\d{1,3}[.)]\s/.test(l) && /^[а-яё(,;:]/.test(l);
      if (joinable) out[out.length - 1] = prev + (prev.endsWith("-") ? "" : " ") + l;
      else out.push(l);
    }
    // markdown: абзацы — через пустую строку, строки внутри абзаца (стихи) — жёсткий перенос
    const esc = s => s.replace(/^(\s*)([#>+])/, "$1\\$2").replace(/([*_`\[\]])/g, "\\$1").replace(/^-{3,}$/, "— — —").replace(/</g, "&lt;");
    const paras = []; let cur = [];
    for (const l of out) { if (!l) { if (cur.length) paras.push(cur); cur = []; } else cur.push(l); }
    if (cur.length) paras.push(cur);
    return paras.map(p => p.map(esc).join("  \n")).join("\n\n");
  }

  /* ---------- разбор конспекта ---------- */
  function parseConspect(md) {
    md = String(md || "");
    const r = { title: (md.match(/^#\s+(.+)$/m) || [])[1] || "", goal: (md.match(/\*\*Цель:\*\*\s*(.+)/) || [])[1] || "", rows: [], rules: [], hw: [], wiki: "", plan: [] };
    const planBlock = md.split(/^## План урока\s*$/m)[1];
    if (planBlock) r.plan = planBlock.split(/^---|^## /m)[0].split("\n").filter(l => /^\d+\.\s/.test(l)).map(l => l.replace(/^\d+\.\s*/, "").replace(/\s*\(\d+\s*мин\)\s*$/, "").trim());
    const tm = md.split(/^## Технологическая карта урока\s*$/m)[1];
    if (tm) {
      const lines = tm.split("\n").filter(l => /^\|/.test(l) && !/^\|\s*:?-{2,}/.test(l));
      lines.slice(1).forEach(l => {
        const cells = l.split("|").slice(1, -1).map(c => c.trim());
        if (cells.length < 2) return;
        r.rows.push({ stage: cells[0].replace(/\s*\(\d+\s*мин\)\s*/, "").trim(), cells, content: cells[1], extra: cells.slice(2) });
      });
    }
    for (const m of md.matchAll(/^>\s*💡\s*ВАЖНО:\s*(.+)$/gm)) if (!/⟦/.test(m[1])) r.rules.push(m[1].trim());
    const hw = md.split(/^## Домашнее задание\s*$/m)[1];
    if (hw) r.hw = hw.split(/^## /m)[0].split("\n").filter(l => /^\s*[-*]\s/.test(l)).map(l => plainMd(l.replace(/^\s*[-*]\s+/, "")));
    const wiki = md.match(/\*\*Википедия, «[^»]*»:\*\*\s*([^\n]+)/);
    if (wiki) r.wiki = wiki[1].replace(/\[Открыть статью\]\([^)]*\)/, "").trim();
    return r;
  }

  /* ---------- названия слайдов по этапам ---------- */
  const STAGE_T = [[/мотивац.*контрол/i, "Что мы уже умеем"], [/мотивац/i, "С чего начнём"], [/организац/i, "Начнём"], [/эпиграф/i, "Эпиграф"], [/критери/i, "Как проверим себя"], [/пробн|актуализац/i, "Вспомним"], [/выявлени/i, "В чём затруднение?"], [/постановк/i, "Задача урока"], [/локализац/i, "Ищем причину ошибок"], [/построени/i, "План работы"], [/реализац.*коррекц/i, "Работа над ошибками"], [/систематиз|обобщени.*систем|реализац.*обобщ/i, "Обобщаем"], [/реализац|открыти/i, "Открываем правило"], [/первичное закреп/i, "Закрепление"], [/первичное восприят|восприят|чтени/i, "Читаем и слушаем"], [/выполнение контрольн|контрольная/i, "Контрольная работа"], [/самостоятельн/i, "Самостоятельная работа"], [/самопроверк|взаимопроверк/i, "Проверка по эталону"], [/включени/i, "Повторение"], [/обобщение затруд/i, "Общие трудности"], [/словарн/i, "Словарная работа"], [/истори.*создани|прототип/i, "История создания"], [/композиц/i, "Композиция"], [/конфликт/i, "Конфликт"], [/персонаж/i, "Система персонажей"], [/эпизод/i, "Ключевой эпизод"], [/синтез/i, "Тема, идея, герой"], [/аналит|анализ/i, "Анализ текста"], [/итог/i, "Итог"], [/творческ/i, "Творческое задание"], [/рефлекс/i, "Рефлексия"]];
  const stageTitle = s => { const m = STAGE_T.find(([re]) => re.test(s)); return m ? m[1] : capF(s.split(/[:(]/)[0].trim()).slice(0, 48); };
  // цель урока — словами ученика: «Учимся…», «Узнаём…»
  function goalForStudents(goal, topic) {
    let g = cleanLine(goal).replace(/\s*\(тема[^)]*\)\s*/i, " ").replace(/\.$/, "").trim();
    const map = [[/^научить(?:ся)?\s+/i, "Учимся "], [/^дать представление о\s+/i, "Узнаём о "], [/^сформировать представление о\s+(?:теме\s+)?/i, "Разбираемся: "], [/^сформировать умени[ея]\s+/i, "Учимся "], [/^формировать умени[ея]\s+/i, "Учимся "], [/^познакомить(?:ся)? с\s+/i, "Знакомимся с "], [/^закрепить(?: умение)?\s+/i, "Закрепляем "], [/^повторить\s+/i, "Повторяем "], [/^проверить\s+/i, "Проверяем "], [/^обобщить и систематизировать\s+/i, "Обобщаем "], [/^обобщить\s+/i, "Обобщаем "], [/^отработать\s+/i, "Отрабатываем "], [/^исправить\s+/i, "Исправляем "], [/^выявить\s+/i, "Выясняем "], [/^раскрыть\s+/i, "Раскрываем "]];
    for (const [re, to] of map) if (re.test(g)) { g = g.replace(re, to); break; }
    g = g.replace(/\s+и научить\s+/i, " и учимся ").replace(/\s+и закрепить\s+/i, " и закрепляем ");
    const [head, list] = /^Разбираемся: /.test(g) ? [g, ""] : g.split(/:\s*/);
    const points = list ? list.split(/,\s*(?![^(]*\))/).map(x => capF(x.trim())).filter(x => x.length > 2) : [];
    return { head: capF(head || topic), points };
  }

  /* Цель для детей: «Сегодня мы…» — 3–4 конкретных шага из содержания урока, простыми словами */
  function childGoal(p, c) {
    const pts = [], kit = p.plan?.kit, RK = p.plan?.rukit;
    const work = (p.topic.match(/«([^»]+)»/) || [])[1];
    const short = (s, n = 70) => { s = String(s).replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n).replace(/\s\S*$/, "") + "…" : s; };
    if (p.subject === "lit") {
      if (work) pts.push(`прочитаем и разберём «${short(work, 50)}»${kit?.fragments?.[0]?.part ? " по частям" : kit?.fragments?.length > 1 ? ` по ${kit.fragments.length} фрагментам` : ""}`);
      const terms = (kit?.terms || []).slice(0, 3).map(t => t.term);
      if (terms.length) pts.push(`узнаем, что такое ${terms.join(", ")}, и найдём их в тексте`);
      if (kit?.heroes?.length >= 2) pts.push(`сравним героев: ${kit.heroes[0]} и ${kit.heroes[1]}`);
      if (kit?.problem) pts.push("ответим на главный вопрос урока");
    } else {
      const T = short(p.topic.replace(/^\s*(Повторение\.?\s*)/i, ""), 60);
      if (RK?.kind === "styles") pts.push("прочитаем настоящие тексты и узнаем, чем они отличаются", "научимся определять жанр (стиль) по признакам", "напишем свой текст");
      else if (RK?.kind === "lex") pts.push(`узнаем, что такое ${RK.lexSets?.[0]?.name || "это явление"}`, "поработаем со словарём", "научимся точно выбирать слова в речи");
      else if (RK?.algo) pts.push(`узнаем правило «${short(RK.algo.name, 50)}»`, "научимся рассуждать по алгоритму, чтобы не ошибаться", "потренируемся на упражнениях и проверим себя");
      else if (RK?.kind === "syntax") pts.push("научимся находить каждый член предложения по вопросу", "разберёмся, как не перепутать похожие члены предложения", "потренируемся на примерах");
      else pts.push(`узнаем главное по теме «${T}»`, "научимся применять это на практике", "проверим себя");
    }
    // правило сайта: цель на слайде — для детей или формулировками ФРП
    if (window.Rules?.get("slide_goal") === "frp" && typeof FRP !== "undefined") { const r = FRP.results(p.subject, p.grade, p.topic, p.type?.id); if (r?.subject?.length) return { head: "Цель урока:", points: r.subject.slice(0, 4).map(x => capF(x.text)) }; }
    return { head: window.Rules?.get("slide_goal_title") || "Сегодня на уроке мы:", points: pts.slice(0, 4).map(capF) };
  }
  /* Правило — короткий текст с формулировкой («пишется», «называется», «ставится»…), а не случайный абзац из пособия */
  const looksRule = s => { const t = plainMd(s).replace(/\*\([^)]*\)\*/g, ""); return t.length >= 25 && t.length <= 450 && /(пиш[еу]тся|называ[ею]тся|ставится|ставятся|не ставится|обособля|выделя[ею]тся|употребля[ею]тся|образу[ею]тся|обозначает|отвечает на вопрос|это\s|является|относятся|различают|бывают)/i.test(t); };

  /* ---------- план презентации ---------- */
  /* Литература: на слайдах только то, с чем работают и что записывают — без вопросов учителя.
     Тема и цель, проблемный вопрос, справка, словарь, текст (фрагменты, дословно, слова с подсказками),
     иллюстрации с подписью (художник, название), термины, таблица, выводы, творческое задание, д/з. */
  const subjectName = p => (typeof Subjects !== "undefined" && Subjects.name ? Subjects.name(p.subject) : (p.subject === "lit" ? "Литература" : "Русский язык"));
  function litOutline(md, p, type, o) {
    const kit = p.plan.kit, c = parseConspect(md), cards = []; let n = 0;
    const add = card => { cards.push({ id: "c" + (++n), on: true, ...card }); return cards[cards.length - 1]; };
    const author = typeof Engine !== "undefined" ? Engine.authorOf(p.topic) : null;
    const work = (p.topic.match(/«([^»]+)»/) || [])[1];
    const shortWork = work && work.length > 44 ? work.split(/,\s*/)[0] + "…" : work;
    const imgOn = o.images !== "none";
    // первый урок по произведению: биография автора → вводный слайд → комментированное чтение → аналитика по нарастающей
    const first = +p.lessonNo === 1;
    const wikiYears = (() => { const m = String(c.wiki || "").match(/\(([^)]*?\d{4}[^)]*?\d{4}[^)]*?)\)/); if (!m) return ""; const ys = m[1].match(/\d{4}/g); return ys && ys.length >= 2 ? `${ys[0]}–${ys[ys.length - 1]}` : ""; })();
    const wikiWho = (() => { const w = String(c.wiki || "").match(/\)\s*[—–-]\s*([^.;]{8,120})/); return w ? capF(w[1].trim()) : ""; })();
    add({ kind: "title", title: work ? `«${work}»` : (c.title || p.topic), points: [author || "", `${p.grade} класс · Литература`].filter(Boolean), img: imgOn ? `commons:${work || p.topic} ${author ? author.split(/\s|\./).filter(Boolean).pop() : ""} иллюстрация` : "", acc: "right" });
    // 1. Биография автора — первый слайд урока (портрет + годы + 2–3 вопроса)
    if (first && author) add({ kind: "author", title: author, points: [wikiYears, wikiWho].filter(Boolean), qs: ["Что в судьбе автора помогает понять произведение?", "Какие события жизни и эпохи отразились в его творчестве?", "Что удивило вас в биографии писателя?"], img: imgOn ? `commons:${author} портрет` : "", acc: "left", notes: `Биография: ${clip(c.wiki || "", 500) || "по учебнику"}. Вопросы — короткое обсуждение до чтения (2–3 минуты).` });
    // 1а. Больше портретов автора: живописный и фотографический — с подписями (художник/фотограф, название)
    if (first && author && imgOn) {
      add({ kind: "image", title: "Портреты автора", img: `commons:${author} портрет живопись`, cap: "Портрет: художник и год — в подписи", notes: "Второй портрет автора: покажите и спросите, что меняется в облике и настроении." });
      add({ kind: "image", title: "Автор в разные годы", img: `commons:${author} фотография`, cap: "", notes: "Фотография автора — без подписи, если неизвестен автор снимка." });
    }
    // 2. Вводный слайд: о произведении, жанр, герои
    if (first) {
      const pts = [];
      if (author) pts.push(`Автор — **${author}**${wikiYears ? ` (${wikiYears})` : ""}`);
      const genre = (p.topic.match(/(поэма|рассказ|повесть|роман|стихотворение|баллада|басня|комедия|трагедия|драма|сказка|былина|очерк)/i) || [])[1];
      if (genre) pts.push(`Жанр — ${genre.toLowerCase()}`);
      const wikiAbout = String(p.plan.workWiki || "").split(/(?<=[.!?])\s+/).find(x => x.length > 45);
      const about = kit.idea || wikiAbout || "";
      if (about) pts.push(clip(about, 200));
      if (kit.heroes && kit.heroes.length) pts.push(`Герои: ${kit.heroes.slice(0, 4).join(", ")}`);
      if (!pts.length) pts.push("Читаем произведение и разбираемся, о чём оно и как устроено.");
      add({ kind: "cards", title: "О произведении", points: pts, notes: "Коротко о произведении до чтения: что увидим, с кем познакомимся. Без пересказа сюжета целиком." });
    }
    // 3. Цель урока
    { const g = childGoal(p, c); add({ kind: "goal", title: "Тема и цель урока", lead: g.head, points: g.points, notes: c.goal ? "Цель из конспекта: " + cleanLine(c.goal) : "" }); }
    // 4. Проблемный вопрос: на первом уроке — только после чтения, без «вопросов с пылу с жару»
    const problemCard = { kind: "big", title: "Проблемный вопрос", lead: kit.problem, notes: "Запишите в тетрадь. Ответ — в выводах в конце урока." };
    add(problemCard); // как в конспекте: вопрос урока ставится на мотивации, до чтения и анализа
    // 5. Автор: краткая справка (для уроков не первого)
    if (!first && author && c.wiki) {
      const pts = [wikiYears, wikiWho].filter(Boolean);
      if (pts.length) add({ kind: "author", title: author, points: pts, img: imgOn ? `commons:${author} портрет` : "", acc: "left", notes: "Справка — по Википедии; даты сверьте с учебником." });
    }
    // 6. Комментированное чтение: на первом уроке — 3–5 читаемых фрагментов, после каждого вопрос «что заметили?»
    const verse = !!p.plan.analysis?.verse;
    const frags = first ? kit.fragments.slice(0, 5) : kit.fragments;
    const mid = Math.ceil(frags.length / 2);
    for (const f of frags) {
      if (imgOn && f.n === mid + 1 && frags.length >= 4) add({ kind: "image", title: "Иллюстрация", img: `commons:${work || p.topic} ${frags[mid - 1].label.replace(/^[^:]*:\s*/, "")}`, cap: work ? `Иллюстрация к «${shortWork}»` : "Иллюстрация", notes: "Подпись (художник, название, год) — с Викисклада." });
      if (verse) {
        // текст перед глазами класса: строфы целиком, не больше ~12 строк на слайд; вопросы — в конспекте, не на слайде
        const stz = f.text.split(/\n\s*\n/).map(x => x.replace(/^\n+|\n+$/g, "")).filter(x => x.trim());
        const chunks = [], spans = []; let cur = [], from = 1;
        const nl = x => x.split("\n").filter(l => l.trim()).length;
        if (stz.length >= 2 && stz.every(x => nl(x) <= 12)) {
          stz.forEach((x, k) => { if (cur.length && nl(cur.join("\n")) + nl(x) > 12) { chunks.push(cur.join("\n\n")); spans.push([from, k]); cur = []; from = k + 1; } cur.push(x); });
          if (cur.length) { chunks.push(cur.join("\n\n")); spans.push([from, stz.length]); }
        } else {
          const lines = f.text.split("\n"); const total = lines.filter(x => x.trim()).length, target = Math.ceil(total / Math.ceil(total / 12));
          for (const l of lines) { cur.push(l); const k = cur.filter(x => x.trim()).length; if ((k >= target && (!l.trim() || /[.!?…;:,—]\s*$/.test(l))) || k >= target + 2) { chunks.push(cur.join("\n")); cur = []; } }
          if (cur.join("").trim()) chunks.push(cur.join("\n"));
        }
        const extra = (ch, k) => chunks.length < 2 ? "" : spans[k] ? `, ${spans[k][0] === spans[k][1] ? "строфа " + spans[k][0] : "строфы " + spans[k][0] + "–" + spans[k][1]}` : `, ${k + 1}/${chunks.length}`;
        chunks.forEach((ch, k) => add({ kind: "fragment", verse: true, fn: f.n, mdBody: LitKit.markup(verbatimMd(ch.trim(), { verse: true }), kit), title: (f.whole ? `«${shortWork || "Текст"}»` : f.part ? `«${shortWork || "Текст"}». Часть ${f.n}` : `Фрагмент ${f.n}. ${f.label}`) + extra(ch, k), text: ch.trim(), by: f.whole && k === chunks.length - 1 ? author || "" : f.whole ? "" : `строки ${f.from}–${f.to}`, notes: (k ? "" : `Текст — дословно${p.plan.textSource ? ` (${p.plan.textSource})` : ""}. `) + "Вопросы к этому тексту — в конспекте; на слайде только текст. Подчёркнутые слова нажимаются: появляется пояснение." }));
      } else add({ kind: "fragment", verse: false, fn: f.n, mdBody: LitKit.markup(verbatimMd(f.text), kit), title: f.whole ? `«${shortWork || "Текст"}»` : `Фрагмент ${f.n}. ${f.label}`, text: f.text, by: "", notes: `Текст — дословно.` });
      // первый урок: после фрагмента — вопрос «что заметили?» (ответы только в заметках учителя)
      if (first) {
        const qa = ((kit.qa || []).find(x => x.n === f.n) || {}).items || [];
        const qs = qa.slice(0, 2).map(x => x.q).filter(Boolean);
        if (qs.length) add({ kind: "cards", title: "Что заметили?", points: qs, notes: `Ожидаемые ответы: ${qa.slice(0, 2).map(x => x.a).join("; ")}. Сначала спрашиваем класс, потом уточняем; ответы на слайде не показываем.` });
      }
    }
    if (imgOn) add({ kind: "image", title: "Иллюстрация", img: `commons:${work || p.topic} иллюстрация`, cap: work ? `Иллюстрация к «${shortWork}»` : "Иллюстрация", notes: "Подпись (художник, название, год) берётся с Викисклада. Если картинка подобрана из Яндекса — впишите подпись, щёлкнув по картинке." });
    // понятия — в контексте анализа: сначала строка из текста и вопросы-наблюдения (термин не называется), потом запись
    if (kit.terms.length && window.Heur) {
      const DEV = { "эпитет": "epithet", "сравнение": "simile", "повтор": "repeat", "риторический вопрос": "rhetq" };
      for (const t of kit.terms.slice(0, 4)) {
        const ch = Heur.concept(t.term) || (t.ex && DEV[t.term] ? Heur.device(DEV[t.term], t.ex) : null); if (!ch) continue;
        if (verse || !t.ex) continue; // стихи: наблюдение идёт по тексту на слайде со строфами, вопросы — в конспекте
        add({ kind: "big", title: "Наблюдаем за текстом", lead: `«${t.ex.replace(/[«»]/g, "")}»`, points: [], callout: "", notes: `Беседа: ${ch.steps.map((x, k) => `${k + 1}) ${x}`).join(" ")} Если затрудняются: ${ch.hint} Понятие, к которому приходим: ${t.term} — ${t.def} (не называть до обсуждения).` });
      }
      if (/термин|понят|эпитет|метафор|сравнен|олицетвор|гипербол|поэтик|фольклор|при[её]м/i.test(p.topic)) add({ kind: "table", title: "Запишем в тетрадь", head: ["Понятие", "Пример из текста", "Роль в произведении"], rows: kit.terms.map(t => [`${t.term}${t.ex ? ` — «${t.ex.replace(/[«»]/g, "")}»` : ""}`]), notes: `Заполняется ПОСЛЕ беседы: ученики сами называют понятие, приводят пример и формулируют роль. Определения: ${kit.terms.map(t => `${t.term} — ${t.def}`).join("; ")}` });
      // следом — та же таблица уже заполненной: класс сверяет свою запись
      if (kit.terms.some(t => t.ex || t.def) && /термин|понят|эпитет|метафор|сравнен|олицетвор|гипербол|поэтик|фольклор|при[её]м/i.test(p.topic)) add({ kind: "table", title: "Проверяем таблицу", head: ["Понятие", "Пример из текста", "Что это"], rows: kit.terms.map(t => [t.term, t.ex ? `«${t.ex.replace(/[«»]/g, "")}»` : "—", String(t.def || "—").replace(/\s+/g, " ").slice(0, 150)]), notes: "Заполненная таблица: сверьте с записями класса." });
      const flip = kit.terms.filter(t => t.ex && t.ex.length <= 40);
      if (flip.length >= 2) add({ kind: "list", title: "Проверь себя: что за приём?", points: flip.map(t => `«${t.ex.replace(/[«»]/g, "")}» — ${t.term}`), notes: "Карточки переворачиваются по щелчку: сначала ученики называют приём и его роль, потом открываем." });
    } else if (kit.terms.length) for (let i = 0; i < kit.terms.length; i += 2) add({ kind: "terms", title: "Работа с понятиями", items: kit.terms.slice(i, i + 2), notes: "Сначала пример из текста и вопрос, затем понятие." });
    const A = p.plan.analysis;
    const HH = kit.heroes?.length >= 2 ? kit.heroes : A?.heroes || [];
    if (HH.length >= 2) { add({ kind: "table", title: "Образы героев: заполняем вместе", head: ["Герой", "Цитаты", "Характеристика", "Вывод"], rows: [[HH[0], "…", "…", "…"], [HH[1], "…", "…", "…"]], notes: "Сначала пустая таблица — заполняем по ходу анализа: цитаты → характеристика → вывод." }); add({ kind: "table", title: "Образы героев: проверяем", head: ["", HH[0], HH[1]], rows: (kit.rows || ["Поступки", "Речь (цитата)", "Отношение автора"]).map(r => [r]), notes: "Таблица — та же, что в рабочем листе." }); }
    add({ kind: "concl", title: "Выводы", points: kit.conclusions, notes: "Запишите в тетрадь." });
    const cr = c.rows.find(r => /^творческ/i.test(r.stage)); if (cr) { const t = cleanLine(unbr(cr.content)); if (t.length > 10) add({ kind: "big", title: "Творческое задание", lead: t }); }
    if (c.hw.length) add({ kind: "hw", title: "Домашнее задание", points: c.hw.slice(0, 4) });
    // разминка в конце: не входит в время урока, учитель берёт любое задание, если осталось время (или переносит на начало следующего урока)
    if (kit.glossary.length) {
      add({ kind: "section", title: "Разминка", points: ["Если останется время (в хронометраж урока не входит)"], warm: true });
      const per = Math.ceil(kit.glossary.length / Math.ceil(kit.glossary.length / 5));
      for (let i = 0; i < kit.glossary.length; i += per) add({ kind: "list", title: "Разминка: незнакомые слова", points: kit.glossary.slice(i, i + per).map(g => `${g.word} — ${String(g.def || "").replace(/\s+/g, " ").slice(0, 140)}`), warm: true, notes: "Карточки переворачиваются по щелчку: ученик объясняет слово, потом открываем значение. Разминка — не основной урок: берите, если осталось время." });
    }
    return cards;
  }
  /* ---------- дополнения ко всем презентациям: доска, запоминалки, видео, разделители ---------- */
  const MONTH = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const DAY = ["первое", "второе", "третье", "четвёртое", "пятое", "шестое", "седьмое", "восьмое", "девятое", "десятое", "одиннадцатое", "двенадцатое", "тринадцатое", "четырнадцатое", "пятнадцатое", "шестнадцатое", "семнадцатое", "восемнадцатое", "девятнадцатое", "двадцатое"];
  function dateWords(d = new Date()) { const n = d.getDate(); const w = n <= 20 ? DAY[n - 1] : n < 30 ? "двадцать " + DAY[n - 21] : n === 30 ? "тридцатое" : "тридцать первое"; return capF(w) + " " + MONTH[d.getMonth()]; }
  // орфограмма мелом: заглавная буква в слове-примере («предлАгать») → выделенная строчная
  const chalk = s => String(s).replace(/([а-яё]*)([А-ЯЁ]{1,2})([а-яё]+)/g, (m, a, b, c) => a ? `${a}**${b.toLowerCase()}**${c}` : m);
  function boardCard(p, cards, RK, MN) {
    const lit = p.subject === "lit", core = typeof Engine !== "undefined" ? Engine.core(p.topic) : p.topic;
    const pts = [];
    if (lit) {
      const prob = cards.find(c => c.kind === "big" && /проблемн/i.test(c.title)); if (prob?.lead) pts.push(`Вопрос урока: ${md1(prob.lead)}`);
      const terms = cards.flatMap(c => c.kind === "terms" ? c.items.map(t => t.term) : c.kind === "glossary" ? c.items.map(g => g.word) : []).slice(0, 5);
      if (terms.length) pts.push(`Понятия урока: **${terms.join(", ")}** (определения — в тетради, с примерами из текста)`);
      if (!prob) { const q = cards.find(c => c.kind === "big" && /\?$/.test(c.lead || "")); if (q) pts.push(`Вопрос урока: ${md1(q.lead)}`); }
      const author = typeof Engine !== "undefined" ? Engine.authorOf(p.topic) : ""; if (author) pts.unshift(`Автор: **${author}**`);
      const route = cards.find(c => c.kind === "steps" && /маршрут|план/i.test(c.title));
      if (route?.points?.length) pts.push("План: " + route.points.slice(0, 5).map(x => md1(x).replace(/\.$/, "")).join(" → "));
      pts.push("Вывод: _______________");
    } else {
      if (RK?.algo?.steps?.length) RK.algo.steps.slice(0, 5).forEach((x, k) => { let t = x.replace(/\s*\(.*?\)/g, "").trim(); if (t.length > 90) t = t.split(/[;:—]/)[0].trim(); pts.push(t); });
      else if (RK?.theory?.length) RK.theory.slice(0, 3).forEach(t => pts.push(plainMd(t).slice(0, 120)));
      { const exs = (MN?.quiz || []).slice(0, 4).map(([, a]) => chalk(a.split(":")[0].trim())).filter(x => /\*\*/.test(x)).slice(0, 3); if (exs.length) pts.push("Примеры (орфограмма выделена): " + exs.join(", ")); }
    }
    return { kind: "board", title: lit ? (p.topic.match(/«[^»]+»/) || [p.topic])[0] : capF(core), points: [`${dateWords()}.`, "Классная работа."], notes: "Запись в тетради: число, «Классная работа», тема. Больше ничего на слайде нет. Дату поправьте под день урока." };
  }
  /* ---------- карточка «Схема-опора» из Schemes: обычный Markdown, без HTML ---------- */
  function schemeCard(sc) {
    if (!sc) return null;
    const P = x => (window.Schemes && Schemes.plain ? Schemes.plain(x) : String(x == null ? "" : x));
    const points = (sc.s || []).map(P).filter(Boolean);
    if (!points.length) return null;
    const card = { kind: "scheme", title: sc.t ? "Схема-опора: " + sc.t : "Схема-опора", points, ex: (sc.ex || []).map(P).filter(Boolean), l: sc.l ? P(sc.l) : "", notes: "Схема — та же, что в конспекте, памятке и рабочем листе. Пройдите по ней на примере из задания; знаки — по школьной традиции (см. легенду)." };
    if (sc.head && sc.rows) { card.head = sc.head; card.rows = sc.rows; card.full = true; }
    return card;
  }
  /* «Проверь себя»: 2–3 вопроса, ответы — в заметках учителя. Источник — Mnemo.quiz или алгоритм урока. */
  function checkCard(MN, RK) {
    const q = (MN?.quiz || []).filter(x => Array.isArray(x) && x[0]);
    if (q.length >= 2) return { kind: "check", title: "Проверь себя", points: q.slice(0, 3).map(([g]) => g), answers: q.slice(0, 3).map(([, a]) => a), notes: "Ответы: " + q.slice(0, 3).map(([, a]) => a).join("; ") + ". Сначала ученики отвечают сами, потом открываем." };
    const st = (RK?.algo?.steps || []).map(x => String(x).replace(/\s*\(.*?\)/g, "").trim()).filter(Boolean);
    if (st.length >= 3) return { kind: "check", title: "Проверь себя", points: ["Сформулируй правило своими словами: с чего начинаем и почему?", "Назови шаги алгоритма по порядку.", "Приведи свой пример и объясни его по шагам."], notes: `Ответы: опора — алгоритм «${RK.algo.name || "как применять правило"}»: ${st.slice(0, 5).map((x, i) => `${i + 1}) ${x}`).join("; ")}. Ученики отвечают своими словами, сверяем с алгоритмом.` };
    return null;
  }
  /* «Картина»: репродукция или иллюстрация с подписью и 2–3 вопросами — для ИЗО, МХК, музыки, литературы */
  function artCard(p) {
    if (!CREATIVE.has(p.subject)) return null;
    const work = (p.topic.match(/«([^»]+)»/) || [])[1] || "";
    const author = typeof Engine !== "undefined" && Engine.authorOf ? (Engine.authorOf(p.topic) || "") : "";
    const core = typeof Engine !== "undefined" ? Engine.core(p.topic) : p.topic;
    const sur = author ? author.split(/\s|\./).filter(Boolean).pop() : "";
    const shortW = work && work.length > 44 ? work.split(/,\s*/)[0] + "…" : work;
    const img = work ? `commons:${[work, sur].filter(Boolean).join(" ")} картина` : `commons:${core} картина репродукция`;
    const Q = p.subject === "lit"
      ? ["Что изображено? Какой момент произведения выбрал художник?", "Какие детали важны для понимания героя и идеи?", "Совпадает ли картина с вашим представлением о героях и событиях?"]
      : p.subject === "mus"
        ? ["Какие образы и настроение ты видишь на полотне?", "Какая музыка подошла бы этой картине (темп, тембр, динамика)?", "Что общего у живописи и музыки в передаче настроения?"]
        : p.subject === "mhk"
          ? ["Что изображено и к какому виду искусства относится работа?", "Какие признаки стиля и эпохи ты видишь?", "Какое место произведение занимает в культуре своего времени?"]
          : ["Что изображено? Как построена композиция (центр, планы, движение)?", "Какие цвета, свет и мазок использует художник?", "Какое настроение создаёт картина и как ей это удаётся?"];
    return { kind: "art", title: work ? (p.subject === "lit" ? `Иллюстрация к «${shortW}»` : `«${shortW}»: картина`) : "Рассматриваем картину", img, cap: work ? (p.subject === "lit" ? "Иллюстрация: художник, название — в подписи" : `Репродукция картины`) : "Репродукция картины", points: Q, notes: "Репродукция подбирается автоматически; подпись (художник, название, год) уточните по источнику. Вопросы — для обсуждения, ответы запишите в тетрадь." };
  }
  /* Больше слайдов по умолчанию: длинные списки делим на части, а если слайдов меньше целевого — добавляем рефлексию. */
  function expandCards(cards, p, o) {
    const amt = AMOUNT[o?.amount] || AMOUNT.medium, max = Math.max(3, amt.max || 5), target = amt.slides || 18;
    const out = [];
    for (const c of cards) {
      if (c.on === false || !["cards", "list", "concl"].includes(c.kind) || (c.points || []).length <= max + 1) { out.push(c); continue; }
      const pts = c.points, parts = Math.ceil(pts.length / max), size = Math.ceil(pts.length / parts);
      for (let i = 0, k = 0; i < pts.length; i += size, k++) out.push({ ...c, id: `${c.id || "s"}_${k}`, title: (c.title || "") + (k ? " (продолжение)" : ""), points: pts.slice(i, i + size), links: k ? undefined : c.links });
    }
    if (o?.amount !== "brief" && out.length < target && !out.some(c => /рефлекс/i.test(c.title || ""))) {
      // рефлексия — до домашнего задания и до слайдов-приложений, они всегда остаются в конце
      const i = out.findIndex(c => c.kind === "hw" || c.kind === "section" || c.kind === "appendix");
      out.splice(i >= 0 ? i : out.length, 0, { id: "refl", on: true, kind: "cards", title: "Рефлексия", points: ["Что было главным на уроке?", "Что осталось непонятным? Сформулируйте вопрос.", "Оцените себя: «могу объяснить сам», «понял с подсказкой», «остались вопросы»."], notes: "Если осталось время; в хронометраж урока не входит, слайд можно выключить." });
    }
    return out;
  }
  /* Картинки-акценты: почти на каждом слайде, кроме дословных цитат/стихов/упражнений, доски и карточки-картины. */
  function fillImages(cards, p, o) {
    /* Картинки — только там, где они действительно уместны (литература, история, МХК, ИЗО, музыка, карты).
       Для остальных предметов слайды идут без изображений: лучше чисто, чем случайное фото. */
    if (!["lit", "hist", "mhk", "izo", "mus", "geo"].includes(p.subject)) { for (const c of cards) { if (c.img) { c.img = ""; c.acc = undefined; } } return cards; }
    const mode = (o && o.images) || "all";
    const lit = p.subject === "lit";
    const work = (p.topic.match(/«([^»]+)»/) || [])[1] || "";
    const author = typeof Engine !== "undefined" && Engine.authorOf ? (Engine.authorOf(p.topic) || "") : "";
    const core = typeof Engine !== "undefined" ? Engine.core(p.topic) : p.topic;
    const base = lit ? (work || author || p.topic) : core;
    /* где картинка уместна: тезисы, списки, цель, вывод. Схемы, алгоритмы, запоминалки, викторины,
       «план/маршрут» и приложения — рисуем текстом, без случайных фото. */
    const ON_ALL = new Set(["cards", "list", "big", "steps", "goal", "concl"]);
    const ON_KEY = new Set(["cards", "list", "big", "steps", "goal"]);
    let side = 0;
    for (const card of cards) {
      if (card.kind === "image" || card.kind === "art" || VERBATIM.has(card.kind)) continue;
      if (["scheme", "algo", "mnemo", "check", "quiz", "table", "appendix", "board", "glossary", "terms", "flip"].includes(card.kind)) { if (mode === "none") { card.img = ""; card.acc = undefined; } continue; }
      // «маршрут/план/схема/алгоритм/таблица» — рисуем текстом, без случайных фото
      if (/схем|алгоритм|маршрут|план (урока|изучен)|таблиц|инфографик|викторин|проверь себя/i.test(String(card.title || ""))) continue;
      if (mode === "none") { card.img = ""; card.acc = undefined; continue; }
      if (card.img) continue;
      if (!(mode === "all" ? ON_ALL.has(card.kind) : ON_KEY.has(card.kind))) continue;
      if ((card.points || []).map(String).some(x => x.length > 150)) continue;
      const qImg = `${card.kind === "big" ? "" : (card.title || "") + " "}${base}`.replace(/\s+/g, " ").trim();
      /* Литература, МХК, ИЗО, музыка: берём только проверенную живопись/иллюстрацию (commons:),
         а не случайное фото. Нет подходящей картины/иллюстрации — слайд остаётся без картинки. */
      card.img = ["lit", "mhk", "izo", "mus"].includes(p.subject) ? `commons:${qImg}` : qImg;
      card.acc = ++side % 2 ? "right" : "left";
    }
    if (mode === "key" && !lit) {
      const mot = cards.find(x => ["cards", "big"].includes(x.kind) && /начн|вспомн|задача/i.test(x.title || ""));
      if (mot && !mot.img) { mot.img = core; mot.acc = "right"; }
    }
    return cards;
  }
  /* ---------- предметные добавки: справка, словарь, карта, ответы, биография, схема урока ---------- */
  const wikiSent = (c, re) => String(c.wiki || "").split(/(?<=[.!?])\s+/).map(x => x.trim()).filter(x => x.length > 30 && re.test(x));
  function histAppendix(p, c) {
    const pts = [];
    const author = typeof Engine !== "undefined" && Engine.authorOf ? (Engine.authorOf(p.topic) || "") : "";
    const ys = (String(c.wiki || "").match(/\(([^)]*?\d{4}[^)]*?\d{4}[^)]*?)\)/m) || [])[0] || "";
    if (p.subject === "lit") { const y = (ys.match(/\d{4}/g) || []); if (author) pts.push(`Автор — ${author}${y.length >= 2 ? ` (${y[0]}–${y[y.length - 1]})` : ""}`); }
    for (const x of (p.web?.items || [])) if (x && x.kind === "date") { const t = clip(x.text, 220); if (t.length > 12) pts.push(t); }
    pts.push(...wikiSent(c, /\d{3,4}|век|эпох|год/i).slice(0, 3));
    for (const r of c.rows) {
      if (pts.length >= 6) break;
      for (const line of unbr(r.content).split("\n")) {
        const t = cleanLine(line);
        if (/=/.test(t)) continue;
        if (t.length > 15 && t.length < 220 && /(^|[^\d])(1[0-9]{3}|[5-9][0-9]{2})\s*(г\.|год)/.test(t)) { pts.push(t); if (pts.length >= 6) break; }
      }
    }
    if (!pts.length) pts.push(...wikiSent(c, /эпох|период|век|XIX|XVIII|XX/i).slice(0, 2));
    const uniq = [...new Set(pts.map(x => clip(x, 220)).filter(Boolean))].slice(0, 6);
    if (uniq.length < 2) return null;
    return { kind: "appendix", appendix: "hist", title: "Историческая справка", points: uniq, notes: "Даты и контекст — из конспекта и открытых источников. Приложение открывается по ссылке «Историческая справка»." };
  }
  function termsAppendix(p, c, md) {
    const items = [];
    for (const t of (p.plan?.kit?.terms || p.plan?.terms || [])) { const term = t && (t.term || t.word); const def = t && (t.def || t.definition); if (term && def) items.push({ term: String(term), def: clip(def, 220) }); }
    if (!items.length) for (const g of (p.plan?.kit?.glossary || [])) if (g && g.word && g.def) items.push({ term: String(g.word), def: clip(g.def, 160) });
    if (!items.length && Array.isArray(p.plan?.vocab)) for (const v of p.plan.vocab) if (v && (v.term || v.word) && (v.def || v.definition)) items.push({ term: String(v.term || v.word), def: clip(v.def || v.definition, 200) });
    if (!items.length) for (const m of String(md || "").matchAll(/Понятия(?: урока)?\s*[:\-—]\s*([^\n]+)/gi)) for (const w of m[1].split(/[,;]\s*/)) { const x = w.trim().replace(/[.;]+$/, ""); if (x.length > 2 && x.length < 60) items.push({ term: x, def: "—" }); }
    const seen = new Set(), uniq = [];
    for (const it of items) { const k = it.term.toLowerCase(); if (!seen.has(k)) { seen.add(k); uniq.push(it); } }
    if (uniq.length < 2) return null;
    return { kind: "appendix", appendix: "terms", title: "Словарь терминов", items: uniq.slice(0, 12), notes: "Те же понятия — в конспекте и рабочем листе. Приложение открывается по ссылке «Словарь»." };
  }
  function mapAppendix(p, c) {
    if (!MAPS.has(p.subject)) return null;
    const core = typeof Engine !== "undefined" ? Engine.core(p.topic) : p.topic;
    const work = (p.topic.match(/«([^»]+)»/) || [])[1];
    const raw = (p.plan && p.plan.map) || p.map || work || core;
    const region = String(raw).replace(/(климат|рельеф|почвы|население|хозяйство|природа|характеристика|особенности|реформы|преобразования|урок)/gi, " ").replace(/\s+/g, " ").trim() || core;
    const qs = p.subject === "geo"
      ? ["Найдите на карте объекты, о которых говорится в теме.", "Определите географическое положение: полушарие, широта, соседние объекты.", "Прочитайте легенду карты: какие условные знаки понадобились?"]
      : ["Найдите на карте место события и назовите соседние страны и моря.", "Проследите по карте ход события: откуда и куда двигались участники.", "Как география объясняет события урока?"];
    return { kind: "appendix", appendix: "map", title: "Работа с картой", img: `commons:карта ${region}`, cap: "Карта: подпись и масштаб — на изображении", points: qs, notes: "Карта подбирается с проверкой: в названии файла должно быть «карта/map»; если не нашлась — выберите карту сами." };
  }
  function answersAppendix(cards) {
    const out = [];
    for (const c of cards) {
      if (c.kind === "quiz") for (const [q, a] of (c.items || [])) out.push(`**${clip(q, 90)}** — ${clip(a, 170)}`);
      else if (c.kind === "check") for (let i = 0; i < (c.points || []).length; i++) if (c.answers && c.answers[i]) out.push(`**${clip(c.points[i], 90)}** — ${clip(c.answers[i], 170)}`);
    }
    if (out.length < 2) return null;
    return { kind: "appendix", appendix: "answers", title: "Ответы", points: out.slice(0, 12), notes: "Ответы к вопросам и викторине — для учителя: показывайте после ответов класса. Приложение открывается по ссылке «Ответы»." };
  }
  function bioAppendix(p, c) {
    if (p.subject !== "lit" || +p.lessonNo === 1) return null;
    const author = typeof Engine !== "undefined" && Engine.authorOf ? (Engine.authorOf(p.topic) || "") : "";
    if (!author) return null;
    const m = String(c.wiki || "").match(/\(([^)]*?\d{4}[^)]*?\d{4}[^)]*?)\)/), ys = m ? (m[1].match(/\d{4}/g) || []) : [];
    const years = ys.length >= 2 ? `${ys[0]}–${ys[ys.length - 1]}` : "";
    const who = (String(c.wiki || "").match(/\)\s*[—–-]\s*([^.;]{8,120})/) || [])[1];
    const pts = [years, who ? capF(who.trim()) : "", ...wikiSent(c, /./).slice(0, 3).map(x => clip(x, 200))].filter(Boolean);
    if (pts.length < 2) return null;
    return { kind: "appendix", appendix: "bio", title: "Биография автора", img: `commons:${author} портрет`, cap: "Портрет писателя", points: pts.slice(0, 6), notes: "Биография — по Википедии; даты сверьте с учебником. Приложение открывается по ссылке «Биография»." };
  }
  function appendices(p, c, cards, md) {
    const out = [], links = {};
    if (HUMAN.has(p.subject)) {
      const h = histAppendix(p, c); if (h) { out.push(h); links.hist = 1; }
      const t = termsAppendix(p, c, md); if (t) { out.push(t); links.terms = 1; }
      const mp = mapAppendix(p, c); if (mp) { out.push(mp); links.map = 1; }
      const b = bioAppendix(p, c); if (b) { out.push(b); links.bio = 1; }
    }
    const a = answersAppendix(cards); if (a) { out.push(a); links.answers = 1; }
    return { cards: out, links };
  }
  /* Ссылки-кнопки ставим в обычные слайды (контракт slides.js: [📖 Историческая справка](#a:hist) и т. д.). */
  function injectLinks(cards, links) {
    if (!links || !Object.keys(links).length) return;
    const host = cards.find(c => c.kind === "concl") || cards.find(c => c.kind === "hw") || [...cards].reverse().find(c => !["appendix", "section"].includes(c.kind));
    const keys = ["hist", "terms", "map"].filter(k => links[k]);
    if (host && keys.length) addLink(host, keys);
    if (links.answers) { const q = cards.find(c => c.kind === "quiz") || cards.find(c => c.kind === "check"); addLink(q || host, "answers"); }
    // биография открывается кнопкой со слайда об авторе
    if (links.bio) { const a = cards.find(c => c.kind === "author"); addLink(a, "bio"); }
  }
  /* Технические предметы: «вспомним → образец → решаем вместе → самостоятельно» (+ олимпиада / подсказки по уровню). */
  function techFlowCards(p, c, MN, RK) {
    if (!TECH.has(p.subject)) return [];
    const lvl = levelOf(p), out = [];
    out.push({ kind: "steps", title: "Как работаем на уроке", points: ["Вспомним: опорные правила и формулы", "Образец: разбираем решение у доски", "Вместе: решаем похожую задачу", "Самостоятельно: проверяем по ключу"], notes: "Схема «вспомним → образец → решаем вместе → самостоятельно» — порядок этапов урока." });
    const ex = [];
    for (const r of c.rows) {
      if (ex.length >= 3) break;
      for (const line of unbr(r.content).split("\n")) {
        const t = cleanLine(line);
        if (/=/.test(t) && t.length > 15 && t.length < 200) { ex.push(t); if (ex.length >= 3) break; }
      }
    }
    if (ex.length) out.push({ kind: "cards", title: "Образец: разбираем вместе", points: ex.slice(0, 3), notes: "Образец решения — на доске: ученики проговаривают каждый шаг по схеме." });
    if (lvl === "high") {
      const ol = (p.olympiad || []).map(String).filter(x => x.length > 10).slice(0, 2);
      const pts = ol.length ? ol : ["Составьте обратную задачу к образцу урока и решите её.", "Найдите второй способ решения примера из урока и сравните ответы."];
      out.push({ kind: "cards", title: "Олимпиадное задание", points: pts, notes: "Задания повышенной сложности (1–2): обсуждаем способы решения и оформление." });
    }
    if (lvl === "weak") {
      const hints = ((MN && MN.scheme) || (MN && MN.tips) || []).slice(0, 3).map(plainMd).filter(Boolean);
      if (hints.length) out.push({ kind: "list", title: "Подсказки: как рассуждать", points: hints, notes: "Уровень «нужно больше объяснений»: разбираем каждый шаг медленно, можно вернуться к схеме." });
    }
    return out;
  }
  /* Разнообразие упражнений: детерминированно по теме — викторина, «верно/неверно» или «найди ошибку». */
  function varietyCard(MN, p) {
    const h = hashOf(`${p.subject}|${p.topic}|${p.grade || ""}|v5`);
    const mode = ["quiz", "bool", "error"][h % 3];
    if (mode !== "quiz" && h % 2) return null; // «иногда»: викторина чаще, остальные — реже
    const quiz = (MN?.quiz || []).filter(x => Array.isArray(x) && x[0] && x[1]);
    const rows = (MN?.tbl?.rows || []).filter(r => Array.isArray(r) && r[0] && r[1]);
    if (mode === "quiz" && quiz.length >= 2) return { kind: "quiz", title: "Викторина: задание — ответ", items: quiz.slice(0, 4).map(([q, a]) => [String(q), String(a)]), notes: "В показе первый клик открывает задание, второй — ответ." };
    if (mode === "bool" && rows.length >= 3) {
      const pts = [], ans = [];
      rows.slice(0, 4).forEach((r, i) => { const wrong = i % 2 === 1; const second = wrong ? String(rows[(i + 1) % rows.length][1] || "") : String(r[1]); pts.push(`Верно ли: «${r[0]} — ${second}»?`); ans.push(wrong ? "неверно" : "верно"); });
      return { kind: "check", title: "Верно или неверно?", points: pts, answers: ans, notes: "Ответы: " + ans.map((a, i) => `${i + 1}) ${a}`).join("; ") + ". Класс голосует «верно/неверно», потом проверяем." };
    }
    if (mode === "error" && rows.length >= 3) {
      const pts = [], ans = [];
      rows.slice(0, 3).forEach((r, i) => { const wrong = String(rows[(i + 1) % rows.length][1] || ""); pts.push(`Найдите ошибку: «${r[0]} — ${wrong}»`); ans.push(`правильно: ${r[1]}`); });
      return { kind: "check", title: "Найди ошибку", points: pts, answers: ans, notes: "Ответы: " + ans.join("; ") + "." };
    }
    return null;
  }
  function enrich(cards, p, o, md) {
    const lit = p.subject === "lit", RK = !lit ? p.plan?.rukit : null, kit = p.plan?.kit;
    let n = cards.length;
    const at = (i, card) => { cards.splice(Math.max(0, Math.min(cards.length, i)), 0, { id: "x" + (++n), on: true, ...card }); };
    const idx = k => cards.findIndex(c => c.kind === k);
    const beforeEnd = () => (idx("concl") >= 0 ? idx("concl") : idx("hw") >= 0 ? idx("hw") : cards.length);
    const MN = window.Mnemo ? Mnemo.find(p.topic, RK?.algo?.name || "", p.subject) : null;
    // доска — сразу после цели
    const g = idx("goal");
    at(g >= 0 ? g + 1 : 1, boardCard(p, cards, RK, MN));
    // условные обозначения — текстом (слайд должен работать и в Word, и в PowerPoint)
    if (window.Conv && !cards.some(c => c.title === "Условные обозначения")) { const lp = Conv.legendPoints(p, 8, { plain: true }); if (lp.length >= 3) at(g >= 0 ? g + 2 : 2, { kind: "list", title: "Условные обозначения", points: lp, notes: "Покажите знаки один раз и договоритесь: дальше в слайдах, листе и памятке они означают одно и то же." }); }
    // «Схема-опора» — перед запоминалками и проверкой (русский, литература, другие предметы)
    if (!cards.some(c => c.kind === "scheme")) {
      const sc = schemeCard(RK?.scheme || (window.Schemes ? Schemes.find(p.subject, p.topic) : null));
      if (sc) { const i0 = cards.findIndex(c => ["mnemo", "check"].includes(c.kind)); at(i0 >= 0 ? i0 : beforeEnd(), sc); }
    }
    // «Запомни», «Схема», таблица примеров и «Проверь себя» из банка Mnemo — к концу урока
    if (MN && !cards.some(c => c.kind === "mnemo")) {
      const before = beforeEnd();
      Mnemo.cards(MN, plainMd).forEach((c, k) => {
        let cc = (c.kind === "scheme" && cards.some(x => x.kind === "scheme")) ? { ...c, kind: "list", title: "Порядок действий по правилу" } : c;
        if (lit) cc = { ...cc, title: cc.title === "Порядок действий по правилу" ? "Порядок анализа" : cc.title === "Примеры: как применяем правило" ? "Примеры из текста" : cc.title }; // на литературе нет «правила»
        at(before + k, cc);
      });
    }
    // «Проверь себя», если банка Mnemo нет, а алгоритм урока есть
    if (!cards.some(c => c.kind === "check")) { const cc = checkCard(MN, RK); if (cc) at(beforeEnd(), cc); }
        /* Интерактив не добавляем автоматически: слайды идут строго по логике конспекта. */
    // «Картина» для творческих предметов: репродукция + вопросы
    if ((!o || o.images !== "none") && CREATIVE.has(p.subject) && !cards.some(c => c.kind === "art")) { const ac = artCard(p); if (ac) at(beforeEnd(), ac); }
    // Гуманитарные предметы: основа — реальная живопись и исторические фотографии (с подписью или без — по типу)
    if ((!o || o.images !== "none") && HUMAN.has(p.subject)) {
      const core = typeof Engine !== "undefined" ? Engine.core(p.topic) : p.topic;
      if (p.subject === "hist") {
        if (!cards.some(c => c.kind === "art")) at(beforeEnd(), { kind: "art", title: "Историческая картина", img: `commons:${core} историческая картина`, cap: "Историческая живопись: автор и название — в подписи", points: ["Что происходит на полотне и кто изображён?", "Какие детали помогают понять эпоху?", "Совпадает ли картина с тем, что вы прочитали?"], note: "Репродукция подбирается с проверкой подписи. Подпись — художник, название, год." });
        // фотографии существуют только с середины XIX века: для древности и Средневековья слайд не добавляем (там нужны миниатюры, карты, находки)
        const PHOTO_ERA = /(?:XIX|XX|ХIХ|ХХ)\s*в|19\s*век|20\s*век|1[89]\d\d|20[0-2]\d|революц|мировая война|Великая Отечественн|СССР|советск|перестройк|Александр\s*II|Николай\s*II|Ленин|Сталин|Хрущ|Брежнев|Горбачёв|Горбачев|Ельцин|Путин|СВО|современн|новейш/i;
        if (PHOTO_ERA.test(p.topic)) at(beforeEnd(), { kind: "image", title: "Исторические фотографии", img: `commons:${core} фотография`, cap: "", notes: "Историческая фотография: автор снимка часто неизвестен — подпись не ставим, но проговорите, что на снимке и когда он сделан." });
      } else if (p.subject === "soc" || p.subject === "geo") {
        at(beforeEnd(), { kind: "image", title: p.subject === "geo" ? "Реальные фотографии места" : "Фотографии и документы эпохи", img: `commons:${core} фотография`, cap: "", notes: "Реальная фотография по теме; подпись не нужна, если автор неизвестен." });
      } else if (p.subject === "lit" && !cards.some(c => c.kind === "art")) {
        const work = (p.topic.match(/«([^»]+)»/) || [])[1] || "", author = typeof Engine !== "undefined" ? Engine.authorOf(p.topic) : "";
        const sur = author ? author.split(/\s|\./).filter(Boolean).pop() : "";
        at(beforeEnd(), { kind: "art", title: "Художник о произведении", img: `commons:${work || p.topic} ${sur} иллюстрация`, cap: "Иллюстрация: художник, название — в подписи", points: ["Какой эпизод выбрал художник?", "Что в иллюстрации совпадает с текстом, а что — нет?", "Какой момент вы бы нарисовали сами?"], note: "Иллюстрация подбирается с проверкой подписи (художник, название)." });
      }
    }
    // аудио и видео — только там, где это работает на урок; ссылку ищет сайт (Яндекс), не нашёл — слайд выключается
    if (lit) {
      const work = (p.topic.match(/«([^»]+)»/) || [])[1] || "", author = typeof Engine !== "undefined" ? Engine.authorOf(p.topic) : "";
      const sur = author ? author.split(/\s|\./).filter(Boolean).pop() : "";
      const verse = !!p.plan?.analysis?.verse, frs = cards.map(c => c.kind).indexOf("fragment"), last = cards.map(c => c.kind).lastIndexOf("fragment");
      if (work && verse && frs >= 0) // первое восприятие: слушаем мастера художественного слова до разбора
        at(frs, { kind: "video", auto: true, mk: "audio", mq: `${work} ${sur}`.trim(), work, author, title: "Слушаем стихотворение",
          notes: "Первое восприятие: слушаем до разбора, текст можно не показывать. После прослушивания — вопросы по конспекту: какое настроение? совпало ли прочтение с вашим? какие слова чтец выделил голосом и почему?" });
      else if (work && !verse && last >= 0) // интерпретация: сцена в кино или театре — сравниваем с текстом
        at(last + 1, { kind: "video", auto: true, mk: "video", mq: `${work} ${sur}`.trim(), work, author, title: "Смотрим: сцена на экране",
          notes: "Творческое прочтение: сравниваем сцену с текстом. Вопросы по конспекту: что режиссёр и актёр передали так же, как в тексте, а что иначе? как это соотносится с авторской позицией? Укажите начало и конец фрагмента: «⋯» → «Видео»." });
    }
    // разделители между большими частями (если слайдов много) — дают паузу и ритм
    if (cards.length >= 12) {
      const first = cards.findIndex(c => ["fragment", "task", "poem"].includes(c.kind) || (c.kind === "video" && c.mk === "audio"));
      if (first > 2) at(first, { kind: "section", title: lit ? "Читаем и думаем" : "Практика", points: [lit ? "Работа с текстом" : "Применяем правило"] });
      const fin = idx("concl") >= 0 ? idx("concl") : idx("hw");
      if (fin > 4 && cards[fin - 1]?.kind !== "section") at(fin, { kind: "section", title: "Подведём итоги", points: [] });
    }
    // ---------- предметные добавки: техническая схема, уровень, разнообразие, приложения ----------
    const c2 = parseConspect(md || "");
    const lvl = levelOf(p);
    const flow = techFlowCards(p, c2, MN, RK);
    if (flow.length) { const g2 = idx("goal"); const pos = g2 >= 0 ? g2 + 2 : 2; flow.forEach((cc, i) => at(pos + i, cc)); }
    const vc = varietyCard(MN, p);
    if (vc) at(beforeEnd(), vc);
    if (lvl === "weak" && !TECH.has(p.subject) && MN && (MN.scheme || MN.tips)) {
      const pts = (MN.scheme || MN.tips).slice(0, 3).map(plainMd).filter(Boolean);
      if (pts.length) at(beforeEnd(), { kind: "list", title: "Подсказки: как рассуждать", points: pts, notes: "Больше объяснений: разбираем каждый шаг медленно, можно вернуться к схеме и образцу." });
    }
    // приложения в конце; ссылки на них — в обычных слайдах
    const ap = appendices(p, c2, cards, md);
    if (ap.cards.length) cards.push(...ap.cards.map((x, i) => ({ id: "ap" + i, on: true, ...x })));
    injectLinks(cards, ap.links);
    return cards;
  }
  function outline(md, p, type, o = opts()) {
    const lvl = levelOf(p), cfg = { ...o };
    // «Умный класс быстро решает»: на высоком уровне больше слайдов и практики; на слабом — короче и с опорой
    if (lvl === "high" && cfg.amount !== "detailed") cfg.amount = "detailed";
    if (lvl === "weak" && cfg.amount === "detailed") cfg.amount = "medium";
    const cards = expandCards(enrich(outline0(md, p, type, cfg), p, cfg, md), p, cfg);
    return fillImages(cards, p, cfg);
  }
  function outline0(md, p, type, o = opts()) {
    curTopic = p.topic; curKit = p.plan?.kit || null;
    if (p.subject === "lit" && p.plan?.kit?.fragments?.length) return litOutline(md, p, type, o);
    const amt = AMOUNT[o.amount] || AMOUNT.medium, lit = p.subject === "lit";
    curTopic = p.topic; curKit = p.plan?.kit || null;
    const c = parseConspect(md);
    const cards = []; let n = 0;
    let add = card => { cards.push({ id: "c" + (++n), on: true, ...card }); return cards[cards.length - 1]; };
    const author = typeof Engine !== "undefined" ? Engine.authorOf(p.topic) : null;
    const work = (p.topic.match(/«([^»]+)»/) || [])[1];
    const core = typeof Engine !== "undefined" ? Engine.core(p.topic) : p.topic;
    const surname = author ? author.split(/\s|\./).filter(Boolean).pop() : "";
    // 1. Титульный: тема + класс, картинка-акцент к произведению или теме
    // название: для литературы — произведение крупно, автор отдельной строкой (без лишних пометок)
    const shortWork = work && work.length > 44 ? work.split(/,\s*/)[0] + "…" : work;
    const titleText = lit && work ? `«${work}»` : (c.title || p.topic);
    add({ kind: "title", title: titleText, points: [lit && author ? author : "", `${p.grade} класс · ${subjectName(p)}`].filter(Boolean), img: lit ? (work ? `${work} ${surname} иллюстрация` : `${author || p.topic} портрет`) : `${core}`, acc: "right", notes: `${type?.name || ""}. ${typeof lessonLabel === "function" ? lessonLabel(p.lessonNo) : ""}.` });
    // 2. Автор: портрет и короткая справка из открытого источника (годы жизни, кто это)
    if (lit && author && c.wiki) { // слайд об авторе — только если есть проверенная справка (без пустого слайда)
      const pts = [];
      const yrs = c.wiki.match(/\(([^)]*?\d{4}[^)]*?\d{4}[^)]*?)\)/);
      if (yrs) { const ys = yrs[1].match(/\d{4}/g); if (ys && ys.length >= 2) pts.push(`${ys[0]}–${ys[ys.length - 1]}`); }
      const who = c.wiki.match(/\)\s*[—–-]\s*([^.;]{8,120})/);
      if (who) pts.push(capF(who[1].trim()));
      add({ kind: "author", title: author, points: pts, img: `${author} портрет`, acc: "left", notes: c.wiki ? `Справка: ${c.wiki.slice(0, 400)} (Википедия). Проверьте даты по учебнику.` : "Портрет писателя. Подпись (художник, год) уточните по источнику изображения." });
    }
    // 3. Эпиграф (дословно)
    for (const row of c.rows) {
      const m = unbr(row.content).match(/Эпиграф:\s*«([\s\S]+?)»\s*\(([^)]+)\)/);
      if (m) { add({ kind: "quote", title: "Эпиграф", quote: m[1].replace(/\s*\/\s*/g, "\n"), by: m[2], notes: "Эпиграф приведён дословно." }); break; }
    }
    // 4. Цель — словами ученика
    { const g = childGoal(p, c); add({ kind: "goal", title: "Цель урока", lead: g.head, points: g.points, notes: c.goal ? "Цель из конспекта: " + cleanLine(c.goal) : "" }); }
    // 5. Маршрут урока (как agenda у Gamma) — если этапов много
    const route = c.plan.filter(s => !/организац|домашн|рефлекс/i.test(s)).map(stageTitle);
    if (route.length >= 5) add({ kind: "steps", title: p.subject === "hist" ? "Маршрут урока" : "План урока", points: [...new Set(route)].slice(0, 6).map(x => p.subject === "hist" ? x : x), on: route.length >= 6, notes: p.subject === "hist" ? "Хронология этапов урока; на доске можно показать стрелкой времени." : "План урока по техкарте. Можно выключить в плане презентации." });
    // 5а. Русский язык: опора урока по профилю (теория, алгоритм, тексты-документы, таблица)
    const RK = !lit ? p.plan?.rukit : null;
    /* Правило, схема, алгоритм и запоминалки не показываются до того, как класс сам «откроет» правило:
       они встают сразу после этапа открытия нового знания (если такой этап есть в уроке). */
    const DISC = /реализац|открыти|изучени[ея] нового|нового знани|наблюдени|работа над темой/i;
    const hasDisc = !lit && c.rows.some(r => DISC.test(r.stage) && !/^домашн/i.test(r.stage));
    const addNow = add, ruleCards = [];
    if (hasDisc) add = card => { ruleCards.push(card); };
    if (RK && RK.kind !== "general") {
      if (RK.algo) add({ kind: "algo", title: RK.algo.name, points: RK.algo.steps.map(x => x.replace(/\s*\(.*?\)/g, "").slice(0, 160)), tip: "Порядок шагов — как в конспекте и рабочем листе.", notes: "Алгоритм — тот же, что в конспекте и рабочем листе. Пройдите его на примере из упражнения." });
      else if (RK.theory?.length) add({ kind: RK.theory.length > 3 ? "list" : "cards", title: "Запомним", points: RK.theory.slice(0, 6), notes: "Опорная теория — для записи в тетрадь." });
      (RK.handouts || []).forEach(h => add({ kind: "quote", title: h.title, quote: h.text, by: "", notes: h.key ? "Для учителя: " + h.key : "" }));
      if (RK.table) add({ kind: "table", title: RK.table.title, head: RK.table.head, rows: RK.table.rows.map(r => [r[0]]), notes: "Таблица — та же, что в рабочем листе." });
      if (RK.table && RK.table.rows.some(r => r.length > 1 && r.slice(1).some(x => String(x || "").trim()))) add({ kind: "table", title: RK.table.title + " — проверяем", head: RK.table.head, rows: RK.table.rows, notes: "Заполненная таблица: сверьте с записями класса." });
    }
    // 5а-схема. Схема-опора из Schemes — текстом, без HTML: её видно и в Word, и в PowerPoint
    { const sc = schemeCard(RK?.scheme || (window.Schemes ? Schemes.find(p.subject, p.topic) : null)); if (sc) add(sc); }
    // 5б. Запоминалки и «Проверь себя» (Mnemo): «Запомни», «Схема», таблица примеров, вопросы с ответами в заметках
    if (!lit && window.Mnemo) {
      const MN = Mnemo.find(p.topic, RK?.algo?.name || "", p.subject);
      if (MN) Mnemo.cards(MN, plainMd).forEach(c => add(c.kind === "scheme" && cards.some(x => x.kind === "scheme") ? { ...c, kind: "list", title: "Порядок действий по правилу" } : c));
    }
    add = addNow;
    let flushRules = false;
    // 6. Этапы техкарты
    const poem = lit && p.plan?.analysis?.verse && p.plan.analysis.stanzas?.length ? p.plan.analysis.stanzas : null;
    let poemDone = false;
    const exFull = p.exFull || [];
    for (const row of c.rows) {
      const stage = row.stage;
      if (flushRules) { ruleCards.splice(0).forEach(add); flushRules = false; }
      if (hasDisc && ruleCards.length && DISC.test(stage)) flushRules = true;
      if (/^домашн/i.test(stage)) continue;
      const lines = unbr(row.content).split("\n").map(s => s.trim()).filter(Boolean);
      const notes = cleanLine(lines.join(" ")).slice(0, 700) + (row.extra.length ? " · " + cleanLine(row.extra.join(" · ")).slice(0, 300) : "");
      const title = stageTitle(stage);
      // упражнение — дословно, полностью
      // задание может стоять в любой колонке техкарты (у русского — в колонке УУД/материалов)
      const allLines = unbr(row.cells.slice(1).join("\n")).split("\n").map(s => s.trim());
      const tIdx = allLines.findIndex(l => /\*\*Задание\*\*/.test(l));
      if (tIdx >= 0) {
        const src = (allLines[tIdx].match(/\*\((?:источник|из материалов):\s*([^)]*)\)\*/) || [])[1] || "";
        const full = exFull.find(e => e.source === src);
        const tail = []; for (const l of allLines.slice(tIdx + 1)) { if (/^\s*$/.test(l) && tail.length && /^\s*$/.test(tail[tail.length - 1])) break; tail.push(l); }
        const text = full ? full.text : [allLines[tIdx].replace(/^.*?\*\((?:источник|из материалов):[^)]*\)\*:?\s*/, ""), ...tail].join("\n").trim();
        const taskCard = { kind: "task", title: `Упражнение${(text.match(/^\s*(\d{1,3})\.\s/) || [])[1] ? " " + text.match(/^\s*(\d{1,3})\./)[1] : ""}`, task: text, src, notes: `Упражнение приведено дословно (${src || "источник — в конспекте"}). ${notes}`.slice(0, 900) };
        const rest = lines.filter(l => isQ(cleanLine(l)) && !/\*\*Задание\*\*/.test(l)).map(l => tight(l, amt));
        if (rest.length) add({ kind: rest.length > 1 ? "cards" : "big", title, lead: rest.length > 1 ? "" : rest[0], points: rest.length > 1 ? pickPoints(rest, amt) : [], notes });
        add(taskCard);
        continue;
      }
      // правило/ключевая мысль из материалов — дословно
      const imp0 = lines.map(l => (l.match(/💡\s*\*\*ВАЖНО:\*\*\s*(.+)$/) || [])[1]).find(Boolean);
      const imp = imp0 && looksRule(imp0) ? imp0.replace(/\s*\*\([^)]*\)\*\s*$/, "") : "";
      // текст стихотворения — после этапа восприятия/чтения
      if (poem && !poemDone && /восприят|чтени|знакомств|анализ/i.test(stage)) {
        poemDone = true;
        // стихотворение — дословно, целыми строфами; длинную строфу делим только по границе строк (до 10 строк на слайд)
        const chunks = []; let curC = [], curN = 0;
        const pushC = () => { if (curC.length) chunks.push(curC); curC = []; curN = 0; };
        for (const st of poem) {
          const nP = Math.ceil(st.length / 8), size = Math.ceil(st.length / nP);
          const parts = Array.from({ length: nP }, (_, k) => st.slice(k * size, (k + 1) * size)).filter(x => x.length);
          for (const pt of parts) { if (curN && curN + pt.length > 8) pushC(); curC.push(pt.join("\n")); curN += pt.length; if (st.length > 8) pushC(); }
        }
        pushC();
        // большое произведение (поэма, «Песня…»): на слайды — только начало, дословно; полный текст — в учебнике
        const totalLines = poem.reduce((a, st) => a + st.length, 0);
        const long = totalLines > 32;
        const use = long ? chunks.slice(0, 1) : chunks;
        use.forEach((ch, k) => add({ kind: "poem", title: (shortWork ? `«${shortWork}»` : "Текст") + (long ? " — начало" : k ? " (продолжение)" : ""), poem: ch.join("\n\n"), by: k === use.length - 1 ? author || "" : "", notes: k ? "" : `Текст — дословно, источник: ${p.plan.textSource || "см. конспект"}.${long ? " Произведение большое: на слайде начало, полный текст — в учебнике." : ""}` }));
      }
      const qs = lines.filter(l => isQ(cleanLine(l)) && !/Эпиграф:/.test(l)).map(l => tight(l, amt)).filter(x => x.length > 8);
      const problem = lines.map(l => (cleanLine(l).match(/Проблемный вопрос(?: урока)?:\s*(.+\?)/i) || [])[1]).find(Boolean);
      if (problem) { add({ kind: "big", title: "Проблемный вопрос", lead: tight(problem, AMOUNT.detailed), notes }); }
      const qq = problem ? qs.filter(x => !x.includes(problem.slice(0, 30))) : qs;
      if (qq.length) {
        const pts = pickPoints(qq, amt);
        const kind = /рефлекс/i.test(stage) ? "cards" : pts.length === 1 ? "big" : pts.every(x => x.length <= 140) ? "cards" : "list";
        add({ kind, title, lead: kind === "big" ? pts[0] : "", points: kind === "big" ? [] : pts, callout: imp && imp.length <= 160 ? plainMd(imp) : "", notes });
      } else if (!problem && /творческ|формат|игр|квест|групп|синквейн|диамант|акрослов|суд|дебат|плейлист|картин|письм/i.test(stage + " " + lines.join(" ").slice(0, 80))) {
        // этап без вопросов (творческое задание, работа в группах): шаги из реплики учителя
        const text = cleanLine(lines.join(" "));
        const head = (text.match(/^([^:«]{3,40}):\s*/) || [])[1];
        const body = text.replace(/^[^:«]{3,40}:\s*/, "");
        const sentences = (typeof Learn !== "undefined" && Learn.sentences ? Learn.sentences(body) : body.split(/(?<=[.!?])\s+(?=[А-ЯЁ])/)).map(s => s.trim()).filter(s => s.length > 8);
        if (sentences.length >= 2) add({ kind: "steps", title: head ? capF(head) : title, points: sentences.slice(0, amt.max + 1).map(s => capF(s.replace(/\.$/, ""))), notes });
        else if (sentences.length === 1 && !/^Домашнее/i.test(sentences[0])) add({ kind: "big", title, lead: sentences[0], notes });
      }
      if (imp && imp.length > 160) add({ kind: "rule", title: "Запомним", rule: plainMd(imp), notes: "Правило — дословно из материала." });
    }
    if (ruleCards.length) ruleCards.splice(0).forEach(add); // этап открытия оказался последним – опора идёт после него
    // 7. Правила из конспекта — дословно
    for (const r of c.rules.filter(looksRule)) if (!cards.some(x => x.rule === plainMd(r) || x.callout === plainMd(r))) add({ kind: "rule", title: "Запомним", rule: plainMd(r.replace(/\*\((?:[^()]|\([^)]*\))*\)\*\s*$/, "")), src: (r.match(/\*\(([^)]*)\)\*\s*$/) || [])[1] || "", notes: "Формулировка — дословно из материала." });
    // 8. Домашнее задание
    if (c.hw.length) add({ kind: "hw", title: "Домашнее задание", points: c.hw.slice(0, 4), notes: "Задания — как в конспекте." });
    // картинки-акценты добавляются после enrich (fillImages): так новые карточки тоже получают картинку
    return cards;
  }

  /* ---------- план → Markdown слайдов ---------- */
  const md1 = s => String(s || "").replace(/\n+/g, " ").trim();
  /* Таблица в обычном Markdown: её понимают SlideEditor, Word, PDF и PowerPoint (без HTML). */
  function tableMd(card) {
    const head = card.head || [], rows = card.rows || [];
    if (!head.length) return "";
    const full = card.full || rows.every(r => Array.isArray(r) && r.length >= head.length);
    return `| ${head.map(md1).join(" | ")} |\n|${head.map(() => "---").join("|")}|\n` + rows.map(r => full ? `| ${head.map((_, i) => md1(r[i])).join(" | ")} |` : `| ${md1(r[0])} |${" |".repeat(head.length - 1)}`).join("\n");
  }
  function cardMd(card) {
    const set = {};
    let title = card.title || "", level = 2, body = "";
    const isrc = card.img ? (/^commons:/.test(card.img) ? card.img : "search:" + card.img).replace(/[()"]/g, "").trim() : "";
    const img = card.img ? `![${md1(card.cap || card.title).replace(/[\[\]()]/g, "")}](${isrc})` : "";
    switch (card.kind) {
      case "title": level = 1; set.layout = "title"; body = (card.points || []).join("\n\n"); break;
      case "author": set.layout = "titleText"; body = (card.points || []).map(x => `- ${x}`).join("\n") + (card.qs?.length ? `\n\n**Вопросы:**\n` + card.qs.map(x => `- ${md1(x)}`).join("\n") : ""); break;
      case "goal": set.layout = "cards"; body = (card.lead ? `**${md1(card.lead)}**\n\n` : "") + (card.points || []).map(x => `- ${md1(x)}`).join("\n"); break;
      case "steps": set.layout = "steps"; body = (card.points || []).map((x, i) => `${i + 1}. ${md1(x)}`).join("\n"); break;
      case "cards": set.layout = "cards"; body = (card.points || []).map(x => `- ${md1(x)}`).join("\n") + (card.callout ? `\n\n> 💡 ${md1(card.callout)}` : ""); break;
      case "list": set.layout = "list"; body = (card.points || []).map(x => `- ${md1(x)}`).join("\n") + (card.callout ? `\n\n> 💡 ${md1(card.callout)}` : ""); break;
      case "big": set.layout = "big"; body = `${md1(card.lead || (card.points || [])[0] || "")}` + (card.qs?.length ? "\n\n" + card.qs.map(x => `- ${md1(x)}`).join("\n") : "") + (card.callout ? `\n\n> 💡 ${md1(card.callout)}` : ""); break;
      case "quote": set.layout = "quote"; set.vb = 1; body = `> ${verbatimMd(card.quote, { verse: true }).replace(/\n\n/g, "\n>\n> ").replace(/ {2}\n/g, "  \n> ")}` + (card.by ? `\n\n— ${md1(card.by)}` : ""); break;
      case "poem": set.layout = "poem"; set.vb = 1; body = verbatimMd(card.poem, { verse: true }) + (card.by ? `\n\n*${md1(card.by)}*` : ""); break;
      case "task": set.layout = "task"; set.vb = 1; body = verbatimMd(card.task); break;
      case "rule": set.layout = "quote"; set.vb = 1; body = `> ${verbatimMd(card.rule).replace(/\n\n/g, "\n>\n> ")}` + (card.src ? `\n\n*${md1(card.src)}*` : ""); break;
      case "hw": set.layout = "cards"; body = (card.points || []).map(x => `- ${md1(x)}`).join("\n"); break;
      case "glossary": set.layout = "cards"; set.kind = "glossary"; body = (card.items || []).map(g => `- **${md1(g.word)}** — ${md1(g.def)}`).join("\n"); break;
      case "terms": set.layout = "cards"; body = (card.items || []).map(t => `- **${md1(t.term)}** — ${md1(t.def)}${t.ex ? `  \n*Пример:* «${md1(t.ex).replace(/[«»]/g, "")}»` : ""}`).join("\n"); break;
      case "fragment": set.layout = card.verse ? "poem" : "task"; set.vb = 1; body = (card.mdBody || verbatimMd(card.text, { verse: card.verse })) + (card.by ? `\n\n*${md1(card.by)}*` : ""); break;
      case "table": set.layout = "one"; body = tableMd(card); break;
      case "concl": set.layout = "list"; body = (card.points || []).map(x => `- ${md1(x)}`).join("\n"); break;
      case "image": set.layout = "image"; break;
      case "board": { set.layout = "one"; const pp = card.points || []; body = `${md1(pp[0] || "")}  \n${md1(pp[1] || "")}` + (pp.length > 2 ? "\n\n" + pp.slice(2).map(x => `- ${md1(x)}`).join("\n") : ""); break; }
      case "video": set.layout = "video"; set.vq = card.vq || card.mq || card.title; if (card.video) set.video = card.video; body = (card.points || []).map(x => `- ${md1(x)}`).join("\n"); break;
      case "section": level = 1; set.layout = "section"; body = (card.points || []).join("\n\n"); break;
      /* «Запомни»: приёмы мнемоники списком (Mnemo). lead — опорная фраза-«картинка» крупно */
      case "mnemo": set.layout = "cards"; body = (card.lead ? `**${md1(card.lead)}**\n\n` : "") + (card.points || []).map(x => `- ${md1(x)}`).join("\n") + (card.callout ? `\n\n> 💡 ${md1(card.callout)}` : ""); break;
      /* «Схема-опора»: текстовые шаги + (если есть) таблица + примеры и легенда — всё обычным Markdown */
      case "scheme": {
        const hasT = !!(card.head && card.rows && card.rows.length);
        set.layout = hasT ? "one" : "list";
        body = (card.points || []).map(x => `- ${md1(x)}`).join("\n");
        if (hasT) body += (body ? "\n\n" : "") + tableMd(card);
        if (card.ex && card.ex.length) body += `\n\n**Примеры:** ${card.ex.map(md1).join(" · ")}`;
        if (card.l) body += `\n\n*${md1(card.l)}*`;
        break;
      }
      /* «Проверь себя»: 2–4 вопроса; ответы — в заметках учителя (комментарий <!-- … -->) */
      case "check": set.layout = "list"; body = (card.points || []).map((x, i) => `${i + 1}. ${md1(x)}`).join("\n") + (card.callout ? `\n\n> 💡 ${md1(card.callout)}` : ""); break;
      /* «Алгоритм»: нумерованные шаги + опора */
      case "algo": set.layout = "steps"; body = (card.points || []).map((x, i) => `${i + 1}. ${md1(x)}`).join("\n") + (card.tip ? `\n\n> **Опора:** ${md1(card.tip)}` : ""); break;
      /* «Картина»: репродукция + вопросы к ней (для ИЗО, МХК, музыки, литературы) */
      case "art": set.layout = "two"; set.acc = card.acc || "right"; set.ov = card.ov || "faded"; body = (card.points || []).map((x, i) => `${i + 1}. ${md1(x)}`).join("\n") + (card.note ? `\n\n*${md1(card.note)}*` : ""); break;
      /* Слайды-приложения (контракт slides.js): <!--@ {"appendix":"hist|terms|map|answers|bio"} -->.
         Только ключ appendix — Lead навешивает на них переходы по ссылкам #a:…; body — обычный Markdown. */
      case "appendix": {
        set.appendix = card.appendix || (card.items && card.items.length ? "terms" : "hist");
        body = card.items && card.items.length
          ? card.items.map(x => `- **${md1(x.term || x.word)}** — ${md1(x.def)}`).join("\n")
          : (card.points || []).map(x => `- ${md1(x)}`).join("\n");
        break;
      }
      /* Викторина (контракт slides.js): <!--@ {"quiz":1} -->, пункты строго «Задание: … || Ответ: …» */
      case "quiz": {
        set.quiz = 1;
        const items = (card.items && card.items.length) ? card.items : (card.points || []).map(q => [q, "—"]);
        body = items.map(([q, a]) => `- Задание: ${md1(q)} || Ответ: ${md1(a)}`).join("\n");
        break;
      }
      /* Выбор с проверкой и «найди лишнее» (контракт slides.js):
         <!--@ {"choice":1} --> или {"odd":1}, пункты «- [+] верно | пояснение» / «- [-] неверно | пояснение» */
      case "choice": case "odd": {
        if (card.kind === "odd") set.odd = 1; else set.choice = 1;
        const Q = card.q || card.lead || card.question || "";
        const opts = card.options || card.items || card.points || [];
        body = `${Q ? `**${md1(Q)}**\n\n` : ""}` + opts.map(o => {
          const t = typeof o === "string" ? o : (o.text || o.t || "");
          const ok = typeof o === "object" ? !!o.ok : false;
          const ex = typeof o === "object" ? (o.exp || o.explain || "") : "";
          return `- [${ok ? "+" : "-"}] ${md1(t)}${ex ? ` | ${md1(ex)}` : ""}`;
        }).join("\n");
        break;
      }
      /* «Светофор» самооценки в конце урока (контракт slides.js): <!--@ {"selfcheck":1} --> */
      case "selfcheck": { set.selfcheck = 1; body = (card.points || []).map(x => `- ${md1(x)}`).join("\n"); break; }
      /* Сравнение двух изображений «шторкой» (контракт slides.js): <!--@ {"cmp":1} -->, две картинки в теле */
      case "compare": {
        set.cmp = 1; set.vb = 1;
        body = (card.images || []).map(im => `![${md1(im.cap || im.title || "Иллюстрация")}](${im.src || im.img})`).join("\n\n");
        break;
      }
      /* Лента времени (контракт slides.js): <!--@ {"tl":1} -->, строки «- дата | событие | подробности» */
      case "timeline": {
        set.tl = 1;
        body = (card.events || []).map(e => `- ${md1(e.date)} | ${md1(e.title)}${e.detail ? ` | ${md1(e.detail)}` : ""}`).join("\n");
        break;
      }
      /* Карта персонажей (контракт slides.js): <!--@ {"cmap":1} -->, строки «- имя | характеристика | цитата» */
      case "charmap": {
        set.cmap = 1;
        body = (card.items || []).map(x => `- ${md1(x.name)} | ${md1(x.desc || "")}${x.quote ? ` | ${md1(x.quote)}` : ""}`).join("\n");
        break;
      }
      /* Итог тренажёра (контракт slides.js): <!--@ {"score":1} --> */
      case "score": { set.score = 1; body = (card.points || []).map(x => `- ${md1(x)}`).join("\n"); break; }
      default: body = (card.points || []).map(x => `- ${md1(x)}`).join("\n");
    }
    if (card.timer) set.timer = +card.timer || 300;
    if (card.kind === "rule" || card.kind === "ref") set.note = 1;
    if (card.cut) set.cut = 1;
    if (card.links && card.links.length) body += `\n\n${card.links.map(linkMd).join("  \n")}`;
    if (img && card.kind !== "image") {
      // у приложений и викторины не добавляем служебных ключей: комментарий должен совпадать с контрактом
      if (card.kind !== "appendix" && card.kind !== "quiz") set.acc = card.acc || "right";
      body = `${img}\n\n${body}`.trim();
    }
    else if (img) body = img;
    if (card.kind === "title" && img) { set.acc = card.acc || "right"; }
    // у приложений и викторины служебный комментарий — только по контракту slides.js: {"appendix":"…"} / {"quiz":1}
    if (card.kind !== "appendix" && card.kind !== "quiz") set.kind = card.kind;
    const notes = String(card.notes || "").replace(/-->/g, "—>").replace(/\s+/g, " ").trim();
    return [title ? `${level === 1 ? "#" : "##"} ${md1(title)}` : "", body, `<!--@ ${JSON.stringify(set)} -->`, notes ? `<!-- ${notes} -->` : ""].filter(Boolean).join("\n\n");
  }
  function toMarkdown(cards) {
    const keyOf = c => (String(c.title || "") + "|" + String(c.lead || "") + "|" + [].concat(c.points || c.task || c.quote || c.poem || c.rule || "").join(" ")).toLowerCase().replace(/[^а-яёa-z0-9]+/g, " ").trim().slice(0, 160); const seen = new Set(); const uniq = cards.filter(c => c.on !== false).filter(c => { if (c.kind === "title" || c.kind === "section") return true; const k = keyOf(c); if (seen.has(k)) return false; seen.add(k); return true; }); return `---\nmarp: true\npaginate: true\n---\n\n` + uniq.map(cardMd).join("\n\n---\n\n") + "\n";
  }

  /* ---------- нейросеть (по желанию): сжать формулировки обычных слайдов ---------- */
  async function condenseAi(cards, p, amtKey, signal) {
    if (!window.UCHU?.configured?.() || typeof caps === "undefined") return cards;
    const amt = AMOUNT[amtKey] || AMOUNT.medium;
    const FIXED = new Set(["title", "author", "art", "check", "board", "video", "image", "section", "terms", "glossary", "appendix", "quiz"]);
    const editable = cards.filter(c => !VERBATIM.has(c.kind) && !FIXED.has(c.kind) && (c.points?.length || c.lead));
    if (!editable.length) return cards;
    const payload = editable.map(c => ({ id: c.id, title: c.title, lead: c.lead || "", points: c.points || [] }));
    const prompt = `Ты — редактор учебных презентаций в стиле Gamma. Сделай формулировки слайдов к уроку «${p.topic}» (${p.grade} класс) лаконичными: одна мысль — один пункт, ${amt.max} пункта максимум, каждый пункт короче ${amt.len} знаков, заголовок — до 5 слов.
Правила:
- Смысл и порядок не менять, ничего не добавлять от себя, факты не придумывать.
- Всё, что стоит в «кавычках», — слова автора: переносить без изменений, кавычки сохранить.
- Вопросы остаются вопросами.
Верни только JSON-массив того же вида: [{"id":"…","title":"…","lead":"…","points":["…"]}].
${JSON.stringify(payload)}`;
    try {
      const res = await caps.sample(prompt, { modelTier: "default", cache: false, signal });
      const j = JSON.parse((res.text.match(/\[[\s\S]*\]/) || ["[]"])[0]);
      const byId = new Map(j.map(x => [x.id, x]));
      const quotes = s => (String(s).match(/«[^»]+»/g) || []);
      return cards.map(c => {
        const x = byId.get(c.id); if (!x) return c;
        // защита дословности: цитаты из исходного пункта должны остаться как были
        const okPts = Array.isArray(x.points) ? x.points.filter(s => typeof s === "string" && s.trim()) : null;
        const srcQ = new Set([...(c.points || []), c.lead || ""].flatMap(quotes));
        const bad = [...(okPts || []), x.lead || ""].flatMap(quotes).some(q => !srcQ.has(q));
        if (bad || !okPts) return c;
        return { ...c, title: String(x.title || c.title).slice(0, 60), lead: c.lead ? String(x.lead || c.lead) : c.lead, points: okPts.slice(0, amt.max) };
      });
    } catch (e) { console.warn("Deck AI", e); return cards; }
  }

  /* Схема-опора от нейросети: одна компактная генерация на тему, с кэшем (для тем, которых нет в банке) */
  async function aiScheme(cards, p) {
    if (cards.some(c => c.kind === "scheme" || /схем/i.test(c.title || ""))) return cards;
    if (!window.UCHU?.configured?.() || typeof caps === "undefined") return cards;
    const key = "uchu:aischene:" + [p.subject, p.grade, p.topic].join("|").toLowerCase();
    let j = null; try { j = JSON.parse(localStorage.getItem(key) || "null"); } catch { }
    if (!j) {
      const prompt = `Ты методист. Тема: «${p.topic}», ${p.grade} класс, ${p.subject}. Верни ТОЛЬКО JSON {"title":"Схема-опора","steps":["шаг 1","шаг 2","шаг 3"],"example":"один короткий пример"}. 3–4 шага, каждый до 80 знаков, по-русски, без вступлений.`;
      try { const r = await caps.sample(prompt, { modelTier: "default", cache: false }); j = JSON.parse((r.text.match(/\{[\s\S]*\}/) || ["null"])[0]); } catch (e) { return cards; }
      if (j) try { localStorage.setItem(key, JSON.stringify(j)); } catch { }
    }
    if (!j || !Array.isArray(j.steps) || j.steps.length < 2) return cards;
    const card = { id: "ai-scheme", on: true, kind: "list", title: j.title || "Схема-опора", points: j.steps.map((x, i) => `${i + 1}. ${String(x).slice(0, 90)}`), notes: (j.example ? "Пример: " + j.example : "Схема предложена нейросетью — проверьте перед уроком.") };
    const ai = cards.findIndex(c => c.kind === "concl" || c.kind === "hw" || c.kind === "appendix");
    if (ai >= 0) cards.splice(ai, 0, card); else cards.push(card);
    return cards;
  }
  /* Запоминалки от нейросети — для тем, которых нет в готовом списке */
  async function aiMnemo(cards, p) {
    if (cards.some(c => c.kind === "mnemo" || /запомни/i.test(c.title || "")) || !window.Mnemo?.ai) return cards;
    const MN = await Mnemo.ai(p.topic, p.grade, p.subject); if (!MN) return cards;
    const i = cards.findIndex(c => ["concl", "hw"].includes(c.kind)), pos = i >= 0 ? i : cards.length;
    const add = Mnemo.cards(MN, plainMd).map((c, k) => {
      const cc = (c.kind === "scheme" && cards.some(x => x.kind === "scheme")) ? { ...c, kind: "list", title: "Порядок действий по правилу" } : c;
      return { id: "m" + (k + 1), on: true, ...cc, notes: (cc.notes || "") + " Предложено нейросетью по школьной методике — проверьте перед уроком." };
    });
    cards.splice(pos, 0, ...add); return cards;
  }
  /* Аудио и видео: сайт ищет чтение артистов и экранизации; не нашёл — слайд остаётся в плане выключенным */
  async function mediaFill(cards) {
    for (const c of cards.filter(x => x.kind === "video" && x.auto && !x.video && x.on !== false)) {
      const r = window.VideoKit?.find ? await VideoKit.find(c.mq, c.mk, { author: c.author, work: c.work }).catch(() => []) : [];
      if (!r.length) { c.on = false; c.notes = "Запись не нашлась автоматически — найдите её сами: «⋯» → «Видео». " + (c.notes || ""); continue; }
      const b = r[0];
      c.video = { u: b.u, c: b.cap, th: b.th || "" };
      if (c.mk === "audio") c.title = b.reader ? `Слушаем: читает ${b.reader}` : "Слушаем стихотворение";
      const alt = r.slice(1, 4).map(x => `${x.cap} — ${x.u}`).join("; ");
      if (alt) c.notes = `${c.notes} Другие записи: ${alt}`;
    }
    return cards;
  }
  /* Нейросеть (если подключена): пояснения к словам и реалиям в тексте + короткие выводы после работы с частью текста */
  async function aiLit(cards, p, signal) {
    const kit = p.plan?.kit; if (p.subject !== "lit" || !kit?.fragments?.length || !window.UCHU?.configured?.() || typeof caps === "undefined") return cards;
    const work = (p.topic.match(/«([^»]+)»/) || [])[1] || p.topic, author = typeof Engine !== "undefined" ? Engine.authorOf(p.topic) : "";
    const frs = kit.fragments.slice(0, 8).map(f => ({ n: f.n, text: String(f.text).slice(0, 1800) }));
    const prompt = `Ты — методист-словесник. Урок: «${work}»${author ? ", " + author : ""}, ${p.grade} класс. Ниже фрагменты текста, с которыми класс работает на уроке.
1) notes: слова и выражения из текста, которые ученику ${p.grade} класса непонятны или несут историко-культурный смысл (реалии, имена, устаревшие слова, исторические события). Не больше 8. "w" — ровно как в тексте (1–3 слова), "tip" — пояснение до 160 знаков: словарное значение или историческая справка. Очевидное не толковать. Числительные, даты, местоимения и имена без реалий («третьего сентября», «этот», «Тарас») не толкуй.
2) concl: для каждого фрагмента — вывод, который класс записывает после работы с ним (1–2 предложения, с литературоведческими терминами, опора на конкретные слова текста, без пустых абстракций и без готовой трактовки всего произведения).
3) heroes: только для прозы и драмы (для стихотворения — пустой массив): 3–5 главных действующих лиц из этих фрагментов. "name" — имя как в тексте, "hint" — описание по поступку или черте в одном предложении, БЕЗ имени героя, до 110 знаков.
4) events: только для прозы и драмы: 5–7 ключевых событий этих фрагментов в правильном порядке, каждое до 70 знаков, только то, что есть в тексте.
Верни только JSON: {"notes":[{"w":"…","tip":"…"}],"concl":[{"n":1,"t":"…"}],"heroes":[{"name":"…","hint":"…"}],"events":["…"]}
${JSON.stringify(frs)}`;
    try {
      const res = await caps.sample(prompt, { modelTier: "default", cache: false, signal });
      const j = JSON.parse((res.text.match(/\{[\s\S]*\}/) || ["{}"])[0]);
      const all = kit.fragments.map(f => f.text).join("\n").toLowerCase();
      const notes = (j.notes || []).filter(x => x?.w && x?.tip && all.includes(String(x.w).toLowerCase())).slice(0, 8).map(x => ({ w: String(x.w), tip: String(x.tip).slice(0, 200) }));
      if (notes.length) { kit.extraTips = [...(kit.extraTips || []), ...notes]; for (const c of cards) if (c.kind === "fragment" && c.text) c.mdBody = LitKit.markup(verbatimMd(c.text, { verse: c.verse }), kit); }
      const concl = new Map((j.concl || []).filter(x => x?.t && String(x.t).length > 15).map(x => [+x.n, String(x.t).slice(0, 260)]));
      if (concl.size && kit.fragments.length >= 2 || concl.size && cards.filter(c => c.kind === "fragment").length >= 2) {
        for (const n of [...concl.keys()].sort((a, b) => b - a)) {
          const last = cards.map(c => c.kind === "fragment" && c.fn === n).lastIndexOf(true); if (last < 0) continue;
          cards.splice(last + 1, 0, { id: "v" + n, on: true, kind: "concl", title: "Вывод", points: [concl.get(n)], notes: "Показывайте после обсуждения: вывод сначала формулируют ученики, слайд — для записи. Слайд можно выключить." });
        }
      }
      // разминка в конце презентации (не входит в время урока): «Угадай героя» и «Восстанови сюжет»
      if (!p.plan?.analysis?.verse) {
        const txt = kit.fragments.map(f => f.text).join("\n").toLowerCase().replace(/ё/g, "е");
        const heroes = (j.heroes || []).filter(x => x?.name && x?.hint && txt.includes(String(x.name).toLowerCase().replace(/ё/g, "е").split(/\s+/)[0].slice(0, 5)) && !String(x.hint).toLowerCase().includes(String(x.name).toLowerCase().split(/\s+/)[0].slice(0, 5))).slice(0, 5);
        const events = (j.events || []).map(x => String(x || "").trim().slice(0, 90)).filter(x => x.length > 8).slice(0, 7);
        const warm = [];
        if (!cards.some(c => c.warm && c.kind === "section")) warm.push({ kind: "section", title: "Разминка", points: ["Если останется время (в хронометраж урока не входит)"], warm: true });
        if (heroes.length >= 3) warm.push({ kind: "list", title: "Разминка: угадай героя по описанию", points: heroes.map(h => `${String(h.hint).replace(/\s+/g, " ")} — ${h.name}`), warm: true, notes: "Карточки переворачиваются по щелчку: класс называет героя по описанию, потом открываем имя." });
        if (events.length >= 4) {
          const order = events.map((e, i) => [e, i]).sort((a, b) => ((a[1] * 7 + 3) % 11) - ((b[1] * 7 + 3) % 11));
          const L = "АБВГДЕЖ";
          warm.push({ kind: "list", title: "Разминка: восстанови сюжет", points: order.map(([e], i) => `${L[i]}. ${e}`), warm: true, notes: "События перепутаны: класс называет правильный порядок букв. Ответ — на следующем слайде." });
          warm.push({ kind: "steps", title: "Сюжет по порядку", points: events, warm: true, notes: "Правильный порядок событий." });
        }
        if (warm.length > (cards.some(c => c.warm && c.kind === "section") ? 0 : 1)) {
          const addWarm = warm.map((c, i) => ({ id: "w" + i + "_" + Math.random().toString(36).slice(2, 5), on: true, ...c }));
          // слайды-приложения всегда остаются последними: разминку вставляем перед ними
          const ai = cards.findIndex(c => c.kind === "appendix");
          if (ai >= 0) cards.splice(ai, 0, ...addWarm); else cards.push(...addWarm);
        }
      }
    } catch (e) { console.warn("Deck AI lit", e); }
    return cards;
  }
  /* ---------- сборка ---------- */
  async function build(md, p, type, { ai = false, signal, o = opts() } = {}) {
    let cards = outline(md, p, type, o);
    if (ai) { cards = await condenseAi(cards, p, o.amount, signal); cards = await aiMnemo(cards, p).catch(() => cards); cards = await aiScheme(cards, p).catch(() => cards); cards = await aiLit(cards, p, signal).catch(() => cards); }
    cards = await mediaFill(cards).catch(() => cards);
    return { cards, md: toMarkdown(cards) };
  }

  /* ---------- окно «План презентации» ---------- */
  function openOutline() {
    const L = state.lesson; if (!L) return;
    const p = { ...L.params, plan: L.planFull || null, exFull: L.exFull || [] };
    const type = L.params.type || {};
    const o = opts();
    let cards = L.deckOutline ? JSON.parse(JSON.stringify(L.deckOutline)) : outline(L.docs.conspect || "", p, type, o);
    const m = openModal(`<div class="dialog wide"><div class="dlg-h"><h2>План презентации</h2><button class="btn ghost x" data-close aria-label="Закрыть">×</button></div>
      <div class="dlg-b deck-ol">
        <p class="hint">Поправьте заголовки, выключите лишнее, перетащите карточки.</p>
        <div class="deck-opts">
          <label class="sx-tl">Объём текста <select id="dkAmt">${Object.entries(AMOUNT).map(([k, v]) => `<option value="${k}" ${k === o.amount ? "selected" : ""}>${v.label}</option>`).join("")}</select></label>
          <label class="sx-tl">Картинки (Яндекс) <select id="dkImg">${Object.entries(IMAGES).map(([k, v]) => `<option value="${k}" ${k === o.images ? "selected" : ""}>${v}</option>`).join("")}</select></label>
          <button class="btn sm ghost" id="dkRe" title="Заново составить план по конспекту с выбранными настройками">Составить план заново</button>
          <span class="small" id="dkCount"></span>
        </div>
        ${window.ThemeKit ? `<details class="dk-theme" open><summary><b>Оформление</b> — <span id="dkThName"></span></summary><div class="th-strip" id="dkThPrev" aria-label="Так будет выглядеть презентация"></div><div class="th-pick" id="dkTh"></div></details>` : ""}
        <ol class="deck-cards" id="dkList"></ol>
        <div class="mat-row"><button class="btn sm ghost" id="dkAdd">+ Карточка</button></div>
        <div class="pk-foot"><button class="btn flame" id="dkBuild">Собрать презентацию</button>${window.UCHU?.configured?.() ? `<label class="check"><input type="checkbox" id="dkAi"> Сжать формулировки нейросетью (дословные блоки не трогает)</label>` : ""}<label class="check" title="Портрет писателя станет наклейкой: фон убирается, по контуру — белая обводка. Первый раз загружается модель (~40 МБ)."><input type="checkbox" id="dkCut" ${(() => { try { const v = localStorage.getItem("uchu:cutout"); return v ? v === "1" : !/Mobi|Android/i.test(navigator.userAgent); } catch { return true; } })() ? "checked" : ""}> Вырезать портреты (наклейка без фона)</label><span class="small" id="dkMsg"></span></div>
      </div></div>`);
    const list = $("#dkList", m);
    const draw = () => {
      list.innerHTML = cards.map((c, i) => {
        const vb = VERBATIM.has(c.kind);
        const fixed = vb || c.items || c.rows;
        const text = vb ? (c.task || c.quote || c.poem || c.rule || c.text || "")
          : c.kind === "quiz" ? (c.items || []).map(([q, a]) => `Задание: ${q} || Ответ: ${a}`).join("\n")
            : c.kind === "appendix" && c.items ? c.items.map(x => `${x.term || x.word} — ${x.def}`).join("\n")
              : c.items ? c.items.map(x => `${x.word || x.term} — ${x.def}`).join("\n")
                : c.rows ? `${c.head.join(" | ")}`
                  : [c.lead, ...(c.points || [])].filter(Boolean).join("\n");
        return `<li class="dk-card${c.on === false ? " off" : ""}" draggable="true" data-i="${i}">
          <span class="dk-n">${i + 1}</span>
          <div class="dk-main">
            <div class="dk-row"><input type="checkbox" data-on ${c.on === false ? "" : "checked"} aria-label="Включить слайд"><input type="text" data-title value="${esc(c.title || "")}" aria-label="Заголовок"><select data-kind aria-label="Вид слайда">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}" ${k === c.kind ? "selected" : ""}>${v}</option>`).join("")}</select>
              <label class="dk-img" title="Картинка из Яндекса: запрос">🖼 <input type="text" data-img value="${esc(c.img || "")}" placeholder="без картинки"></label><button class="btn sm ghost" data-del aria-label="Удалить карточку">×</button></div>
            ${fixed ? `<div class="dk-vb"><span class="tag">${vb ? "дословно" : "из конспекта"}</span> ${esc(text.slice(0, 260))}${text.length > 260 ? "…" : ""} <span class="small">(${text.length} зн.)</span></div>` : `<textarea data-pts rows="${Math.min(6, Math.max(2, (c.points || []).length + (c.lead ? 1 : 0)))}" aria-label="Тезисы, по одному в строке">${esc(text)}</textarea>`}
          </div></li>`;
      }).join("");
      $("#dkCount", m).textContent = `Слайдов: ${cards.filter(c => c.on !== false).length}`;
      $$(".dk-card", list).forEach(li => {
        const c = cards[+li.dataset.i];
        li.querySelector("[data-on]").onchange = e => { c.on = e.target.checked; li.classList.toggle("off", !c.on); $("#dkCount", m).textContent = `Слайдов: ${cards.filter(x => x.on !== false).length}`; };
        li.querySelector("[data-title]").oninput = e => { c.title = e.target.value; };
        li.querySelector("[data-img]").oninput = e => { c.img = e.target.value.trim(); if (c.img && !c.acc) c.acc = "right"; };
        li.querySelector("[data-kind]").onchange = e => {
          const k = e.target.value, wasVb = VERBATIM.has(c.kind), nowVb = VERBATIM.has(k);
          if (wasVb && !nowVb) { const t = c.task || c.quote || c.poem || c.rule || ""; c.points = t.split(/\n+/).filter(Boolean); c.lead = ""; }
          if (!wasVb && nowVb) { const t = [c.lead, ...(c.points || [])].filter(Boolean).join("\n"); c[k === "task" ? "task" : k === "poem" ? "poem" : k === "rule" ? "rule" : "quote"] = t; }
          c.kind = k; draw();
        };
        const ta = li.querySelector("[data-pts]");
        if (ta) ta.oninput = e => { const ls = e.target.value.split("\n").map(s => s.trim()).filter(Boolean); if (c.kind === "big") { c.lead = ls[0] || ""; c.points = ls.slice(1); } else if (c.kind === "goal" && c.lead) { c.lead = ls[0] || ""; c.points = ls.slice(1); } else c.points = ls; };
        li.querySelector("[data-del]").onclick = () => { cards.splice(+li.dataset.i, 1); draw(); };
        li.addEventListener("dragstart", e => { if (e.target.closest("input,textarea,select")) { e.preventDefault(); return; } e.dataTransfer.setData("text/x-card", li.dataset.i); li.classList.add("drag"); });
        li.addEventListener("dragend", () => li.classList.remove("drag"));
        li.addEventListener("dragover", e => { if (e.dataTransfer.types.includes("text/x-card")) { e.preventDefault(); li.classList.add("over"); } });
        li.addEventListener("dragleave", () => li.classList.remove("over"));
        li.addEventListener("drop", e => { const from = +e.dataTransfer.getData("text/x-card"); if (isNaN(from)) return; e.preventDefault(); const [x] = cards.splice(from, 1); cards.splice(+li.dataset.i, 0, x); draw(); });
      });
    };
    draw();
    // оформление: «Авто» подбирает по произведению/разделу; можно выбрать до сборки
    let thPick = L.slideThemeAuto === false && L.slideTheme ? L.slideTheme : "auto";
    const drawTh = () => {
      const box = $("#dkTh", m); if (!box || !window.SlideEditor) return;
      const autoK = ThemeKit.auto(p);
      const sample = { title: (p.topic.match(/«[^»]+»/) || [p.topic])[0].slice(0, 60), level: 1, body: `${p.grade} класс`, notes: "", set: { layout: "title", afs: .8 } };
      const opt = (k, label, sub) => `<button type="button" data-th="${k}" class="${thPick === k ? "on" : ""}">${SlideEditor.slideHtml(sample, 0, { th: k === "auto" ? autoK : k })}<span>${label}</span><small>${sub}</small></button>`;
      box.innerHTML = opt("auto", "✨ Авто: " + ThemeKit.META[autoK].name, "по теме урока") + Object.entries(ThemeKit.META).map(([k, v]) => opt(k, v.name, v.desc)).join("") + Object.entries(SlideEditor.THEMES).filter(([k]) => !ThemeKit.has(k)).map(([k, v]) => opt(k, v, "строгая")).join("");
      $("#dkThName", m).textContent = thPick === "auto" ? `авто: ${ThemeKit.why(p)}` : (ThemeKit.META[thPick]?.name || SlideEditor.THEMES[thPick] || "");
      box.querySelectorAll("[data-th]").forEach(b => b.onclick = () => { thPick = b.dataset.th; drawTh(); });
      // лента: первые слайды ЭТОЙ презентации в выбранном оформлении — видно, что весь урок в одном стиле
      const strip = $("#dkThPrev", m), k = thPick === "auto" ? autoK : thPick;
      const sl = splitSlides(toMarkdown(cards.filter(c => c.on !== false).slice(0, 8))).map(SlideEditor.parse);
      strip.innerHTML = sl.map((x, i) => `<div class="th-s">${SlideEditor.slideHtml({ ...x, set: { ...x.set, afs: .62 } }, i, { th: k })}</div>`).join("");
      strip.querySelectorAll(".sx-body, .sx-acc").forEach(decorate);
    };
    drawTh();
    const cur = () => ({ amount: $("#dkAmt", m).value, images: $("#dkImg", m).value });
    $("#dkAmt", m).onchange = $("#dkImg", m).onchange = () => saveOpts(cur());
    $("#dkRe", m).onclick = () => { saveOpts(cur()); cards = outline(L.docs.conspect || "", p, type, cur()); draw(); };
    $("#dkAdd", m).onclick = () => { cards.push({ id: "c" + Date.now(), on: true, kind: "cards", title: "Новый слайд", points: ["Тезис"] }); draw(); list.lastElementChild?.scrollIntoView({ block: "nearest" }); };
    $("#dkBuild", m).onclick = async () => {
      window.Usage?.begin("Пересборка презентации", p.topic);
      const btn = $("#dkBuild", m); btn.disabled = true; $("#dkMsg", m).textContent = "Собираю слайды и подбираю картинки в Яндексе…";
      saveOpts(cur());
      if ($("#dkAi", m)?.checked) { $("#dkMsg", m).textContent = "Нейросеть сжимает формулировки…"; cards = await condenseAi(cards, p, cur().amount); }
      if (window.ThemeKit && window.SlideEditor) { const k = thPick === "auto" ? ThemeKit.auto(p) : thPick; SlideEditor.applyTheme(k, { auto: thPick === "auto" }); }
      if ($("#dkAi", m)?.checked) cards = await aiMnemo(cards, p).catch(() => cards);      if ($("#dkAi", m)?.checked) cards = await aiScheme(cards, p).catch(() => cards);
      if ($("#dkAi", m)?.checked) { $("#dkMsg", m).textContent = "Пояснения к словам и выводы…"; cards = await aiLit(cards, p).catch(() => cards); }
      $("#dkMsg", m).textContent = "Ищу чтение артистов и фрагменты фильмов…"; cards = await mediaFill(cards).catch(() => cards);
      L.deckOutline = cards;
      let md = toMarkdown(cards);
      md = await Media.autoFill(md).catch(() => md);
      try { localStorage.setItem("uchu:cutout", $("#dkCut", m)?.checked ? "1" : "0"); } catch { }
      if (window.SlideEditor?.stickerize) md = await SlideEditor.stickerize(md, { onStep: t => { $("#dkMsg", m).textContent = t; } }).catch(() => md);
      if (window.SlideEditor) SlideEditor.replaceAll(md);
      closeModal(); toast("Презентация готова.", 3500);
    };
  }

  return { childGoal, outline, toMarkdown, build, mediaFill, aiLit, openOutline, verbatimMd, parseConspect, tight, opts, AMOUNT, IMAGES, KINDS, VERBATIM };
})();
window.Deck = Deck;
