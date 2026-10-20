/* ===================================================================
   «Учу по ФРП» — вёрстка конспекта урока (все предметы).
   Образец — конспекты учителя: паспорт урока, план урока таблицей, блоки урока с полосой-заголовком,
   метки «Материал» и «Записывают», «▸ ПОИСК» — таблица «Учитель | Ученики», «▸ СЛОВО УЧИТЕЛЯ» — рамка,
   цветные рамки: «На доске», «Ответы», «Вывод», «Проблемный вопрос», «Установка на чтение», «Отрывок»,
   «Словарная работа», «Проговариваем вслух», «Рабочий лист», «Тетрадь».
   Разметка — обычный Markdown (рамка = таблица из одного столбца, заголовок столбца = вид рамки),
   поэтому конспект правится на сайте и выгружается в Word и PDF без потерь.
   =================================================================== */
const Layout = (() => {
  "use strict";
  const clean = s => String(s ?? "").replace(/\s+/g, " ").trim();
  const cell = s => String(s ?? "").replace(/\|/g, "∣").replace(/\n/g, "<br>").trim();
  const SUBJ = { ru: "русского языка", lit: "литературы", math: "математики", hist: "истории", eng: "английского языка", bio: "биологии" };

  /* ---------- виды рамок: по заголовку столбца ---------- */
  const KINDS = [
    ["word", /^▸?\s*слово учителя/i], ["self", /^▸?\s*самостоятельн/i], ["pairs", /^▸?\s*работа в пар/i], ["group", /^▸?\s*работа в групп/i],
    ["board", /^на доске|^запись на доске|^план\b|^алгоритм/i], ["answers", /^(🔑\s*)?(ответы|ключи?\b|ключ ответов)/i], ["concl", /^(вывод|понятие|правило|итог\b)/i],
    ["problem", /^(❓\s*)?проблемн/i], ["reading", /^установка на чтение/i], ["fragment", /^(отрывок|фрагмент|часть \d)/i], ["vocab", /^словарн/i],
    ["aloud", /^проговариваем/i], ["ws", /^рабочий лист/i], ["notebook", /^(тетрадь|запись в тетрадь)/i], ["hw", /^домашн/i], ["hint", /^если затрудня/i], ["safety", /^техника безопасн/i], ["lab", /^(лабораторная|практическая) работа/i]
  ];
  const kindOf = label => (KINDS.find(([, re]) => re.test(clean(label).replace(/^[^\wА-Яа-яЁё▸❓🔑]+/u, ""))) || ["box"])[0];
  const MARK = { search: "▸ ПОИСК", word: "▸ СЛОВО УЧИТЕЛЯ", self: "▸ САМОСТОЯТЕЛЬНАЯ РАБОТА", pairs: "▸ РАБОТА В ПАРАХ", group: "▸ РАБОТА В ГРУППАХ" };

  /* ---------- кирпичики Markdown ---------- */
  const md = {
    kicker: (p, kind = "Конспект урока") => `*${kind} ${SUBJ[p.subject] || ""} · ${p.grade} класс*\n\n`,
    passport: rows => { const R = rows.filter(r => r && clean(r[1])); if (!R.length) return ""; return `| ${cell(R[0][0])} | ${cell(R[0][1])} |\n|---|---|\n${R.slice(1).map(r => `| ${cell(r[0])} | ${cell(r[1])} |`).join("\n")}\n\n`; },
    plan: (rows, withMat = true) => `## План урока\n\n| № | Блок | Время${withMat ? " | Материал" : ""} |\n|---|---|---${withMat ? "|---" : ""}|\n${rows.map((r, i) => `| ${i + 1} | ${cell(r.name)} | ${r.min ? r.min + " мин" : "—"}${withMat ? ` | ${cell(r.mat || "—")}` : ""} |`).join("\n")}\n${rows.some(r => r.min) ? `|  | **Итого** | **${rows.reduce((s, r) => s + (+r.min || 0), 0)} мин**${withMat ? " | " : ""} |\n` : ""}\n`,
    legend: () => `*Как читать конспект: ▸ ПОИСК — ученики ищут ответ сами (слева вопрос учителя, справа ожидаемый ответ); ▸ СЛОВО УЧИТЕЛЯ — учитель объясняет сам; ▸ САМОСТОЯТЕЛЬНАЯ РАБОТА — ученики работают одни. «На доске» — что записать на доске, «Ответы» — эталон для учителя.*\n\n`,
    block: (n, title, min, word = "БЛОК") => `## ${word} ${n}. ${clean(title).toUpperCase()}${min ? ` · ${min} мин` : ""}\n\n`,
    sub: (num, title, min) => `### ${num}. ${clean(title)}${min ? ` (${min} мин)` : ""}\n\n`,
    meta: (mat, writes) => (mat ? `**Материал:** ${clean(mat)}  \n` : "") + (writes ? `**Записывают:** ${clean(writes)}` : "") + (mat || writes ? "\n\n" : ""),
    marker: k => `**${MARK[k] || k}**\n\n`,
    qa: (pairs, head = ["Учитель", "Ученики"]) => { const P = pairs.filter(x => clean(x[0])); if (!P.length) return ""; return `${md.marker("search")}| ${head[0]} | ${head[1]} |\n|---|---|\n${P.map(([q, a]) => `| ${cell(q)} | ${a ? `*${cell(a).replace(/\*/g, "")}*` : "*свободные ответы: выслушать 2–3 мнения*"} |`).join("\n")}\n\n`; },
    box: (label, lines) => { const L = (Array.isArray(lines) ? lines : [lines]).map(x => cell(x)).filter(Boolean); if (!L.length) return ""; return `| ${cell(label)} |\n|---|\n${L.map(l => `| ${l} |`).join("\n")}\n\n`; },
    result: t => t ? `*Результат блока: ${clean(t).replace(/^результат блока:\s*/i, "")}*\n\n` : ""
  };

  /* ---------- конспект предметных модулей (история, математика, английский, биология): пересборка в блоки ---------- */
  // строки рамки «**❓ Учитель:** …», «**💬 Ученики:** …», «**🔑 Ответы:** …», «**✅ Вывод:** …» → поиск, ответы, вывод
  const strip = s => String(s).replace(/^\*\*[^*]*\*\*\s*/, "").trim();
  const isQ = l => /^\*\*❓[^*]*\*\*/.test(l), isA = l => /^\*\*💬[^*]*\*\*/.test(l), isKey = l => /^\*\*🔑[^*]*\*\*/.test(l), isConcl = l => /^\*\*✅[^*]*\*\*/.test(l), isPlan = l => /^\*\*🧭[^*]*\*\*/.test(l);
  function tableAt(lines, i) { const t = []; while (i < lines.length && /^\|/.test(lines[i])) t.push(lines[i++]); return { t, i }; }
  const rowCells = r => r.replace(/^\|/, "").replace(/\|\s*$/, "").split("|").map(x => x.trim());
  function convertBox(title, body) {
    let out = ""; const qa = []; const rest = []; let keys = [], concl = [], plan = [];
    for (const l of body) {
      if (isQ(l)) { const q = strip(l); if (/^Вопрос урока/i.test(l.replace(/\*\*/g, "").replace(/^❓\s*/, ""))) { out += md.box("Проблемный вопрос (записать на доске)", [q]); continue; } qa.push([q, ""]); }
      else if (isA(l)) { if (qa.length && !qa[qa.length - 1][1]) qa[qa.length - 1][1] = strip(l); else qa.push(["", strip(l)]); }
      else if (isKey(l)) keys.push(strip(l));
      else if (isConcl(l)) concl.push(strip(l));
      else if (isPlan(l)) plan.push(strip(l));
      else rest.push(l.replace(/^📌\s*/, ""));
    }
    const k = kindOf(title);
    if (rest.length) out += ["box", "hint"].includes(k) && /разминк|диктант|самостоят|контрольн|проверочн|работа в групп/i.test(title) ? md.box(/групп/i.test(title) ? "▸ Работа в группах" : "▸ Самостоятельная работа", [`**${clean(title)}.** ` + rest[0], ...rest.slice(1)]) : md.box(k === "box" ? (/проблемная ситуация/i.test(title) ? "▸ Слово учителя" : title) : title, rest);
    const pairs = qa.filter(x => x[0]); if (pairs.length) out += md.qa(pairs);
    const loose = qa.filter(x => !x[0] && x[1]).map(x => x[1]); if (loose.length) out += md.box("Ученики", loose);
    if (plan.length) out += md.box("На доске", plan);
    if (keys.length) out += md.box("Ответы", keys);
    if (concl.length) out += md.box("Вывод", concl);
    return out;
  }
  function restyle(src, p, type) {
    const text = String(src || "");
    if (!text.trim() || /^## (БЛОК|ЭТАП) \d/m.test(text)) return text; // уже свёрстан
    const lines = text.split("\n");
    const title = ((text.match(/^#\s+(.+)$/m) || [])[1] || p.topic).trim();
    const metaLine = (text.match(/^\*\*Класс:\*\*(.+)$/m) || [])[1] || "";
    const typeName = (metaLine.match(/Тип урока:\*\*\s*([^·]+)/) || [])[1] || type?.name || "";
    const prob = (text.match(/^>\s*❓\s*\*\*Проблемный вопрос урока:\*\*\s*(.+)$/m) || [])[1] || "";
    const equip = (text.match(/^\*\*Оборудование:\*\*\s*(.+)$/m) || [])[1] || "";
    // этапы
    const st = []; let cur = null, tail = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i], h = l.match(/^###\s+(\d+)\.\s+(.+?)(?:\s*·\s*(\d+)\s*мин)?\s*$/);
      if (h) { cur = { name: h[2].trim(), min: h[3] || "", parts: [] }; st.push(cur); continue; }
      if (/^##\s/.test(l) && !/^##\s+Ход урока/.test(l)) { cur = null; tail.push(l); continue; }
      if (!cur) { if (st.length) tail.push(l); continue; }
      if (/^\|/.test(l)) { const r = tableAt(lines, i); i = r.i - 1; cur.parts.push({ table: r.t }); continue; }
      if (l.trim() && !/^---\s*$/.test(l)) cur.parts.push({ line: l.trim() });
    }
    if (!st.length) return text;
    const mat = s => { const t = s.parts.map(x => x.table ? x.table.join(" ") : x.line).join(" ").toLowerCase(); return [/учебник|параграф/.test(t) && "учебник", /карт[аеуы]/.test(t) && /истор/.test(p.subject) && "карта", /источник/.test(t) && "источник", /микроскоп|микропрепарат/.test(t) && "микроскоп", /рабочий лист|листе/.test(t) && "рабочий лист", /слайд|доск/.test(t) && "доска"].filter(Boolean).join(", ") || "беседа"; };
    let out = md.kicker(p) + `# ${title}\n\n`;
    out += md.passport([["Тип урока", typeName + (p.duration ? `. ${p.duration} минут` : "")], ["Проблемный вопрос", prob], ["Оборудование", equip]]);
    out += md.plan(st.map(s => ({ name: s.name, min: s.min, mat: mat(s) })));
    out += md.legend();
    st.forEach((s, i) => {
      out += md.block(i + 1, s.name, s.min);
      for (const part of s.parts) {
        if (part.line) { out += /^📌/.test(part.line) || /^✅|^\*\(|^—/.test(part.line) ? `${part.line.replace(/^📌\s*/, "")}\n\n` : `${part.line}\n\n`; continue; }
        const T = part.table, head = rowCells(T[0]);
        if (head.length !== 1) { out += T.join("\n") + "\n\n"; continue; }
        const body = T.slice(2).map(r => rowCells(r)[0]).flatMap(c => c.split(/<br>(?=\*\*[❓💬🔑✅🧭])/)).filter(Boolean);
        out += convertBox(head[0], body);
      }
    });
    if (tail.length) out += "\n" + tail.join("\n").replace(/^---\s*$/gm, "") + "\n";
    return out.replace(/\n{3,}/g, "\n\n");
  }

  /* ---------- оформление на сайте и в PDF: классы по содержимому ---------- */
  function decorate(root) {
    const first = root.firstElementChild;
    if (first && first.tagName === "P" && /^Конспект урока/.test(first.textContent.trim())) first.classList.add("lx-kicker");
    root.querySelectorAll("h2").forEach(h => { if (/^(БЛОК|ЭТАП)\s+\d/.test(h.textContent.trim())) { h.classList.add("lx-block"); const m = h.textContent.match(/·\s*(\d+\s*мин)\s*$/); if (m && !h.querySelector(".lx-min")) { h.innerHTML = h.innerHTML.replace(/\s*·\s*\d+\s*мин\s*$/, ""); const s = document.createElement("span"); s.className = "lx-min"; s.textContent = m[1]; h.appendChild(s); } } else if (/^План урока|^Ход урока/.test(h.textContent.trim())) h.classList.add("lx-h"); });
    root.querySelectorAll("p").forEach(p => {
      const t = p.textContent.trim();
      if (/^▸\s*(ПОИСК|СЛОВО УЧИТЕЛЯ|САМОСТОЯТЕЛЬНАЯ РАБОТА|РАБОТА В ПАРАХ|РАБОТА В ГРУППАХ)$/.test(t)) { p.classList.add("lx-mark", "lx-" + ({ "ПОИСК": "search", "СЛОВО УЧИТЕЛЯ": "word", "САМОСТОЯТЕЛЬНАЯ РАБОТА": "self", "РАБОТА В ПАРАХ": "pairs", "РАБОТА В ГРУППАХ": "pairs" }[t.replace(/^▸\s*/, "")])); }
      else if (/^(Материал|Записывают):/.test(t)) p.classList.add("lx-meta");
      else if (/^Как читать конспект/.test(t)) p.classList.add("lx-legend");
      else if (/^Результат блока:/.test(t)) p.classList.add("lx-result");
    });
    root.querySelectorAll("table").forEach(tb => {
      const th = [...tb.querySelectorAll("thead th")].map(x => x.textContent.trim());
      const wrap = tb.closest(".tblwrap");
      if (th.length === 1) { const k = kindOf(th[0]); tb.classList.add("lx-box", "lx-" + k); wrap?.classList.add("lx-boxwrap"); }
      else if (th.length === 2 && (/^(учитель|вопрос)/i.test(th[0]) && /^(ученики|ответ)/i.test(th[1]))) { tb.classList.add("lx-qa"); wrap?.classList.add("lx-boxwrap"); }
      else if (th[0] === "№" && /блок|этап/i.test(th[1] || "")) tb.classList.add("lx-plan");
      else if (th.length === 2 && /^(учебник|тип урока|класс|место урока|тема|предмет)$/i.test(th[0])) { tb.classList.add("lx-pass"); wrap?.classList.add("lx-boxwrap"); }
    });
  }

  /* ---------- Word: цвета рамок по виду ---------- */
  const DOCX = {
    word: { fill: "FFFFFF", line: "8A8FA3", label: "2448C4" }, self: { fill: "FFFFFF", line: "8A8FA3", label: "277A4D" }, pairs: { fill: "FFFFFF", line: "8A8FA3", label: "277A4D" }, group: { fill: "FFFFFF", line: "8A8FA3", label: "277A4D" },
    board: { fill: "F1EEFB", line: "6B4FBB", label: "6B4FBB" }, answers: { fill: "FFF6D6", line: "E2C25A", label: "9A6B00" }, concl: { fill: "FFF6D6", line: "E2C25A", label: "9A6B00" },
    problem: { fill: "FDECF1", line: "C2185B", label: "C2185B" }, reading: { fill: "EEF4FD", line: "9DB7E6", label: "2448C4" }, fragment: { fill: "F6F6F8", line: "6B4FBB", label: "6B6F80" },
    vocab: { fill: "EEF8F0", line: "9BCFA6", label: "277A4D" }, aloud: { fill: "F4EEFC", line: "9C7BD6", label: "6B4FBB" }, ws: { fill: "F2F2F2", line: "333333", label: "333333" },
    notebook: { fill: "FFFFFF", line: "777777", label: "333333", dash: true }, hw: { fill: "F1EEFB", line: "6B4FBB", label: "6B4FBB" }, hint: { fill: "FFFFFF", line: "BBBBBB", label: "6B6F80" },
    safety: { fill: "FDECEC", line: "C63A2F", label: "C63A2F" }, lab: { fill: "FFFFFF", line: "277A4D", label: "277A4D" }, box: { fill: "FFFFFF", line: "9AA3B2", label: "4A4F63" }
  };
  const docxKind = label => DOCX[kindOf(label)] || DOCX.box;

  return { md, restyle, decorate, kindOf, docxKind, cell, clean, KINDS };
})();
window.Layout = Layout;
