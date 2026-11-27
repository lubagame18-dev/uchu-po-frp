/* «Учу по ФРП» — починка рабочих листов после нейросети.
   Проблема: модель иногда «рисует» карту/схему символами (|, ↑, →, —) и оборачивает
   подписи в обратные кавычки. В листе это превращается в обрывки текста в рамках,
   стрелки и пустые места. Здесь такие псевдосхемы убираются, а задачи с ссылкой
   на несуществующую карту/схему удаляются и нумерация заданий восстанавливается. */
(function (root) {
  "use strict";
  const CYR = /[А-Яа-яЁё]/;
  const ARROW = /[↑↓←→↔⇄⇆↕]/;
  const DIAG_CHARS = /[↑↓←→↔⇄⇆↕|—–]/g;

  function unboxCyrillic(md) {
    /* `Балтийское море` → Балтийское море; формулы и латиница остаются кодом */
    return String(md || "").replace(/`([^`\n]{1,90})`/g, (m, s) => {
      const t = String(s).trim();
      if (!CYR.test(t)) return m;
      if (/^[A-Za-zА-Яа-яЁё0-9\s.,:;!?«»"()\-–—+*/=<>²³₂₃]+$/.test(t) && t.length > 60) return m;
      return t;
    });
  }

  function isDiagramLine(line) {
    const t = String(line || "").trim();
    if (!t) return false;
    /* настоящие строки Markdown-таблицы не трогаем */
    if (/^\|.*\|$/.test(t) && /[А-Яа-яЁёA-Za-z0-9]/.test(t)) return false;
    if (/^\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(t)) return false;
    const noTicks = t.replace(/`/g, "").trim();
    if (!noTicks) return false;
    const sym = (noTicks.match(DIAG_CHARS) || []).length;
    const words = (noTicks.match(/[А-Яа-яЁёA-Za-z]{2,}/g) || []).length;
    if (sym >= 3 && words <= 4) return true;
    if (sym >= 1 && words <= 2 && noTicks.length <= 70 && /[|—–]/.test(noTicks)) return true;
    if (ARROW.test(noTicks) && words <= 4 && noTicks.length <= 90) return true;
    if (/^[`\s|↑↓←→↔⇄⇆↕—–_=+\-.]+$/.test(noTicks)) return true;
    return false;
  }

  function stripDiagramLines(text) {
    const lines = String(text || "").split("\n");
    let removed = 0;
    const out = lines.filter(line => {
      if (isDiagramLine(line)) { removed++; return false; }
      return true;
    });
    return { text: out.join("\n"), removed };
  }

  function isBrokenTask(block) {
    const b = String(block || "");
    if (/!\[[^\]]*\]\([^)]+\)/.test(b)) return false; // настоящая картинка/карта есть
    const refsMap = /(?:карт[аыуеой]|план[аеу]?\s+местности)\s+(?:на|в)\s+слайде|на\s+схеме\s+ниже|на\s+карте\s+ниже|подпишите\s+на\s+схеме|к\s+какому\s+морю|покажите\s+стрелкой/i.test(b);
    const diagram = /[↑↓←→↔⇄⇆]/.test(b) || /(?:^|\n)\s*\|/m.test(b) || /`[^`\n]{1,40}`\s*(?:\n|$)/.test(b);
    const asksDraw = /нарисуйте|подпишите|обозначьте\s+стрелк|покажите\s+стрелк|составьте\s+схему|зарисуйте/i.test(b);
    return (refsMap && (diagram || asksDraw)) || (diagram && asksDraw);
  }

  function sanitize(md) {
    let text = String(md || "").replace(/\r\n/g, "\n");
    if (!text.trim()) return text;
    text = unboxCyrillic(text);
    const stripped = stripDiagramLines(text);
    text = stripped.text;
    /* Разбиваем на задачи по заголовкам «### Задание N» */
    const parts = text.split(/(?=^###\s*Задание\s*\d+)/m);
    const kept = [];
    let removedTasks = 0;
    for (const part of parts) {
      if (!/^###\s*Задание\s*\d+/m.test(part)) { kept.push(part); continue; }
      if (isBrokenTask(part)) { removedTasks++; continue; }
      kept.push(part);
    }
    let out = kept.join("");
    if (removedTasks) {
      let n = 0;
      out = out.replace(/^###\s*Задание\s*\d+/gm, () => `### Задание ${++n}`);
    }
    out = out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    return out;
  }

  function analyze(md) {
    const before = String(md || "");
    const stripped = stripDiagramLines(unboxCyrillic(before));
    let tasks = 0, broken = 0;
    for (const part of before.split(/(?=^###\s*Задание\s*\d+)/m)) if (/^###\s*Задание\s*\d+/m.test(part)) { tasks++; if (isBrokenTask(part)) broken++; }
    return { diagramLines: stripped.removed, tasks, brokenTasks: broken };
  }

  root.WsFix = { sanitize, analyze, isDiagramLine };
})(typeof globalThis !== "undefined" ? globalThis : this);
