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
    brief: { label: "Минимум текста", max: 2, paren: false, len: 90 },
    medium: { label: "Кратко", max: 3, paren: false, len: 130 },
    detailed: { label: "Подробнее", max: 4, paren: true, len: 220 }
  };
  const IMAGES = { key: "Картинки на ключевых слайдах", all: "Картинка почти на каждом слайде", none: "Без картинок" };
  const KINDS = {
    title: "Титульный", author: "Автор (портрет)", goal: "Цель урока", steps: "Шаги / план", cards: "Карточки с тезисами",
    list: "Список", big: "Крупный вопрос", quote: "Цитата (дословно)", poem: "Стихотворение (дословно)",
    task: "Упражнение (дословно)", rule: "Правило (дословно)", hw: "Домашнее задание", image: "Картинка во весь слайд",
    fragment: "Фрагмент текста (дословно)", glossary: "Словарная работа", terms: "Работа с терминами", table: "Таблица для заполнения", concl: "Выводы",
    board: "На доске (что записать)", mnemo: "Как запомнить", flip: "Проверь себя (карточки)", video: "Видеофрагмент", section: "Разделитель"
  };
  const VERBATIM = new Set(["quote", "poem", "task", "rule", "fragment"]);
  function opts() { let o = {}; try { o = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { } return { amount: AMOUNT[o.amount] ? o.amount : "medium", images: IMAGES[o.images] ? o.images : "key" }; }
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
  function litOutline(md, p, type, o) {
    const kit = p.plan.kit, c = parseConspect(md), cards = []; let n = 0;
    const add = card => { cards.push({ id: "c" + (++n), on: true, ...card }); return cards[cards.length - 1]; };
    const author = typeof Engine !== "undefined" ? Engine.authorOf(p.topic) : null;
    const work = (p.topic.match(/«([^»]+)»/) || [])[1];
    const shortWork = work && work.length > 44 ? work.split(/,\s*/)[0] + "…" : work;
    const imgOn = o.images !== "none";
    add({ kind: "title", title: work ? `«${work}»` : (c.title || p.topic), points: [author || "", `${p.grade} класс · Литература`].filter(Boolean), img: imgOn ? `commons:${work || p.topic} ${author ? author.split(/\s|\./).filter(Boolean).pop() : ""} иллюстрация` : "", acc: "right" });
    { const g = childGoal(p, c); add({ kind: "goal", title: "Тема и цель урока", lead: g.head, points: g.points, notes: c.goal ? "Цель из конспекта: " + cleanLine(c.goal) : "" }); }
    add({ kind: "big", title: "Проблемный вопрос", lead: kit.problem, notes: "Запишите в тетрадь. Ответ — в выводах в конце урока." });
    if (author && c.wiki) {
      const pts = []; const yrs = c.wiki.match(/\(([^)]*?\d{4}[^)]*?\d{4}[^)]*?)\)/);
      if (yrs) { const ys = yrs[1].match(/\d{4}/g); if (ys && ys.length >= 2) pts.push(`${ys[0]}–${ys[ys.length - 1]}`); }
      const who = c.wiki.match(/\)\s*[—–-]\s*([^.;]{8,120})/); if (who) pts.push(capF(who[1].trim()));
      if (pts.length) add({ kind: "author", title: author, points: pts, img: imgOn ? `commons:${author} портрет` : "", acc: "left", notes: "Справка — по Википедии; даты сверьте с учебником." });
    }
    if (kit.glossary.length) {
      const per = Math.ceil(kit.glossary.length / Math.ceil(kit.glossary.length / 4));
      for (let i = 0; i < kit.glossary.length; i += per) add({ kind: "glossary", title: "Словарная работа", items: kit.glossary.slice(i, i + per) });
    }
    // текст: фрагменты дословно; слова из словаря и примеры терминов — с подсказкой по щелчку
    const verse = !!p.plan.analysis?.verse;
    const mid = Math.ceil(kit.fragments.length / 2);
    for (const f of kit.fragments) {
      if (imgOn && f.n === mid + 1 && kit.fragments.length >= 4) add({ kind: "image", title: "Иллюстрация", img: `commons:${work || p.topic} ${kit.fragments[mid - 1].label.replace(/^[^:]*:\s*/, "")}`, cap: work ? `Иллюстрация к «${shortWork}»` : "Иллюстрация", notes: "Подпись (художник, название, год) — с Викисклада." });
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
      add({ kind: "table", title: "Запишем в тетрадь", head: ["Понятие", "Пример из текста", "Роль в произведении"], rows: kit.terms.map(t => [`${t.term}${t.ex ? ` — «${t.ex.replace(/[«»]/g, "")}»` : ""}`]), notes: `Заполняется ПОСЛЕ беседы: ученики сами называют понятие, приводят пример и формулируют роль. Определения: ${kit.terms.map(t => `${t.term} — ${t.def}`).join("; ")}` });
      const flip = kit.terms.filter(t => t.ex && t.ex.length <= 40);
      if (flip.length >= 2) add({ kind: "list", title: "Проверь себя: что за приём?", points: flip.map(t => `«${t.ex.replace(/[«»]/g, "")}» — ${t.term}`), notes: "Карточки переворачиваются по щелчку: сначала ученики называют приём и его роль, потом открываем." });
    } else if (kit.terms.length) for (let i = 0; i < kit.terms.length; i += 2) add({ kind: "terms", title: "Работа с понятиями", items: kit.terms.slice(i, i + 2), notes: "Сначала пример из текста и вопрос, затем понятие." });
    const A = p.plan.analysis;
    const HH = kit.heroes?.length >= 2 ? kit.heroes : A?.heroes || [];
    if (HH.length >= 2) add({ kind: "table", title: "Сравним героев", head: ["", HH[0], HH[1]], rows: (kit.rows || ["Поступки", "Речь (цитата)", "Отношение автора"]).map(r => [r]), notes: "Таблица — та же, что в рабочем листе." });
    add({ kind: "concl", title: "Выводы", points: kit.conclusions, notes: "Запишите в тетрадь." });
    const cr = c.rows.find(r => /^творческ/i.test(r.stage)); if (cr) { const t = cleanLine(unbr(cr.content)); if (t.length > 10) add({ kind: "big", title: "Творческое задание", lead: t }); }
    if (c.hw.length) add({ kind: "hw", title: "Домашнее задание", points: c.hw.slice(0, 4) });
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
    return { kind: "board", title: lit ? (p.topic.match(/«[^»]+»/) || [p.topic])[0] : capF(core), points: [`${dateWords()}.`, "Классная работа.", ...pts], notes: "Запись на доске и в тетради: число, «Классная работа», тема, опорная схема, примеры (орфограмма выделена). Дату поправьте под день урока." };
  }
  function enrich(cards, p, o) {
    const lit = p.subject === "lit", RK = !lit ? p.plan?.rukit : null;
    let n = cards.length;
    const at = (i, card) => { cards.splice(Math.max(0, Math.min(cards.length, i)), 0, { id: "x" + (++n), on: true, ...card }); };
    const idx = k => cards.findIndex(c => c.kind === k);
    // запоминалки для литературы (тропы, размеры, композиция…) — после терминов/фрагментов
    const MN = window.Mnemo ? Mnemo.find(p.topic, RK?.algo?.name || "", p.subject) : null;
    if (lit && MN && !cards.some(c => c.title === "Как запомнить")) {
      const before = idx("concl") >= 0 ? idx("concl") : idx("hw") >= 0 ? idx("hw") : cards.length;
      at(before, { kind: "list", title: "Как запомнить", points: MN.tips.map(plainMd), notes: "Приёмы запоминания — по школьным учебникам. Попросите учеников придумать свой пример." });
      at(before + 1, { kind: "list", title: "Проверь себя: переверни карточку", points: MN.quiz.map(([g, a]) => `${g} — ${a}`), notes: "В показе карточки переворачиваются по щелчку." });
    }
    // доска — сразу после цели
    const g = idx("goal");
    at(g >= 0 ? g + 1 : 1, boardCard(p, cards, RK, MN));
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
    return cards;
  }
  function outline(md, p, type, o = opts()) { return enrich(outline0(md, p, type, o), p, o); }
  function outline0(md, p, type, o = opts()) {
    curTopic = p.topic; curKit = p.plan?.kit || null;
    if (p.subject === "lit" && p.plan?.kit?.fragments?.length) return litOutline(md, p, type, o);
    const amt = AMOUNT[o.amount] || AMOUNT.medium, lit = p.subject === "lit";
    curTopic = p.topic; curKit = p.plan?.kit || null;
    const c = parseConspect(md);
    const cards = []; let n = 0;
    const add = card => { cards.push({ id: "c" + (++n), on: true, ...card }); return cards[cards.length - 1]; };
    const author = typeof Engine !== "undefined" ? Engine.authorOf(p.topic) : null;
    const work = (p.topic.match(/«([^»]+)»/) || [])[1];
    const core = typeof Engine !== "undefined" ? Engine.core(p.topic) : p.topic;
    const surname = author ? author.split(/\s|\./).filter(Boolean).pop() : "";
    // 1. Титульный: тема + класс, картинка-акцент к произведению или теме
    // название: для литературы — произведение крупно, автор отдельной строкой (без лишних пометок)
    const shortWork = work && work.length > 44 ? work.split(/,\s*/)[0] + "…" : work;
    const titleText = lit && work ? `«${work}»` : (c.title || p.topic);
    add({ kind: "title", title: titleText, points: [lit && author ? author : "", `${p.grade} класс · ${lit ? "Литература" : "Русский язык"}`].filter(Boolean), img: lit ? (work ? `${work} ${surname} иллюстрация` : `${author || p.topic} портрет`) : `${core}`, acc: "right", notes: `${type?.name || ""}. ${typeof lessonLabel === "function" ? lessonLabel(p.lessonNo) : ""}.` });
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
    if (route.length >= 5) add({ kind: "steps", title: "Маршрут урока", points: [...new Set(route)].slice(0, 6), on: route.length >= 6, notes: "План урока по техкарте. Можно выключить в плане презентации." });
    // 5а. Русский язык: опора урока по профилю (теория, алгоритм, тексты-документы, таблица)
    const RK = !lit ? p.plan?.rukit : null;
    if (RK && RK.kind !== "general") {
      if (RK.algo) add({ kind: "steps", title: RK.algo.name, points: RK.algo.steps.map(x => x.replace(/\s*\(.*?\)/g, "").slice(0, 160)), notes: "Алгоритм — тот же, что в конспекте и рабочем листе." });
      else if (RK.theory?.length) add({ kind: RK.theory.length > 3 ? "list" : "cards", title: "Запомним", points: RK.theory.slice(0, 6), notes: "Опорная теория — для записи в тетрадь." });
      (RK.handouts || []).forEach(h => add({ kind: "quote", title: h.title, quote: h.text, by: "", notes: h.key ? "Для учителя: " + h.key : "" }));
      if (RK.table) add({ kind: "table", title: RK.table.title, head: RK.table.head, rows: RK.table.rows.map(r => [r[0]]), notes: "Таблица — та же, что в рабочем листе." });
    }
    // 5б. Запоминалки и интерактивные примеры (в показе — карточки-перевороты: пропуск → ответ)
    if (!lit && window.Mnemo) {
      const MN = Mnemo.find(p.topic, RK?.algo?.name || "");
      if (MN) {
        add({ kind: "list", title: "Как запомнить", points: MN.tips.map(plainMd), notes: "Приёмы запоминания: проговорите с классом, попросите придумать свой пример." });
        add({ kind: "list", title: "Проверь себя: переверни карточку", points: MN.quiz.map(([g, a]) => `${g} — ${a}`), notes: "В показе каждая карточка переворачивается по щелчку: сначала ученики отвечают, потом открываем ответ." });
      }
    }
    // 6. Этапы техкарты
    const poem = lit && p.plan?.analysis?.verse && p.plan.analysis.stanzas?.length ? p.plan.analysis.stanzas : null;
    let poemDone = false;
    const exFull = p.exFull || [];
    for (const row of c.rows) {
      const stage = row.stage;
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
    // 7. Правила из конспекта — дословно
    for (const r of c.rules.filter(looksRule)) if (!cards.some(x => x.rule === plainMd(r) || x.callout === plainMd(r))) add({ kind: "rule", title: "Запомним", rule: plainMd(r.replace(/\*\((?:[^()]|\([^)]*\))*\)\*\s*$/, "")), src: (r.match(/\*\(([^)]*)\)\*\s*$/) || [])[1] || "", notes: "Формулировка — дословно из материала." });
    // 8. Домашнее задание
    if (c.hw.length) add({ kind: "hw", title: "Домашнее задание", points: c.hw.slice(0, 4), notes: "Задания — как в конспекте." });
    // картинки-акценты
    const imgMode = o.images;
    let side = 0;
    for (const card of cards) {
      if (imgMode === "none") { card.img = ""; continue; }
      if (card.img) continue;
      if (imgMode === "all" && ["cards", "list", "big", "steps", "goal"].includes(card.kind) && !(card.points || []).some(x => x.length > 150)) {
        card.img = `${card.kind === "big" ? "" : card.title + " "}${lit ? (work || author || p.topic) : core}`.replace(/\s+/g, " ").trim();
        card.acc = ++side % 2 ? "right" : "left";
      }
    }
    if (imgMode === "key" && !lit) { // по русскому языку — ещё одна иллюстрация к теме для мотивации
      const mot = cards.find(x => ["cards", "big"].includes(x.kind) && /начн|вспомн|задача/i.test(x.title));
      if (mot && !mot.img) { mot.img = core; mot.acc = "right"; }
    }
    return cards;
  }

  /* ---------- план → Markdown слайдов ---------- */
  const md1 = s => String(s || "").replace(/\n+/g, " ").trim();
  function cardMd(card) {
    const set = {};
    let title = card.title || "", level = 2, body = "";
    const isrc = card.img ? (/^commons:/.test(card.img) ? card.img : "search:" + card.img).replace(/[()"]/g, "").trim() : "";
    const img = card.img ? `![${md1(card.cap || card.title).replace(/[\[\]()]/g, "")}](${isrc})` : "";
    switch (card.kind) {
      case "title": level = 1; set.layout = "title"; body = (card.points || []).join("\n\n"); break;
      case "author": set.layout = "titleText"; body = (card.points || []).map(x => `- ${x}`).join("\n"); break;
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
      case "table": set.layout = "one"; body = `| ${card.head.map(md1).join(" | ")} |\n|${card.head.map(() => "---").join("|")}|\n${card.rows.map(r => `| ${md1(r[0])} |${" |".repeat(card.head.length - 1)}`).join("\n")}`; break;
      case "concl": set.layout = "list"; body = (card.points || []).map(x => `- ${md1(x)}`).join("\n"); break;
      case "image": set.layout = "image"; break;
      case "board": { set.layout = "one"; const pp = card.points || []; body = `${md1(pp[0] || "")}  \n${md1(pp[1] || "")}` + (pp.length > 2 ? "\n\n" + pp.slice(2).map(x => `- ${md1(x)}`).join("\n") : ""); break; }
      case "video": set.layout = "video"; set.vq = card.vq || card.mq || card.title; if (card.video) set.video = card.video; body = (card.points || []).map(x => `- ${md1(x)}`).join("\n"); break;
      case "section": level = 1; set.layout = "section"; body = (card.points || []).join("\n\n"); break;
      default: body = (card.points || []).map(x => `- ${md1(x)}`).join("\n");
    }
    if (img && card.kind !== "image") { set.acc = card.acc || "right"; body = `${img}\n\n${body}`.trim(); }
    else if (img) body = img;
    if (card.kind === "title" && img) { set.acc = card.acc || "right"; }
    set.kind = card.kind;
    const notes = String(card.notes || "").replace(/-->/g, "—>").replace(/\s+/g, " ").trim();
    return [title ? `${level === 1 ? "#" : "##"} ${md1(title)}` : "", body, `<!--@ ${JSON.stringify(set)} -->`, notes ? `<!-- ${notes} -->` : ""].filter(Boolean).join("\n\n");
  }
  function toMarkdown(cards) {
    return `---\nmarp: true\npaginate: true\n---\n\n` + cards.filter(c => c.on !== false).map(cardMd).join("\n\n---\n\n") + "\n";
  }

  /* ---------- нейросеть (по желанию): сжать формулировки обычных слайдов ---------- */
  async function condenseAi(cards, p, amtKey, signal) {
    if (!window.UCHU?.configured?.() || typeof caps === "undefined") return cards;
    const amt = AMOUNT[amtKey] || AMOUNT.medium;
    const editable = cards.filter(c => !VERBATIM.has(c.kind) && c.kind !== "title" && c.kind !== "author" && (c.points?.length || c.lead));
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

  /* Запоминалки от нейросети — для тем, которых нет в готовом списке */
  async function aiMnemo(cards, p) {
    if (cards.some(c => c.title === "Как запомнить") || !window.Mnemo?.ai) return cards;
    const MN = await Mnemo.ai(p.topic, p.grade, p.subject); if (!MN) return cards;
    const i = cards.findIndex(c => ["concl", "hw"].includes(c.kind)), pos = i >= 0 ? i : cards.length;
    const add = [{ id: "m1", on: true, kind: "list", title: "Как запомнить", points: MN.tips.map(plainMd), notes: "Приёмы предложены нейросетью по школьной методике — проверьте перед уроком." }];
    if (MN.quiz.length) add.push({ id: "m2", on: true, kind: "list", title: "Проверь себя: переверни карточку", points: MN.quiz.map(([g, a]) => `${g} — ${a}`), notes: "В показе карточки переворачиваются по щелчку." });
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
1) notes: слова и выражения из текста, которые ученику ${p.grade} класса непонятны или несут историко-культурный смысл (реалии, имена, устаревшие слова, исторические события). Не больше 8. "w" — ровно как в тексте (1–3 слова), "tip" — пояснение до 160 знаков: словарное значение или историческая справка. Очевидное не толковать.
2) concl: для каждого фрагмента — вывод, который класс записывает после работы с ним (1–2 предложения, с литературоведческими терминами, опора на конкретные слова текста, без пустых абстракций и без готовой трактовки всего произведения).
Верни только JSON: {"notes":[{"w":"…","tip":"…"}],"concl":[{"n":1,"t":"…"}]}
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
    } catch (e) { console.warn("Deck AI lit", e); }
    return cards;
  }
  /* ---------- сборка ---------- */
  async function build(md, p, type, { ai = false, signal, o = opts() } = {}) {
    let cards = outline(md, p, type, o);
    if (ai) { cards = await condenseAi(cards, p, o.amount, signal); cards = await aiMnemo(cards, p).catch(() => cards); cards = await aiLit(cards, p, signal).catch(() => cards); }
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
        const text = vb ? (c.task || c.quote || c.poem || c.rule || c.text || "") : c.items ? c.items.map(x => `${x.word || x.term} — ${x.def}`).join("\n") : c.rows ? `${c.head.join(" | ")}` : [c.lead, ...(c.points || [])].filter(Boolean).join("\n");
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
      if ($("#dkAi", m)?.checked) cards = await aiMnemo(cards, p).catch(() => cards);
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
