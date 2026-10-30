/* «Учу по ФРП» — единый резолвер материалов.
   Собирает для урока все доступные источники строго по предмету и теме:
   предметную базу, глубину, банки знаний, справочную опору и темы года.
   Один порядок источников, без смешивания предметов. */
window.MaterialResolver = (() => {
  "use strict";
  const norm = s => String(s || "").toLowerCase().replace(/ё/g, "е");
  const clean = s => String(s || "").replace(/\*\*/g, "").trim();

  const SUPP = {
    ru: () => window.RuSec, lit: () => window.LitSec, bio: () => window.BioSec,
    geo: () => window.GeoSec, phys: () => window.PhysSec, chem: () => window.ChemSec,
    soc: () => window.SocSec, inf: () => window.InfoSec, hist: () => window.HistSec,
    eng: () => window.EngSec
  };
  const KEY = { ru1: "ru", lit1: "lit", obzh: "obzh", mhk: "mhk" };

  function subjectKey(p) {
    const s = String(p.subject || "");
    return KEY[s] || s;
  }

  function supplementBank(key, topic) {
    const get = SUPP[key];
    if (!get) return null;
    const lib = get();
    if (!lib || !Array.isArray(lib.BANKS)) return null;
    const t = norm(topic);
    return lib.BANKS.find(b => b.re.test(t)) || null;
  }

  function baseEntry(p, key) {
    const B = window.SUBJECT_BASE || {};
    return B[key] || null;
  }

  function depthEntry(p, key) {
    const D = window.SUBJECT_DEPTH || {};
    return D[key] || null;
  }

  function planThemes(p, key) {
    try {
      const P = window.FRPPlans || {};
      const pl = (P[p.subject] && P[p.subject][p.grade]) || (P[key] && P[key][p.grade]);
      return (pl && pl.th) || [];
    } catch (e) { return []; }
  }

  /* главный сбор: возвращает упорядоченные блоки строго по предмету */
  function resolve(p) {
    const key = subjectKey(p);
    const topic = p.topic || "";
    const blocks = [];
    const bank = supplementBank(key, topic);
    if (bank) {
      if (bank.theory && bank.theory.length) blocks.push({ title: "Опорная теория", points: bank.theory.slice(0, 8) });
      if (bank.steps && bank.steps.length) blocks.push({ title: "Алгоритм", points: bank.steps.slice(0, 6) });
      if (bank.tasks && bank.tasks.length) blocks.push({ title: "Задания с ответами", points: bank.tasks.slice(0, 8).map(([q, a]) => q + " — " + a) });
    }
    const base = baseEntry(p, key);
    if (base) {
      if (base.terms && base.terms.length) blocks.push({ title: "Ключевые понятия", points: base.terms.slice(0, 10).map(x => clean(x)) });
      if (base.ideas && base.ideas.length) blocks.push({ title: "Опорные положения", points: base.ideas.slice(0, 6).map(x => clean(x)) });
      if (base.tasks && base.tasks.length) blocks.push({ title: "Типовые задания", points: base.tasks.slice(0, 6).map(x => clean(x)) });
    }
    const depth = depthEntry(p, key);
    if (depth) {
      if (depth.analysis && depth.analysis.length) blocks.push({ title: "Как разбирать материал", points: depth.analysis.slice(0, 7).map(x => clean(x)) });
      const ep = (depth.epochs || []).find(e => e.name && norm(topic).includes(norm(e.name).slice(0, 6)));
      if (ep) blocks.push({ title: "Контекст темы", points: [ep.name + " (" + ep.years + ")", ...(ep.features || []), "Примеры: " + (ep.works || []).join(", ")].slice(0, 6) });
    }
    try {
      const md = window.SupportLib && window.SupportLib.md(p);
      if (md) {
        const pts = md.split("\n").filter(l => /^-\s+/.test(l)).map(l => clean(l.replace(/^-\s+/, ""))).slice(0, 8);
        if (pts.length) blocks.push({ title: "Справочная опора", points: pts });
      }
    } catch (e) { }
    const th = planThemes(p, key);
    if (th.length) blocks.push({ title: "Темы года по ФРП", points: th.slice(0, 10).map(x => clean(x)) });
    return { key, topic, blocks };
  }

  function md(p) {
    const r = resolve(p);
    if (!r.blocks.length) return "";
    return "\n\n## 📚 Материалы урока\n\n" + r.blocks.map(b => "### " + b.title + "\n" + b.points.map(x => "- " + x).join("\n")).join("\n\n");
  }

  function cards(p) {
    const r = resolve(p);
    if (!r.blocks.length) return null;
    const cards = [{ id: "mr-title", on: true, kind: "title", title: clean(p.topic || "Урок"), lead: `${p.grade ? p.grade + " класс · " : ""}${p.subjectName || p.subject || ""}`.trim() }];
    r.blocks.forEach((b, i) => {
      cards.push({ id: "mr-" + (i + 1), on: true, kind: "list", title: b.title, points: b.points.slice(0, 7) });
    });
    return cards.length >= 4 ? cards : null;
  }

  return { resolve, md, cards, subjectKey };
})();

/* Автоподстановка: к конспекту/техкарте/листу добавляются материалы урока. */
(function () {
  function wrap(obj) {
    if (!obj) return;
    ["conspect", "lesson", "worksheet"].forEach(fn => {
      if (typeof obj[fn] !== "function" || obj["__mr_" + fn]) return;
      const orig = obj[fn];
      obj[fn] = function (p, t) {
        const out = orig.call(obj, p, t);
        try {
          const extra = window.MaterialResolver && window.MaterialResolver.md(p);
          if (extra && !String(out).includes("Материалы урока")) return String(out) + extra;
        } catch (e) { }
        return out;
      };
      obj["__mr_" + fn] = true;
    });
  }
  try { wrap(window.Engine); } catch (e) { }
  try {
    if (window.Subjects && !window.Subjects.__mrPatched) {
      const _plugin = window.Subjects.plugin;
      window.Subjects.plugin = function (id) {
        const kit = _plugin.call(window.Subjects, id);
        if (kit && !kit.__mr) { wrap(kit); kit.__mr = true; }
        return kit;
      };
      window.Subjects.__mrPatched = true;
    }
  } catch (e) { }
})();
