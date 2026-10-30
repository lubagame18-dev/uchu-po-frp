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
    const subject = p.subjectName || p.subject || "";
    const topic = clean(p.topic || "Урок");
    cards.push({ id: "cp-title", on: true, kind: "title", title: topic, lead: `${p.grade ? p.grade + " класс · " : ""}${subject}`.trim() });
    let cur = null, inTable = false, tableRows = [];
    const flush = () => {
      if (!cur) return;
      if (cur.points.length || cur.table) cards.push(cur);
      cur = null;
    };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || /^\|?[\s:-]+\|/.test(line)) continue;
      if (/^##\s+/.test(line)) {
        flush();
        const title = clean(line.replace(/^##\s+/, ""));
        cur = { id: "cp-" + (cards.length + 1), on: true, kind: "list", title, points: [] };
        inTable = false;
        tableRows = [];
        continue;
      }
      if (!cur) {
        if (/^[-•]\s+/.test(line)) {
          cur = { id: "cp-" + (cards.length + 1), on: true, kind: "list", title: topic, points: [] };
        } else continue;
      }
      if (/^\|/.test(line)) {
        if (cur && cur.kind !== "table") {
          flush();
          cur = { id: "cp-" + (cards.length + 1), on: true, kind: "table", title: (cur && cur.title) || "Таблица", head: [], rows: [] };
        }
        const cells = line.replace(/^\|/, "").replace(/\|$/, "").split("|").map(x => clean(x));
        if (!cur.head.length) cur.head = cells;
        else if (!/^[-: ]+$/.test(cells.join(""))) cur.rows.push(cells);
        inTable = true;
        continue;
      }
      if (/^[-•]\s+/.test(line)) cur.points.push(clean(line.replace(/^[-•]\s+/, "")));
      else if (cur.points.length && cur.points.length < 7) cur.points.push(clean(line));
      else if (cur.points.length) {} // дальше не наращиваем
    }
    flush();
    return cards.filter(c => c.kind === "title" || (c.points && c.points.length) || (c.rows && c.rows.length)).slice(0, 18);
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
