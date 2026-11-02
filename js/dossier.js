/* «Учу по ФРП» — досье урока для нейросети.
   Прежде чем писать, нейросеть получает опору: правило, алгоритм, схему, запоминалку, упражнения нужного класса,
   материалы учителя, найденное в образовательных источниках и место темы в курсе (что было до, что будет после).
   Методические объяснения, правила и запоминалки она берёт отсюда и ссылается на номер источника [И…];
   свои примеры может придумывать, но строго по правилу. */
window.Dossier = (() => {
  "use strict";
  const low = s => String(s || "").toLowerCase().replace(/ё/g, "е");
  const plain = s => String(s || "").replace(/<[^>]+>/g, " ").replace(/\{[а-яё]+:([^}]*)\}/gi, "$1").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  const cut = (s, n) => { const t = plain(s); return t.length > n ? t.slice(0, n).replace(/\s+\S*$/, "") + "…" : t; };

  /* место темы в курсе: соседние темы того же класса по программе */
  function neighbours(p) {
    try {
      if (typeof topicList !== "function" || typeof state === "undefined") return null;
      const keep = { s: state.subject, g: state.grade };
      state.subject = p.subject; state.grade = p.grade;
      let items = []; try { items = topicList().items || []; } finally { state.subject = keep.s; state.grade = keep.g; }
      const ct = t => (typeof cleanTopic === "function" ? cleanTopic(t) : String(t)).trim();
      const titles = [...new Set(items.map(i => ct(i.title)))].filter(t => t.length > 3);
      const t0 = low(p.topic).slice(0, 40);
      let i = titles.findIndex(t => low(t) === low(p.topic).trim());
      if (i < 0) i = titles.findIndex(t => low(t).startsWith(t0) || (low(t).length >= 8 && t0.startsWith(low(t).slice(0, 40))));
      if (i < 0) return null;
      return { prev: titles.slice(Math.max(0, i - 3), i), next: titles.slice(i + 1, i + 3) };
    } catch { return null; }
  }

  function build(p, { max = 7000 } = {}) {
    const S = p.subject, out = []; let k = 0;
    const add = (title, text, src) => { const t = Array.isArray(text) ? text.filter(Boolean).map(x => "– " + cut(x, 400)).join("\n") : cut(text, 1400); if (!t) return; out.push(`[И${++k}] ${title}${src ? ` (источник: ${src})` : ""}\n${t}`); };
    try {
      const RK = p.plan?.rukit;
      if (RK?.theory?.length && RK.theory.join("|") !== (RK.algo?.steps || []).join("|")) add("Правило / теория темы", RK.theory.slice(0, 6), "база сайта по учебнику");
      if (RK?.algo?.steps?.length) add(`Алгоритм «${RK.algo.name}»`, RK.algo.steps.map((x, i) => `${i + 1}) ${x}`), "база сайта");
      if (S === "ru" && !RK?.algo && window.RuSec) { const b = RuSec.BANKS.find(b => b.re.test(low(p.topic))); if (b) { add(`Правило «${b.name}»`, b.theory, "база сайта"); add("Алгоритм", b.steps.map((x, i) => `${i + 1}) ${x}`), "база сайта"); } }
      const sc = window.Schemes?.find(S, p.topic); if (sc) add(`Схема-опора «${sc.t}»`, [...(sc.s || []), sc.l || ""], "схемы учебника");
      const mn = window.Mnemo?.find(p.topic, RK?.algo?.name || "", S); if (mn?.tips?.length) add("Запоминалка (мнемотехника)", mn.tips, "методические пособия");
      if (typeof Base !== "undefined" && Base.rules && /^ru/.test(S)) for (const r of Base.rules(p.topic, p.grade, 2) || []) add("Правило из пособия", r.text, r.source);
      if (typeof Base !== "undefined" && Base.exercises && /^ru/.test(S)) {
        const ex = (Base.exercises(p.topic, p.grade, 4) || []).slice(0, 4);
        ex.forEach((e, i) => add(`Упражнение ${i + 1}${e.sec ? ` (раздел «${cut(e.sec, 60)}»)` : ""}`, e.text, e.own ? "тетради «Учу по ФРП»" : e.source));
      }
      if (typeof relevantMaterials === "function") for (const m of relevantMaterials(p.topic, p.grade, S, 2500).slice(0, 3)) add(`Материал учителя «${m.name}»`, m.text, "материалы учителя");
      if (window.MaterialResolver?.md && !/^(ru|lit)/.test(S)) { const md = MaterialResolver.md(p); if (md) add("Предметная база сайта", md, "база сайта"); }
      if (S === "lit" && p.plan?.text) add("Текст произведения (начало)", String(p.plan.text).slice(0, 2500), p.plan.textSource || "текст произведения");
      if (p.plan?.workWiki) add("О произведении", p.plan.workWiki, "Википедия");
      for (const it of (p.web?.items || []).slice(0, 4)) add("Из образовательного источника", it.text || it, it.src?.domain || "образовательный сайт");
      for (const r of (p.plan?.edu || []).slice(0, 2)) add("Из разработки учителя", [...(r.problem || []), ...(r.questions || [])].slice(0, 4), r.domain || r.src || "образовательный сайт");
    } catch (e) { console.warn("Dossier", e); }
    let body = out.join("\n\n"); if (body.length > max) body = body.slice(0, max).replace(/\n[^\n]*$/, "") + "\n…";
    const nb = neighbours(p);
    const place = nb ? `\nМесто темы в курсе ${p.grade} класса. Раньше изучали: ${nb.prev.length ? nb.prev.map(t => `«${t}»`).join(", ") : "—"}. Дальше будет: ${nb.next.length ? nb.next.map(t => `«${t}»`).join(", ") : "—"}. Опирайся на пройденное (в повторении и «включении в систему»), но не забегай вперёд и не смешивай с соседними темами.` : "";
    const meth = window.Methodology ? Methodology.block(p) + "\n\n" : "";
    if (!body && !place && !meth) return "";
    return `${meth}## Досье урока (опора)
Методические объяснения, правила, определения, схемы и запоминалки бери ИЗ ДОСЬЕ и ставь номер источника в скобках, например [И2]. Если нужного в досье нет – опирайся на школьный учебник${/^ru/.test(S) ? " (Ладыженская, Баранов)" : ""} и пиши «по учебнику»; не выдумывай правила, даты, цитаты и номера упражнений. Свои примеры придумывать можно, но они должны точно подчиняться правилу, соответствовать классу и не быть спорными.${place}

${body || "(в базе по теме ничего не найдено – опирайся на учебник)"}`;
  }
  return { build, neighbours };
})();
