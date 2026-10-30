/* «Учу по ФРП» — мягкое самообучение на правках учителя.

   Что делает:
   1) замечает ручную правку конспекта (до/после), но НЕ копирует текст учителя;
   2) определяет направление правки: вовлекающий заход, упрощение терминов,
      добавление примеров, исправление факта и т. п.;
   3) отбрасывает сомнительные правки: удаление содержания, длинные цитаты
      (риск чужого авторского текста), крупные переписывания без признаков приёма;
   4) копит наблюдения локально (в браузере учителя) и включает мягкую подсказку
      в генерацию только после повторения на РАЗНЫХ темах (принцип «дважды — не случайность»);
   5) наружу (в общую базу site_rules) ничего не отправляет автоматически:
      это делает разработчик после просмотра — так плохие правки не расходятся по всем.

   Принципы: никаких категоричных запретов, только «обращай внимание», «если уместно»,
   «перепроверяй целесообразность». Тексты учителя не сохраняются — только признаки. */
const Learn2 = (() => {
  "use strict";

  const KEY = "uchu:learn2";
  const MAX_QUOTE = 180;        // длинная цитата в правке — не учим
  const MAX_NOTES = 60;         // сколько наблюдений держим
  const MATURE = 2;             // сколько разных тем нужно для подсказки
  const SMALL = 25;             // правки короче не считаем

  let S = { notes: [], patterns: [] };
  try { const j = JSON.parse(localStorage.getItem(KEY)); if (j && Array.isArray(j.notes)) S = { notes: j.notes, patterns: j.patterns || [] }; } catch { }
  const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { } };
  let ctx = { subject: "", grade: 0, kind: "" };

  const norm = s => String(s || "").replace(/\s+/g, " ").trim();
  const gradeBand = g => (+g <= 4 ? "1-4" : +g <= 6 ? "5-6" : +g <= 9 ? "7-9" : "10-11");
  const subjectGroup = id => {
    if (["lit", "ru", "ru1", "lit1", "eng"].includes(id)) return "словесность";
    if (["hist", "soc", "obzh", "orkse"].includes(id)) return "общество";
    if (["mhk", "izo", "mus"].includes(id)) return "искусство";
    if (["math", "inf", "vis", "astr"].includes(id)) return "точные";
    if (["phys", "chem", "bio", "geo"].includes(id)) return "естественные";
    return "начальная";
  };
  const topicKey = t => norm(t).toLowerCase().slice(0, 80);

  /* ---------- признаки правки ---------- */
  const re = {
    hook: /(представь|вообрази|давайте|ребята|как вы думаете|а что если|кто из вас|попробуйте угадать)/i,
    image: /(как будто|словно|представьте себе|это как|вообрази|город|цивилизац|космос|путешеств)/i,
    question: /\?/,
    dialog: /(спросите|обсудите|повернитесь к соседу|в парах|в группах)/i,
    simplify: /(проще говоря|по-простому|если сказать понятно|иначе говоря)/i,
    example: /(например|пример|вспомните|из жизни)/i,
    fact: /\b(\d{3,4})\s*(год|г\.|тыс|млн|млрд)/i,
    copyrightRisk: /[«"][^»"]{40,}[»"]/g
  };

  function sentences(text) {
    return norm(text).split(/(?<=[.!?…])\s+/).map(norm).filter(x => x.length > 12);
  }

  function diffInfo(before, after) {
    const b = norm(before), a = norm(after);
    const bSent = sentences(before), aSent = sentences(after);
    const bSet = new Set(bSent.map(x => x.toLowerCase()));
    const added = aSent.filter(x => !bSet.has(x.toLowerCase()));
    const addedText = added.join(" ");
    return {
      beforeLen: b.length, afterLen: a.length,
      addedSent: added, addedText,
      removed: Math.max(0, b.length - a.length),
      addedLen: Math.max(0, a.length - b.length),
      deleteOnly: b.length > 0 && a.length > 0 && a.length < b.length * 0.5,
      hugeRewrite: b.length > 80 && Math.abs(a.length - b.length) / b.length > 0.85,
      quoteChars: (norm(after).match(re.copyrightRisk) || []).join("").length
    };
  }

  /* тип изменения: КРИТИЧЕСКАЯ ОШИБКА / НЕПОЛНЫЕ ДАННЫЕ / МЕТОДИЧЕСКИЙ ПРИЕМ / ОТКЛОНЕНО */
  function classify(d) {
    if (d.quoteChars > MAX_QUOTE) return "ОТКЛОНЕНО_ЦИТАТА";
    if (d.deleteOnly && d.removed > 120) return "ОТКЛОНЕНО_УДАЛЕНИЕ";
    if (d.hugeRewrite && !re.hook.test(d.addedText) && !re.example.test(d.addedText)) return "ОТКЛОНЕНО_ПЕРЕПИСЬ";
    if (re.fact.test(d.addedText) && !re.fact.test(norm(d.addedSent.join(" ")).replace(d.addedText, ""))) return "КРИТИЧЕСКАЯ_ОШИБКА";
    const markers = ["hook", "image", "question", "dialog", "simplify", "example"].filter(k => re[k].test(d.addedText));
    if (markers.length >= 1) return "МЕТОДИЧЕСКИЙ_ПРИЕМ";
    if (d.addedLen > 120) return "НЕПОЛНЫЕ_ДАННЫЕ";
    return "МЕЛКО";
  }

  /* направление приёма: только абстракция, без текста учителя.
     Формулировки разные («представьте…», «как вы думаете?») — направление одно,
     чтобы приём учитывался после повторения на разных темах, а не дробился. */
  function direction(addedText) {
    if (re.hook.test(addedText)) return "вовлекающий заход";
    if (re.dialog.test(addedText)) return "диалог/работа в парах";
    if (re.simplify.test(addedText)) return "упрощение формулировок";
    if (re.example.test(addedText)) return "бытовой пример";
    return "уточнение содержания";
  }

  function template(type, dir, band, subjGroup) {
    if (type === "МЕТОДИЧЕСКИЙ_ПРИЕМ") {
      if (dir === "вовлекающий заход")
        return `Обращай внимание: для ${band} классов в «${subjGroup}» уместно начинать конспект с короткого вовлекающего образа или вопроса к классу (1–2 предложения) до введения терминов; затем — точные определения. Если контекст темы этого не требует, обходись обычным заходом.`;
      if (dir === "диалог/работа в парах")
        return `Обращай внимание: в ${band} классах по «${subjGroup}» уместно встраивать короткое обсуждение в парах или вопрос «как вы думаете?» перед объяснением; перепроверяй целесообразность по теме.`;
      if (dir === "упрощение формулировок")
        return `Обращай внимание: для ${band} классов в «${subjGroup}» формулировки стоит упрощать (проще говоря, без лишних терминов), но не теряя точности понятий.`;
      if (dir === "бытовой пример")
        return `Обращай внимание: в ${band} классах по «${subjGroup}» полезен бытовой пример до теории, если он не подменяет научное понятие.`;
      return `Обращай внимание: правки учителя по «${subjGroup}» (${band}) чаще связаны с уточнением содержания — перепроверяй точность и добавляй пояснение, если уместно.`;
    }
    if (type === "НЕПОЛНЫЕ_ДАННЫЕ")
      return `Обращай внимание: в «${subjGroup}» (${band}) учителя дополняют конспект содержанием — проверяй, хватает ли примера и пояснения к понятию, если это уместно теме.`;
    return "";
  }

  function learnNote({ subject, grade, topic, kind, before, after }) {
    const d = diffInfo(before, after);
    if (d.addedLen < SMALL && d.removed < SMALL) return null;
    const type = classify(d);
    const dir = type === "МЕТОДИЧЕСКИЙ_ПРИЕМ" ? direction(d.addedText) : "";
    const band = gradeBand(grade), sg = subjectGroup(subject);
    const note = {
      at: new Date().toISOString(), subject: subject || "", grade: +grade || 0,
      topic: topicKey(topic), kind: kind || "", type, dir,
      metrics: { beforeLen: d.beforeLen, afterLen: d.afterLen, added: d.addedLen, removed: d.removed, quoteChars: d.quoteChars },
      markers: ["hook", "image", "question", "dialog", "simplify", "example"].filter(k => re[k].test(d.addedText))
    };
    // отклонённые правки в копилку не берём — только счётчик для прозрачности
    if (type.startsWith("ОТКЛОНЕНО")) { note.ignored = true; }
    S.notes.push(note);
    if (S.notes.length > MAX_NOTES) S.notes = S.notes.slice(-MAX_NOTES);
    if (!note.ignored && (type === "МЕТОДИЧЕСКИЙ_ПРИЕМ" || type === "НЕПОЛНЫЕ_ДАННЫЕ")) {
      const key = type + "|" + (dir || "общее") + "|" + band + "|" + sg;
      const p = S.patterns.find(x => x.key === key);
      const topics = new Set(p ? p.topics : []);
      topics.add(note.topic);
      if (p) { p.n++; p.topics = [...topics].slice(0, 20); p.updatedAt = note.at; }
      else S.patterns.push({ key, type, dir: dir || "общее", band, group: sg, n: 1, topics: [note.topic], createdAt: note.at, updatedAt: note.at, active: false });
      const q = S.patterns.find(x => x.key === key);
      if (q.n >= MATURE && topics.size >= MATURE) {
        q.active = true;
        q.text = template(q.type, q.dir, q.band, q.group);
      }
    }
    keep();
    return note;
  }

  /* ---------- контекст генерации и подсказки ---------- */
  /* нейтрализация авторской методики: личное -> общее положение */
  function neutralize(s) {
    return String(s || "")
      .replace(/\b(?:я|мы)\s+(?:обычно|всегда|люблю|предпочитаю|советую|делаю|использую)\b/gi, "на практике")
      .replace(/\b(?:по моему мнению|на мой взгляд|мне нравится|я считаю)\b/gi, "целесообразно")
      .replace(/[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+)?/g, "")
      .replace(/«[^»]{0,120}»/g, "")
      .replace(/\b(?:моя|моей|моих|наш|наша|наши)\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .replace(/^[\s,;:—-]+|[\s,;:—-]+$/g, "")
      .trim();
  }
  /* сигнал от выгрузки: какие материалы чаще сохраняют по предмету/классу */
  function learnExport({ subject, grade, kind, format }) {
    try {
      S = load() || { notes: [], patterns: [] };
      const key = "export:" + (subject || "?") + ":" + gradeBand(grade) + ":" + (format || kind || "?");
      let p = (S.patterns || []).find(x => x.key === key);
      if (!p) { p = { key, n: 0, subject, band: gradeBand(grade), format: format || kind || "" }; S.patterns.push(p); }
      p.n++; p.at = Date.now();
      keep();
      return true;
    } catch { return false; }
  }

  function setContext(c) { ctx = { ...ctx, ...(c || {}) }; }
  function hints() { /* выдаём только обобщённые формулировки */
    const band = gradeBand(ctx.grade), sg = subjectGroup(ctx.subject);
    return S.patterns
      .filter(p => p.active && p.band === band && p.group === sg && p.text)
      .slice(0, 2)
      .map(p => p.text);
  }
  function hintsSuffix() { /* нейтрализованные подсказки */
    const h = hints();
    return h.length ? "\n\n# Мягкие наблюдения с правок учителей (учитывай, если уместно, не навязывай)\n" + h.map((x, i) => `${i + 1}. ${x}`).join("\n") : "";
  }

  /* ---------- просмотр и ручное подтверждение (кабинет) ---------- */
  function list() { /* список для кабинета */
    return {
      notes: S.notes.slice().reverse(),
      patterns: S.patterns.slice().sort((a, b) => (b.active - a.active) || (b.n - a.n))
    };
  }
  function approve(key, on = true) {
    const p = S.patterns.find(x => x.key === key); if (!p) return false;
    p.active = on;
    p.text = on ? (p.text || template(p.type, p.dir, p.band, p.group)) : "";
    keep(); return true;
  }
  function clear() { S = { notes: [], patterns: [] }; keep(); }

  document.addEventListener("uchu:ready", () => { try { keep(); } catch { } });

  return { learnNote, learnExport, neutralize, setContext, hints, hintsSuffix, list, approve, clear, gradeBand, subjectGroup, MATURE };
})();
window.Learn2 = Learn2;
