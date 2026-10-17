/* ===================================================================
   «Учу по ФРП» — индивидуальность каждого урока (работает без ИИ).
   1) Анализ текста произведения: сильные позиции, повторы и анафора,
      антитеза, цвет и звук, сравнения, эпитеты, риторические вопросы,
      композиционный перелом, герои и диалоги.
   2) Вопросы по типам из методички (Э, С, Ф, смысл, композиция, герой,
      контекст, сопоставление, проблема, личный опыт, чтение) — с опорой
      на цитаты из этого текста. Часть вопросов — дословно из образцовых
      разработок (методика из файлов, см. Learn).
   3) Разные задания и необычные форматы (синквейн, диаманта, акрослово,
      квест, суд над героем, дебаты, плейлист, ожившие картины, письмо
      героя) — только если подходят произведению и возрасту, без повтора
      формата подряд.
   4) Разная структура конспекта: по образцовому уроку на ту же тему,
      по классу и по особенностям текста.
   История использованных вопросов и форматов хранится в браузере,
   поэтому следующий урок не повторяет предыдущий.
   =================================================================== */
const Variety = (() => {
  "use strict";

  /* ---------- случайность и история ---------- */
  let seed = Date.now() >>> 0;
  function rnd() { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
  const hash = s => { let h = 5381; for (const c of String(s)) h = (h * 33 + c.charCodeAt(0)) >>> 0; return h.toString(36); };
  function reseed(s) { seed = (Date.now() ^ parseInt(hash(s), 36)) >>> 0; }
  const HKEY = "uchu:variety";
  const H = {
    load() { try { return JSON.parse(localStorage.getItem(HKEY)) || {}; } catch { return {}; } },
    save(h) { try { localStorage.setItem(HKEY, JSON.stringify(h)); } catch { } },
    age(kind, key) { const h = this.load(); const t = h[kind]?.[key]; return t ? Date.now() - t : Infinity; },
    mark(kind, keys) {
      const h = this.load(); h[kind] = h[kind] || {};
      for (const k of [].concat(keys)) h[kind][k] = Date.now();
      const e = Object.entries(h[kind]); if (e.length > 800) h[kind] = Object.fromEntries(e.sort((a, b) => b[1] - a[1]).slice(0, 600));
      this.save(h);
    },
    lastFormats(n = 3) { const f = this.load().fmt || {}; return Object.entries(f).sort((a, b) => b[1] - a[1]).slice(0, n).map(x => x[0]); }
  };
  /* Выбор: сначала то, что давно не использовалось (или никогда), среди равных — случайно */
  function pickLRU(list, kind, keyFn = x => x, n = 1, used = null) {
    const scored = list.filter(x => !used || !used.has(keyFn(x))).map(x => { const a = H.age(kind, keyFn(x)); return { x, s: (a === Infinity ? 1e13 : a) * (0.75 + rnd() * 0.5) }; });
    return scored.sort((a, b) => b.s - a.s).slice(0, n).map(o => o.x);
  }
  const shuffle = a => { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };

  /* ---------- 1. Анализ текста ---------- */
  const STOP = new Set("и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее её мне было вот от меня еще ещё нет о из ему теперь когда даже ну вдруг ли если уже или ни быть был него до вас нибудь опять уж вам ведь там потом себя ничего ей может они тут где есть надо ней для мы тебя их чем была сам чтоб без будто чего раз тоже себе под будет ж тогда кто этот того потому этого какой совсем ним здесь этом один почти мой тем чтобы нее неё сейчас были куда зачем всех никогда можно при наконец два об другой хоть после над больше тот через эти нас про всего них какая много разве три эту моя впрочем хорошо свою этой перед иногда лучше чуть том нельзя такой им более всегда конечно всю между это свой своей своих своим своё свое мои мою моих твой твоя твои наш наша наши ваш весь вся всё все весьма лишь пусть ах ох эх ой нам ним ними тех тех которые который которая которое".split(" "));
  const COLORS = /^(бел|черн|чёрн|красн|ал(ый|ая|ое|ые|ого|ым)|багр|багрян|син|голуб|лазур|зелен|зелён|жёлт|желт|золот|серебр|сер(ый|ая|ое|ые|ого)|румян|пурпур|розов|лилов|фиолет|изумруд|бирюз|рыж|смугл|бледн|сед|седой|кровав|огнен|огнён)/i;
  const SOUNDS = /^(звон|звен|звук|шум|шорох|шёпот|шепот|шепч|гром|грох|стук|скрип|песн|пенье|пени|поют|поёт|крик|кричит|плач|рыда|тишин|тих(ий|о|ая)|молч|свист|гул|эхо|звучит|звучал|голос|рокот|журч|трел|колокол)/i;
  const PAIRS = [["ден|дн(?!о)|днём|утр", "ноч"], ["свет", "тьм|мрак|темн|тёмн"], ["жизн|жив", "смерт|мёрт|мерт|гибел"], ["любов|любл", "ненавист|вражд"], ["радост|весел|счаст", "печал|горе|грус|тоск|несчаст"], ["неб", "земл"], ["высок|выш|горн", "низ|глуб|дол"], ["тепл|жар", "холод|хлад|стуж|мороз"], ["свобод|вол(я|ю|ей|е)(?![а-яё])", "невол|рабств|цеп|темниц|тюрьм"], ["правд|истин", "лож|обман|клевет"], ["добр", "зл"], ["тишин|тих|молч", "шум|гром|крик|грох"], ["стар", "молод|юн"], ["весн", "осен"], ["лет(о|а|ом|ний)", "зим"], ["огон|огн|пламен", "лёд|лед|снег|вод"], ["мир(?!о)", "войн|бит"], ["рай|бог", "ад|демон|бес"], ["рассуд|ум", "сердц|чувств|душ"], ["прошл|былое|был", "будущ|грядущ"], ["толп|люд", "одиноч|один"], ["родин|дом", "чужбин|изгнан"]];
  const WORD = /[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)?/g;
  const stem = w => w.toLowerCase().replace(/ё/g, "е").slice(0, Math.max(4, Math.min(6, w.length - 2)));
  const cleanTxt = t => String(t || "").replace(/́/g, "").replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

  function analyze(raw, meta = {}) {
    const text = cleanTxt(raw);
    if (!text || text.length < 60) return null;
    const allLines = text.split("\n").map(l => l.trim());
    const lines = allLines.filter(Boolean);
    const lens = lines.map(l => l.length).sort((a, b) => a - b), median = lens[Math.floor(lens.length / 2)] || 0;
    const verse = lines.length >= 4 && median < 62 && lines.filter(l => l.length > 95).length < lines.length * 0.15;
    const stanzas = text.split(/\n\s*\n/).map(s => s.split("\n").map(l => l.trim()).filter(Boolean)).filter(s => s.length);
    const units = verse ? lines : (typeof Learn !== "undefined" ? Learn.sentences(text) : text.split(/(?<=[.!?…])\s+/)).filter(s => s.length > 3);
    const words = (text.match(WORD) || []);
    const freq = new Map();
    words.forEach(w => { const lw = w.toLowerCase(); if (lw.length < 4 || STOP.has(lw)) return; const k = stem(lw); const f = freq.get(k) || { n: 0, forms: new Map() }; f.n++; f.forms.set(lw, (f.forms.get(lw) || 0) + 1); freq.set(k, f); });
    const top = [...freq.entries()].sort((a, b) => b[1].n - a[1].n);
    const formOf = f => [...f.forms.entries()].sort((a, b) => b[1] - a[1])[0][0];
    // ключевые слова — существительные (глаголы и прилагательные отсекаем по окончаниям); слово из заглавия — первым
    const VERBISH = /(ю|ешь|ет|ем|ете|ют|ут|ит|им|ите|ат|ят|ть|ться|тся|л|ла|ли|ло|лся|лась|лись|сь|ся|вши|в)$/;
    const ADJISH = /(ый|ий|ой|ая|яя|ое|ее|ые|ие|ого|его|ому|ему|ую|юю|ым|ыми|ими|ых|их|ой)$/;
    const nounish = w => !VERBISH.test(w) && !ADJISH.test(w);
    const titleWords = String(meta.title || "").toLowerCase().match(/[а-яё]{4,}/g) || [];
    const keywords = [...titleWords.filter(nounish).slice(0, 1), ...top.filter(([, f]) => f.n >= 2 && nounish(formOf(f))).slice(0, 8).map(([, f]) => formOf(f))].filter((w, i, a) => a.indexOf(w) === i);
    const repeats = top.filter(([, f]) => f.n >= 3).slice(0, 4).map(([, f]) => ({ word: formOf(f), n: f.n }));
    // анафора: строки (предложения), начинающиеся с одного слова
    const starts = new Map();
    units.forEach((l, i) => { const w = (l.match(/^[«"(—–\s]*([А-Яа-яЁё]+)/) || [])[1]; if (!w) return; const k = w.toLowerCase(); (starts.get(k) || starts.set(k, []).get(k)).push(i); });
    let anaphora = null;
    for (const [w, idx] of starts) {
      if (idx.length < 2) continue;
      let run = 1, best = 1; for (let k = 1; k < idx.length; k++) { run = idx[k] - idx[k - 1] === 1 ? run + 1 : 1; best = Math.max(best, run); }
      const ok = (w.length > 1 && (best >= 2 || idx.length >= 3)) || (w.length === 1 && best >= 3);
      if (ok && !["и", "а", "в", "с"].includes(w) || (ok && best >= 3)) { if (!anaphora || idx.length > anaphora.n) anaphora = { word: units[idx[0]].match(/^[«"(—–\s]*([А-Яа-яЁё]+)/)[1], n: idx.length, line: units[idx[0]] }; }
    }
    const qLines = units.filter(l => /\?\s*[»"]?$/.test(l) && l.length < 140);
    const exLines = units.filter(l => /!\s*[»"]?$/.test(l) && l.length < 140);
    const lower = text.toLowerCase().replace(/ё/g, "е");
    const pairs = [];
    for (const [a, b] of PAIRS) {
      const ra = new RegExp("(^|[^а-яё])(" + a + ")[а-яё]*", "i"), rb = new RegExp("(^|[^а-яё])(" + b + ")[а-яё]*", "i");
      const ma = lower.match(ra), mb = lower.match(rb);
      if (ma && mb) pairs.push([ma[0].replace(/^[^а-яё]/, ""), mb[0].replace(/^[^а-яё]/, "")]);
    }
    const uniqForms = re => [...new Set(words.map(w => w.toLowerCase()).filter(w => re.test(w)))].slice(0, 5);
    const colors = uniqForms(COLORS), sounds = uniqForms(SOUNDS);
    const similes = [...text.matchAll(/[^,.;:!?\n—]{0,28}\s(как|словно|будто|точно|как будто)\s[^,.;:!?\n—]{4,40}/gi)].map(m => m[0].trim()).filter(s => !/^(как|словно|будто)(?:(?<=[A-Za-z0-9_А-Яа-яЁё])(?![A-Za-z0-9_А-Яа-яЁё])|(?<![A-Za-z0-9_А-Яа-яЁё])(?=[A-Za-z0-9_А-Яа-яЁё]))/i.test(s) && s.split(" ").length >= 3).slice(0, 3);
    const epithets = [...text.matchAll(/(?:^|[\s«(—])([а-яё]{5,}(?:ый|ий|ой|ая|яя|ое|ее|ые|ие|ого|его|ую|юю|ой|ым|им))\s+([а-яё]{3,})(?=[\s,.;:!?»)]|$)/gi)]
      .map(m => m[1] + " " + m[2]).filter(s => !/(ый|ий|ой|ая|яя|ое|ее|ые|ие)$/.test(s.split(" ")[1])).filter((s, i, a) => a.indexOf(s) === i);
    // композиционный перелом: строка с «Но / А / Однако / Зато / И вот» в середине текста
    let turn = null;
    units.forEach((l, i) => { if (turn || units.length < 5) return; const pos = i / units.length; if (pos > 0.2 && pos < 0.85 && /^[«"—–\s]*(Но|А|Однако|Зато|И вот|Вдруг|Лишь)(?:(?<=[A-Za-z0-9_А-Яа-яЁё])(?![A-Za-z0-9_А-Яа-яЁё])|(?<![A-Za-z0-9_А-Яа-яЁё])(?=[A-Za-z0-9_А-Яа-яЁё]))/.test(l)) turn = { line: l, word: l.match(/^[«"—–\s]*(Но|А|Однако|Зато|И вот|Вдруг|Лишь)/)[1], idx: i }; });
    // герои (проза): имена с заглавной буквы не в начале предложения
    const heroes = [];
    if (!verse || meta.epic) {
      const cnt = new Map();
      for (const m of text.matchAll(/[а-яё,;:»)]\s+([А-ЯЁ][а-яё]{2,}(?:\s[А-ЯЁ][а-яё]{2,})?)/g)) {
        const n = m[1]; const k = stem(n.split(" ")[0]);
        if (/^(Бог|Господ|Росси|Москв|Петербург|Россия|Христ|Царь|Царе)/.test(n)) continue;
        const e = cnt.get(k) || { n: 0, forms: new Map() }; e.n++; e.forms.set(n, (e.forms.get(n) || 0) + 1); cnt.set(k, e);
      }
      [...cnt.values()].filter(e => e.n >= 3).sort((a, b) => b.n - a.n).slice(0, 4).forEach(e => heroes.push(formOf(e)));
    }
    const dialog = (text.match(/^\s*[—–]\s/gm) || []).length >= 3;
    const pron = { ya: (lower.match(/(^|[^а-яё])(я|меня|мне|мной|мой|моя|моё|мое|мои)(?=[^а-яё]|$)/g) || []).length, ty: (lower.match(/(^|[^а-яё])(ты|тебя|тебе|тобой|твой|твоя|твои)(?=[^а-яё]|$)/g) || []).length, my: (lower.match(/(^|[^а-яё])(мы|нас|нам|наш|наша|наши)(?=[^а-яё]|$)/g) || []).length };
    const first = units[0], last = units[units.length - 1];
    const ring = first && last && units.length > 3 && [...new Set((first.match(WORD) || []).map(w => stem(w)))].some(s => s.length >= 4 && (last.match(WORD) || []).map(w => stem(w)).includes(s));
    // яркие строки: средней длины, с ключевым словом или приёмом, не первая и не последняя
    const kwSt = new Set(keywords.map(stem));
    const notable = units.slice(1, -1).filter(l => l.length >= 18 && l.length <= (verse ? 80 : 150)).map(l => ({ l, s: (l.match(WORD) || []).filter(w => kwSt.has(stem(w))).length + (/[!?]/.test(l) ? 1 : 0) + (similes.some(x => l.includes(x)) ? 1 : 0) })).sort((a, b) => b.s - a.s).slice(0, 12).map(x => x.l);
    return {
      verse, lines: units.length, stanzas: verse ? stanzas : [], stanzaN: verse ? stanzas.length : 0, first, last, ring, title: meta.title || null, author: meta.author || null,
      keywords, repeats, anaphora, qLines, exLines, pairs: pairs.slice(0, 4), colors, sounds, similes, epithets: epithets.slice(0, 6), turn, heroes, dialog, pron, notable,
      source: meta.source || null, sourceUrl: meta.url || null, chars: text.length
    };
  }

  /* ---------- 2. Вопросы по типам ---------- */
  const q = s => `«${String(s).replace(/^[«"—–\s]+|[»"\s]+$/g, "").replace(/[.,;:—–-]+$/, "").replace(/[«»]/g, "\"").trim()}»`;
  const plural = (n, one, few, many) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };
  const clip = s => String(s || "").replace(/[\s.,;:—–-]+$/, "").trim();
  const short = (s, n = 90) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n).replace(/\s\S*$/, "") + "…" : s; };
  // need — какие находки анализа нужны; a — подсказка учителю (ожидаемый ответ), если её можно вывести из текста
  const T = {
    E: [
      { t: A => `Какое настроение задаёт первая строка ${q(A.first)}? Сохраняется ли оно до финала — ${q(short(A.last, 70))}?`, need: ["first", "last"] },
      { t: () => "Найдите слово, в котором, по-вашему, больше всего чувства. Почему именно оно?" },
      { t: () => "Какие эмоции сменяют друг друга по ходу текста? Назовите их — можно по «колесу эмоций»." },
      { t: A => `С каким чувством, по-вашему, произнесено ${q(short(A.exLines[0], 80))}?`, need: ["exLines"] },
      { t: A => `Строка ${q(short(A.notable[0], 80))} — какое чувство она вызывает у вас и почему?`, need: ["notable"] },
      { t: () => "Если бы у текста был цвет настроения, каким он был бы в начале и каким — в конце?" },
      { t: A => `Что остаётся у вас после последних слов — ${q(short(A.last, 70))}: тревога, светлая грусть, надежда? Объясните.`, need: ["last"] }
    ],
    S: [
      { t: A => `Представьте картину, с которой начинается текст: ${q(short(A.first, 80))}. Что вы видите на первом плане?`, need: ["first"] },
      { t: A => `Какие звуки «слышны» в тексте (${A.sounds.slice(0, 3).join(", ")})? Как звучит этот мир?`, need: ["sounds"] },
      { t: A => `Текст окрашен словами «${A.colors.slice(0, 3).join("», «")}». Какую картину рисуют эти цвета?`, need: ["colors"] },
      { t: () => "Если снимать по тексту фильм, каким был бы первый кадр, а каким — последний?" },
      { t: A => `Где «стоит» герой (рассказчик) в строке ${q(short(A.notable[1] || A.notable[0], 80))}? Что он видит перед собой?`, need: ["notable"] },
      { t: () => "Какой образ из текста вы бы нарисовали? Какую деталь обязательно оставили бы?" },
      { t: A => `Представьте образ «${A.keywords[0]}»: какие слова текста помогают его увидеть?`, need: ["keywords"] }
    ],
    F: [
      { t: A => `Несколько строк начинаются одинаково: «${A.anaphora.word}…». Как называется этот приём и что он подчёркивает?`, need: ["anaphora"], a: A => `анафора «${A.anaphora.word}…»: нагнетание, усиление` },
      { t: A => `Найдите сравнение ${q(A.similes[0])}. Что с чем сравнивается и зачем?`, need: ["similes"], a: () => "сравнение" },
      { t: A => `Слово «${A.repeats[0].word}» повторяется ${A.repeats[0].n} раз(а). Случайно ли это?`, need: ["repeats"], a: A => `повтор «${A.repeats[0].word}» — смысловой центр` },
      { t: A => `Строка ${q(short(A.qLines[0], 80))} — вопрос. Кому он адресован и ждёт ли ответа?`, need: ["qLines"], a: () => "риторический вопрос" },
      { t: A => `В тексте сталкиваются «${A.pairs[0][0]}» и «${A.pairs[0][1]}». Как называется такой приём и что он даёт?`, need: ["pairs"], a: () => "антитеза" },
      { t: A => `Обратите внимание на сочетание «${A.epithets[0]}». Чем оно необычно? Какое это средство?`, need: ["epithets"], a: () => "эпитет" },
      { t: A => `Почему текст называется ${q(A.title)}? Как заглавие связано с финалом?`, need: ["title"] },
      { t: A => `В тексте ${A.stanzaN} ${plural(A.stanzaN, "строфа", "строфы", "строф")}. Почему мысль разделена именно так?`, need: ["stanza2"] },
      { t: () => "Какой знак препинания чаще всего встречается в тексте? Как он связан с интонацией?" }
    ],
    T: [
      { t: A => `На какие части можно разделить текст? Где проходит граница?`, a: A => A.turn ? `перелом — строка «${short(A.turn.line, 60)}»` : null },
      { t: A => `Строка ${q(short(A.turn.line, 80))} начинается со слова «${A.turn.word}». Что меняется после неё?`, need: ["turn"], a: () => "композиционный перелом" },
      { t: A => `Сравните начало и финал: ${q(short(A.first, 60))} — ${q(short(A.last, 60))}. Как изменилась мысль?`, need: ["first", "last"] },
      { t: () => "Какое место текста, по-вашему, — кульминация? Докажите." },
      { t: A => `Начало и финал перекликаются. Что даёт такое «кольцо»?`, need: ["ring"], a: () => "кольцевая композиция" }
    ],
    M: [
      { t: A => `Как вы понимаете строку ${q(short(A.notable[2] || A.notable[0], 90))}? Что за ней стоит, кроме прямого смысла?`, need: ["notable"] },
      { t: A => `Ключевые слова текста — «${A.keywords.slice(0, 4).join("», «")}». Какая мысль их объединяет?`, need: ["keywords"] },
      { t: A => `Что автор не говорит прямо, но даёт понять в финале ${q(short(A.last, 70))}?`, need: ["last"] },
      { t: () => "О чём этот текст на самом деле, если сказать одной фразой?" },
      { t: () => "Какое слово из текста вы бы сделали его вторым названием? Почему?" }
    ],
    H: [
      { t: A => `Каким предстаёт ${A.heroes[0]} в этом эпизоде? Подтвердите словами текста.`, need: ["heroes"] },
      { t: A => `Почему ${A.heroes[0]} поступает именно так? Был ли другой выбор?`, need: ["heroes"] },
      { t: A => `Сравните: ${A.heroes[0]} и ${A.heroes[1]}. В чём их главное различие?`, need: ["heroes2"] },
      { t: () => "Какая деталь портрета или поведения героя больше всего говорит о его характере?" },
      { t: A => `Что ${A.heroes[0]} теряет и что обретает к финалу?`, need: ["heroes"] }
    ],
    HL: [
      { t: () => "Каким вы представляете лирического героя? Какие слова текста помогают его увидеть?" },
      { t: A => `Что лирический герой принимает, а от чего отказывается? Найдите строки${A.pairs?.length ? ` (подсказка: «${A.pairs[0][0]}» и «${A.pairs[0][1]}»)` : ""}.` },
      { t: A => `Как меняется состояние лирического героя от строки ${q(short(A.first, 60))} к финалу?`, need: ["first"] },
      { t: A => `Кто говорит в тексте: «я», «мы» или голос со стороны? Что это меняет?`, a: A => A.pron ? (A.pron.ya > A.pron.my ? "преобладает «я» — личное высказывание" : A.pron.my > 0 ? "есть «мы» — голос поколения, народа" : null) : null }
    ],
    C: [
      { t: () => "С каким уже прочитанным произведением перекликается этот текст? Что общего и в чём различие?" },
      { t: A => `Сравните первую и последнюю строфу: что повторяется, а что изменилось?`, need: ["stanza2"] },
      { t: () => "Что объединяет тексты урока и чем отличается взгляд автора в каждом?" }
    ],
    K: [
      { t: A => `Что вы знаете о времени, когда ${A.author} создавал(а) этот текст? Где это «слышно» в строках?`, need: ["author"] },
      { t: () => "Как биография автора помогает понять этот текст? А где она, наоборот, может помешать?" },
      { t: () => "Какие реалии эпохи нужно пояснить современному читателю? Найдите их в тексте." }
    ],
    P: [
      { t: A => `Согласны ли вы с мыслью, выраженной в строке ${q(short(A.notable[0], 80))}? Аргументируйте.`, need: ["notable"] },
      { t: () => "Можно ли назвать финал текста счастливым? Докажите или опровергните." },
      { t: A => `Что, по-вашему, важнее для автора: «${A.pairs[0][0]}» или «${A.pairs[0][1]}»? Есть ли примирение?`, need: ["pairs"] },
      { t: A => `Прав ли ${A.heroes[0]}? Какие доводы «за» и «против» даёт текст?`, need: ["heroes"] }
    ],
    L: [
      { t: A => `Бывало ли у вас чувство, похожее на то, что в строке ${q(short(A.notable[0], 80))}?`, need: ["notable"] },
      { t: () => "Какое место текста вы бы перечитали ещё раз? Почему?" },
      { t: () => "Что бы вы спросили у автора после чтения?" }
    ],
    R: [
      { t: A => `Где в строке ${q(short(A.notable[0], 80))} вы сделаете паузу? Какое слово выделите голосом?`, need: ["notable"] },
      { t: () => "С какой интонацией нужно читать начало и как она меняется к финалу?" },
      { t: A => `Прочитайте ${q(short(A.exLines[0], 80))} двумя способами. Как меняется смысл?`, need: ["exLines"] }
    ]
  };
  // вопросы без текста произведения: опора только на тему и автора
  const T0 = {
    E: [() => "Какое чувство остаётся после первого чтения? Запишите одно слово.", () => "Какой момент текста задел вас сильнее всего?"],
    S: [() => "Какую картину вы представили при чтении? Что на первом плане?", () => "Если бы вы иллюстрировали текст, какой эпизод выбрали бы?"],
    F: [() => "Какие слова и приёмы помогают автору передать главное чувство?", () => "Найдите повтор (слово, звук, строку). Зачем он здесь?"],
    T: [() => "Как построен текст: из каких частей он состоит?", () => "Где происходит поворот мысли или сюжета?"],
    M: [() => "Какая мысль автора кажется вам главной?", () => "Что в тексте сказано не прямо, а намёком?"],
    H: [() => "Какой поступок героя кажется вам ключевым? Почему?", () => "Как меняется герой от начала к финалу?"],
    HL: [() => "Каким вы представляете лирического героя? Что он ценит?", () => "Как меняется настроение лирического героя от начала к финалу?"],
    C: [() => "С каким прочитанным произведением хочется сравнить этот текст?"],
    K: [p => `Что из жизни автора помогает понять тему «${p.topic}»?`],
    P: [() => "Какой вопрос текста остаётся открытым? Можно ли на него ответить однозначно?"],
    L: [() => "Совпало ли ваше ожидание от названия с тем, что вы прочитали?"],
    R: [() => "Какую строку (фразу) вы прочитаете вслух первой? С какой интонацией?"]
  };
  function has(A, need) {
    if (!A) return false;
    return (need || []).every(n => n === "heroes2" ? A.heroes?.length >= 2 : n === "stanza2" ? A.stanzaN >= 2 : n === "ring" ? !!A.ring : Array.isArray(A[n]) ? A[n].length > 0 : !!A[n]);
  }
  /* Один вопрос заданного типа. used — уже взятые в этот урок (без повторов внутри урока) */
  const DRAMA = /(пьес|комеди|драм|трагеди|ревизор|горе от ума|гроза|вишн[её]в\w* сад|на дне|недоросль|мещанин|ромео|гамлет|маскарад|бесприданниц|чайк|три сестры|фауст)/i;
  function genreOf(p, A) {
    const t = String(p.topic || "").toLowerCase();
    if (DRAMA.test(t)) return "drama";
    if (A?.verse || /lyric|performative/.test(p.type?.id || "") || /лирик|стихотворени/.test(t)) return "lyric";
    return "prose";
  }
  function question(cat, A, p, used) {
    if (cat === "H" && (A?.verse || /lyric|performative/.test(p.type?.id || "")) && !(A?.heroes?.length)) cat = "HL";
    // вопросы-образцы из методических файлов: только подходящие по роду литературы (лирика / эпос и драма)
    // род литературы урока: лирика, драма или проза; вопрос из файла годится, если не называет чужой род
    const g = genreOf(p, A);
    const MARK = { lyric: /(стихотворени|строф|лирик|лирическ|рифм|поэт)/i, drama: /(пьес|комеди|драм|трагеди|действи[еяи]|сцен[аеуы]|ремарк)/i, prose: /(рассказ|роман|повест|сказк|глав[аеуы]|рассказчик)/i };
    const genreOk = t => Object.entries(MARK).every(([k, re]) => k === g || !re.test(t)) && !(g === "lyric" && /(персонаж|эпизод|сюжет)/i.test(t));
    const fromFiles = typeof Learn !== "undefined" ? Learn.genericQuestions(cat === "HL" ? "H" : cat).filter(x => !used.has(hash(x.text)) && genreOk(x.text) && !(Learn.offTopic && Learn.offTopic(x.text, p.topic)) && (cat !== "HL" || /лирическ/i.test(x.text))) : [];
    const sys = A ? (T[cat] || []).filter(x => has(A, x.need)) : [];
    const sysTexts = sys.map(x => ({ text: x.t(A), a: x.a ? x.a(A) : null, src: null })).filter(x => !used.has(hash(x.text)));
    const noText = (T0[cat] || []).map(f => ({ text: f(p), a: null, src: null })).filter(x => !used.has(hash(x.text)));
    // с текстом: 2/3 — вопросы с опорой на цитаты, 1/3 — образцы из методических файлов; без текста — наоборот
    let pool;
    const r = rnd();
    if (sysTexts.length && (r < (A ? 0.66 : 0.3) || !fromFiles.length)) pool = sysTexts;
    else if (fromFiles.length) pool = fromFiles.map(x => ({ text: x.text, a: null, src: x.src }));
    else pool = noText;
    if (!pool.length) pool = noText;
    const [pick] = pickLRU(pool, "q", x => hash(x.text), 1);
    if (!pick) return null;
    used.add(hash(pick.text));
    return { ...pick, cat };
  }

  /* Этап техкарты литературы → типы вопросов */
  const LIT_STAGE_CATS = [
    [/^творческ/i, []],
    [/партитур|исполнительск/i, ["R", "R"]],
    [/синтез|итог|вывод|обобщ/i, ["M", "P"]],
    [/анализ|аналит|беседа|информацион|работа над темой/i, ["F", "S", "M", "T"]],
    [/эмоциональн|настро|фон(?:(?<=[A-Za-z0-9_А-Яа-яЁё])(?![A-Za-z0-9_А-Яа-яЁё])|(?<![A-Za-z0-9_А-Яа-яЁё])(?=[A-Za-z0-9_А-Яа-яЁё]))/i, ["E", "L"]],
    [/эпиграф|тезис-эпиграф/i, ["P", "M"]],
    [/хронолог|узлов|жизн|биограф|документ|письм|дневник|воспомин|истори[яи] создан|эпох/i, ["K", "L"]],
    [/партитур|исполнит|логическ|пауз|интонац|выразительн[A-Za-z0-9_А-Яа-яЁё]* чтен/i, ["R", "R"]],
    [/восприят|первичн|чтени|слушан/i, ["E", "S"]],
    [/систем.*персонаж|персонаж|конфликт|геро/i, ["H", "H"]],
    [/композиц|план(?:(?<=[A-Za-z0-9_А-Яа-яЁё])(?![A-Za-z0-9_А-Яа-яЁё])|(?<![A-Za-z0-9_А-Яа-яЁё])(?=[A-Za-z0-9_А-Яа-яЁё]))|по частям|част[ьи](?:(?<=[A-Za-z0-9_А-Яа-яЁё])(?![A-Za-z0-9_А-Яа-яЁё])|(?<![A-Za-z0-9_А-Яа-яЁё])(?=[A-Za-z0-9_А-Яа-яЁё]))/i, ["T", "F"]],
    [/сравн|сопостав|диалог искусств|медиа/i, ["C", "S"]],
    [/цитат|подтекст|скрыт|комментари/i, ["M", "F"]],
    [/троп|образ/i, ["F", "S", "M"]],
    [/мотивац|актуализ|ассоциат|проблем|организац|опор|настро|установк/i, ["L", "P"]]
  ];
  const REFLECT = [
    "— Закончите фразу: «Сегодня я впервые заметил(а), что…».",
    "— Закончите фразу: «Если бы я мог(ла) задать автору один вопрос, я спросил(а) бы…».",
    "— Одно слово-итог урока: какое слово из текста вы унесёте с собой?",
    "— Каким цветом вы бы обозначили своё настроение в начале урока и сейчас? Почему изменилось (или нет)?",
    "— Закончите фразу: «Строка, которую я запомню, — … потому что…».",
    "— Закончите фразу: «Если бы я зажигал(а) звезду, я зажёг(ла) бы её для…, потому что…».",
    "— Что на уроке было открытием, а что вызвало сомнение? Назовите одно и другое."
  ];
  function stageQuestions(stage, A, p, used, n = 2) {
    if (/рефлекс/i.test(stage)) { const [r] = pickLRU(REFLECT, "q", hash, 1, used); if (r) { used.add(hash(r)); return [{ text: r.replace(/^—\s*/, ""), cat: "L" }]; } }
    if (/домашн/i.test(stage) && !/рефлекс/i.test(stage)) return [];
    // сначала смотрим на название этапа (до двоеточия), потом на пояснение
    const head = stage.split(":")[0];
    const cats = (LIT_STAGE_CATS.find(([re]) => re.test(head)) || LIT_STAGE_CATS.find(([re]) => re.test(stage)) || [0, ["M", "F"]])[1];
    if (!cats.length) return [];
    const want = shuffle(cats).slice(0, n);
    if (want.length < n) want.push(cats[0]);
    // акценты из заметок учителя: один из вопросов этапа — нужного типа
    const cue = p.notes?.cues?.cats || [];
    if (cue.length && !/рефлекс|организац/i.test(stage) && rnd() < 0.6) want[want.length - 1] = cue[Math.floor(rnd() * cue.length)];
    return want.map(c => question(c, A, p, used)).filter(Boolean);
  }

  /* ---------- 3. Необычные форматы ---------- */
  const lyricType = id => /lyric|performative/.test(id);
  const epicType = id => /epic|commented/.test(id);
  const FORMATS = [
    { id: "sinkwine", name: "Синквейн", ages: [5, 11], fit: () => true,
      make: (A, p) => { const obj = A?.heroes?.[0] || (A?.title ? `образе «${A.title}»` : A?.keywords?.[0] ? `образе «${A.keywords[0]}»` : `главном образе темы «${p.topic}»`); return `Составьте синквейн ${/^образ/.test(obj) ? "об" : "о"} ${obj} — так, чтобы в нём прозвучал ваш ответ на вопрос урока: 1) одно существительное; 2) два прилагательных; 3) три глагола; 4) фраза из четырёх слов (можно строку из текста); 5) слово-вывод.`; } },
    { id: "diamante", name: "Диаманта", ages: [6, 11], fit: A => A?.pairs?.length > 0,
      make: A => `Составьте диаманту «${A.pairs[0][0]} — ${A.pairs[0][1]}»: 1) существительное-1; 2) два прилагательных к нему; 3) три глагола; 4) четыре существительных (два — о первом, два — о втором); 5) три глагола; 6) два прилагательных; 7) существительное-2. Как текст «переходит» от одного полюса к другому?` },
    { id: "acro", name: "Акрослово", ages: [5, 8], fit: A => A?.keywords?.some(w => w.length >= 4 && w.length <= 8),
      make: A => { const w = A.keywords.find(x => x.length >= 4 && x.length <= 8).toUpperCase(); return `Составьте акрослово «${w}»: каждая строка начинается с очередной буквы и говорит о прочитанном тексте (можно брать слова из текста).`; } },
    { id: "quest", name: "Литературный квест", ages: [5, 7], fit: (A, p, type) => !!A,
      make: A => { const st = [A.first && `найдите в тексте строку, с которой всё начинается, и предскажите по ней настроение`, A.colors?.length && `соберите все «цветные» слова текста`, A.sounds?.length && `найдите все звуки текста`, A.heroes?.length && `узнайте героя по трём словам текста`, A.similes?.length && `найдите сравнение и нарисуйте его`, A.qLines?.length && `найдите вопрос, на который текст не отвечает`, `найдите самую «тихую» и самую «громкую» строку`].filter(Boolean).slice(0, 4); return `Литературный квест (группы проходят станции, на каждой — задание по тексту): ${st.map((s, i) => `станция ${i + 1} — ${s}`).join("; ")}. Побеждает группа, которая подтвердила все ответы цитатами.`; } },
    { id: "trial", name: "Суд над героем", ages: [7, 11], fit: (A, p, type) => (A?.heroes?.length > 0 || epicType(type.id)) && !lyricType(type.id),
      make: (A, p) => { const h = A?.heroes?.[0] || "главным героем"; return `Суд над героем: ${h}. Роли: обвинитель, защитник, свидетели (другие персонажи), присяжные. Каждая сторона приводит не меньше трёх доказательств — только цитаты и эпизоды. Присяжные выносят решение и объясняют его.`; } },
    { id: "debate", name: "Дебаты", ages: [8, 11], fit: (A, p, type) => /problem|epic|commented|lyricTheme|bio/.test(type.id),
      make: (A, p) => { const thesis = A?.pairs?.length ? `в тексте побеждает «${A.pairs[0][0]}», а не «${A.pairs[0][1]}»` : A?.heroes?.length ? `${A.heroes[0]} прав(а)` : `тема «${p.topic}» актуальна и сегодня`; return `Дебаты. Тезис: «${thesis}». Две команды готовят по три аргумента с опорой на текст; затем — по одному контраргументу. Итог: какая команда точнее опиралась на текст?`; } },
    { id: "playlist", name: "Литературный плейлист", ages: [6, 11], fit: (A, p, type) => lyricType(type.id) || type.id === "lyricTheme" || (A?.verse),
      make: A => `Литературный плейлист: подберите 2–3 музыкальных произведения (любого жанра) к частям текста. Для каждого трека укажите строку текста, к которой он «звучит», и объясните выбор одним предложением.` },
    { id: "tableau", name: "Ожившие картины", ages: [5, 9], fit: (A, p, type) => epicType(type.id) || A?.dialog,
      make: A => `Ожившие картины: группа выбирает ключевой эпизод и показывает его немой сценой (застывшая поза, 10 секунд). Класс угадывает эпизод и называет строку текста, которую «показали». Затем один участник «оживает» и произносит реплику героя.` },
    { id: "letter", name: "Письмо от героя", ages: [6, 11], fit: (A, p, type) => A?.heroes?.length > 0 || epicType(type.id),
      make: (A, p) => { const h = A?.heroes?.[0] || "героя"; const to = A?.heroes?.[1] || "автору"; return `Письмо от героя: напишите письмо от лица ${h} — ${to === "автору" ? "автору" : "адресату: " + to} — после главного события текста (8–10 предложений). В письме должны быть две детали из текста и одна фраза, которую герой мог бы сказать сам.`; } }
  ];
  function chooseFormat(A, p, type) {
    const grade = +p.grade || 7;
    // формат, который учитель назвал в заметках, — в приоритете (если подходит возрасту)
    const want = p.notes?.cues?.format && FORMATS.find(f => f.id === p.notes.cues.format);
    if (want && grade >= want.ages[0] - 1 && grade <= want.ages[1] + 1) return { id: want.id, name: want.name, task: want.make(A, p, type), byTeacher: true };
    const last = H.lastFormats(1)[0];
    const ok = FORMATS.filter(f => grade >= f.ages[0] && grade <= f.ages[1] && f.fit(A, p, type) && f.id !== last);
    const [f] = pickLRU(ok, "fmt", x => x.id, 1);
    return f ? { id: f.id, name: f.name, task: f.make(A, p, type) } : null;
  }

  /* ---------- 4. Структура урока ---------- */
  function adaptStages(type, p, A, sample, fmt) {
    let stages = type.stages.slice(), note = "";
    // а) образцовый урок на ту же тему (сборник планов-конспектов, разработки): берём его структуру, а не текст
    if (sample && sample.stages.length >= 4) {
      const flat = [];
      sample.stages.forEach(s => { if (/работа над темой|изучение нового|аналитическ|информационно/i.test(s.name) && s.steps.length) s.steps.slice(0, 6).forEach(st => flat.push(`${s.name.replace(/[.:]$/, "")}: ${st.replace(/[.:]$/, "")}`)); else flat.push(s.name.replace(/[.:]$/, "")); });
      if (flat.length >= 4 && flat.length <= 14) { stages = flat; note = `по образцовому уроку «${short(sample.topic.replace(/[«»]/g, "\""), 80)}» (${sample.src}${sample.num ? `, урок № ${sample.num}` : ""})`; }
    }
    if (!note) {
      // б) по классу
      if (p.grade <= 6 && /lyric|epic|commented/.test(type.id)) { const i = stages.findIndex(s => /восприят|чтени эпизод|история создан/i.test(s)); if (i >= 0) stages.splice(i + 1, 0, "Словарная работа: непонятные слова и реалии текста"); }
      if (p.grade >= 10 && /epic|problem|bio|lyricTheme/.test(type.id)) { const i = stages.findIndex(s => /синтез|итог|вывод/i.test(s)); if (i >= 0) stages.splice(i, 0, "Работа с критикой: тезисы статьи и спор с ней"); }
      // в) по тексту
      if (A?.pairs?.length >= 2 && /lyric/.test(type.id)) { const i = stages.findIndex(s => /анализ|аналит/i.test(s)); if (i >= 0) stages.splice(i + 1, 0, "Бинарные оппозиции: пары образов текста"); }
      if (A?.dialog && /epic|commented/.test(type.id)) { const i = stages.findIndex(s => /чтени|эпизод/i.test(s)); if (i >= 0) stages.splice(i + 1, 0, "Чтение по ролям: диалог героев"); }
      const parts = [p.grade <= 6 ? "для младших — словарная работа" : p.grade >= 10 ? "для старших — работа с критикой" : "", A?.pairs?.length >= 2 && /lyric/.test(type.id) ? "в тексте есть антитеза — бинарные оппозиции" : "", A?.dialog && /epic|commented/.test(type.id) ? "в эпизоде диалог — чтение по ролям" : ""].filter(Boolean);
      if (parts.length) note = "подстроена под класс и текст: " + parts.join("; ");
    }
    // г) необычный формат урока — отдельным этапом перед рефлексией
    if (fmt) { const i = stages.findIndex(s => /рефлекс/i.test(s)); stages.splice(i >= 0 ? i : stages.length, 0, `Творческое задание: ${fmt.name.toLowerCase()}`); }
    return { stages, note };
  }

  /* ---------- 5. Подготовка урока: текст, анализ, образец, формат ---------- */
  async function findText(p, L) {
    if (p.textOverride?.text) return { text: p.textOverride.text, source: p.textOverride.source || "текст учителя" };
    // 1) текст, который учитель вставил в заметки
    const own = p.notes?.text && p.notes.text.trim().length > 80 ? p.notes.text : null;
    if (own) return { text: own, source: "текст из заметок учителя" };
    if (p.subject !== "lit") return null;
    // 2) встроенная база: стихотворный фрагмент из разработки урока именно по этому произведению
    const work = (p.topic.match(/«([^»]+)»/) || [])[1];
    const wl = work ? work.toLowerCase().replace(/ё/g, "е") : null;
    for (const l of L) {
      if (!wl || !String(l.topic).toLowerCase().replace(/ё/g, "е").includes(wl.slice(0, 18))) continue;
      const blocks = String(l.text).match(/(?:^|\n)((?:[^\n|]{8,70}\n){8,80})/g) || [];
      const verse = blocks.map(b => b.trim()).filter(b => {
        const ls = b.split("\n");
        const caps = ls.filter(x => /^[«"—–(]?\s*[А-ЯЁ]/.test(x)).length / ls.length;
        const ends = ls.filter(x => /[.:]$/.test(x)).length / ls.length;
        const numbered = ls.filter(x => /^(\d+[.)]|[а-е]\)|[IVX]+\.|•|-)\s/.test(x)).length;
        return caps > 0.7 && ends < 0.45 && numbered === 0;
      }).sort((a, b) => b.length - a.length)[0];
      if (verse) return { text: verse, source: `встроенная база: ${l.src}${l.num ? `, урок № ${l.num}` : ""}` };
    }
    // 3) внешние источники: Викитека
    if (work && typeof Base !== "undefined" && Base.wikisourceText) {
      const author = typeof Engine !== "undefined" ? Engine.authorOf(p.topic) : null;
      const w = await Base.wikisourceText(`${work} ${author ? author.split(/\s|\./).filter(Boolean).pop() : ""}`.trim(), 20000).catch(() => null);
      if (w) return { text: w.text, source: `${w.source}: «${w.title}»`, url: w.url };
    }
    return null;
  }
  async function prepare(p, type) {
    reseed(p.topic + p.grade + p.lessonNo);
    const samples = p.subject === "lit" && typeof Learn !== "undefined" ? Learn.lessonsFor(p.topic, p.grade, 3) : [];
    const found = await findText(p, samples).catch(() => null);
    const author = typeof Engine !== "undefined" ? Engine.authorOf(p.topic) : null;
    const title = (p.topic.match(/«([^»]+)»/) || [])[1] || null;
    const A = found ? analyze(found.text, { title, author, source: found.source, url: found.url, epic: /epic|commented/.test(type.id) }) : null;
    const fmt = p.subject === "lit" ? chooseFormat(A, p, type) : chooseRuFormat(p);
    const sample = samples[0] || null;
    const st = p.subject === "lit" ? adaptStages(type, p, A, sample, fmt) : { stages: type.stages.slice(), note: "" };
    const plan = { text: found ? String(found.text).slice(0, 40000) : null, analysis: A, format: fmt, sample: sample ? { topic: sample.topic, src: sample.src, num: sample.num, epigraph: sample.epigraph, questions: sample.questions.slice(0, 40).map(q => q.text) } : null, stages: st.stages, structureNote: st.note, textSource: found ? found.source : null, textUrl: found?.url || null, used: [] };
    // открытые источники: статья о произведении (Википедия) — для проблемного вопроса и ориентира учителя
    if (p.subject === "lit" && title && typeof Base !== "undefined" && Base.wikiSummary) {
      try { const sur = author ? author.split(/\s|\./).filter(Boolean).pop() : ""; const w = await Promise.race([Base.wikiSummary(`${title}${sur ? " (" + sur + ")" : ""}`), new Promise(r => setTimeout(() => r(null), 6000))]); const t = w?.extract || w?.text || (typeof w === "string" ? w : ""); if (t && (!sur || t.includes(sur.slice(0, 5)))) plan.workWiki = String(t).slice(0, 3000); } catch { }
    }
    // методический набор урока литературы: фрагменты, вопросы с ответами, словарь, термины, выводы
    if (p.subject === "lit" && typeof LitKit !== "undefined") { try { plan.kit = LitKit.build(p, plan); } catch (e) { console.warn("LitKit", e); } }
    // профиль урока русского языка: свой формат для орфографии, пунктуации, синтаксиса, лексики, стилей…
    if (p.subject === "ru" && typeof RuKit !== "undefined") { try { plan.rukit = RuKit.build(p); const st2 = type.id !== "ctrl" && !/контрол/i.test(type.name || "") ? RuKit.stagesFor(plan.rukit) : null; if (st2) { plan.stages = st2; plan.structureNote = `урок-практикум (${plan.rukit.label.toLowerCase()})`; } } catch (e) { console.warn("RuKit", e); } }
    return plan;
  }
  /* После сборки: запомнить, что использовано, чтобы следующий урок был другим */
  function commit(plan) {
    if (!plan) return;
    if (plan.used?.length) H.mark("q", plan.used);
    if (plan.format) H.mark("fmt", plan.format.id);
    if (plan.exUsed?.length) H.mark("ex", plan.exUsed);
  }

  /* ---------- 6. Литература: строки техкарты ---------- */
  function litRow(stage, p, plan, mins) {
    const used = new Set(plan.used);
    let qs = stageQuestions(stage, plan.analysis, p, used, /анализ|аналит|беседа|работа над темой|информацион/i.test(stage) ? 3 : 2);
    // из образцового урока на ту же тему — не больше одного вопроса на этап
    if (plan.sample?.questions?.length && /анализ|беседа|работа над темой|комментари|синтез/i.test(stage) && rnd() < 0.5) {
      const sq = plan.sample.questions.find(x => !used.has(hash(x)) && x.length < 200 && !(Learn.offTopic && Learn.offTopic(x, p.topic)));
      if (sq) { used.add(hash(sq)); qs = [...qs.slice(0, 2), { text: sq, cat: Learn.classify(sq), src: `образец: ${plan.sample.src}${plan.sample.num ? `, урок № ${plan.sample.num}` : ""}` }]; }
    }
    plan.used = [...used];
    if (/^домашн/i.test(stage)) return { teacher: "— Домашнее задание — на слайде и в конце конспекта. Какое задание вы выберете: базовое или повышенное? *(выбор ученика)*", methods: "Регулятивные: планирование." };
    plan.qsrc = plan.qsrc || [];
    qs.forEach(x => { if (x.src && !plan.qsrc.includes(x.src)) plan.qsrc.push(x.src); });
    let teacher = qs.map(x => `— ${x.text}${x.a ? ` *(${x.a})*` : " *(ответы учеников)*"}`).join("<br>");
    if (/эпиграф/i.test(stage) && plan.sample?.epigraph) teacher = `Эпиграф: «${plan.sample.epigraph.text.replace(/\s*\n\s*/g, " / ").trim()}» (${plan.sample.epigraph.author}).<br>` + teacher; // эпиграф — дословно, без сокращения
    if (/^Творческое задание/i.test(stage) && plan.format) teacher = plan.format.task;
    if (/восприят|первичн/i.test(stage)) teacher = `— Слушая, ${pickLRU(["отметьте строку, где меняется настроение", "запишите одно слово, которое останется после чтения", "отметьте слово, которое хочется произнести громче остальных", "подчеркните одну деталь, которую легко «увидеть»", "отметьте место, где вам стало тревожно (или светло)"], "q", hash, 1)[0]}. *(целевая установка на чтение)*<br>` + teacher;
    // v5.8: работа с фрагментами текста, проблемный вопрос, словарь — по методическому набору урока (LitKit)
    const kit = plan.kit;
    if (kit && !/^Творческое задание|^домашн/i.test(stage)) {
      if (/мотивац|постановк|проблем|целеполаг/i.test(stage) && !plan.problemShown) { teacher += `<br>— Проблемный вопрос урока: ${kit.problem} *(записывают в тетрадь; ответ — в конце урока, в выводах)*`; plan.problemShown = true; }
      if (/словар/i.test(stage) && kit.glossary.length) teacher = `Словарная работа (слайд «Словарь»; слова кликабельны во фрагментах): ${kit.glossary.map(g => `**${g.word}** — ${g.def}`).join("; ")}.<br>` + teacher;
      if (/итог|вывод|обобщ|рефлекс/i.test(stage) && !plan.answerShown) { teacher += `<br>— Вернёмся к проблемному вопросу: ${kit.problem} Сформулируйте ответ, опираясь на фрагменты, с которыми работали. *(Ожидаемый ответ: ${kit.answer || "ученики формулируют главную мысль с опорой на 2–3 цитаты из разных фрагментов"})*<br>— Запишите выводы в тетрадь (слайд «Выводы»).`; plan.answerShown = true; }
      if (/восприят|первичн|чтени/i.test(stage)) teacher += `<br>Читаем ${kit.fragments[0]?.whole ? "текст целиком" : `фрагменты 1–${kit.fragments.length}`} — на слайдах, дословно.`;
      if (/анализ|аналит|комментар|эпизод|композиц|конфликт|персонаж|образ|синтез|беседа|работа над|наблюд/i.test(stage) && kit.fragments.length) {
        // все фрагменты распределяются по этапам анализа (ни один не теряется)
        const AN = /анализ|аналит|комментар|эпизод|композиц|конфликт|персонаж|образ|синтез|беседа|работа над|наблюд/i;
        const nSt = Math.max(1, (plan.stages || []).filter(s => AN.test(s) && !/^Творческое|домашн/i.test(s)).length);
        const per = Math.ceil(kit.fragments.length / nSt), k = plan.fragI || 0;
        const take = kit.fragments.slice(k, k + per); plan.fragI = k + per;
        take.forEach(fr => { (plan.fragStage = plan.fragStage || {})[fr.n] = stage.split(":")[0].trim(); });
        if (take.length) teacher = take.map(fr => {
          const qa = (kit.qa.find(x => x.n === fr.n) || { items: [] }).items;
          const firstLine = String(fr.text).split("\n").find(l => l.trim()) || "";
          return `**Работа ${fr.part ? `с частью ${fr.n} («${fr.label}»)` : `с фрагментом ${fr.n}. ${fr.label}`}** («${firstLine.trim().replace(/[.,;:—–-]+$/, "")}…»${fr.whole ? "" : `, строки ${fr.from}–${fr.to}`}; текст на слайде):<br>` + qa.map(x => `— ${x.q} *(Ожидаемый ответ: ${x.a})*`).join("<br>");
        }).join("<br>");
        else teacher = teacher.split("<br>").slice(0, 2).join("<br>");
      }
    }
    const cats = /^творческ/i.test(stage) ? [] : [...new Set(qs.map(x => x.cat === "HL" ? "H" : x.cat))].map(c => Learn.CATS[c]?.label).filter(Boolean);
    const methods = cats.length ? `Вопросы: ${cats.join(", ")}.` : "";
    const uud = /рефлекс/i.test(stage) ? "Регулятивные: рефлексия." : /сравн|сопостав/i.test(stage) ? "Познавательные: сравнение. Коммуникативные: аргументация." : /контекст|биограф|хронолог|документ/i.test(stage) ? "Познавательные: работа с источником." : /творческ/i.test(stage) ? "Коммуникативные: совместная деятельность. Личностные: эстетическое воспитание." : "Познавательные: анализ текста.";
    return { teacher, methods: [methods, uud].filter(Boolean).join(" ") };
  }

  /* ---------- 7. Литература: рабочий лист ---------- */
  const BL = "[ ________________________________________ ]";
  function litWorksheet(p, type, plan) {
    const A = plan.analysis, used = new Set(plan.used), tasks = [];
    // восприятие
    const perception = [
      "Запишите одно слово или фразу, которые остались после первого чтения.",
      "Каким цветом вы бы обозначили настроение начала текста и его финала? Объясните разницу.",
      "Назовите две эмоции, которые сменяют друг друга в тексте (можно по «колесу эмоций»). Найдите слова, которые их вызывают.",
      p.grade <= 7 ? "Нарисуйте (схематично) картинку, которая возникла при чтении, и подпишите строкой из текста." : "Какая строка «зацепила» вас сильнее всего? Выпишите её и объясните почему."
    ];
    tasks.push({ lvl: 1, text: pickLRU(perception, "q", hash, 1, used)[0], lines: 2 });
    // единый комплект урока (тот же, что в конспекте и на слайдах): словарь, фрагменты, термины, выводы
    const K = plan.kit;
    if (K) {
      const G = (K.glossary || []).slice(0, 6);
      if (G.length >= 3) {
        const L = "АБВГДЕЖЗ", order = G.map((g, i) => (i + Math.ceil(G.length / 2)) % G.length);
        tasks.push({ lvl: 1, name: "Словарная работа", text: `Соедините устаревшее слово с его значением (на слайде «Словарная работа» — подсказка: щёлкните по слову во фрагменте). Ответ запишите парами: 1 — Б, …

| № | Слово | Буква | Значение |
|---|---|---|---|
${G.map((g, i) => `| ${i + 1} | ${g.word} |  | ${L[i]}) ${G[order[i]].def} |`).join("\n")}` });
        H.mark("task", ["gloss:" + p.topic]);
      }
      for (const f of (K.fragments || []).slice(0, 4)) {
        const it = (K.qa || []).find(x => x.n === f.n)?.items || [];
        if (!it.length) continue;
        const first = String(f.text).split("\n").find(l => l.trim()) || "";
        tasks.push({ lvl: it.length > 1 ? 2 : 1, name: f.part ? `Часть ${f.n}` : `Фрагмент ${f.n}`, text: `**${f.part ? `Часть ${f.n}. ${f.label}` : `Фрагмент ${f.n}. ${f.label}`}** (строки ${f.from}–${f.to}, текст на слайде; начало: «${clip(short(first, 50))}…»).\n\n${it.slice(0, 2).map((x, j) => `${j + 1}) ${x.q}`).join("\n\n")}`, lines: Math.min(4, 2 * Math.min(2, it.length)) });
      }
      const T = (K.terms || []).slice(0, 5);
      if (T.length) tasks.push({ lvl: 2, name: "Работа с терминами", text: `Запишите определения терминов (слайды «Работа с терминами») и найдите пример во фрагментах урока.\n\n| Термин | Определение | Пример из текста (фрагмент №) |\n|---|---|---|\n${T.map(t => `| ${t.term} |  |  |`).join("\n")}` });
      if (K.heroes?.length >= 2) tasks.push({ lvl: 2, name: "Сравним героев", text: `Сравните героев (та же таблица — на слайде).\n\n| Признак | ${K.heroes[0]} | ${K.heroes[1]} |\n|---|---|---|\n${(K.rows || ["Поступки", "Речь (цитата)", "Отношение автора"]).map(r => `| ${r} |  |  |`).join("\n")}` });
      if (K.problem) tasks.push({ lvl: 2, name: "Проблемный вопрос", text: `Ответьте на проблемный вопрос урока (5–7 предложений, две цитаты из разных фрагментов): **${K.problem}**`, lines: 4 });
      tasks.push({ lvl: 1, name: "Выводы", text: `Запишите выводы урока (слайд «Выводы»), заполнив пропуски.\n\n- Средства выразительности, которые мы нашли: ____________________\n- Жанр и его особенности: ____________________\n- Главная мысль (ответ на проблемный вопрос): ____________________` });
      if (plan.format) tasks.push({ lvl: 3, text: plan.format.task, lines: 3, name: plan.format.name });
      plan.used = [...used];
      return tasks;
    }
    // анализ — набор зависит от того, что найдено в тексте
    const an = [];
    const dev = [];
    if (A?.anaphora) dev.push(["анафора", `«${A.anaphora.word}…»`]);
    if (A?.pairs?.length) dev.push(["антитеза", `«${A.pairs[0][0]}» — «${A.pairs[0][1]}»`]);
    if (A?.similes?.length) dev.push(["сравнение", `«${clip(short(A.similes[0], 50))}»`]);
    if (A?.epithets?.length) dev.push(["эпитет", `«${A.epithets[0]}»`]);
    if (A?.qLines?.length) dev.push(["риторический вопрос", `«${clip(short(A.qLines[0], 50))}»`]);
    if (A) an.push({ id: "devices", lvl: 1, text: `Заполните таблицу средств выразительности.${dev.length ? " Первая строка — образец." : ""}\n\n| Средство | Пример из текста | Роль (что подчёркивает) |\n|---|---|---|\n${dev.length ? `| ${dev[0][0]} | ${dev[0][1]} |  |\n` : ""}|  |  |  |\n|  |  |  |` });
    if (A?.notable?.length >= 2) an.push({ id: "quotes", lvl: 2, text: `Прокомментируйте строки. Что в них сказано прямо, а что — между строк?\n\n| Цитата | Комментарий | Подтекст |\n|---|---|---|\n| «${clip(short(A.notable[0], 70))}» |  |  |\n| «${clip(short(A.notable[1], 70))}» |  |  |` });
    if (A?.pairs?.length >= 2) an.push({ id: "binary", lvl: 2, text: `Бинарные оппозиции. Заполните пары образов и ответьте: снимается ли противостояние в финале?\n\n| Полюс 1 | Полюс 2 | Где в тексте |\n|---|---|---|\n${A.pairs.slice(0, 3).map(x => `| ${x[0]} | ${x[1]} |  |`).join("\n")}` });
    if (A && A.lines >= 6) an.push({ id: "parts", lvl: 1, text: `Разделите текст на части и озаглавьте каждую цитатой. Отметьте строку, где происходит поворот мысли${A.turn ? " (подсказка: ищите слово «" + A.turn.word + "»)" : ""}.\n\n| Часть | Строки | Заголовок-цитата |\n|---|---|---|\n| 1 |  |  |\n| 2 |  |  |\n| 3 |  |  |` });
    if (A?.verse && A.stanzas?.length) { const s = A.stanzas[Math.min(A.stanzas.length - 1, Math.floor(rnd() * A.stanzas.length))]; an.push({ id: "score", lvl: 2, text: `Партитура чтения. Разметьте строфу: | — короткая пауза, || — длинная пауза, подчеркните слова с логическим ударением, стрелкой ↑↓ — повышение и понижение голоса.\n\n${s.map(l => "> " + l).join("\n")}` }); }
    if (A?.keywords?.length >= 3) an.push({ id: "keyword", lvl: 1, text: `Выпишите из текста все слова, связанные со словом «${A.keywords[0]}» (по смыслу, по звуку, по цвету). Какой образ из них складывается?` });
    if (A?.heroes?.length) an.push({ id: "hero", lvl: 2, text: `Характеристика героя: ${A.heroes[0]}.\n\n| Поступок или слова героя | Цитата | Черта характера |\n|---|---|---|\n|  |  |  |\n|  |  |  |\n|  |  |  |` });
    if (!A) {
      an.push({ id: "devices0", lvl: 1, text: `Найдите в тексте три средства выразительности и объясните их роль.\n\n| Средство | Пример из текста | Роль |\n|---|---|---|\n|  |  |  |\n|  |  |  |\n|  |  |  |` });
      an.push({ id: "quotes0", lvl: 2, text: `${type.id === "commented" ? "Заполните таблицу по эпизоду." : "Найдите 2–3 ключевые цитаты и объясните их смысл."}\n\n| Цитата | Комментарий | Подтекст |\n|---|---|---|\n|  |  |  |\n|  |  |  |` });
    }
    const chosen = pickLRU(an, "task", x => x.id + ":" + p.topic, Math.min(3, an.length));
    chosen.sort((a, b) => a.lvl - b.lvl).forEach(x => tasks.push({ lvl: x.lvl, text: x.text }));
    H.mark("task", chosen.map(x => x.id + ":" + p.topic));
    // проблемный вопрос — свой для каждого урока
    const pq = question("P", A, p, used) || question("M", A, p, used);
    tasks.push({ lvl: 2, text: `Ответьте на вопрос (5–7 предложений, с опорой на текст): ${pq ? pq.text : "в чём главная мысль текста?"}`, lines: 3 });
    // творческое / необычный формат
    if (plan.format) tasks.push({ lvl: 3, text: plan.format.task, lines: 3, name: plan.format.name });
    plan.used = [...used];
    return tasks;
  }

  /* ---------- 7б. Домашнее задание (литература): разное от урока к уроку ---------- */
  function homework(p, type, plan) {
    const A = plan?.analysis, lyric = A?.verse || /lyric|performative/.test(type.id);
    const base = [
      lyric && "выучить стихотворение наизусть (по выбору — строфу или полностью) и подготовить его выразительное чтение по партитуре",
      lyric && A?.notable?.length && `выписать из текста три строки, которые лучше всего передают настроение, и объяснить выбор (одна из них — «${clip(short(A.notable[0], 60))}»)`,
      !lyric && "перечитать ключевой эпизод и составить его цитатный план (5–6 пунктов)",
      !lyric && A?.heroes?.length && `составить таблицу «Поступок — цитата — черта характера» для героя: ${A.heroes[0]}`,
      "составить словарик непонятных слов и реалий текста с толкованиями (по словарю)",
      "подготовить устный ответ на вопрос урока с двумя цитатами"
    ].filter(Boolean);
    const adv = [
      `написать мини-сочинение (8–10 предложений): ${(question("P", A, p, new Set(plan?.used || [])) || { text: "в чём главная мысль текста?" }).text}`,
      "найти другое произведение на ту же тему и письменно сопоставить его с изученным (общее и различие, по две цитаты)",
      lyric ? "написать анализ одной строфы по плану: тема, образы, средства, интонация, роль в целом тексте" : "написать отзыв о прочитанном от лица критика XIX века и от лица современного читателя",
      plan?.format && plan.format.id !== "playlist" && plan.format.id !== "quest" ? `доработать дома творческое задание урока (${plan.format.name.toLowerCase()}) и подготовить его презентацию` : null
    ].filter(Boolean);
    const [b] = pickLRU(base, "hw", hash, 1), [a] = pickLRU(adv, "hw", hash, 1);
    H.mark("hw", [hash(b), hash(a)]);
    return { base: b, adv: a };
  }

  /* ---------- 8. Русский язык ---------- */
  const RU_ALT = {
    "мотивац.*контрол": [["— Какие правила по теме «{T}» вы применяете увереннее всего? Где ещё сомневаетесь?", "— Как вы поймёте, что работа выполнена хорошо?"], ["— Представьте, что вы проверяете работу одноклассника. На что посмотрите в первую очередь?"], ["— Какой вопрос по теме «{T}» вы бы задали на контрольной сами себе?"]],
    "мотивац.*коррекц": [["— В каком задании прошлого урока чаще всего ошибались? Почему?", "— Что сегодня нужно потренировать?"], ["— Вспомните правило с прошлого урока одним предложением. Кто сформулирует короче?"], ["— Найдите ошибку в предложении на доске. Каким правилом вы воспользовались?"]],
    "мотивац": [["— Сравните два предложения на доске. Что в них общего, чем они различаются?", "— О чём, по-вашему, пойдёт речь, если тема звучит так: «{T}»?"], ["— Прочитайте фразу на доске. Что в ней «не так» — или всё правильно?", "— Какое правило поможет это доказать?"], ["— Перед вами слово (предложение), которое пишут с ошибкой чаще всего. Почему, как вы думаете?"], ["— Где в жизни вам пригодится умение, которому посвящена тема «{T}»?"]],
    "критери": [["— По каким признакам вы проверите себя? Что будет считаться ошибкой?"], ["— Составим вместе памятку-критерии: что должно быть в верном ответе?"]],
    "пробн|фиксирование индивидуального": [["— Что из изученного раньше может помочь нам сегодня?", "— Попробуйте выполнить задание, опираясь на то, что уже знаете."], ["— Выполните пробное задание за две минуты. Где вы засомневались?"], ["— Решите пример на доске. Почему ответы в классе разошлись?"]],
    "актуализац": [["— Какие понятия по теме «{T}» вы уже знаете? Как они связаны между собой?"], ["— Составьте цепочку из трёх терминов, которые понадобятся сегодня."], ["— Объясните соседу по парте правило, которое пригодится на уроке. Сверьтесь."]],
    "выявлени": [["— Почему у нас получились разные ответы?", "— Чего нам не хватает, чтобы ответить уверенно?"], ["— В каком месте задания вы остановились? Что помешало?"]],
    "постановк": [["— Что нам предстоит выяснить сегодня? Как сформулируем задачу урока?"], ["— Сформулируйте вопрос, на который урок должен ответить."]],
    "построени": [["— Что нам предстоит выяснить? С чего начнём?"], ["— Составим план: что сделаем сначала, что потом, как проверим себя?"]],
    "реализац": [["— Рассмотрите примеры. Какую закономерность вы замечаете?", "— Сформулируйте правило своими словами и сверьте с учебником."], ["— Разделите примеры на две группы. По какому признаку вы их разделили?"], ["— Сравните пары примеров. Что меняется и почему?"]],
    "первичное закреплени": [["— Объясните решение вслух, опираясь на правило."], ["— Работаем в парах: один решает, другой проверяет по алгоритму, потом меняемся."]],
    "самостоятельн": [["— Выполните задание самостоятельно и проверьте себя по образцу."], ["— Выберите уровень: базовое или повышенное задание. Проверка — по эталону на слайде."]],
    "включени": [["— Где ещё встречается это явление? Как оно связано с тем, что мы изучали раньше?"], ["— Найдите это явление в тексте произведения, которое вы читаете на литературе."]],
    "рефлекс": [["— Что получилось лучше всего? Где было трудно и почему?", "— Закончите фразу: «Сегодня я понял(а), что…»."], ["— Оцените себя по шкале от 1 до 5: насколько уверенно вы применяете правило?"], ["— Какое задание урока вы бы дали младшему брату (сестре), чтобы объяснить тему?"], ["— Закончите фразу: «Теперь я не ошибусь, потому что…»."]]
  };
  function ruStage(stage, def, p, plan) {
    const key = Object.keys(RU_ALT).find(k => new RegExp(k, "i").test(stage));
    if (!key) return def;
    const opts = [def, ...RU_ALT[key]];
    const used = new Set(plan?.used || []);
    const [pick] = pickLRU(opts, "q", x => hash(x.join("|") + "|" + key), 1, used);
    if (plan) { plan.used = [...used, hash(pick.join("|") + "|" + key)]; }
    return pick;
  }
  /* «Интересные» механики из рабочих тетрадей и пособий — по одной на урок, без повтора подряд */
  const RU_FORMATS = ["crossword", "equation", "perfo", "speech", "research", "restore", "picture", "lingEssay"];
  function chooseRuFormat(p) {
    if (typeof KB === "undefined") return null;
    const last = H.lastFormats(1)[0];
    const mech = KB.ru.mechanics.filter(m => RU_FORMATS.includes(m.id) && m.id !== last).filter(m => { const [a, b] = m.grades.split("-").map(Number); return p.grade >= a && p.grade <= (b || a); });
    const [m] = pickLRU(mech, "fmt", x => x.id, 1);
    return m ? { id: m.id, name: m.name, task: `${m.formula} Материал — по теме «${p.topic}».`, src: m.src } : null;
  }
  /* Упражнения: недавно использованные уходят в конец списка */
  function rotateExercises(list, plan) {
    const fresh = list.map(e => ({ e, a: H.age("ex", hash(e.text.slice(0, 120))) }));
    const out = fresh.sort((x, y) => (y.a === Infinity ? 1e13 : y.a) * (y.e.s || 1) - (x.a === Infinity ? 1e13 : x.a) * (x.e.s || 1)).map(x => x.e);
    if (plan) plan.exUsed = out.map(e => hash(e.text.slice(0, 120)));
    return out;
  }

  /* ---------- 9. Блок для ИИ: индивидуальность ---------- */
  function promptBlock(p, plan) {
    if (!plan) return "";
    const A = plan.analysis;
    const facts = A ? [
      A.first && `первая строка: «${short(A.first, 90)}»`, A.last && `последняя: «${short(A.last, 90)}»`,
      A.anaphora && `анафора «${A.anaphora.word}…»`, A.pairs.length && `антитезы: ${A.pairs.map(x => x.join(" — ")).join("; ")}`,
      A.similes.length && `сравнения: ${A.similes.map(s => "«" + s + "»").join("; ")}`, A.epithets.length && `эпитеты: ${A.epithets.slice(0, 3).join("; ")}`,
      A.colors.length && `цвет: ${A.colors.join(", ")}`, A.sounds.length && `звук: ${A.sounds.join(", ")}`, A.turn && `перелом: «${short(A.turn.line, 80)}»`,
      A.heroes.length && `герои: ${A.heroes.join(", ")}`, A.keywords.length && `ключевые слова: ${A.keywords.join(", ")}`
    ].filter(Boolean) : [];
    const ex = typeof Learn !== "undefined" ? Object.keys(Learn.CATS).map(c => { const g = Learn.genericQuestions(c); return g.length ? `- ${Learn.CATS[c].label} (${Learn.CATS[c].src}): например, «${g[Math.floor(rnd() * g.length)].text}»` : null; }).filter(Boolean) : [];
    return `## Индивидуальность урока (обязательно)
- Вопросы — только к этому тексту, с цитатами; не шаблоны «закончите фразу». Типы вопросов — из методических файлов сайта (не придумывай свою методику):
${ex.join("\n")}
- Чередуй типы заданий: анализ, сопоставление, наблюдение над языком, проблемная ситуация, творческое задание.
${plan.format ? `- Необычный формат этого урока: ${plan.format.name}. ${plan.format.task}` : ""}
${plan.structureNote ? `- Структура: ${plan.structureNote}. Этапы: ${plan.stages.join(" → ")}` : ""}
${facts.length ? `- Находки в тексте (${A.source}): ${facts.join("; ")}.` : "- Текст произведения не найден: опирайся на учебник; цитаты, в которых не уверен, не приводи."}
- Не повторяй форматы прошлых уроков: ${H.lastFormats(3).join(", ") || "—"}.`;
  }

  return { pick: (list, kind, keyFn, n) => pickLRU(list, kind, keyFn, n), homework, analyze, prepare, commit, litRow, litWorksheet, ruStage, chooseFormat, chooseRuFormat, rotateExercises, promptBlock, stageQuestions, FORMATS, history: H, reseed, hash };
})();
window.Variety = Variety;
