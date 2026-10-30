/* «Учу по ФРП» — единый сборщик материалов для конспекта и презентации.
   Слайды строятся из того же локального конспекта и справочной опоры,
   поэтому в презентацию попадают теория, задания и ответы. */
window.CardsPlus = (() => {
  "use strict";

  function clean(s) {
    return String(s || "")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\[([^\]]+)\]\(#[^)]*\)/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/^#+\s*/, "")
      .trim();
  }

  /* разбирает markdown конспекта на слайды */
  function fromMd(md, p) {
    const lines = String(md || "").split(/\r?\n/);
    const cards = [];
    const topic = clean(p.topic || "Урок");
    const subject = p.subjectName || p.subject || "";
    cards.push({ id: "cp-title", on: true, kind: "title", title: topic, lead: `${p.grade ? p.grade + " класс · " : ""}${subject}`.trim() });
    let cur = null, table = null;
    const pushList = () => { if (cur && cur.points.length) { cards.push(cur); } cur = null; };
    const pushTable = () => { if (table && table.rows.length) cards.push(table); table = null; };
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (/^##\s+/.test(line)) {
        pushList(); pushTable();
        const title = clean(line.replace(/^##\s+/, ""));
        if (title && !/справочная опора/i.test(title)) cur = { id: "cp-" + (cards.length + 1), on: true, kind: "list", title, points: [] };
        continue;
      }
      if (/^\|/.test(line)) {
        const cells = line.replace(/^\|/, "").replace(/\|$/, "").split("|").map(x => clean(x));
        if (/^[\s:|-]+$/.test(cells.join(""))) continue;
        if (!table) table = { id: "cp-" + (cards.length + 1), on: true, kind: "table", title: "Таблица с ответами", head: cells, rows: [] };
        else if (!table.head.length) table.head = cells;
        else table.rows.push(cells);
        continue;
      }
      pushTable();
      if (!cur) cur = { id: "cp-" + (cards.length + 1), on: true, kind: "list", title: topic, points: [] };
      if (/^[-•]\s+/.test(line)) cur.points.push(clean(line.replace(/^[-•]\s+/, "")));
      else if (cur.points.length < 7) cur.points.push(clean(line));
    }
    pushList(); pushTable();
    return cards.filter(c => c.kind === "title" || (c.points && c.points.length) || (c.rows && c.rows.length)).slice(0, 20);
  }
  function supportCard(p) {
    try {
      const md = window.SupportLib && window.SupportLib.md(p);
      if (!md) return null;
      const pts = md.split("\n").filter(l => /^-\s+/.test(l)).map(l => clean(l.replace(/^-\s+/, ""))).slice(0, 6);
      if (!pts.length) return null;
      return { id: "cp-support", on: true, kind: "list", title: "Справочная опора", points: pts };
    } catch (e) { return null; }
  }

  /* собирает полный набор слайдов для локального урока */
  function build(p, PL, type) {
    if (!PL || typeof PL.conspect !== "function") return null;
    let md = "";
    try { md = PL.conspect(p, type) || ""; } catch (e) { md = ""; }
    let cards = fromMd(md, p);
    const sup = supportCard(p);
    if (sup) cards.push(sup);
    return cards.length >= 4 ? cards : null;
  }

  return { fromMd, build, supportCard };
})();

/* Патчим все предметные наборы: слайды берутся из локального конспекта. */
(function () {
  try {
    if (!window.Subjects || window.Subjects.__cardsPatched) return;
    const _plugin = window.Subjects.plugin;
    window.Subjects.plugin = function (id) {
      const kit = _plugin.call(window.Subjects, id);
      if (kit && !kit.__cardsPlus) {
        const origCards = kit.cards;
        kit.cards = function (p, type) {
          try {
            const built = window.CardsPlus && window.CardsPlus.build(p, kit, type);
            if (built && built.length >= 4) return built;
          } catch (e) { }
          return typeof origCards === "function" ? origCards.call(kit, p, type) : [];
        };
        kit.__cardsPlus = true;
      }
      return kit;
    };
    window.Subjects.__cardsPatched = true;
  } catch (e) { }
})();
