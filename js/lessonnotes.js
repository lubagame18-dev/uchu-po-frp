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
      line = line.trim(); if (!line) continue;
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

  /* ---------- сборка ---------- */
  function build(techMd, p) {
    const md = String(techMd || ""), H = head(md), R = rows(md), ru = p.subject === "ru", K = p.plan?.kit;
    const ctx = { lc: 0, rule: "" };
    const rk = ru && p.plan?.rukit; if (rk?.algo) ctx.rule = rk.algo.steps.slice(1).join(" ");
    const imp = md.match(/> 💡 ВАЖНО:\s*([^\n]+)/); if (ru && !ctx.rule && imp && !/⟦/.test(imp[1])) ctx.rule = clean(imp[1].replace(/\*\([^)]*\)\*/g, ""));
    let out = `# ${H.title || p.topic}\n\n*Конспект урока для учителя*\n\n${H.meta ? H.meta + "\n\n" : ""}`;
    if (H.goal) out += `**Цель:** ${H.goal}\n\n`;
    if (H.equip) out += `**Оборудование:** ${H.equip}\n\n`;
    if (H.text) out += `**Текст для анализа:** ${H.text}\n\n`;
    if (H.book) out += `**Опора в учебнике:** ${H.book}\n\n`;
    if (!ru && K?.problem) out += `> ❓ **Проблемный вопрос урока:** ${K.problem}\n>\n> *Ответ, к которому приходим в конце:* ${K.answer || "главная мысль с опорой на 2–3 цитаты"}\n\n`;
    out += `---\n\n## Ход урока\n\n`;
    let ex = 0, fragDone = false;
    R.forEach((c, i) => {
      const stage = c[0] || `Этап ${i + 1}`, name = stage.replace(/\s*\(\d+\s*мин\)\s*$/, ""), min = (stage.match(/\((\d+)\s*мин\)/) || [])[1];
      const T = talk(c[1] || ""), students = ru ? c[2] : "";
      out += `### ${i + 1}. ${name}${min ? ` · ${min} мин` : ""}\n\n`;
      const notes = T.notes.filter(n => !/^Алгоритм «.*на слайде/.test(n));
      if (notes.length) out += notes.map(n => `📌 ${n}`).join("  \n") + "\n\n";
      const concl = conclusion(name, p, ctx), short = name.split(/[(:]/)[0].trim().slice(0, 48);
      if (T.qs.length) out += qaBox(`Задание ${i + 1} · ${short}`, T.qs, students, concl);
      else if (concl) out += box(`Задание ${i + 1} · ${short}`, [students ? `**👥 Ученики:** ${cell(students)}` : "", `**✅ Вывод (формулируют ученики, учитель уточняет):** ${cell(concl)}`]);
      const t = ru ? task(c[3] || "") : null;
      if (t && t.text && !/⟦/.test(t.text)) out += exBox(++ex, t, p);
      // литература: фрагменты текста — на первом аналитическом этапе
      if (!ru && K?.fragments?.length && !fragDone && /аналит|анализ|комментар|беседа/.test(low(name))) {
        fragDone = true;
        K.fragments.forEach((f, j) => {
          const qa = (K.qa.find(x => x.n === f.n) || { items: [] }).items;
          const quote = f.text.split("\n").filter(l => l.trim()).map(l => `<i>${cell(l)}</i>`).join("<br>");
          out += box(`${f.part ? "Часть" : "Фрагмент"} ${f.n}. ${f.label}${f.whole ? "" : ` (строки ${f.from}–${f.to})`}`, [quote, ...qa.flatMap(x => x.steps ? [`**❓ Беседа (от наблюдения к выводу):** ${x.steps.map((st, k) => `${k + 1}) ${cell(st)}`).join(" ")}`, `**🧭 Если затрудняются:** ${cell(x.hint)}`, `**🔒 Ориентир для учителя (не озвучивать):** ${cell(x.a)}`] : [`**❓ Вопрос учителя:** ${cell(x.q)}`, `**🔒 Ориентир для учителя:** ${cell(x.a)}`]), K.conclusions?.[j] ? `**✅ Вывод (формулируют ученики, учитель уточняет):** ${cell(K.conclusions[j])}` : ""]);
        });
      }
    });
    if (!R.length) out += "*Этапы урока не найдены — откройте технологическую карту.*\n\n";
    if (!ru && K?.glossary?.length) out += `## Словарная работа\n\n${K.glossary.map(g => `- **${g.word}** — ${g.def}`).join("\n")}\n\n`;
    if (!ru && K?.terms?.length) out += `## Термины (запись в тетрадь)\n\n${K.terms.map(t => `- **${t.term}** — ${t.def}${t.ex ? ` *(пример: «${t.ex.replace(/[«»]/g, "")}»)*` : ""}`).join("\n")}\n\n`;
    if (ru && rk?.theory?.length) out += `## Запись в тетрадь\n\n${rk.theory.map(x => "- " + x).join("\n")}\n\n`;
    if (!ru && K?.conclusions?.length) out += `## Выводы урока (запись в тетрадь)\n\n${K.conclusions.map(c => "- " + c).join("\n")}\n\n`;
    const hw = section(md, "Домашнее задание");
    if (hw) out += `## Домашнее задание\n\n${hw}\n`;
    return out.replace(/\n{3,}/g, "\n\n");
  }
  return { build, rows, talk };
})();
window.LessonNotes = LessonNotes;
