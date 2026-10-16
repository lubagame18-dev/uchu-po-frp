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
    medium: { label: "Кратко (как в Gamma)", max: 3, paren: false, len: 130 },
    detailed: { label: "Подробнее", max: 4, paren: true, len: 220 }
  };
  const IMAGES = { key: "Картинки на ключевых слайдах", all: "Картинка почти на каждом слайде", none: "Без картинок" };
  const KINDS = {
    title: "Титульный", author: "Автор (портрет)", goal: "Цель урока", steps: "Шаги / план", cards: "Карточки с тезисами",
    list: "Список", big: "Крупный вопрос", quote: "Цитата (дословно)", poem: "Стихотворение (дословно)",
    task: "Упражнение (дословно)", rule: "Правило (дословно)", hw: "Домашнее задание", image: "Картинка во весь слайд"
  };
  const VERBATIM = new Set(["quote", "poem", "task", "rule"]);
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
  function pickPoints(list, amt) {
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

  /* Правило — короткий текст с формулировкой («пишется», «называется», «ставится»…), а не случайный абзац из пособия */
  const looksRule = s => { const t = plainMd(s).replace(/\*\([^)]*\)\*/g, ""); return t.length >= 25 && t.length <= 450 && /(пиш[еу]тся|называ[ею]тся|ставится|ставятся|не ставится|обособля|выделя[ею]тся|употребля[ею]тся|образу[ею]тся|обозначает|отвечает на вопрос|это\s|является|относятся|различают|бывают)/i.test(t); };

  /* ---------- план презентации ---------- */
  function outline(md, p, type, o = opts()) {
    const amt = AMOUNT[o.amount] || AMOUNT.medium, lit = p.subject === "lit";
    const c = parseConspect(md);
    const cards = []; let n = 0;
    const add = card => { cards.push({ id: "c" + (++n), on: true, ...card }); return cards[cards.length - 1]; };
    const author = typeof Engine !== "undefined" ? Engine.authorOf(p.topic) : null;
    const work = (p.topic.match(/«([^»]+)»/) || [])[1];
    const core = typeof Engine !== "undefined" ? Engine.core(p.topic) : p.topic;
    const surname = author ? author.split(/\s|\./).filter(Boolean).pop() : "";
    // 1. Титульный: тема + класс, картинка-акцент к произведению или теме
    add({ kind: "title", title: c.title || p.topic, points: [`${p.grade} класс · ${lit ? "Литература" : "Русский язык"}`], img: lit ? (work ? `${work} ${surname} иллюстрация` : `${author || p.topic} портрет`) : `${core}`, acc: "right", notes: `${type?.name || ""}. ${typeof lessonLabel === "function" ? lessonLabel(p.lessonNo) : ""}.` });
    // 2. Автор: портрет и короткая справка из открытого источника (годы жизни, кто это)
    if (lit && author) {
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
    if (c.goal) { const g = goalForStudents(c.goal, p.topic); add({ kind: g.points.length >= 2 ? "goal" : "big", title: "Цель урока", lead: g.head, points: g.points.slice(0, 6), notes: cleanLine(c.goal) }); }
    // 5. Маршрут урока (как agenda у Gamma) — если этапов много
    const route = c.plan.filter(s => !/организац|домашн|рефлекс/i.test(s)).map(stageTitle);
    if (route.length >= 5) add({ kind: "steps", title: "Маршрут урока", points: [...new Set(route)].slice(0, 6), on: route.length >= 6, notes: "План урока по техкарте. Можно выключить в плане презентации." });
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
        chunks.forEach((ch, k) => add({ kind: "poem", title: (work ? `«${work}»` : "Текст") + (k ? " (продолжение)" : ""), poem: ch.join("\n\n"), by: k === chunks.length - 1 ? author || "" : "", notes: k ? "" : `Текст — дословно, источник: ${p.plan.textSource || "см. конспект"}.` }));
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
    const img = card.img ? `![${md1(card.cap || card.title).replace(/[\[\]()]/g, "")}](search:${card.img.replace(/[()"]/g, "").trim()})` : "";
    switch (card.kind) {
      case "title": level = 1; set.layout = "title"; body = (card.points || []).join("\n\n"); break;
      case "author": set.layout = "titleText"; body = (card.points || []).map(x => `- ${x}`).join("\n"); break;
      case "goal": set.layout = "cards"; body = (card.lead ? `**${md1(card.lead)}**\n\n` : "") + (card.points || []).map(x => `- ${md1(x)}`).join("\n"); break;
      case "steps": set.layout = "steps"; body = (card.points || []).map((x, i) => `${i + 1}. ${md1(x)}`).join("\n"); break;
      case "cards": set.layout = "cards"; body = (card.points || []).map(x => `- ${md1(x)}`).join("\n") + (card.callout ? `\n\n> 💡 ${md1(card.callout)}` : ""); break;
      case "list": set.layout = "list"; body = (card.points || []).map(x => `- ${md1(x)}`).join("\n") + (card.callout ? `\n\n> 💡 ${md1(card.callout)}` : ""); break;
      case "big": set.layout = "big"; body = `${md1(card.lead || (card.points || [])[0] || "")}` + (card.callout ? `\n\n> 💡 ${md1(card.callout)}` : ""); break;
      case "quote": set.layout = "quote"; set.vb = 1; body = `> ${verbatimMd(card.quote, { verse: true }).replace(/\n\n/g, "\n>\n> ").replace(/ {2}\n/g, "  \n> ")}` + (card.by ? `\n\n— ${md1(card.by)}` : ""); break;
      case "poem": set.layout = "poem"; set.vb = 1; body = verbatimMd(card.poem, { verse: true }) + (card.by ? `\n\n*${md1(card.by)}*` : ""); break;
      case "task": set.layout = "task"; set.vb = 1; body = verbatimMd(card.task); break;
      case "rule": set.layout = "quote"; set.vb = 1; body = `> ${verbatimMd(card.rule).replace(/\n\n/g, "\n>\n> ")}` + (card.src ? `\n\n*${md1(card.src)}*` : ""); break;
      case "hw": set.layout = "cards"; body = (card.points || []).map(x => `- ${md1(x)}`).join("\n"); break;
      case "image": set.layout = "image"; break;
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

  /* ---------- сборка ---------- */
  async function build(md, p, type, { ai = false, signal, o = opts() } = {}) {
    let cards = outline(md, p, type, o);
    if (ai) cards = await condenseAi(cards, p, o.amount, signal);
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
        <p class="hint">Как в Gamma: сначала план, потом слайды. Поправьте заголовки и тезисы, выключите лишнее, перетащите карточки. Упражнения, цитаты, правила и стихи переносятся <b>дословно</b> — их текст здесь не меняется; если он длинный, шрифт станет меньше или слайд разделится на 2–3.</p>
        <div class="deck-opts">
          <label class="sx-tl">Объём текста <select id="dkAmt">${Object.entries(AMOUNT).map(([k, v]) => `<option value="${k}" ${k === o.amount ? "selected" : ""}>${v.label}</option>`).join("")}</select></label>
          <label class="sx-tl">Картинки (Яндекс) <select id="dkImg">${Object.entries(IMAGES).map(([k, v]) => `<option value="${k}" ${k === o.images ? "selected" : ""}>${v}</option>`).join("")}</select></label>
          <button class="btn sm ghost" id="dkRe" title="Заново составить план по конспекту с выбранными настройками">Составить план заново</button>
          <span class="small" id="dkCount"></span>
        </div>
        <ol class="deck-cards" id="dkList"></ol>
        <div class="mat-row"><button class="btn sm ghost" id="dkAdd">+ Карточка</button></div>
        <div class="pk-foot"><button class="btn flame" id="dkBuild">Собрать презентацию</button>${window.UCHU?.configured?.() ? `<label class="check"><input type="checkbox" id="dkAi"> Сжать формулировки нейросетью (дословные блоки не трогает)</label>` : ""}<span class="small" id="dkMsg">Текущие слайды заменятся; вернуть их можно кнопкой ↶.</span></div>
      </div></div>`);
    const list = $("#dkList", m);
    const draw = () => {
      list.innerHTML = cards.map((c, i) => {
        const vb = VERBATIM.has(c.kind);
        const text = vb ? (c.task || c.quote || c.poem || c.rule || "") : [c.lead, ...(c.points || [])].filter(Boolean).join("\n");
        return `<li class="dk-card${c.on === false ? " off" : ""}" draggable="true" data-i="${i}">
          <span class="dk-n">${i + 1}</span>
          <div class="dk-main">
            <div class="dk-row"><input type="checkbox" data-on ${c.on === false ? "" : "checked"} aria-label="Включить слайд"><input type="text" data-title value="${esc(c.title || "")}" aria-label="Заголовок"><select data-kind aria-label="Вид слайда">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}" ${k === c.kind ? "selected" : ""}>${v}</option>`).join("")}</select>
              <label class="dk-img" title="Картинка из Яндекса: запрос">🖼 <input type="text" data-img value="${esc(c.img || "")}" placeholder="без картинки"></label><button class="btn sm ghost" data-del aria-label="Удалить карточку">×</button></div>
            ${vb ? `<div class="dk-vb"><span class="tag">дословно</span> ${esc(text.slice(0, 260))}${text.length > 260 ? "…" : ""} <span class="small">(${text.length} зн.)</span></div>` : `<textarea data-pts rows="${Math.min(6, Math.max(2, (c.points || []).length + (c.lead ? 1 : 0)))}" aria-label="Тезисы, по одному в строке">${esc(text)}</textarea>`}
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
    const cur = () => ({ amount: $("#dkAmt", m).value, images: $("#dkImg", m).value });
    $("#dkAmt", m).onchange = $("#dkImg", m).onchange = () => saveOpts(cur());
    $("#dkRe", m).onclick = () => { saveOpts(cur()); cards = outline(L.docs.conspect || "", p, type, cur()); draw(); };
    $("#dkAdd", m).onclick = () => { cards.push({ id: "c" + Date.now(), on: true, kind: "cards", title: "Новый слайд", points: ["Тезис"] }); draw(); list.lastElementChild?.scrollIntoView({ block: "nearest" }); };
    $("#dkBuild", m).onclick = async () => {
      const btn = $("#dkBuild", m); btn.disabled = true; $("#dkMsg", m).textContent = "Собираю слайды и подбираю картинки в Яндексе…";
      saveOpts(cur());
      if ($("#dkAi", m)?.checked) { $("#dkMsg", m).textContent = "Нейросеть сжимает формулировки…"; cards = await condenseAi(cards, p, cur().amount); }
      L.deckOutline = cards;
      let md = toMarkdown(cards);
      md = await Media.autoFill(md).catch(() => md);
      if (window.SlideEditor) SlideEditor.replaceAll(md);
      closeModal(); toast("Презентация собрана по плану. Картинки можно заменить: щёлкните по картинке на слайде.", 6000);
    };
  }

  return { outline, toMarkdown, build, openOutline, verbatimMd, parseConspect, tight, opts, AMOUNT, IMAGES, KINDS, VERBATIM };
})();
window.Deck = Deck;
