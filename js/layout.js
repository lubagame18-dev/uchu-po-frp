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
  const SUBJ = { ru: "русского языка", lit: "литературы", math: "математики", hist: "истории", eng: "английского языка", bio: "биологии", geo: "географии", phys: "физики" };

  /* ---------- виды рамок: по заголовку столбца ---------- */
  const KINDS = [
    ["word", /^▸?\s*слово учителя/i], ["self", /^▸?\s*самостоятельн/i], ["pairs", /^▸?\s*работа в пар/i], ["group", /^▸?\s*работа в групп/i],
    ["board", /^на доске|^запись на доске|^план\b|^алгоритм/i], ["answers", /^(🔑\s*)?(ответы|ключи?(?![а-яё]))/i], ["concl", /^(вывод|понятие|правило|итог\b)/i],
    ["problem", /^(❓\s*)?проблемн/i], ["reading", /^установка на чтение/i], ["fragment", /^(отрывок|фрагмент|часть \d)/i], ["vocab", /^словарн/i],
    ["aloud", /^проговариваем/i], ["ws", /^рабочий лист/i], ["notebook", /^(тетрадь|запись в тетрадь)/i], ["hw", /^домашн/i], ["hint", /^если затрудня/i], ["safety", /^техника безопасн/i], ["lab", /^(лабораторная|практическая) работа/i]
  ];
  const kindOf = label => (KINDS.find(([, re]) => re.test(clean(label).replace(/^[^\wА-Яа-яЁё▸❓🔑]+/u, ""))) || ["box"])[0];
  const MARK = { search: "▸ ПОИСК", word: "▸ СЛОВО УЧИТЕЛЯ", self: "▸ САМОСТОЯТЕЛЬНАЯ РАБОТА", pairs: "▸ РАБОТА В ПАРАХ", group: "▸ РАБОТА В ГРУППАХ" };

  /* ---------- метки слева (как в конспекте учителя: УЧИТЕЛЬ, В ТЕТРАДЬ, СЛОВАРЬ, ОТВЕТЫ…) ---------- */
  const LABEL = { word: "УЧИТЕЛЬ", self: "САМОСТОЯТЕЛЬНО", pairs: "В ПАРАХ", group: "В ГРУППАХ", answers: "ОТВЕТЫ", notebook: "В ТЕТРАДЬ", vocab: "СЛОВАРЬ", aloud: "ПРОГОВАРИВАЕМ", ws: "РАБОЧИЙ ЛИСТ", hw: "ДОМАШНЕЕ ЗАДАНИЕ", problem: "ПРОБЛЕМНЫЙ ВОПРОС", reading: "ПЕРЕД ЧТЕНИЕМ", fragment: "ЧИТАЕМ", safety: "ТЕХНИКА БЕЗОПАСНОСТИ", lab: "РАБОТА" };
  const isLabel = s => { const t = clean(s); return !!t && /[А-ЯЁ]/.test(t) && !/[а-яё]/.test(t) && t.length <= 40; };
  function labelOf(title) {
    const t = clean(title).replace(/^[▸❓🔑📝🧭✅📌\s]+/u, ""), k = kindOf(t);
    if (k === "hint") return null;
    if (LABEL[k]) return { label: LABEL[k], lead: ["fragment", "lab"].includes(k) || (["self", "pairs", "group"].includes(k) && !/^(самостоятельная работа|работа в (парах|группах))$/i.test(t)) ? t : "" };
    if (k === "board") return /^(на доске|запись на доске)/i.test(t) ? { label: "НА ДОСКЕ", lead: "" } : { label: "НА ДОСКЕ", lead: t };
    if (k === "concl") { const m = t.match(/^(понятие|правило)\s*(.*)$/i); return m ? { label: m[1].toUpperCase(), lead: m[2] } : { label: "ВЫВОД", lead: "" }; }
    if (t.length <= 22) return { label: t.toUpperCase(), lead: "" };
    return { label: "ХОД РАБОТЫ", lead: t };
  }
  const LEGEND = "Метки слева: УЧИТЕЛЬ — что сказать; НА ДОСКЕ и В ТЕТРАДЬ — что записать; СЛОВАРЬ — непонятные слова; ОТВЕТЫ — ключ для учителя. В таблице «Вопрос учителя — Ответ учеников» ответ стоит рядом с вопросом; в таблице «Упражнение — Алгоритм» рядом с заданием порядок его выполнения.";

  const short = n => { const t = clean(n).replace(/[:,(].*$/, "").trim(); if (t.length <= 30) return t; const w = t.split(" "); let o = ""; for (const x of w) { if ((o + " " + x).trim().length > 28) break; o = (o + " " + x).trim(); } return o + "…"; };
  /* ---------- кирпичики Markdown ---------- */
  const md = {
    kicker: (p, kind = "Конспект урока") => `*${kind} ${SUBJ[p.subject] || ""} · ${p.grade} класс*\n\n`,
    passport: (rows, noLegend) => { const R = rows.filter(r => r && clean(r[1])); if (!noLegend) R.push(["Как читать конспект", LEGEND]); return `| ${cell(R[0][0])} | ${cell(R[0][1])} |\n|---|---|\n${R.slice(1).map(r => `| ${cell(r[0])} | ${cell(r[1])} |`).join("\n")}\n\n`; },
    // полоска этапов вместо плана: «Этап 1 · 5 мин» / название
    plan: rows => rows.length ? `| ${rows.map((r, i) => `Этап ${i + 1}${r.min ? ` · ${r.min} мин` : ""}`).join(" | ")} |\n|${rows.map(() => "---").join("|")}|\n| ${rows.map(r => cell(short(r.name))).join(" | ")} |\n\n` : "",
    legend: () => "",
    block: (n, title, min) => `## ЭТАП ${n}. ${clean(title).replace(/^./, c => c.toUpperCase())}${min ? ` · ${min} мин` : ""}\n\n`,
    sub: (num, title, min) => `### ${num}. ${clean(title)}${min ? ` (${min} мин)` : ""}\n\n`,
    meta: (mat, writes) => (mat ? md.row("Материал", mat) : "") + (writes ? md.row("В тетрадь", writes) : ""),
    marker: () => "",
    // строка с меткой слева; соседние строки потом сливаются в одну таблицу
    row: (label, text) => { const t = Array.isArray(text) ? text.map(x => cell(x)).filter(Boolean).join("<br>") : cell(text); if (!t) return ""; return `| ${clean(label).toUpperCase()} | ${t} |\n|---|---|\n\n`; },
    qa: (pairs, head = ["Вопрос учителя", "Ответ учеников"]) => { const P = pairs.filter(x => clean(x[0])); if (!P.length) return ""; return `| ${head[0]} | ${head[1]} |\n|---|---|\n${P.map(([q, a], i) => `| ${P.length > 1 ? `${i + 1}) ` : ""}${cell(q)} | ${a ? `*${cell(a).replace(/\*/g, "")}*` : "*высказывают своё мнение*"} |`).join("\n")}\n\n`; },
    // упражнение и рядом алгоритм его выполнения
    ex: (title, lines, steps, algoName) => `| ${cell(title)} | Алгоритм выполнения${algoName ? ` «${cell(algoName)}»` : ""} |\n|---|---|\n| ${lines.map(x => cell(x)).filter(Boolean).join("<br>")} | ${steps.map((s, i) => `${i + 1}) ${cell(String(s).replace(/^\d+[.)]\s*/, ""))}`).join("<br>")} |\n\n`,
    box: (label, lines) => {
      const L = (Array.isArray(lines) ? lines : [lines]).map(x => cell(x)).filter(Boolean); if (!L.length) return "";
      const lb = labelOf(label); if (!lb) return "";
      const body = (lb.lead ? [`**${cell(lb.lead)}**`] : []).concat(L);
      // длинные пункты — отдельными строками, короткие — в одной клетке
      if (body.some(x => /<br>/.test(x)) && body.length > 1) return `| ${lb.label} | ${body[0]} |\n|---|---|\n${body.slice(1).map(x => `|  | ${x} |`).join("\n")}\n\n`;
      return `| ${lb.label} | ${body.join("<br>")} |\n|---|---|\n\n`;
    },
    result: t => t ? `*Результат этапа: ${clean(t).replace(/^результат (блока|этапа):\s*/i, "")}*\n\n` : ""
  };
  // соседние таблицы с метками слева → одна таблица этапа
  function merge(text) {
    const B = String(text).split(/\n{2,}/), out = [];
    const isRows = b => { const L = b.split("\n"); if (L.length < 2 || L[1] !== "|---|---|") return false; const c = L[0].replace(/^\|/, "").replace(/\|\s*$/, "").split("|"); return c.length === 2 && isLabel(c[0]); };
    for (const b of B) {
      if (isRows(b) && out.length && isRows(out[out.length - 1])) { const L = b.split("\n"); out[out.length - 1] += "\n" + [L[0], ...L.slice(2)].filter(Boolean).join("\n"); }
      else out.push(b);
    }
    return out.join("\n\n").replace(/\n{3,}/g, "\n\n");
  }

  /* ---------- конспект предметных модулей (история, математика, английский, биология): пересборка в блоки ---------- */
  // строки рамки «**❓ Учитель:** …», «**💬 Ученики:** …», «**🔑 Ответы:** …», «**✅ Вывод:** …» → поиск, ответы, вывод
  const strip = s => String(s).replace(/^\*\*[^*]*\*\*\s*/, "").trim();
  const isQ = l => /^\*\*❓[^*]*\*\*/.test(l), isA = l => /^\*\*💬[^*]*\*\*/.test(l), isKey = l => /^\*\*🔑[^*]*\*\*/.test(l), isConcl = l => /^\*\*✅[^*]*\*\*/.test(l), isPlan = l => /^\*\*🧭[^*]*\*\*/.test(l);
  function tableAt(lines, i) { const t = []; while (i < lines.length && /^\|/.test(lines[i])) t.push(lines[i++]); return { t, i }; }
  const rowCells = r => r.replace(/^\|/, "").replace(/\|\s*$/, "").split("|").map(x => x.trim());
  function convertBox(title, body) {
    let out = ""; const qa = []; const rest = []; let keys = [], concl = [], plan = [];
    for (const l of body) {
      if (isQ(l)) { const q = strip(l); if (/^Вопрос урока/i.test(l.replace(/\*\*/g, "").replace(/^❓\s*/, ""))) { out += md.box("Проблемный вопрос", [`**${q}** (записать на доске)`]); continue; } qa.push([q, ""]); }
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
    // конспект без меток «Учитель / На доске / Ответы» (например, свёрстанный двумя столбцами): подсказка о метках не нужна
    const plain = !st.some(s => s.parts.some(x => x.line || (x.table && rowCells(x.table[0]).length === 1)));
    out += md.passport([["Тип урока", typeName + (p.duration ? `. ${p.duration} минут` : "")], ["Проблемный вопрос", prob], ["Что нужно", equip]], plain);
    out += md.plan(st.map(s => ({ name: s.name, min: s.min, mat: mat(s) })));
    if (!plain) out += md.legend();
    st.forEach((s, i) => {
      out += md.block(i + 1, s.name, s.min);
      for (const part of s.parts) {
        if (part.line) { const L0 = part.line.replace(/^📌\s*/, ""); if (/если затрудня/i.test(L0)) continue; out += /^✅/.test(L0) ? md.row("Вывод", L0.replace(/^✅\s*(\*?Вывод[^:]*:\*?\s*)?/, "")) : md.row("Учитель", L0); continue; }
        const T = part.table, head = rowCells(T[0]);
        if (head.length !== 1) { out += T.join("\n") + "\n\n"; continue; }
        const body = T.slice(2).map(r => rowCells(r)[0]).flatMap(c => c.split(/<br>(?=\*\*[❓💬🔑✅🧭])/)).filter(Boolean);
        out += convertBox(head[0], body);
      }
    });
    if (tail.length) out += "\n" + tail.join("\n").replace(/^---\s*$/gm, "") + "\n";
    return merge(out);
  }

  /* ---------- оформление на сайте и в PDF: классы по содержимому (текст не меняется) ---------- */
  function decorate(root) {
    const first = root.firstElementChild;
    if (first && first.tagName === "P" && /^Конспект урока/.test(first.textContent.trim())) first.classList.add("lx-kicker");
    root.querySelectorAll("h2").forEach(h => {
      const t = h.textContent.trim();
      if (/^(БЛОК|ЭТАП)\s+\d/.test(t)) {
        h.classList.add("lx-block");
        if (!h.querySelector(".lx-no") && h.childNodes.length === 1 && h.firstChild.nodeType === 3) {
          const m = t.match(/^((?:БЛОК|ЭТАП)\s+\d+\.?)\s*(.*?)(\s*·\s*\d+\s*мин)?$/);
          if (m) { h.textContent = ""; const a = document.createElement("span"); a.className = "lx-no"; a.textContent = m[1]; const b = document.createElement("span"); b.className = "lx-t"; b.textContent = " " + m[2]; h.append(a, b); if (m[3]) { const c = document.createElement("span"); c.className = "lx-min"; c.textContent = m[3]; h.append(c); } }
        }
      } else if (/^План урока|^Ход урока/.test(t)) h.classList.add("lx-h");
    });
    root.querySelectorAll("p").forEach(p => {
      const t = p.textContent.trim();
      if (/^(Материал|Записывают):/.test(t)) p.classList.add("lx-meta");
      else if (/^Как читать конспект/.test(t)) p.classList.add("lx-legend");
      else if (/^Результат (блока|этапа):/.test(t)) p.classList.add("lx-result");
    });
    root.querySelectorAll("table").forEach(tb => {
      const th = [...tb.querySelectorAll("thead th")].map(x => x.textContent.trim());
      const wrap = tb.closest(".tblwrap"); wrap?.classList.add("lx-boxwrap");
      if (th.length === 1) tb.classList.add("lx-box", "lx-" + kindOf(th[0]));
      else if (th.length === 2 && isLabel(th[0])) { tb.classList.add("lx-rows"); tb.querySelectorAll("tr").forEach(tr => { const c = tr.firstElementChild; const k = clean(c?.textContent); if (/^(В ТЕТРАДЬ|НА ДОСКЕ)$/.test(k)) tr.classList.add("lx-write"); if (!k) tr.classList.add("lx-cont"); }); }
      else if (th.length === 2 && /^(учитель|вопрос)/i.test(th[0]) && /^(ученики|ответ)/i.test(th[1])) tb.classList.add("lx-qa");
      else if (th.length === 2 && /^(упражнение|задание)/i.test(th[0]) && /^алгоритм/i.test(th[1])) tb.classList.add("lx-ex");
      else if (/^Этап 1\b/.test(th[0] || "")) tb.classList.add("lx-strip");
      else if (th[0] === "№" && /блок|этап/i.test(th[1] || "")) tb.classList.add("lx-plan");
      else if (th.length === 2 && /^(цель|учебник|тип урока|класс|место урока|тема|предмет|что нужно|проблемный вопрос)$/i.test(th[0])) tb.classList.add("lx-pass");
      else wrap?.classList.remove("lx-boxwrap");
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

  return { md, merge, restyle, decorate, kindOf, docxKind, cell, clean, isLabel, KINDS, LEGEND };
})();
window.Layout = Layout;
