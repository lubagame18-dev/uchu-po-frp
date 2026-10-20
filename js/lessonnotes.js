/* ===================================================================
   «Учу по ФРП» — конспект урока для учителя (удобный для печати).
   Строится из технологической карты того же урока, но без колонок и без
   результатов ФРП: этапы идут по порядку, каждое задание — в своей рамке.
   • Общий формат рамки: название задания, вопрос учителя, ожидаемый ответ
     ученика, вывод учителя.
   • Упражнение по русскому языку: слева задание, справа алгоритм решения,
     ниже — ключи.
   • Литература: фрагменты текста с вопросами и ответами, вывод после каждой части.
   =================================================================== */
const LessonNotes = (() => {
  "use strict";
  const clean = s => String(s || "").replace(/\s+/g, " ").trim();
  const cell = s => clean(s).replace(/\|/g, "∣");
  const low = s => String(s || "").toLowerCase();

  /* ---------- разбор техкарты ---------- */
  function head(md) {
    const pick = re => (md.match(re) || [])[1] || "";
    return {
      title: pick(/^#\s+(.+)$/m),
      meta: pick(/^(\*\*Класс:\*\*.+)$/m),
      goal: pick(/\*\*Цель:\*\*\s*([^\n]+)/),
      equip: pick(/\*\*Оборудование:\*\*\s*([^\n]+)/),
      text: pick(/\*\*Текст для анализа:\*\*\s*([^\n]+)/),
      book: pick(/\*\*Опора в учебнике:\*\*\s*([^\n]+)/)
    };
  }
  function section(md, title) {
    const i = md.search(new RegExp("^##\\s+" + title, "m")); if (i < 0) return "";
    const rest = md.slice(i).replace(/^##[^\n]*\n/, "");
    const j = rest.search(/^##\s|^---\s*$/m);
    return (j < 0 ? rest : rest.slice(0, j)).trim();
  }
  function rows(md) {
    const i = md.search(/^##\s+Технологическая карта/m); if (i < 0) return [];
    const out = [];
    for (const line of md.slice(i).split("\n").slice(1)) {
      if (/^##\s/.test(line)) break;
      if (!/^\|/.test(line) || /^\|\s*-+/.test(line)) continue;
      const c = line.replace(/^\|/, "").replace(/\|\s*$/, "").split("|").map(x => x.trim());
      if (/^Этап/.test(c[0])) continue;
      out.push(c);
    }
    return out;
  }
  /* реплики учителя → вопросы с ожидаемыми ответами и пометки */
  function talk(cellText) {
    const qs = [], notes = [];
    const ans = s => { const m = s.match(/\*\((?:(?:Ожидаемый ответ|Ориентир для учителя|Ориентир):\s*)?([^)]*(?:\([^)]*\)[^)]*)*)\)\*\s*$/); return m ? [s.slice(0, m.index).trim(), clean(m[1])] : [s.trim(), ""]; };
    for (let line of String(cellText).split(/<br\s*\/?>/i)) {
      line = line.replace(/\*?\((?:Наводящий вопрос|Если затрудняются)[^)]*\)\*?/gi, "").trim(); if (!line) continue;
      if (/^[^\wА-Яа-яЁё]*(↳\s*)?(Если (ученики )?затрудня|Если не (ответ|справ)|Наводящий вопрос)/i.test(line)) continue;
      if (/^\*\(/.test(line) && qs.length) { qs[qs.length - 1].a = clean(ans(line)[1] || line.replace(/^\*\(|\)\*$/g, "")); continue; }
      let pre = "";
      const k = line.indexOf(" — "); if (!/^—/.test(line) && k > 0 && /\?/.test(line.slice(k))) { pre = line.slice(0, k).trim(); line = line.slice(k + 1).trim(); }
      if (pre) notes.push(pre);
      if (/^—/.test(line)) { const [q, a] = ans(line.replace(/^—\s*/, "")); qs.push({ q, a: /^ответы учеников$|^целевая установка/i.test(a) ? "" : a }); }
      else notes.push(line);
    }
    return { qs, notes };
  }
  function task(cellText) {
    const m = String(cellText).match(/\*\*Задание\*\*\s*\*\(источник:\s*([^)]*)\)\*:?\s*(?:<br>)?([\s\S]*)$/);
    if (m) return { src: clean(m[1]), text: m[2].split(/<br\s*\/?>/i).map(x => x.trim()).filter(Boolean).join("<br>") };
    const g = String(cellText).match(/\*\*Задание:\*\*\s*([\s\S]*)$/);
    return g ? { src: "", text: clean(g[1]) } : null;
  }

  /* ---------- выводы учителя ---------- */
  function conclusion(stage, p, ctx) {
    const s = low(stage), RK = p.plan?.rukit, K = p.plan?.kit;
    if (p.subject === "lit") {
      if (/итог|рефлекс|вывод|синтез|обобщ/.test(s) && K?.answer) return K.answer;
      if (/аналит|анализ|беседа|комментар|сравн|сопостав|композиц/.test(s) && K?.conclusions?.length) return K.conclusions[ctx.lc++ % K.conclusions.length];
      if (/мотивац|организац/.test(s) && K?.problem) return `Главный вопрос урока: ${K.problem}`;
      if (/восприят|чтени/.test(s)) return "Первое впечатление записали — проверим его анализом текста.";
      if (/аналит|анализ|беседа|комментар/.test(s)) return "Записываем вывод: как устроен текст (композиция, образы, средства) и что этим хочет сказать автор.";
      if (/мотивац/.test(s)) return "Ставим цель: ответить на главный вопрос урока — к концу урока вернёмся к нему.";
      if (/синтез/.test(s)) return "Формулируем тему и идею стихотворения, называем лирического героя и жанр.";
      return "";
    }
    const rule = ctx.rule || (RK?.algo ? RK.algo.steps.slice(1).join(" ") : "");
    if (/мотивац|самоопредел/.test(s)) return "Чтобы ответить точно, нужно знать правило — это и есть задача нашего урока.";
    if (/актуализ|пробн/.test(s)) return "Знаний, которые у нас есть, не хватило — значит, сегодня узнаём новое.";
    if (/выявлени|затруднен/.test(s)) return "Мы не знаем, по какому условию делать выбор. Это и выясним.";
    if (/построени|проект выхода|постановк/.test(s)) return "План: наблюдаем → формулируем правило → составляем алгоритм → тренируемся.";
    if (/реализац|открыти|изучени|нового/.test(s)) return rule ? `Правило: ${rule}` : "Правило сформулировали и сверили с учебником.";
    if (/первичн|закреплен|проговарив|тренинг/.test(s)) return RK?.algo ? `Рассуждаем по алгоритму «${RK.algo.name}» — тогда ошибок нет.` : "Рассуждаем по правилу — тогда ошибок нет.";
    if (/самостоятел|самопровер|эталон|контрол/.test(s)) return "Сверились с эталоном: ошибки разобрали, правило работает.";
    if (/включени|повторени|систем/.test(s)) return "Новое правило связано с тем, что мы уже знаем, и пригодится в любом тексте.";
    if (/рефлекс|итог/.test(s)) { const g = window.Deck?.childGoal ? Deck.childGoal(p, {}) : null; return g?.points?.length ? "Сегодня мы " + g.points.map(x => x.replace(/^\S/, c => c.toLowerCase())).join(", ") + "." : "Подводим итог: что узнали и чему научились."; }
    if (/домашн/.test(s)) return "";
    return "";
  }

  /* ---------- рамки ---------- */
  const box = (title, lines) => `| ${cell(title)} |\n|---|\n${lines.filter(Boolean).map(l => `| ${l} |`).join("\n")}\n\n`;
  function qaBox(title, qs, students, concl) {
    const lines = [];
    qs.forEach((x, i) => { lines.push(`**❓ Вопрос учителя${qs.length > 1 ? " " + (i + 1) : ""}:** ${cell(x.q)}`); lines.push(`**💬 Ответы учеников (ориентир):** ${x.a ? cell(x.a) : `<i>${cell(students || "свободные ответы; выслушать 2–3 мнения, не оценивать сразу")}</i>`}`); });
    if (concl) lines.push(`**✅ Вывод (формулируют ученики, учитель уточняет):** ${cell(concl)}`);
    return box(title, lines);
  }
  function exBox(n, t, p) {
    const RK = p.plan?.rukit, algo = RK?.algo;
    const steps = algo ? algo.steps.map((s, i) => `${i + 1}) ${cell(s)}`).join("<br>") : "1) Прочитайте задание и найдите, к какому правилу оно относится.<br>2) Примените правило к каждому примеру.<br>3) Проверьте себя по образцу.";
    const keys = [t.src ? `по ключу пособия (${cell(t.src)})` : "", algo?.ex?.length ? `образцы: ${cell(algo.ex.join("; "))}` : ""].filter(Boolean).join("; ");
    const text = String(t.text || "").split("<br>").map(x => cell(x)).join("<br>");
    return `| 📝 Упражнение ${n}${t.src ? ` · ${cell(t.src)}` : ""} | 🧭 Алгоритм решения${algo ? ` «${cell(algo.name)}»` : ""} |\n|---|---|\n| <span class="nw">${text}</span> | ${steps} |\n| **🔑 Ключи:** ${keys || "проверить по правилу; ответы — на листе «Ответы» рабочего листа"} |  |\n\n`;
  }

  /* ---------- сборка: вёрстка по образцу конспектов учителя (Layout) ---------- */
  const strip = s => String(s || "").replace(/<br\s*\/?>/gi, " ").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  function build(techMd, p) {
    const md = String(techMd || ""), H = head(md), R = rows(md), ru = p.subject === "ru", K = p.plan?.kit, X = Layout.md;
    const ctx = { lc: 0, rule: "" };
    const rk = ru && p.plan?.rukit; if (rk?.algo) ctx.rule = rk.algo.steps.slice(1).join(" ");
    const imp = md.match(/> 💡 ВАЖНО:\s*([^\n]+)/); if (ru && !ctx.rule && imp && !/⟦/.test(imp[1])) ctx.rule = clean(imp[1].replace(/\*\([^)]*\)\*/g, ""));
    const typeName = (H.meta.match(/Тип урока:\*\*\s*([^·]+)/) || [])[1] || p.type?.name || "";
    const prob = !ru && K?.problem ? K.problem : (md.match(/Проблемный вопрос[^:\n]*:\**\s*([^\n]+)/) || [])[1] || "";
    let out = X.kicker(p) + `# ${H.title || p.topic}\n\n`;
    out += X.passport([["Учебник", H.book], ["Тип урока", clean(typeName) + `. ${p.duration || 45} минут`], ["Цель", H.goal], ["Проблемный вопрос", strip(prob)], ["Понятия урока", !ru && K?.terms?.length ? "вводятся по ходу работы с текстом: " + K.terms.map(t => t.term).join(", ") : ""], ["Текст", H.text], ["Что нужно", H.equip]]);
    // план урока
    const st = R.map((c, i) => {
      const stage = c[0] || `Этап ${i + 1}`, name = stage.replace(/\s*\(\d+\s*мин\)\s*$/, ""), min = (stage.match(/\((\d+)\s*мин\)/) || [])[1] || "";
      const t = ru ? task(c[3] || "") : null;
      const side = strip(ru ? c[3] : c[2]);
      const mat = t?.src ? t.src : /рабоч[а-я]* лист/i.test(side) ? "рабочий лист" : /слайд|доск/i.test(side + c[1]) ? "доска, слайд" : !ru && K?.fragments?.length && /аналит|анализ|комментар|беседа/i.test(name) ? "текст произведения" : "беседа";
      return { c, name, min, t, side, mat };
    });
    if (st.length) out += X.plan(st.map(s => ({ name: s.name.split(/[(:]/)[0].trim(), min: s.min, mat: s.mat })));
    out += X.legend();
    let ex = 0, fragDone = false;
    st.forEach((S, i) => {
      const { c, name, min, t, side } = S, T = talk(c[1] || ""), students = ru ? strip(c[2]) : "";
      const short = name.split(/[(]/)[0].trim();
      out += X.block(i + 1, short, min);
      const writes = (strip(c[1]).match(/[Зз]апиш(?:ите|ем)\s+([^.?!]{4,80})/) || [])[1] || "";
      out += X.meta(S.mat !== "беседа" ? S.mat : "", writes);
      // слово учителя: переходы, пояснения (без вариантов «если не ответили…»)
      const word = [];
      for (const n of T.notes) {
        if (/^Алгоритм «.*на слайде/.test(n) || /если затрудня|если не (ответ|справ)|наводящ/i.test(n)) continue;
        word.push(n.replace(/^🔗\s*\*?Переход:\*?\s*/, "").replace(/^📌\s*/, ""));
      }
      if (word.length) out += X.row("Учитель", word);
      // вопрос учителя — рядом ответ учеников
      if (T.qs.length) out += X.qa(T.qs.map((x, k) => [x.q, x.a || (k === 0 && students ? students : "")]));
      // рабочий лист
      if (/рабоч[а-я]* лист/i.test(side)) out += X.row("Рабочий лист", side.replace(/^.*?(рабоч[а-я]* лист)/i, (m, a) => a.replace(/^./, ch => ch.toUpperCase())));
      // упражнение — рядом алгоритм его выполнения, ниже ответы
      if (t && t.text && !/⟦/.test(t.text)) {
        ex++;
        const algo = rk?.algo;
        const L0 = String(t.text).split("<br>").map(x => clean(x)).filter(Boolean);
        const lines = L0.length > 9 ? [...L0.slice(0, 8), "*…полностью — в учебнике и на рабочем листе*"] : L0;
        const steps = algo ? algo.steps : ["Прочитай задание, найди, что нужно сделать.", ctx.rule ? `Вспомни правило: ${ctx.rule}` : "Вспомни правило урока.", "Выполни задание по правилу для каждого примера.", "Обозначь графически то, что требует задание.", "Проверь себя: перечитай и сверь с правилом."];
        out += X.ex(`Упражнение ${ex}${t.src ? ` · ${t.src}` : ""}`, lines, steps, algo?.name);
        out += X.row("Ответы", [t.src ? `по ключу пособия (${t.src})` : "проверить по правилу", algo?.ex?.length ? `образцы: ${algo.ex.join("; ")}` : ""].filter(Boolean).join("; "));
      }
      // литература: работа с фрагментами текста — по блокам: установка на чтение → отрывок → словарная работа → вопросы → вывод
      if (!ru && K?.fragments?.length && !fragDone && /аналит|анализ|комментар|беседа/.test(low(name))) {
        fragDone = true;
        K.fragments.forEach((f, j) => {
          const qa = (K.qa.find(x => x.n === f.n) || { items: [] }).items;
          out += X.sub(`${i + 1}.${j + 1}`, `${f.part ? "Часть" : "Фрагмент"} ${f.n}. ${f.label}`);
          const firstQ = qa[0] ? (qa[0].steps ? qa[0].steps[0] : qa[0].q) : "";
          out += X.box("Установка на чтение", [`Прочитаем ${f.part ? "эту часть" : "фрагмент"}${f.whole ? "" : ` (строки ${f.from}–${f.to})`}.${firstQ ? ` Обратите внимание, чтобы потом ответить: ${clean(firstQ)}` : ""}`]);
          out += X.box(`Отрывок ${f.n}. ${f.label}`, f.text.split("\n").filter(l => l.trim()).map(l => `*${clean(l)}*`));
          const gl = (K.glossary || []).filter(g => low(f.text).includes(low(g.word).slice(0, Math.max(4, g.word.length - 2))));
          if (gl.length) out += X.box("Словарная работа", gl.map(g => `**${g.word}** — ${g.def}`));
          const pairs = qa.flatMap(x => x.steps ? x.steps.map((q, k) => [q, k === x.steps.length - 1 ? x.a : ""]) : [[x.q, x.a]]);
          out += X.qa(pairs, ["Вопрос, задание учителя", "Ответ учеников"]);
          if (K.conclusions?.[j]) out += X.box("Вывод", [`Учитель: «${clean(K.conclusions[j])}»`]);
        });
        // понятия — после наблюдения над текстом, с проговариванием вслух
        (K.terms || []).slice(0, 4).forEach(tm => { out += X.box(`Понятие «${tm.term}»`, [`Учитель: «${tm.def.replace(/^./, ch => ch.toUpperCase())}${tm.ex ? `. Вспомним строки: «${tm.ex.replace(/[«»]/g, "")}»` : ""}»`]); out += X.box("Проговариваем вслух", [`Учитель: «Как называется этот приём?» — Класс: «${tm.term}».`]); });
      }
      const concl = conclusion(name, p, ctx);
      if (concl && !(fragDone && /аналит|анализ|комментар|беседа/.test(low(name)))) out += X.box("Вывод", [concl]);
    });
    if (!R.length) out += "*Этапы урока не найдены — откройте технологическую карту.*\n\n";
    if (!ru && K?.glossary?.length && !K?.fragments?.length) out += X.box("Словарная работа", K.glossary.map(g => `**${g.word}** — ${g.def}`));
    if (ru && rk?.theory?.length) out += X.box("Тетрадь · запись на уроке", rk.theory);
    if (!ru && K?.conclusions?.length) out += X.box("Тетрадь · выводы урока", K.conclusions);
    const hw = section(md, "Домашнее задание");
    if (hw) out += X.box("Домашнее задание", hw.split("\n").map(x => x.replace(/^[-*]\s*/, "").trim()).filter(Boolean));
    return Layout.merge(out);
  }
  return { build, rows, talk };
})();
window.LessonNotes = LessonNotes;
