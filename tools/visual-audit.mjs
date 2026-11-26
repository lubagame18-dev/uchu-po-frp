#!/usr/bin/env node
/**
 * visual-audit.mjs — аудит визуальных планов «Учу по ФРП».
 *
 * Zero-dependency CLI (Node 24). Загружает все уроки из data/frp2025/*.js через
 * node:vm с заглушкой global.window, строит для каждого урока 6 синтетических
 * слайдов, прогоняет VisualPlan.planForSlide + VisualPlan.validate и пишет
 * детерминированные отчёты tools/reports/visual-audit.json и .md.
 *
 * CONTRACT.md v1.2 (grounded-only) + v1.2.1 (объект только для предметной темы):
 * поверх validate работает НЕЗАВИСИМЫЙ детектор фантазий — собственный словарь
 * старых шаблонных объектов, независимая классификация темы object/group/abstract,
 * проверка anchor-бойлерплейтов, эпох/регионов в паспорте и символических планов.
 * Критерий PASS: 0 UNGROUNDED_OBJECT / FAKE_OBJECT / GENERIC_ANCHOR / UNSUPPORTED_ERA /
 * SYMBOLIC_WITH_OBJECT, 0 abstract/group-тем с предметным промптом; в отчёт выводятся
 * доля символических планов, типы тем и разрез по предметам/форматам.
 *
 * CLI:
 *   node tools/visual-audit.mjs [--limit N] [--subject bio] [--out dir]
 *
 * Служебные флаги только для самопроверки инструмента (НЕ для приёмки):
 *   --demo-engine  — внутренний демо-движок, если js/visualplan.js ещё нет;
 *   --demo-fault   — вместе с --demo-engine добавляет контролируемые нарушения.
 *
 * Exit code: 0 — все критерии выполнены, 1 — есть нарушения/ошибки/нет движка.
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const DATA_DIR = path.join(ROOT, "data", "frp2025");
const ENGINE_REL = "js/visualplan.js";
const ENGINE_FILE = path.join(ROOT, "js", "visualplan.js");
const DEFAULT_OUT = path.join(ROOT, "tools", "reports");

const STRATEGIES = [
  "site_library",
  "ru_wikipedia_api",
  "en_wikimedia_api",
  "svg_code",
  "flux_generation",
];

const REQUIRED_ZERO = [
  "EMPTY_SLIDE",
  "NULL_PROMPT",
  "MAP_REQUEST",
  "PROMPT_CYRILLIC",
  "PROMPT_DIGITS",
];

/* CONTRACT.md v1.2 / v1.2.1 (grounded-only): независимый детектор фантазий. */
const GROUNDING_REQUIRED_ZERO = [
  "UNGROUNDED_OBJECT",
  "FAKE_OBJECT",
  "GENERIC_ANCHOR",
  "UNSUPPORTED_ERA",
];

const GROUNDING_OPTIONAL_ZERO = ["SYMBOLIC_WITH_OBJECT"];

const GROUNDING_CODES = [...GROUNDING_REQUIRED_ZERO, ...GROUNDING_OPTIONAL_ZERO];

// Эти коды обязаны быть нулевыми и в общем списке «жёстких нулей».
for (const code of GROUNDING_CODES) if (!REQUIRED_ZERO.includes(code)) REQUIRED_ZERO.push(code);

const SVG_PREFIX = "SVG_";
const MAX_SECONDS = 120;

const NEG_TAIL =
  "Clean educational visual style, scientifically accurate proportions, soft even studio lighting, " +
  "uncluttered background with ample negative space, strictly zero text, no letters, no numbers, " +
  "no labels, no calligraphy, no watermarks.";

const SUBJECT_NAMES = {
  math: "Математика",
  inf: "Информатика",
  phys: "Физика",
  chem: "Химия",
  bio: "Биология",
  geo: "География",
  hist: "История",
  soc: "Обществознание",
  izo: "Изобразительное искусство",
  mus: "Музыка",
  tech: "Технология",
  pe: "Физическая культура",
  orkse: "ОРКСЭ",
  okr: "Окружающий мир",
  eng: "Иностранный язык",
  ru1: "Русский язык",
  lit1: "Литературное чтение",
  obzh: "ОБЗР",
  lit: "Литература",
};

const STOP_WORDS = new Set([
  "это", "эта", "этот", "эти", "как", "для", "или", "при", "над", "без",
  "его", "ее", "их", "так", "все", "весь", "что", "чтобы", "которые",
  "которая", "который", "где", "когда", "между", "через", "после", "перед",
  "также", "более", "менее", "очень", "самые", "самых", "может", "можно",
  "нужно", "должен", "должны", "является", "являются", "одна", "один", "одно",
  "тема", "урок", "урока", "класс", "класса", "раздел", "раздела", "темы",
  "уроки", "уроков", "например", "другие", "других", "связь", "работа",
]);

/* ------------------------------------------------------------------ */
/* Утилиты                                                            */
/* ------------------------------------------------------------------ */

function fail(message, code = 1) {
  process.stderr.write(`visual-audit: ${message}\n`);
  process.exit(code);
}

function relPath(abs) {
  return path.relative(ROOT, abs).split(path.sep).join("/");
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function percent(count, total) {
  return total > 0 ? round2((count / total) * 100) : 0;
}

function sortedCounts(map) {
  return Object.fromEntries([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function normalizeTopic(raw) {
  let s = String(raw == null ? "" : raw).replace(/\s+/g, " ").trim();
  // Снимаем ведущую нумерацию ФРП: "1.2 ", "3 ", "1) ", "Практическая работа № 1." не трогаем.
  s = s.replace(/^\s*\d+(?:[.,]\d+)*[.)]?\s+/, "");
  return s.trim();
}

function normKey(value) {
  return String(value == null ? "" : value)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^0-9a-zа-я]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordsOf(text) {
  return normKey(text)
    .split(" ")
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
}

function clip(text, max = 320) {
  const s = String(text).trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return (sp > 120 ? cut.slice(0, sp) : cut).replace(/[;:,.\-\s]+$/u, "") + ".";
}

const ABBR_DOT = "\u0001";

function extractFacts(text, maxFacts = 60) {
  let s = String(text == null ? "" : text).replace(/\s+/g, " ").trim();
  if (!s) return [];
  // Не рвём предложения на инициалах (А.С. Пушкин).
  s = s.replace(/(?:[А-ЯЁA-Z]\.){1,3}/g, (m) => m.replace(/\./g, ABBR_DOT));
  const parts = s
    .split(/(?<=[.!?])\s+/u)
    .map((p) => p.replace(new RegExp(ABBR_DOT, "g"), ".").trim())
    .map((p) => p.replace(/^[-–—•*·\s]+/u, "").trim())
    .filter((p) => p.length >= 12)
    .map((p) => clip(p))
    .filter((p) => p.length >= 12);

  const out = [];
  const seen = new Set();
  for (const part of parts) {
    const key = normKey(part);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(part);
    if (out.length >= maxFacts) break;
  }
  return out;
}

function uniqueFacts(list) {
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const fact = String(item == null ? "" : item).replace(/\s+/g, " ").trim();
    if (!fact) continue;
    const key = normKey(fact);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(fact);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Загрузка данных                                                    */
/* ------------------------------------------------------------------ */

function loadData() {
  if (!fs.existsSync(DATA_DIR)) fail(`нет каталога данных: ${relPath(DATA_DIR)}`);

  const files = fs
    .readdirSync(DATA_DIR)
    .filter((name) => name.endsWith(".js"))
    .sort();

  const windowObject = {};
  const sandbox = { window: windowObject, console };
  const context = vm.createContext(sandbox);

  const fileFormats = {};
  for (const name of files) {
    const abs = path.join(DATA_DIR, name);
    const code = fs.readFileSync(abs, "utf8");
    if (name === "index.js") {
      fileFormats[name] = "metadata";
    } else if (code.includes("UCHU_FRP_PLANS2025")) {
      fileFormats[name] = "rich_topics";
    } else {
      fileFormats[name] = "frp_plans";
    }
    try {
      new vm.Script(code, { filename: `data/frp2025/${name}` }).runInContext(context);
    } catch (error) {
      fail(`не удалось загрузить ${relPath(abs)}: ${error.message}`);
    }
  }

  const frp = windowObject.FRPPlans2025 || {};
  const rich = windowObject.UCHU_FRP_PLANS2025 || {};

  const subjects = new Set([...Object.keys(frp), ...Object.keys(rich)]);

  const rawLessons = [];

  for (const subject of [...subjects].sort()) {
    const gradeSources = [];
    if (frp[subject] && typeof frp[subject] === "object") gradeSources.push(frp[subject]);
    if (rich[subject] && typeof rich[subject] === "object") gradeSources.push(rich[subject]);

    for (const source of gradeSources) {
      for (const grade of Object.keys(source).sort(compareGrades)) {
        const entry = source[grade];
        if (!entry || typeof entry !== "object") continue;

        // Формат 1: {s, l:[[тема, …], …], th:[[блок, содержание, требования], …]}
        if (Array.isArray(entry.l)) {
          const blocks = Array.isArray(entry.th)
            ? entry.th
                .filter((row) => Array.isArray(row) && row.length >= 2)
                .map((row) => ({
                  title: String(row[0] || "").trim(),
                  content: String(row[1] || "").trim(),
                  requirements: String(row[2] == null ? "" : row[2]).trim(),
                }))
            : [];
          for (const row of entry.l) {
            const raw = Array.isArray(row) ? row[0] : row;
            const topic = normalizeTopic(raw);
            if (!topic) continue;
            rawLessons.push({
              subject,
              grade: String(grade),
              topic,
              format: "frp_plans",
              blocks,
              rawTopic: String(raw == null ? "" : raw),
            });
          }
          continue;
        }

        // Формат 2 (lit.js): {topics:[{num,title,section,prac,theme,…}]}
        if (Array.isArray(entry.topics)) {
          for (const item of entry.topics) {
            if (!item || typeof item !== "object") continue;
            const topic = normalizeTopic(item.title);
            if (!topic) continue;
            const section = String(item.section || "").trim();
            const prac = String(item.prac || "").trim();
            rawLessons.push({
              subject,
              grade: String(grade),
              topic,
              format: "rich_topics",
              rawTopic: String(item.title == null ? "" : item.title),
              blocks: [
                {
                  title: section || `Литература, ${grade} класс`,
                  content: [topic, section].filter(Boolean).join(". "),
                  requirements: prac,
                },
              ],
            });
          }
        }
      }
    }
  }

  const lessons = [];
  const seen = new Set();
  for (const lesson of rawLessons) {
    const key = `${lesson.subject}\u0000${lesson.grade}\u0000${normKey(lesson.topic)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lessons.push(lesson);
  }

  return {
    files,
    fileFormats,
    subjects: [...subjects].sort(),
    grades: countGrades(rawLessons),
    lessons,
  };
}

function compareGrades(a, b) {
  const na = Number(a);
  const nb = Number(b);
  const fa = Number.isFinite(na);
  const fb = Number.isFinite(nb);
  if (fa && fb && na !== nb) return na - nb;
  if (fa !== fb) return fa ? -1 : 1;
  return String(a).localeCompare(String(b), "ru");
}

function countGrades(rawLessons) {
  const grades = new Set();
  for (const lesson of rawLessons) grades.add(`${lesson.subject}:${lesson.grade}`);
  return grades.size;
}

/* ------------------------------------------------------------------ */
/* Синтетические слайды урока                                         */
/* ------------------------------------------------------------------ */

function pickBlock(lesson) {
  const blocks = lesson.blocks || [];
  if (blocks.length === 0) return null;
  if (blocks.length === 1) return blocks[0];

  const topicWords = new Set(wordsOf(lesson.topic));
  let best = blocks[0];
  let bestScore = -1;
  for (const block of blocks) {
    const blockWords = new Set(wordsOf(block.title));
    let score = 0;
    for (const word of topicWords) if (blockWords.has(word)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = block;
    }
  }
  return best;
}

function collectPools(lesson) {
  const block = pickBlock(lesson);
  const contentFacts = [];
  const requirementFacts = [];
  for (const item of lesson.blocks || []) {
    contentFacts.push(...extractFacts(item.content));
    requirementFacts.push(...extractFacts(item.requirements));
  }
  const subjectName = SUBJECT_NAMES[lesson.subject] || lesson.subject;
  const metaFacts = uniqueFacts([
    `Тема: ${lesson.topic}`,
    `Предмет «${subjectName}», ${lesson.grade} класс`,
    block && block.title
      ? `Раздел: ${block.title}`
      : `Раздел программы: ${subjectName}, ${lesson.grade} класс`,
  ]);
  return {
    subjectName,
    block,
    contentFacts: uniqueFacts(contentFacts),
    requirementFacts: uniqueFacts(requirementFacts),
    metaFacts,
  };
}

function genericFacts(topic) {
  return uniqueFacts([
    `Ключевое понятие темы «${topic}»`,
    `Основные признаки и примеры по теме «${topic}»`,
    `Связь темы «${topic}» с другими разделами`,
    `Практическое применение знаний по теме «${topic}»`,
    `Вопрос для самопроверки по теме «${topic}»`,
  ]);
}

function pickFacts(pool, offset, count, topic) {
  const out = [];
  if (Array.isArray(pool) && pool.length > 0) {
    for (let step = 0; step < pool.length * 2 && out.length < count; step += 1) {
      const fact = pool[(offset + step) % pool.length];
      if (!out.includes(fact)) out.push(fact);
    }
  }
  if (out.length < 3) {
    for (const fact of genericFacts(topic)) {
      if (out.length >= Math.max(3, count)) break;
      if (!out.includes(fact)) out.push(fact);
    }
  }
  return out.slice(0, 5);
}

function buildSlides(lesson) {
  const { metaFacts, contentFacts, requirementFacts } = collectPools(lesson);
  const topic = lesson.topic;
  const generic = genericFacts(topic);

  const titleFacts = uniqueFacts([
    ...metaFacts.slice(0, 2),
    (contentFacts[0] || generic[0] || topic),
  ]).slice(0, 5);
  while (titleFacts.length < 3) titleFacts.push(generic[titleFacts.length % generic.length]);

  const goalBase = uniqueFacts([...requirementFacts, ...contentFacts]);
  const goals = pickFacts(goalBase, 0, 4, topic);
  goals.unshift(`Познакомиться с темой «${topic}»`);
  const goalFacts = uniqueFacts(goals).slice(0, 5);

  const contentSlides = [0, 1, 2].map((index) => {
    const facts = pickFacts(contentFacts, index * 4, 4, topic);
    return {
      title: `${topic}: ${["ключевые понятия", "как это устроено", "примеры и практика"][index]}`,
      facts,
    };
  });

  const summaryPool = requirementFacts.length
    ? [...requirementFacts].reverse()
    : [...contentFacts].reverse();
  const summaryFacts = uniqueFacts([
    ...pickFacts(summaryPool, 0, 3, topic),
    `Главное по теме «${topic}»`,
  ]).slice(0, 5);
  while (summaryFacts.length < 3) summaryFacts.push(generic[summaryFacts.length % generic.length]);

  const slides = [
    { title: topic, facts: titleFacts },
    { title: "Цели и планируемые результаты", facts: goalFacts },
    ...contentSlides,
    { title: "Итоги урока", facts: summaryFacts },
  ];

  return slides.map((slide) => ({
    title: slide.title,
    body: slide.facts.map((fact) => `- ${fact}`).join("\n"),
    facts: slide.facts,
  }));
}

/* ------------------------------------------------------------------ */
/* Движок VisualPlan                                                  */
/* ------------------------------------------------------------------ */

function loadEngine() {
  if (!fs.existsSync(ENGINE_FILE)) return null;
  const code = fs.readFileSync(ENGINE_FILE, "utf8");
  const moduleObject = { exports: {} };
  const sandbox = { module: moduleObject, exports: moduleObject.exports, console };
  const context = vm.createContext(sandbox);
  vm.runInContext("globalThis.window = globalThis;", context);
  try {
    new vm.Script(code, { filename: ENGINE_REL }).runInContext(context);
  } catch (error) {
    fail(`не удалось выполнить ${ENGINE_REL}: ${error.message}`);
  }

  let api = moduleObject.exports;
  if (!api || typeof api.planForSlide !== "function") {
    api = sandbox.VisualPlan || sandbox.window.VisualPlan;
  }
  if (!api || typeof api.planForSlide !== "function") {
    fail(`${ENGINE_REL}: не найден VisualPlan.planForSlide (ожидается UMD-экспорт)`);
  }
  if (typeof api.validate !== "function") {
    fail(`${ENGINE_REL}: не найден VisualPlan.validate`);
  }
  return { api, file: ENGINE_REL, demo: false };
}

const DEMO_SUBJECT_VISUALS = {
  bio: "a single microscopic cell structure cross section",
  chem: "glass laboratory vessels with a clear liquid and crystal structures",
  phys: "a simple physical setup with a weight, a spring and an inclined plane",
  math: "a clean geometric construction with straight lines and a triangle",
  inf: "a minimal abstract block diagram shape with connecting lines",
  geo: "a natural landscape with a river valley and layered rocks",
  hist: "a quiet historical workshop interior with wooden tools",
  soc: "a calm still life of an open notebook and simple everyday objects",
  izo: "a painterly still life of brushes, paints and a folded cloth",
  mus: "a wooden musical instrument resting on a soft fabric",
  tech: "a workbench with simple hand tools and wooden blanks",
  pe: "a sports field corner with a ball and marked lines",
  orkse: "a quiet architectural interior with arched windows",
  okr: "a meadow with wild flowers, grasses and a small pond edge",
  eng: "a study desk with a globe, books and a cup",
  ru1: "an old printed page pattern with an ink pen and parchment texture",
  lit1: "an open illustrated book on a wooden table",
  obzh: "an outdoor safety scene with a first aid kit and a backpack",
  lit: "an open classic book with a quill on a wooden desk",
};

function makeDemoEngine() {
  function planForSlide(input) {
    const slide = input && input.slide ? input.slide : {};
    const title = String(slide.title || "").trim();
    const facts = uniqueFacts(Array.isArray(slide.facts) ? slide.facts : []).slice(0, 5);
    const phrase = DEMO_SUBJECT_VISUALS[input.subject] || "a single educational object";
    const prompt =
      `A single detailed educational illustration of ${phrase}, centered on a neutral light background, ` +
      "shown in soft even studio lighting from the front, with clean edges, gentle shadows, natural textures " +
      "and a calm cool palette, generous free space around the main object, no people, no small details. " +
      NEG_TAIL;
    return {
      title,
      facts,
      editorial_check: {
        visual_anchor: "single centered educational object",
        historical_or_scientific_passport: "neutral studio scene, natural materials, accurate proportions",
        cut_out_noise: "no people, no labels, no instruments of measurement",
        visual_strategy: "flux_generation",
      },
      image_prompt: prompt,
      extra_sources: {
        library_tags: [],
        ru_wiki_title: null,
        en_wiki_query: null,
        svg_markup: null,
      },
    };
  }

  function planForLesson(lesson, slides) {
    const list = (slides || []).map((slide, index) => ({
      ...planForSlide({ ...lesson, slide }),
      slide_number: index + 1,
    }));
    return {
      lesson_meta: {
        subject: lesson.subject,
        grade: String(lesson.grade),
        topic: lesson.topic,
        visual_theme: "Тёплая научная иллюстрация: бумага, акварель, спокойная палитра",
      },
      slides: list,
    };
  }

  function validate(x) {
    const errors = [];
    if (!x || typeof x !== "object") {
      return { ok: false, errors: [{ code: "EMPTY_SLIDE", path: "$", message: "plan is empty" }] };
    }
    const items = Array.isArray(x.slides) ? x.slides : [x];
    items.forEach((plan, index) => {
      const p = Array.isArray(x.slides) ? `$.slides[${index}]` : "$";
      if (!plan || typeof plan !== "object") {
        errors.push({ code: "EMPTY_SLIDE", path: p, message: "slide plan is empty" });
        return;
      }
      const title = typeof plan.title === "string" ? plan.title.trim() : "";
      const facts = Array.isArray(plan.facts) ? plan.facts.filter((f) => String(f || "").trim()) : [];
      if (!title && facts.length === 0) {
        errors.push({ code: "EMPTY_SLIDE", path: p, message: "empty title and facts" });
      }
      if (!title) errors.push({ code: "TITLE_EMPTY", path: `${p}.title`, message: "title is empty" });
      if (facts.length === 0) errors.push({ code: "FACTS_EMPTY", path: `${p}.facts`, message: "facts are empty" });
      const editorial = plan.editorial_check || {};
      const strategy = editorial.visual_strategy;
      if (!strategy) errors.push({ code: "NO_STRATEGY", path: `${p}.editorial_check.visual_strategy`, message: "no strategy" });
      else if (!STRATEGIES.includes(strategy)) {
        errors.push({ code: "STRATEGY_INVALID", path: `${p}.editorial_check.visual_strategy`, message: `unknown strategy: ${strategy}` });
      }
      const prompt = plan.image_prompt;
      if (typeof prompt !== "string" || prompt.trim() === "") {
        errors.push({ code: "NULL_PROMPT", path: `${p}.image_prompt`, message: "prompt is empty" });
      } else {
        if (/[А-Яа-яЁё]/u.test(prompt)) {
          errors.push({ code: "PROMPT_CYRILLIC", path: `${p}.image_prompt`, message: "prompt contains Cyrillic" });
        }
        if (/\d/u.test(prompt)) {
          errors.push({ code: "PROMPT_DIGITS", path: `${p}.image_prompt`, message: "prompt contains digits" });
        }
        if (!prompt.endsWith(NEG_TAIL)) {
          errors.push({ code: "PROMPT_TAIL_MISSING", path: `${p}.image_prompt`, message: "prompt has no NEG_TAIL" });
        }
      }
      return undefined;
    });
    return { ok: errors.length === 0, errors };
  }

  return {
    VERSION: "0.0.0-demo",
    STRATEGIES,
    NEG_TAIL,
    planForSlide,
    planForLesson,
    validate,
    fallbackSvg() {
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">' +
        '<rect x="0" y="0" width="800" height="600" fill="#F8FAFC"/>' +
        '<circle cx="400" cy="300" r="120" fill="#E2E8F0"/></svg>';
    },
  };
}

/* ------------------------------------------------------------------ */
/* Независимые проверки (в дополнение к VisualPlan.validate)           */
/* ------------------------------------------------------------------ */

const NON_MAP_COLLOCATIONS =
  /(?:(?<![\p{L}])(?:sim|сим)[- ]?карт[а-яё]*|(?<![\p{L}])карт[а-яё]*\s+памяти|(?<![\p{L}])карточк[а-яё]*|(?<![\p{L}])картин[а-яё]*|(?<![\p{L}])картон[а-яё]*|игральн[а-яё]*\s+карт[а-яё]*)/giu;

const MAP_PATTERNS = [
  /(?<![\p{L}])(?:maps?|atlas)(?![\p{L}])/iu,
  /(?<![\p{L}])(?:карт(?:а|ы|е|у|ой|ою|ам|ами|ах)|карт)(?![\p{L}])/iu,
  /(?<![\p{L}])атлас(?:а|у|ом|е|ы|ов|ами|ах)?(?![\p{L}])/iu,
  /план[а-яё]*\s+местности/iu,
  /схем[а-яё]*\s+сражени/iu,
  /контурн[а-яё]*\s+карт[а-яё]*/iu,
];

function mapMention(text) {
  const value = String(text == null ? "" : text);
  if (!value) return false;
  const cleaned = value.replace(NON_MAP_COLLOCATIONS, " ");
  for (const Pattern of MAP_PATTERNS) {
    const re = new RegExp(Pattern.source, Pattern.flags);
    let match;
    while ((match = re.exec(cleaned)) !== null) {
      const prefix = cleaned.slice(Math.max(0, match.index - 45), match.index).toLowerCase();
      if (/(без|никак|не\s|нет\s|no\b|without|zero|not\s)/iu.test(prefix)) continue;
      return true;
    }
  }
  return false;
}

function directErrors(plan) {
  const errors = [];
  if (!plan || typeof plan !== "object") {
    errors.push({ code: "EMPTY_SLIDE", path: "$", message: "plan is null or not an object" });
    return errors;
  }
  const title = typeof plan.title === "string" ? plan.title.trim() : "";
  const facts = Array.isArray(plan.facts)
    ? plan.facts.filter((fact) => String(fact == null ? "" : fact).trim() !== "")
    : [];
  if (!title && facts.length === 0) {
    errors.push({ code: "EMPTY_SLIDE", path: "$", message: "empty title and empty facts" });
  }
  const prompt = plan.image_prompt;
  if (typeof prompt !== "string" || prompt.trim() === "") {
    errors.push({ code: "NULL_PROMPT", path: "$.image_prompt", message: "image_prompt is empty" });
  } else {
    if (/[А-Яа-яЁё]/u.test(prompt)) {
      errors.push({ code: "PROMPT_CYRILLIC", path: "$.image_prompt", message: "image_prompt contains Cyrillic" });
    }
    if (/\d/u.test(prompt)) {
      errors.push({ code: "PROMPT_DIGITS", path: "$.image_prompt", message: "image_prompt contains digits" });
    }
    if (mapMention(prompt)) {
      errors.push({ code: "MAP_REQUEST", path: "$.image_prompt", message: "image_prompt mentions a map" });
    }
  }
  const editorial = plan.editorial_check || {};
  const editorText = [
    editorial.visual_anchor,
    editorial.historical_or_scientific_passport,
    editorial.cut_out_noise,
  ]
    .map((value) => String(value == null ? "" : value))
    .join(" | ");
  if (mapMention(editorText)) {
    errors.push({ code: "MAP_REQUEST", path: "$.editorial_check", message: "editorial fields mention a map" });
  }
  return errors;
}

function mergeErrors(plan, validatedErrors) {
  const codes = new Set(validatedErrors.map((error) => error.code));
  const merged = validatedErrors.map((error) => ({ ...error, source: "validate" }));
  for (const error of directErrors(plan)) {
    if (!codes.has(error.code)) {
      codes.add(error.code);
      merged.push({ ...error, source: "independent" });
    }
  }
  return merged;
}

/* ------------------------------------------------------------------ */
/* Независимый детектор фантазий (CONTRACT.md v1.2 / v1.2.1)           */
/* ------------------------------------------------------------------ */
/*
 * Детектор не полагается на VisualPlan.validate: он сам
 *  - разбирает image_prompt на предметный объект (по собственному словарю
 *    старых шаблонных объектов и английских предметных существительных);
 *  - независимо классифицирует тему урока как object / group / abstract
 *    (CONTRACT v1.2.1) и запрещает предмет для не-object тем;
 *  - ловит бойлерплейт-anchor и эпохи/регионы без опоры в теме/фактах;
 *  - использует VisualPlan.grounding(plan) / isSymbolic(plan), если движок
 *    их предоставляет, но не доверяет им слепо.
 */

function normRuText(text) {
  return String(text == null ? "" : text)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^0-9a-zа-я]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ruWord(source) {
  return new RegExp(`(?<![0-9a-zа-я])(?:${source})(?![0-9a-zа-я])`, "u");
}

function ruWordList(sources) {
  return sources.map((source) => ruWord(source));
}

function enWord(source) {
  return new RegExp(`(?<![a-z0-9])(?:${source})(?![a-z])`, "i");
}

function enWordList(sources) {
  return sources.map((source) => enWord(source));
}

function anyListMatch(list, text) {
  for (const re of list) if (re.test(text)) return true;
  return false;
}

function firstListMatch(list, text) {
  for (const re of list) if (re.test(text)) return re.source;
  return "";
}

/* --- собственный словарь старых шаблонных объектов движка ---------- */

function fakeTemplate(key, label, re, ground) {
  return { key, label, re, ground };
}

const FAKE_OBJECT_TEMPLATES = [
  fakeTemplate("translucent_living_organism", "translucent living organism", /\btranslucent living organism\b/i,
    ["organism", "ciliate", "bacterium", "virus", "cell", "mushroom", "plant", "animal"]),
  fakeTemplate("period_artifact", "period artifact", /\bperiod artifact\b/i, ["artifact", "period_room"]),
  fakeTemplate("wooden_musical_instrument", "wooden musical instrument", /\bwooden musical instrument\b/i, ["musical_instrument"]),
  fakeTemplate("open_exercise_book", "open exercise book", /\bopen exercise book\b/i, ["exercise_book"]),
  fakeTemplate("open_notebook", "open notebook", /\bopen notebook\b/i, ["exercise_book", "pen_pencil"]),
  fakeTemplate("tuning_fork", "tuning fork", /\btuning fork\b/i, ["tuning_fork"]),
  fakeTemplate("safety_demonstration_object", "safety demonstration object", /\bsafety demonstration object\b/i, ["first_aid"]),
  fakeTemplate("small_electronic_device", "small electronic device", /\bsmall electronic device\b/i,
    ["electronic_device", "computer", "smartphone", "robot"]),
  fakeTemplate("clean_sports_object", "clean sports object", /\bclean sports object\b/i, ["sports_ball", "skis", "gym_mat"]),
  fakeTemplate("layered_natural_landscape", "layered natural landscape", /\blayered natural landscape\b/i,
    ["landscape", "river", "mountain", "ocean", "forest", "steppe", "tundra", "desert", "volcano", "glacier", "soil"]),
  fakeTemplate("artist_palette", "artist palette", /\bartist palette\b/i, ["palette"]),
  fakeTemplate("quiet_architectural_detail", "quiet architectural detail", /\bquiet architectural detail\b/i, ["architecture"]),
  fakeTemplate("simple_physics_apparatus", "simple physics apparatus", /\bsimple physics apparatus\b/i,
    ["electric_circuit", "pendulum", "magnet", "lens"]),
  fakeTemplate("clear_glass_flask", "clear glass flask", /\bclear glass flask\b/i, ["flask"]),
  fakeTemplate("clean_geometric_shape", "clean geometric shape", /\bclean geometric shape\b/i, ["triangle", "circle", "graph"]),
  fakeTemplate("old_leather_book", "old book with a worn leather cover", /\bold book with a worn leather cover\b/i, ["book"]),
  fakeTemplate("open_storybook", "open storybook", /\bopen storybook\b/i, ["book"]),
  fakeTemplate("open_illustrated_book", "open illustrated book", /\bopen illustrated book\b/i, ["book"]),
  fakeTemplate("classical_marble_sculpture", "classical marble sculpture", /\bclassical marble sculpture\b/i, ["sculpture"]),
  fakeTemplate("deep_sky_scene_planet", "deep sky scene with a planet", /\bdeep sky scene with a planet\b/i, ["planet"]),
  fakeTemplate("calm_nature_scene_animal", "calm nature scene with green plants and a small animal",
    /\bcalm nature scene with green plants\b/i, ["plant", "animal", "landscape"]),
  fakeTemplate("simple_modern_technical_object", "simple modern technical object", /\bsimple modern technical object\b/i,
    ["robot", "computer", "printer3d", "sewing", "woodworking", "metalworking"]),
  fakeTemplate("wooden_counting_blocks", "wooden counting blocks", /\bwooden counting blocks\b/i, ["counting_blocks"]),
  fakeTemplate("clean_grid_tokens", "clean grid of small colored tokens", /\bclean grid of small colored tokens\b/i,
    ["counting_blocks", "graph"]),
  fakeTemplate("old_military_drum", "old military drum", /\bold military drum\b/i, ["artifact", "period_room"]),
  fakeTemplate("quiet_period_room", "quiet period room", /\bquiet period room\b/i, ["period_room"]),
  fakeTemplate("wide_natural_landscape", "wide natural landscape", /\bwide natural landscape\b/i,
    ["landscape", "river", "mountain", "ocean", "forest", "steppe", "tundra", "desert", "volcano", "glacier", "soil"]),
  fakeTemplate("clean_geometric_diagram", "clean geometric diagram", /\bclean geometric diagram\b/i,
    ["triangle", "circle", "graph"]),
  fakeTemplate("tidy_school_desk", "tidy school desk", /\btidy school desk\b/i, ["exercise_book", "pen_pencil"]),
];

/* --- бойлерплейт-anchor (CONTRACT v1.2 §6, GENERIC_ANCHOR) ---------- */

const GENERIC_ANCHOR_RE = ruWord(
  [
    "учебные материалы урока",
    "предметы и герои произведения",
    "предметы и образы произведения",
    "современные устройства и материалы",
    "цифровые устройства и схемы",
    "природн[а-я]* объект[а-я]*",
    "живой объект[а-я]*",
    "прибор и явлени[а-я]*",
    "геометрическ[а-я]* объект[а-я]*",
    "вещества и лабораторная посуда",
    "объект[а-я]* безопасности",
    "предмет[а-я]* культур[а-я]*",
    "спортивн[а-я]* инвентар[а-я]*",
    "музыкальн[а-я]* инструмент[а-я]*",
    "предмет[а-я]* эпохи",
    "один старинн[а-я]* артефакт[а-я]*",
    "материалы и образы искусства",
    "произведения искусства",
    "символы и жизненные ситуации",
    "главный объект темы",
    "объекты и явления",
  ].join("|"),
);

/* --- признак символического плана (CONTRACT v1.2 §2) --------------- */

const SYMBOLIC_PROMPT_RE =
  /symbolic (?:composition|arrangement|image|scene|still)|without any recognizable objects|no recognizable objects|abstract geometric composition/i;
const SYMBOLIC_ANCHOR_RE = /символическ[а-я]*\s+образ/;
const SYMBOLIC_PASSPORT_RE = /предметн[а-я]*\s+атрибуция отсутствует/;

const ILLUSTRATION_OF_RE =
  /\billustration of\s+(?:the\s+|a\s+|an\s+)?(?:single\s+|one\s+|two\s+|three\s+|several\s+|a few\s+)?([^,]{2,200})/i;
const COMPOSITION_OF_RE =
  /\b(?:composition|arrangement|depiction|drawing|sketch) of\s+(?:the\s+|a\s+|an\s+)?(?:single\s+|one\s+|two\s+|several\s+)?([^,]{2,200})/i;

function mainObjectPhrase(body) {
  const match = String(body || "").match(ILLUSTRATION_OF_RE) || String(body || "").match(COMPOSITION_OF_RE);
  return match ? match[1].trim() : "";
}

function stripNegativesEn(text) {
  // «without any recognizable objects, specimens, tools, artifacts, people or
  // buildings» — это ЗАПРЕТ, а не предмет; отрицания вырезаем до конца фразы.
  return String(text || "").replace(/\b(?:without|no|zero|free of|not including|avoiding)\b[^.;]*/gi, " ");
}

/* --- русско-английский предметный лексикон (независимый) ----------- */

function concept(key, ruSources, enSources) {
  return { key, ruSources, enSources, ru: ruWordList(ruSources), en: enWordList(enSources) };
}

const OBJECT_CONCEPTS = [
  concept("organism", ["организм[а-я]*"], ["living organism", "organism"]),
  concept("ciliate", ["инфузори[а-я]*", "туфельк[а-я]*", "парамеци[а-я]*"], ["ciliate", "paramecium", "slipper shaped"]),
  concept("bacterium", ["бактери[а-я]*"], ["bacterium", "bacteria", "microbe"]),
  concept("virus", ["вирус[а-я]*"], ["virus", "viral"]),
  concept("cell", ["клетк[а-я]*", "клеточн[а-я]*"], ["cells?", "cellular"]),
  concept("mushroom", ["гриб[а-я]*", "мицел[а-я]*"], ["mushroom", "fungus", "fungi", "mycelium"]),
  concept("heart", ["сердц[а-я]*"], ["heart"]),
  concept("blood_vessels", ["кровообращ[а-я]*", "сосуд[а-я]*"], ["blood vessels?", "vessels?"]),
  concept("skeleton", ["скелет[а-я]*"], ["skeleton"]),
  concept("brain", ["мозг(?:а|у|ом|е|и|ов|ам|ами|ах)?"], ["brain"]),
  concept("tooth", ["зуб[а-я]*"], ["tooth", "teeth"]),
  concept("leaf", ["лист[а-я]*", "листь[а-я]*", "листв[а-я]*"], ["leaf", "leaves"]),
  concept("plant", ["растени[а-я]*", "растен[а-я]*"], ["plants?", "green plant"]),
  concept("flower", ["цвет(?:ок|ка|ку|ком|ке|ы|ов|ам|ами|ах)?", "цветени[а-я]*"], ["flowers?"]),
  concept("root", ["корн[а-я]*", "корен[а-я]*"], ["roots?"]),
  concept("seed", ["сем[яи][а-я]*", "семен[а-я]*"], ["seeds?"]),
  concept("animal", ["животн[а-я]*", "звер[а-я]*", "питом[а-я]*"], ["animals?", "domestic animal"]),
  concept("bird", ["птиц[а-я]*"], ["birds?"]),
  concept("fish", ["рыб[а-я]*"], ["fish"]),
  concept("insect", ["насеком[а-я]*"], ["insects?"]),
  concept("human_organ", ["орган(?:ы|ов|ам|ами|ах|а|у|ом|е)?", "анатоми[а-я]*", "тело человек[а-я]*"],
    ["human organ", "anatomical", "human body"]),
  concept("atom_molecule", ["атом[а-я]*", "молекул[а-я]*"], ["molecules?", "atoms?", "ball and stick"]),
  concept("flask", ["колб[а-я]*", "мензурк[а-я]*", "пробирк[а-я]*", "посуда", "реакц[а-я]*", "раствор[а-я]*"],
    ["flasks?", "glassware", "beakers?", "test tubes?", "vials?"]),
  concept("microscope", ["микроскоп[а-я]*"], ["microscopes?"]),
  concept("thermometer", ["термометр[а-я]*", "градусник[а-я]*"], ["thermometers?"]),
  concept("magnet", ["магнит[а-я]*"], ["magnets?"]),
  concept("lens", ["линз[а-я]*", "оптик[а-я]*"], ["lenses?", "lens", "prisms?"]),
  concept("pendulum", ["маятник[а-я]*"], ["pendulums?"]),
  concept("tuning_fork", ["камертон[а-я]*"], ["tuning forks?"]),
  concept("electric_circuit", ["электрическ[а-я]*\\s+цеп[а-я]*", "цепь", "цепи", "цепью", "цепей"],
    ["circuits?", "resistors?", "coils?"]),
  concept("volcano", ["вулкан[а-я]*"], ["volcanoes?", "volcano"]),
  concept("earth_layers", ["литосфер[а-я]*", "манти[а-я]*", "земн[а-я]*\\s+кор[а-я]*", "ядро земл[а-я]*"],
    ["cutaway of earth", "earth layers", "earth crust", "mantle"]),
  concept("atmosphere", ["атмосфер[а-я]*"], ["atmosphere", "layered sky"]),
  concept("glacier", ["ледник[а-я]*"], ["glaciers?"]),
  concept("soil", ["почв[а-я]*"], ["soil cross", "soil"]),
  concept("ocean", ["океан[а-я]*", "мор(?:е|я|ю|ем|ям|ями|ях|ской)"], ["oceans?", "ocean", "sea"]),
  concept("water", ["вод(?:а|ы|е|у|ой|ам|ами|ах)", "капл(?:я|и|е|ю|ей)"], ["water", "droplets?"]),
  concept("river", ["рек(?:а|и|у|ой|е|ам|ами|ах)"], ["rivers?"]),
  concept("mountain", ["гор(?:а|ы|е|у|ой|ам|ами|ах)", "горн[а-я]*", "хребет[а-я]*"], ["mountains?", "ridge"]),
  concept("forest", ["лес[а-я]*", "тайг[а-я]*"], ["forests?", "pine forest"]),
  concept("steppe", ["степ[а-я]*"], ["steppes?"]),
  concept("tundra", ["тундр[а-я]*"], ["tundras?"]),
  concept("desert", ["пустын[а-я]*"], ["deserts?", "dunes?"]),
  concept("landscape", ["ландшафт[а-я]*", "пейзаж[а-я]*", "природн[а-я]*\\s+зон[а-я]*"], ["landscape", "natural landscape"]),
  concept("planet", ["планет[а-я]*", "космос[а-я]*", "лун[а-я]*", "солнц[а-я]*", "звезд[а-я]*", "комет[а-я]*"],
    ["planets?", "moon", "comets?", "stars?"]),
  concept("triangle", ["треугольник[а-я]*"], ["triangles?"]),
  concept("circle", ["окружност[а-я]*", "круг(?:а|у|ом|е)?"], ["circles?"]),
  concept("graph", ["график[а-я]*"], ["graph", "plot"]),
  concept("diagram", ["диаграмм[а-я]*", "схем[а-я]*"], ["diagram", "flowchart"]),
  concept("robot", ["робот[а-я]*"], ["robots?"]),
  concept("computer", ["компьютер[а-я]*", "ноутбук[а-я]*"], ["computers?", "laptops?"]),
  concept("electronic_device", ["электронн[а-я]*\\s+устройств[а-я]*", "гаджет[а-я]*"], ["electronic devices?"]),
  concept("smartphone", ["смартфон[а-я]*", "телефон[а-я]*", "планшет[а-я]*"], ["smartphones?", "phones?", "tablets?"]),
  concept("printer3d", ["3\\s*[dд]", "трехмерн[а-я]*"], ["three dimensional printer", "3d printer"]),
  concept("sewing", ["швейн[а-я]*", "шить", "шов", "выкройк[а-я]*", "ткан[а-я]*"], ["sewing machines?", "fabric", "scissors"]),
  concept("food", ["кулинар[а-я]*", "бутерброд[а-я]*", "блюд[а-я]*", "салат[а-я]*", "рецепт[а-я]*", "продукт[а-я]*",
    "ед(?:а|ы|е|у|ой)"], ["food", "meal", "vegetables?", "dish"]),
  concept("woodworking", ["рубанок", "рубанк[а-я]*", "пил(?:а|ы|е|у|ой|ам|ами|ах)", "столяр[а-я]*", "древесин[а-я]*"],
    ["woodworking plane", "saw", "workbench"]),
  concept("metalworking", ["напильник[а-я]*", "слесарн[а-я]*", "металлообработ[а-я]*"], ["metal file", "workpiece"]),
  concept("musical_instrument", ["скрипк[а-я]*", "роял[а-я]*", "гитар[а-я]*", "оркестр[а-я]*", "ансамбл[а-я]*",
    "музыкальн[а-я]*\\s+инструмент[а-я]*", "баян[а-я]*", "флейт[а-я]*", "домр[а-я]*", "балалайк[а-я]*"],
    ["musical instruments?", "violins?", "pianos?", "guitars?", "flutes?", "instrument"]),
  concept("sports_ball", ["мяч[а-я]*", "футбол[а-я]*", "баскетбол[а-я]*", "волейбол[а-я]*"],
    ["balls?", "footballs?", "basketballs?", "volleyballs?"]),
  concept("skis", ["лыж[а-я]*"], ["skis", "ski"]),
  concept("gym_mat", ["гимнаст[а-я]*", "кувырок", "акробат[а-я]*", "разминк[а-я]*", "зарядк[а-я]*"],
    ["gymnastics mat", "gym mat"]),
  concept("running_track", ["легк[а-я]*\\s+атлетик[а-я]*", "бег", "бега", "бегу", "спринт[а-я]*"], ["running track"]),
  concept("swimming_pool", ["плаван[а-я]*", "бассейн[а-я]*"], ["swimming pool"]),
  concept("book", ["книг[а-я]*", "читан[а-я]*", "произведени[а-я]*"], ["books?", "storybooks?"]),
  concept("exercise_book", ["тетрад[а-я]*", "пропис[а-я]*"], ["exercise books?", "notebooks?", "copybooks?"]),
  concept("pen_pencil", ["перо", "ручк[а-я]*", "карандаш[а-я]*"], ["pens?", "pencils?", "ruler"]),
  concept("architecture", ["храм[а-я]*", "мечет[а-я]*", "церк[а-я]*", "собор[а-я]*", "архитект[а-я]*",
    "зодчеств[а-я]*", "памятник[а-я]*"], ["temples?", "mosques?", "churches?", "arches", "buildings?"]),
  concept("palette", ["палитр[а-я]*", "краск[а-я]*", "кист[а-я]*", "живопис[а-я]*", "натюрморт[а-я]*"],
    ["artist palette", "palette with", "brushes", "paints"]),
  concept("sculpture", ["скульптур[а-я]*", "стату[а-я]*"], ["sculptures?", "statues?"]),
  concept("artifact", ["артефакт[а-я]*", "курган[а-я]*", "монет[а-я]*", "оруж[а-я]*", "летопис[а-я]*",
    "свиток", "свитк[а-я]*", "берест[а-я]*", "фреск[а-я]*", "утвар[а-я]*"], ["artifacts?", "amphoras?", "manuscripts?"]),
  concept("period_room", ["интерьер[а-я]*", "изб(?:а|ы|е|у|ой)", "печ(?:ь|и|ей|ью)", "прялк[а-я]*",
    "крестьян[а-я]*", "кабинет[а-я]*"], ["period room", "peasant interior", "writing desk", "interior"]),
  concept("first_aid", ["аптечк[а-я]*", "бинт[а-я]*", "повязк[а-я]*", "перв[а-я]*\\s+помощ[а-я]*"],
    ["first aid", "first aid kit", "bandages?"]),
  concept("sports_equipment", ["спортивн[а-я]*\\s+инвентар[а-я]*", "спортивн[а-я]*\\s+оборудован[а-я]*"],
    ["sports object", "sports equipment"]),
  concept("counting_blocks", ["счет[а-я]*", "числ[а-я]*", "дроб(?:ь|и|ей|ям|ями|ях|ью)", "процент[а-я]*",
    "арифметик[а-я]*"], ["counting blocks", "wooden blocks"]),
];

/* Быстрый предфильтр: если ни одного предметного слова в тексте нет, дорогие
   словари не перебираются. Это важно для < 120 с на 26 682 планах. */
const RU_OBJECT_MASTER_RE = new RegExp(
  `(?<![0-9a-zа-я])(?:${OBJECT_CONCEPTS.flatMap((item) => item.ruSources.map((source) => `(?:${source})`)).join("|")})(?![0-9a-zа-я])`,
  "u",
);

const EN_OBJECT_MASTER_RE = new RegExp(
  `(?<![a-z0-9])(?:${OBJECT_CONCEPTS.flatMap((item) => item.enSources.map((source) => `(?:${source})`)).join("|")})(?![a-z])`,
  "i",
);

const GENERIC_OBJECT_EN = enWordList([
  "animals?", "birds?", "fish", "insects?", "mammals?", "reptiles?", "amphibians?", "flowers?", "trees?",
  "fruits?", "vegetables?", "mushrooms?", "leaves?", "plants?", "roots?", "seeds?", "hearts?", "lungs?",
  "brains?", "skeletons?", "teeth", "tooth", "cells?", "bacteria", "bacterium", "viruses?", "ciliates?",
  "paramecium", "molecules?", "atoms?", "flasks?", "beakers?", "test tubes?", "glassware", "microscopes?",
  "thermometers?", "magnets?", "lenses?", "prisms?", "pendulums?", "tuning forks?", "volcanoes?", "glaciers?",
  "soils?", "rivers?", "oceans?", "seas?", "mountains?", "forests?", "steppes?", "tundras?", "deserts?",
  "planets?", "moons?", "comets?", "triangles?", "circles?", "squares?", "rectangles?", "pyramids?",
  "cylinders?", "cones?", "spheres?", "circuits?", "coils?", "resistors?", "robots?", "computers?", "laptops?",
  "smartphones?", "tablets?", "machines?", "devices?", "tools?", "hammers?", "saws?", "scissors", "fabric",
  "sewing machines?", "foods?", "meals?", "bread", "dishes?", "books?", "storybooks?", "notebooks?",
  "exercise books?", "pens?", "pencils?", "rulers?", "artist palettes?", "brushes?", "paints?", "sculptures?",
  "statues?", "temples?", "mosques?", "churches?", "buildings?", "arches?", "artifacts?", "amphoras?",
  "manuscripts?", "drums?", "banners?", "candles?", "chests?", "tables?", "chairs?", "desks?", "benches?",
  "boats?", "ships?", "cars?", "trains?", "airplanes?", "clocks?", "lamps?", "coins?", "flags?", "crowns?",
  "swords?", "shields?", "atlases?",
]);

/* --- независимая классификация темы: object / group / abstract ----- */

const STRUCTURE_RE = ruWord("строени[а-я]*");

const ABSTRACT_MARKERS = ruWordList([
  "обмен[а-я]*\\s+веществ[а-я]*",
  "фотосинтез[а-я]*",
  "дыхан[а-я]*",
  "питани[а-я]*",
  "размножени[а-я]*",
  "развити[а-я]*",
  "эволюци[а-я]*",
  "генетик[а-я]*",
  "наследственн[а-я]*",
  "классификаци[а-я]*",
  "систематик[а-я]*",
  "метод[а-я]*",
  "изучени[а-я]*",
  "значени[а-я]*",
  "охрана|охраны|охране|охрану|охраной",
  "безопасност[а-я]*",
  "правил[а-я]*",
  "отношени[а-я]*",
  "деятельност[а-я]*",
  "культур[а-я]*",
  "государств[а-я]*",
  "прав(?:о|а|у|ом|е)",
  "экономик[а-я]*",
  "информаци[а-я]*",
  "алгоритм[а-я]*",
  "модел[а-я]*",
  "систем[а-я]*",
  "теори[а-я]*",
  "закон[а-я]*",
  "функци[а-я]*",
  "технологи[а-я]*",
  "анализ[а-я]*",
  "синтез[а-я]*",
  "сравнени[а-я]*",
  "характеристик[а-я]*",
  "особенност[а-я]*",
  "признак[а-я]*",
  "свойств[а-я]*",
  "состав[а-я]*",
  "структур[а-я]*",
  "роль|роли|ролью|ролей|ролям|ролями|ролях",
  "влияни[а-я]*",
  "взаимосвяз[а-я]*",
  "взаимодействи[а-я]*",
  "регуляци[а-я]*",
  "превращени[а-я]*",
  "движени[а-я]*",
  "измерени[а-я]*",
  "вычислени[а-я]*",
  "строени[а-я]*",
  "процесс[а-я]*",
  "явлени[а-я]*",
  "поняти[а-я]*",
  "смысл[а-я]*",
  "познани[а-я]*",
  "мышлени[а-я]*",
  "творчеств[а-я]*",
  "личност[а-я]*",
  "стил[а-я]*",
  "наук[а-я]*",
  "биологи[а-я]*",
  "географи[а-я]*",
  "физик(?:а|и|е|у|ой)",
  "хими[а-я]*",
  "математик[а-я]*",
  "информатик[а-я]*",
  "истори(?:я|и|ю|ей|ям|ями|ях)",
  "обществознани[а-я]*",
  "приставк[а-я]*",
  "суффикс[а-я]*",
  "окончани[а-я]*",
  "орфограмм[а-я]*",
  "орфографи[а-я]*",
  "пунктуаци[а-я]*",
  "синтаксис[а-я]*",
  "морфологи[а-я]*",
  "фонетик[а-я]*",
  "лексик[а-я]*",
  "процент[а-я]*",
  "уравнени[а-я]*",
  "выражени[а-я]*",
  "множеств[а-я]*",
  "вероятност[а-я]*",
  "статистик[а-я]*",
  "формул[а-я]*",
  "теорем[а-я]*",
  "координат[а-я]*",
  "сказк[а-я]*",
  "былин[а-я]*",
  "фольклор[а-я]*",
  "миф[а-я]*",
  "пейзаж[а-я]*",
  "натюрморт[а-я]*",
  "портрет[а-я]*",
  "чтени[а-я]*",
  "населен[а-я]*",
  "климат[а-я]*",
  "погод[а-я]*",
  "хозяйств[а-я]*",
  "семь(?:я|и|ю|ей|ям|ями|ях)",
  "школ(?:а|ы|е|у|ой)",
  "дружб[а-я]*",
  "сред(?:а|ы|е|у|ой)",
  "круговорот[а-я]*",
]);

const GROUP_MARKERS = ruWordList([
  "простейш[а-я]*",
  "животн[а-я]*",
  "растени[а-я]*",
  "гриб[а-я]*",
  "бактери[а-я]*",
  "кислот[а-я]*",
  "металл[а-я]*",
  "жанр[а-я]*",
  "вид(?:ы|ов|ам|ами|ах|у|е)",
  "тип(?:ы|ов|ам|ами|ах|у|е)",
  "класс(?:ы|ов|ам|ами|ах|у|е)",
  "семейств[а-я]*",
  "отряд[а-я]*",
  "таксон[а-я]*",
  "многообрази[а-я]*",
  "разнообрази[а-я]*",
  "групп[а-я]*",
  "категор[а-я]*",
  "транспорт[а-я]*",
  "професси[а-я]*",
  "одежд[а-я]*",
  "посуд[а-я]*",
  "мебел[а-я]*",
  "игрушк[а-я]*",
  "продукт[а-я]*",
  "музыкальн[а-я]*\\s+инструмент[а-я]*",
  "геометрическ[а-я]*\\s+фигур[а-я]*",
  "фигур[а-я]*",
  "природн[а-я]*\\s+зон[а-я]*",
  "органоид[а-я]*",
  "ткан(?:и|ей|ям|ями|ях)",
  "организм(?:ы|ов|ам|ами|ах)",
  "орган[а-я]*\\s+чувств[а-я]*",
  "черв(?:и|ей|ям|ями|ях)",
  "неметалл[а-я]*",
  "углеводород[а-я]*",
]);

/* Свойства/отношения/методы — «рамка» вокруг конкретного объекта:
   «Химический состав клетки», «Строение инфузории», «Значение воды».
   Если в теме есть конкретный объект, такая рамка делает тему предметной. */
const RELATIONAL_FRAMES = ruWordList([
  "строени[а-я]*",
  "состав[а-я]*",
  "значени[а-я]*",
  "роль|роли|ролью|ролей|ролям|ролями|ролях",
  "свойств[а-я]*",
  "признак[а-я]*",
  "функци[а-я]*",
  "структур[а-я]*",
  "вид(?:ы|ов|ам|ами|ах|у|е)",
  "тип(?:ы|ов|ам|ами|ах|у|е)",
  "классификаци[а-я]*",
  "систематик[а-я]*",
  "изучени[а-я]*",
  "истори(?:я|и|ю|ей|ям|ями|ях)",
  "метод[а-я]*",
  "охрана|охраны|охране|охрану|охраной",
  "безопасност[а-я]*",
  "правил[а-я]*",
  "отношени[а-я]*",
  "связ(?:ь|и|ью|ей|ям|ями|ях)",
  "влияни[а-я]*",
  "взаимодействи[а-я]*",
  "применени[а-я]*",
  "использовани[а-я]*",
  "изображени[а-я]*",
]);

/* Процессы: даже при наличии объекта тема остаётся абстрактной. */
const PROCESS_MARKERS = ruWordList([
  "обмен[а-я]*",
  "фотосинтез[а-я]*",
  "дыхан[а-я]*",
  "питани[а-я]*",
  "размножени[а-я]*",
  "рост[а-я]*",
  "развити[а-я]*",
  "эволюци[а-я]*",
  "наследственн[а-я]*",
  "генетик[а-я]*",
  "движени[а-я]*",
  "превращени[а-я]*",
  "измерени[а-я]*",
  "вычислени[а-я]*",
  "регуляци[а-я]*",
  "круговорот[а-я]*",
  "селекци[а-я]*",
  "познани[а-я]*",
  "мышлени[а-я]*",
  "творчеств[а-я]*",
  "деятельност[а-я]*",
  "чтени[а-я]*",
  "письм[а-я]*",
  "счет|счёта|счёт|счету|счёту",
]);

function conceptsOfRu(text) {
  const out = new Set();
  const value = String(text || "");
  if (!value || !RU_OBJECT_MASTER_RE.test(value)) return out;
  for (const item of OBJECT_CONCEPTS) {
    for (const re of item.ru) {
      if (re.test(value)) {
        out.add(item.key);
        break;
      }
    }
  }
  return out;
}

function conceptsOfEn(text) {
  const out = new Set();
  const value = String(text || "").toLowerCase();
  if (!value || !EN_OBJECT_MASTER_RE.test(value)) return out;
  for (const item of OBJECT_CONCEPTS) {
    for (const re of item.en) {
      if (re.test(value)) {
        out.add(item.key);
        break;
      }
    }
  }
  return out;
}

function startsWithObjectConcept(text) {
  for (const item of OBJECT_CONCEPTS) {
    for (const re of item.ru) {
      const match = re.exec(text);
      if (match && match.index === 0) return true;
    }
  }
  return false;
}

const TOPIC_TYPE_CACHE = new Map();

/* Синтетические подзаголовки аудита не должны влиять на тип темы:
   «…: ключевые понятия» не делает предметную тему абстрактной. */
const SLIDE_SUFFIX_RE = /:\s*(?:ключевые понятия|как это устроено|примеры и практика)\s*$/iu;
const GENERIC_SLIDE_TITLES = new Set(["цели и планируемые результаты", "итоги урока"]);

function classificationTitle(slide) {
  const raw = String((slide && slide.title) || "").trim();
  if (!raw) return "";
  if (GENERIC_SLIDE_TITLES.has(normRuText(raw))) return "";
  return raw.replace(SLIDE_SUFFIX_RE, "").trim();
}

/* Групповой маркер считается групповым, только если это категория в начале
   темы, а не случайное слово внутри предметной темы. */
function groupMarkerNearStart(text) {
  for (const re of GROUP_MARKERS) {
    const match = re.exec(text);
    if (!match) continue;
    const before = text.slice(0, match.index).trim();
    const tokens = before ? before.split(/\s+/).filter(Boolean).length : 0;
    if (tokens <= 1) return true;
  }
  return false;
}

/* Классовые понятия (множества/таксоны): объект такого класса без конкретики
   в теме — всё ещё выдумка («Классификация животных» → животное). */
const GROUP_CATEGORY_CONCEPTS = new Set(["animal", "plant", "mushroom", "bacterium", "virus"]);

/* Природные объекты, явно названные в теме/фактах («Мировой океан», «Горы»,
   «Атмосфера», «Влажность воздуха»), — честная иллюстрация, не выдумка:
   для них разрешён природный ландшафт/сцена даже на процессной/групповой теме. */
const NATURAL_OBJECT_KEYS = new Set([
  "landscape",
  "river",
  "mountain",
  "ocean",
  "water",
  "atmosphere",
  "glacier",
  "soil",
  "volcano",
  "forest",
  "steppe",
  "tundra",
  "desert",
  "planet",
]);

function classifyTopicType(topic, title) {
  const text = normRuText(`${topic || ""} ${title || ""}`);
  if (!text) return "unknown";
  const cached = TOPIC_TYPE_CACHE.get(text);
  if (cached) return cached;
  let type = "unknown";
  const concepts = conceptsOfRu(text);
  if (concepts.size > 0 && STRUCTURE_RE.test(text)) {
    // «Строение инфузории», «Строение клетки», «Строение Земли» — предметная
    // тема (CONTRACT v1.2.1 §1), даже если в теме есть слово «строение».
    type = "object";
  } else if (groupMarkerNearStart(text)) {
    // Множества/классы/таксоны: «Простейшие», «Животные», «Кислоты», «Жанры».
    type = "group";
  } else if (concepts.size > 0 && startsWithObjectConcept(text)) {
    // Тема НАЧИНАЕТСЯ с конкретного объекта — предметная тема даже при
    // абстрактном продолжении («Клетка как целостная живая система»).
    type = "object";
  } else if (concepts.size > 0 && anyListMatch(RELATIONAL_FRAMES, text) && !anyListMatch(PROCESS_MARKERS, text)) {
    // Свойства/отношения/методы вокруг конкретного объекта: «Химический состав
    // клетки», «Значение воды» — предметная тема.
    type = "object";
  } else if (anyListMatch(ABSTRACT_MARKERS, text)) {
    type = "abstract";
  } else if (concepts.size > 0) {
    type = "object";
  }
  TOPIC_TYPE_CACHE.set(text, type);
  return type;
}

/* --- эпоха/регион в паспорте: опора в теме/фактах ------------------ */

const ROMAN_CENTURY = { xiv: 14, xv: 15, xvi: 16, xvii: 17, xviii: 18, xix: 19, xx: 20, xxi: 21 };

const ERA_CLAIM_RE = new RegExp(
  [
    "(?:XIV|XV|XVI|XVII|XVIII|XIX|XX|XXI)\\s+век[а-я]*",
    "(?:1[1-9]|2[01])\\s+век[а-я]*",
    "Древн[а-я]*\\s+(?:мир|Греци[а-я]*|Рим[а-я]*|Египет[а-я]*)",
    "Средн[а-я]*\\s+век[а-я]*",
    "Средневековь[а-я]*",
    "Возрождени[а-я]*",
    "Античност[а-я]*",
    "Новое\\s+время",
    "Первобытн[а-я]*",
  ].join("|"),
  "giu",
);

const REGION_CLAIM_RE = /(?:Древн[а-я]*\s+Русь|Русь|Росси[а-я]*|Европ[а-я]*|Восток[а-я]*|СССР|Советск[а-я]*\s+Союз)/giu;

function eraClaimsOf(passport) {
  const raw = String(passport || "").replace(/\s+/g, " ");
  if (!raw) return [];
  // Быстрый предфильтр: без этих слов в паспорте заявок на эпоху/регион нет.
  if (
    !/эпох|регион|век|древн|античн|средневек|возрожд|первобыт|росси|европ|восток|ссср|XIV|XV|XVI|XVII|XVIII|XIX|XX|XXI|[Рр]усь/.test(
      raw,
    )
  ) {
    return [];
  }
  const claims = [];
  const labeled = /(?:эпоха|регион)\s*:\s*([^;.]+)/giu;
  let match;
  while ((match = labeled.exec(raw)) !== null) {
    const claim = match[1].trim();
    if (claim) claims.push(claim);
  }
  const era = new RegExp(ERA_CLAIM_RE.source, "giu");
  while ((match = era.exec(raw)) !== null) claims.push(match[0].trim());
  const region = new RegExp(REGION_CLAIM_RE.source, "giu");
  while ((match = region.exec(raw)) !== null) claims.push(match[0].trim());
  const seen = new Set();
  const out = [];
  for (const claim of claims) {
    const key = normRuText(claim);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(claim);
  }
  return out;
}

function eraClaimKind(claim) {
  const text = normRuText(claim);
  if (!text) return "unknown";
  if (/древн|антич|первобыт|неолит|палеолит|бронзов|железн|до н э/.test(text)) return "ancient";
  if (/средневек|средн[а-я]* век/.test(text)) return "middle";
  if (/возрожден|ренессанс/.test(text)) return "renaissance";
  if (/барокко|классицизм|просвещ|петровск|екатерининск/.test(text)) return "century:18";
  const roman = text.match(/\b(xiv|xv|xvi|xvii|xviii|xix|xx|xxi)\b/);
  if (roman) return `century:${ROMAN_CENTURY[roman[1]]}`;
  const numeric = text.match(/\b(1[1-9]|2[01])\b/);
  if (numeric) return `century:${numeric[1]}`;
  if (/советск|ссср|оттепел|перестройк|сталинск/.test(text)) return "century:20";
  if (/росси|русск|петербург|москв|сибир|урал|поволж|кавказ/.test(text)) return "region:russia";
  if (/европ|франц|англ|британ|герман|итал|испан|нидерланд|швец|польск/.test(text)) return "region:europe";
  if (/китай|япон|инди|египет|восток|перси|месопотам|араб/.test(text)) return "region:east";
  return "unknown";
}

function sourceSupportsCentury(century, sourceNorm) {
  if (!Number.isFinite(century)) return true;
  const from = (century - 1) * 100 + 1;
  const to = century * 100;
  const years = [...String(sourceNorm || "").matchAll(/\b(1[0-9]{3}|20[0-2][0-9])\b/g)];
  for (const year of years) {
    const value = Number(year[1]);
    if (value >= from && value <= to) return true;
  }
  if (century === 11) return /11|одиннадцат|xi/.test(sourceNorm);
  if (century === 12) return /12|двенадцат|xii/.test(sourceNorm);
  if (century === 13) return /13|тринадцат|xiii/.test(sourceNorm);
  if (century === 14) return /14|четырнадцат|xiv|средневек|средн[а-я]* век/.test(sourceNorm);
  if (century === 15) return /15|пятнадцат|xv|средневек|средн[а-я]* век/.test(sourceNorm);
  if (century === 16) return /16|шестнадцат|xvi/.test(sourceNorm);
  if (century === 17) return /17|семнадцат|xvii/.test(sourceNorm);
  if (century === 18) return /18|восемнадцат|xviii/.test(sourceNorm);
  if (century === 19) return /19|девятнадцат|xix/.test(sourceNorm);
  if (century === 20) return /20|двадцат|xx|советск|ссср|оттепел|перестройк|сталинск/.test(sourceNorm);
  if (century === 21) return /21|двадцать перв|xxi/.test(sourceNorm);
  return false;
}

function eraClaimSupported(kind, sourceNorm) {
  const src = String(sourceNorm || "");
  if (!src) return false;
  if (kind.startsWith("century:")) return sourceSupportsCentury(Number(kind.slice("century:".length)), src);
  if (kind === "ancient") {
    return /древн|антич|первобыт|неолит|палеолит|бронзов|железн|до н э|египет|грец|рим|месопотам|вавилон|ассири|перси|инди|китай/.test(src);
  }
  if (kind === "middle") {
    return /средневек|средн[а-я]* век|рыцар|летопис|крестонос|киевск|ордынск|феодал|викинг|варяг/.test(src);
  }
  if (kind === "renaissance") return /возрожден|ренессанс|леонардо|микеланджело|рафаэл/.test(src);
  if (kind === "region:russia") return /росси|русск|петербург|москв|сибир|урал|поволж|кавказ|ссср|советск/.test(src);
  if (kind === "region:europe") {
    return /европ|франц|англ|британ|герман|итал|испан|нидерланд|швец|польск|грец|рим|скандинав|финн|венгр|чех|серб|болгар|украин|белорус|литв|латв|эстон|молдав/.test(src);
  }
  if (kind === "region:east") return /китай|япон|инди|египет|восток|перси|месопотам|араб/.test(src);
  return true;
}

/* Опора для детектора считается один раз на урок (тема + все тематические
   блоки), т.к. синтетические факты слайдов берутся из этих же блоков. */
function buildLessonGrounding(lesson) {
  const topicType = classifyTopicType(lesson.topic, "");
  const parts = [lesson.topic];
  for (const block of Array.isArray(lesson.blocks) ? lesson.blocks : []) {
    parts.push(block.title, block.content, block.requirements);
  }
  const sourceNorm = normRuText(parts.join(" "));
  return { topicType, sourceNorm, sourceConcepts: conceptsOfRu(sourceNorm) };
}

/* --- чтение меты движка -------------------------------------------- */

function readEngineGrounding(engine, plan) {
  const info = { available: false, meta: null, symbolic: null };
  try {
    if (typeof engine.grounding === "function") {
      const meta = engine.grounding(plan);
      if (meta && typeof meta === "object") {
        info.available = true;
        info.meta = meta;
      }
    }
  } catch (error) {
    /* движок без grounding — используем собственные эвристики */
  }
  try {
    if (typeof engine.isSymbolic === "function") {
      const symbolic = engine.isSymbolic(plan);
      if (typeof symbolic === "boolean") {
        info.available = true;
        info.symbolic = symbolic;
      }
    }
  } catch (error) {
    /* движок без isSymbolic — используем собственные эвристики */
  }
  return info;
}

/* --- детектор для одного плана -------------------------------------- */

function detectHallucinations(plan, lesson, slide, engine, lessonGround) {
  const errors = [];
  const editorial = plan && typeof plan.editorial_check === "object" ? plan.editorial_check : {};
  const strategy = String(editorial.visual_strategy || "");
  const flux = strategy === "flux_generation";
  const prompt = typeof plan.image_prompt === "string" ? plan.image_prompt : "";
  const anchor = String(editorial.visual_anchor || "");
  const passport = String(editorial.historical_or_scientific_passport || "");
  const ground = lessonGround || buildLessonGrounding(lesson);
  const sourceNorm = ground.sourceNorm;
  // CONTRACT v1.2.1: классифицируем по теме + заголовку КОНКРЕТНОГО слайда
  // (слайд может назвать объект, которого нет в общем названии урока).
  const slideTopicTitle = classificationTitle(slide);
  const topicType = classifyTopicType(lesson.topic, slideTopicTitle);
  const namedConcepts = new Set(conceptsOfRu(normRuText(`${lesson.topic} ${slideTopicTitle}`)));
  const sourceConcepts = new Set(ground.sourceConcepts);
  for (const key of conceptsOfRu(normRuText(slide.title))) sourceConcepts.add(key);
  const grounding = readEngineGrounding(engine, plan);
  const meta = grounding.meta;
  const body = prompt.endsWith(NEG_TAIL) ? prompt.slice(0, prompt.length - NEG_TAIL.length) : prompt;
  const metaSymbolic = grounding.symbolic === true || !!(meta && meta.symbolic === true);
  const symbolicPrompt = SYMBOLIC_PROMPT_RE.test(body);
  const symbolicAnchor = SYMBOLIC_ANCHOR_RE.test(normRuText(anchor));
  const symbolicPassport = SYMBOLIC_PASSPORT_RE.test(normRuText(passport));
  const symbolic = metaSymbolic || symbolicPrompt || symbolicAnchor || symbolicPassport;
  // Карта по контракту заменяется натуральным ландшафтом (без условных
  // обозначений) — это разрешённое поведение, а не выдуманный объект.
  const mapReplacement =
    /без условных (?:обозначений|знаков)|без картографическ/.test(normRuText(`${anchor} ${passport}`)) ||
    /^ландшафт\s*:/.test(normRuText(anchor));
  const metaTopicType = meta && typeof meta.topicType === "string" ? meta.topicType : null;
  const metaGrounded = meta && typeof meta.grounded === "boolean" ? meta.grounded : null;

  const info = {
    topicType,
    metaTopicType,
    symbolic,
    symbolicMeta: metaSymbolic,
    symbolicPrompt,
    metaAvailable: grounding.available,
    mapReplacement: false,
    hasObject: false,
    objectKeys: [],
    templateKeys: [],
    sourceKeys: [...sourceConcepts].sort(),
    causes: [],
    mainPhrase: "",
  };

  // 1) GENERIC_ANCHOR — anchor-бойлерплейт вместо конкретного образа темы.
  if (anchor && GENERIC_ANCHOR_RE.test(normRuText(anchor))) {
    info.causes.push("generic_anchor");
    errors.push({
      code: "GENERIC_ANCHOR",
      path: "$.editorial_check.visual_anchor",
      source: "grounding",
      cause: "generic_anchor",
      message: `обобщённый anchor-бойлерплейт: «${clip(anchor, 120)}»`,
    });
  }

  // 2) UNSUPPORTED_ERA — эпоха/регион в паспорте без опоры в теме/фактах.
  for (const claim of eraClaimsOf(passport)) {
    const kind = eraClaimKind(claim);
    if (kind === "unknown") continue;
    if (!eraClaimSupported(kind, sourceNorm)) {
      info.causes.push("unsupported_era");
      errors.push({
        code: "UNSUPPORTED_ERA",
        path: "$.editorial_check.historical_or_scientific_passport",
        source: "grounding",
        cause: "unsupported_era",
        message: `эпоха/регион «${clip(claim, 80)}» не подтверждены темой/фактами`,
      });
    }
  }

  if (mapReplacement) {
    // По правилам пользователя карта заменяется живым ландшафтом — это
    // разрешённый map→landscape-план, а не выдуманный объект.
    info.mapReplacement = true;
    return { errors, info };
  }

  if (!flux || !prompt) return { errors, info };

  // 3) Предметный объект в flux-промпте.
  const fakeHits = FAKE_OBJECT_TEMPLATES.filter((tpl) => tpl.re.test(body));
  const objectKeys = new Set();
  let mainPhrase = "";
  if (symbolic) {
    const cleaned = stripNegativesEn(body);
    for (const key of conceptsOfEn(cleaned)) objectKeys.add(key);
    if (anyListMatch(GENERIC_OBJECT_EN, cleaned)) objectKeys.add("__generic__");
  } else {
    mainPhrase = mainObjectPhrase(body);
    if (mainPhrase) {
      for (const key of conceptsOfEn(mainPhrase)) objectKeys.add(key);
      if (objectKeys.size === 0 && anyListMatch(GENERIC_OBJECT_EN, mainPhrase)) objectKeys.add("__generic__");
    } else if (body) {
      const cleaned = stripNegativesEn(body);
      const firstClause = cleaned.split(/[.;]/)[0] || "";
      for (const key of conceptsOfEn(firstClause)) objectKeys.add(key);
      if (objectKeys.size === 0 && anyListMatch(GENERIC_OBJECT_EN, firstClause)) objectKeys.add("__generic__");
    }
  }

  const strongKeys = new Set([...objectKeys].filter((key) => key !== "__generic__"));
  const matchedKeys = [...strongKeys].filter((key) => sourceConcepts.has(key));
  const genericHit = objectKeys.has("__generic__");
  const fakeUnsupported = fakeHits.filter((tpl) => !tpl.ground.some((key) => sourceConcepts.has(key)));
  const templateObjects = new Set();
  for (const tpl of fakeHits) templateObjects.add(tpl.key);

  info.hasObject = objectKeys.size > 0 || templateObjects.size > 0;
  info.objectKeys = [...strongKeys].sort();
  info.templateKeys = [...templateObjects].sort();
  info.mainPhrase = mainPhrase;

  if (symbolic && info.hasObject) {
    info.causes.push("symbolic_with_object");
    errors.push({
      code: "SYMBOLIC_WITH_OBJECT",
      path: "$.image_prompt",
      source: "grounding",
      cause: "symbolic_with_object",
      message: `план помечен символическим, но в промпте предмет: ${[...strongKeys, ...info.templateKeys].join(", ")}`,
    });
    return { errors, info };
  }

  if (fakeUnsupported.length > 0) {
    info.causes.push("fake_template");
    errors.push({
      code: "FAKE_OBJECT",
      path: "$.image_prompt",
      source: "grounding",
      cause: "fake_template",
      message: `шаблонный объект без опоры в теме/фактах: ${fakeUnsupported.map((tpl) => tpl.label).join("; ")}`,
    });
    return { errors, info };
  }

  if (objectKeys.size === 0) return { errors, info };

  let cause = "";
  const namedObjectGrounded = [...strongKeys].some(
    (key) => namedConcepts.has(key) && !GROUP_CATEGORY_CONCEPTS.has(key),
  );
  if (metaGrounded === false) cause = "meta_grounded_false";
  else if (matchedKeys.some((key) => NATURAL_OBJECT_KEYS.has(key))) cause = "";
  else if (namedObjectGrounded) cause = "";
  else if (metaTopicType && metaTopicType !== "object") cause = `meta_topic_type_${metaTopicType}`;
  else if (topicType === "abstract") cause = "abstract_topic_object";
  else if (topicType === "group") cause = "group_topic_object";
  else if (matchedKeys.length > 0) cause = "";
  else if (metaGrounded === true && (topicType === "object" || topicType === "unknown")) cause = "";
  else if (genericHit) cause = "unmapped_object";
  else cause = "no_grounded_source";

  if (cause) {
    info.causes.push(cause);
    const objectText = [...strongKeys].concat(genericHit ? ["unrecognized object"] : []).join(", ") || "object";
    errors.push({
      code: "UNGROUNDED_OBJECT",
      path: "$.image_prompt",
      source: "grounding",
      cause,
      message:
        `предмет в промпте не подтверждён темой/фактами (${objectText}; тема=${topicType}` +
        `${metaTopicType ? `, meta=${metaTopicType}` : ""}): «${clip(mainPhrase || body, 120)}»`,
    });
  }

  return { errors, info };
}

/* --- самопроверка детектора (служебный флаг --self-test) ------------ */

function runSelfTest() {
  const fakeEngine = {
    grounding(plan) {
      return plan && plan.__grounding ? plan.__grounding : null;
    },
    isSymbolic(plan) {
      return !!(plan && plan.__grounding && plan.__grounding.symbolic);
    },
  };
  const lesson = (topic, subject = "bio", grade = "10") => ({
    subject,
    grade,
    topic,
    format: "frp_plans",
    blocks: [],
  });
  const slide = (title, facts = []) => ({ title, body: "", facts });
  const plan = (prompt, { anchor = "объект темы", passport = "", grounding = null } = {}) => ({
    title: "t",
    facts: [],
    editorial_check: {
      visual_strategy: "flux_generation",
      visual_anchor: anchor,
      historical_or_scientific_passport: passport,
      cut_out_noise: "без лишнего",
    },
    image_prompt: prompt + " " + NEG_TAIL,
    extra_sources: {},
    __grounding: grounding,
  });

  const promptOf = (objectPhrase) =>
    "A single precise scientific illustration of " + objectPhrase +
    ", rendered with soft even studio lighting and a muted natural palette, generous empty space around the edges.";

  const cases = [
    {
      name: "abstract: организм на «Биология в системе наук»",
      lesson: lesson("Биология в системе наук"),
      slide: slide("Биология в системе наук"),
      plan: plan(promptOf("one translucent living organism with visible internal structures")),
      expect: ["FAKE_OBJECT"],
    },
    {
      name: "abstract: орган на «Дыхание» (meta=abstract)",
      lesson: lesson("Дыхание"),
      slide: slide("Дыхание"),
      plan: plan(promptOf("one human heart model with visible chambers"), {
        grounding: { grounded: true, topicType: "abstract", symbolic: false },
      }),
      expect: ["UNGROUNDED_OBJECT"],
    },
    {
      name: "group: инструмент на «Жанры музыки»",
      lesson: lesson("Жанры музыки", "mus"),
      slide: slide("Жанры музыки"),
      plan: plan(promptOf("one wooden musical instrument with warm reflections"), {
        grounding: { grounded: true, topicType: "object", symbolic: false },
      }),
      expect: ["FAKE_OBJECT"],
    },
    {
      name: "abstract: ландшафт на «Население России»",
      lesson: lesson("Население России", "geo"),
      slide: slide("Население России"),
      plan: plan(promptOf("one layered natural landscape with a river valley and a distant ridge")),
      expect: ["FAKE_OBJECT"],
    },
    {
      name: "object: инфузория-туфелька сохраняет объект",
      lesson: lesson("Инфузория-туфелька"),
      slide: slide("Инфузория-туфелька"),
      plan: plan(promptOf("one slipper shaped ciliate with fine cilia in a drop of pond water"), {
        grounding: { grounded: true, topicType: "object", symbolic: false },
      }),
      expect: [],
    },
    {
      name: "object: сердце человека сохраняет объект",
      lesson: lesson("Сердце человека"),
      slide: slide("Сердце человека"),
      plan: plan(promptOf("one human heart model with visible chambers"), {
        grounding: { grounded: true, topicType: "object", symbolic: false },
      }),
      expect: [],
    },
    {
      name: "group: классификация животных не получает животное",
      lesson: lesson("Классификация животных"),
      slide: slide("Классификация животных"),
      plan: plan(promptOf("one friendly domestic animal sitting on a soft rug"), {
        grounding: { grounded: true, topicType: "object", symbolic: false },
      }),
      expect: ["UNGROUNDED_OBJECT"],
    },
    {
      name: "slide-level: «Жанры музыки» + слайд «Балалайка»",
      lesson: lesson("Жанры музыки", "mus"),
      slide: slide("Жанры музыки: Балалайка"),
      plan: plan(promptOf("one wooden balalaika with warm reflections"), {
        grounding: { grounded: true, topicType: "object", symbolic: false },
      }),
      expect: [],
    },
    {
      name: "map→landscape допустим даже при meta.grounded=false",
      lesson: lesson("Географические карты", "geo", "5"),
      slide: slide("Географические карты"),
      plan: plan(promptOf("one wide natural landscape with a river valley and forested hills"), {
        anchor: "Ландшафт: речная долина, холмы и хвойный лес, без условных обозначений",
        grounding: { grounded: false, topicType: "abstract", symbolic: false },
      }),
      expect: [],
    },
    {
      name: "unsupported era: эпоха без опоры",
      lesson: lesson("Фотосинтез"),
      slide: slide("Фотосинтез"),
      plan: plan(
        "A clean educational symbolic composition of soft geometric shapes, gentle light and muted colour, without any recognizable objects.",
        { anchor: "Символический образ темы: формы, свет и цвет, без конкретных объектов", passport: "признаки: свет и вода; эпоха: XIX век", grounding: { grounded: false, topicType: "abstract", symbolic: true } },
      ),
      expect: ["UNSUPPORTED_ERA"],
    },
    {
      name: "supported era: 1812 год подтверждает XIX век",
      lesson: lesson("Отечественная война 1812 года", "hist", "8"),
      slide: slide("Отечественная война 1812 года"),
      plan: plan(
        "A clean educational symbolic composition of soft geometric shapes, gentle light and muted colour, without any recognizable objects.",
        { anchor: "Символический образ темы: формы, свет и цвет, без конкретных объектов", passport: "события: Отечественная война; эпоха: XIX век", grounding: { grounded: false, topicType: "abstract", symbolic: true } },
      ),
      expect: [],
    },
  ];

  let failed = 0;
  for (const item of cases) {
    const detected = detectHallucinations(item.plan, item.lesson, item.slide, fakeEngine, null);
    const codes = detected.errors.map((error) => error.code);
    const ok =
      item.expect.length === 0
        ? codes.length === 0
        : item.expect.every((code) => codes.includes(code));
    if (!ok) failed += 1;
    process.stdout.write(
      `${ok ? "PASS" : "FAIL"} ${item.name}${codes.length ? ` → ${codes.join(", ")}` : " → 0 нарушений"}\n`,
    );
  }
  process.stdout.write(`\nСамопроверка детектора: ${cases.length - failed}/${cases.length} PASS\n`);
  return failed === 0;
}

/* ------------------------------------------------------------------ */
/* Аудит                                                              */
/* ------------------------------------------------------------------ */

function runAudit(engineInfo, lessons, options) {
  const engine = engineInfo.api;
  const start = process.hrtime.bigint();

  const stats = {
    lessons: lessons.length,
    slides: 0,
    plans: 0,
    lessonsWithValidSlide: 0,
    lessonsWithoutValidSlide: [],
    strategies: new Map(STRATEGIES.map((strategy) => [strategy, 0])),
    unknownStrategy: 0,
    promptsNonEmpty: 0,
    promptTail: 0,
    codes: new Map(),
    validateCodes: new Map(),
    independentCodes: new Map(),
    codeExamples: new Map(),
    planExamples: [],
    planExampleKeys: new Set(),
    exampleStrategies: new Set(),
    fallbackExamples: [],
    exampleKeys: new Set(),
    perSubject: new Map(),
    perFormat: new Map(),
    engineErrors: 0,
    validateErrors: 0,
    // CONTRACT v1.2 / v1.2.1: grounded-only.
    groundingCodes: new Map(),
    hallucCodes: new Map(),
    hallucCauses: new Map(),
    hallucExamples: new Map(),
    hallucLessons: new Map(),
    topicTypes: { object: 0, group: 0, abstract: 0, unknown: 0 },
    lessonTopicTypes: { object: 0, group: 0, abstract: 0, unknown: 0 },
    fluxPlans: 0,
    symbolicPlans: 0,
    symbolicFluxPlans: 0,
    symbolicMetaPlans: 0,
    symbolicPromptPlans: 0,
    groundingMetaPlans: 0,
    mapLandscapePlans: 0,
    abstractTopicObjects: 0,
    groupTopicObjects: 0,
    metaTopicObjects: 0,
  };

  const errorLimit = 3;

  for (let lessonIndex = 0; lessonIndex < lessons.length; lessonIndex += 1) {
    const lesson = lessons[lessonIndex];
    const slides = buildSlides(lesson);
    const subjectStat = getSubjectStat(stats, lesson.subject);
    subjectStat.lessons += 1;
    const formatStat = getFormatStat(stats, lesson.format || "unknown");
    formatStat.lessons += 1;

    // CONTRACT v1.2.1: независимая классификация темы (урок без синтетических
    // подзаголовков), чтобы в отчёте была доля object/group/abstract-тем.
    const lessonGrounding = buildLessonGrounding(lesson);
    const lessonTopicType = lessonGrounding.topicType;
    stats.lessonTopicTypes[lessonTopicType] += 1;
    subjectStat.lessonTopicTypes[lessonTopicType] += 1;
    formatStat.lessonTopicTypes[lessonTopicType] += 1;

    let validSlidesInLesson = 0;
    const lessonErrorCodes = new Set();

    for (let slideIndex = 0; slideIndex < slides.length; slideIndex += 1) {
      const slide = slides[slideIndex];
      stats.slides += 1;
      stats.plans += 1;
      subjectStat.slides += 1;
      formatStat.slides += 1;

      let plan = null;
      let errors = [];

      try {
        plan = engine.planForSlide({
          subject: lesson.subject,
          grade: lesson.grade,
          topic: lesson.topic,
          slide: { title: slide.title, body: slide.body, facts: slide.facts },
        });
        if (options.demoFault) plan = injectDemoFault(plan, lessonIndex, slideIndex);
      } catch (error) {
        stats.engineErrors += 1;
        errors.push({
          code: "PLAN_THREW",
          path: "$",
          message: `planForSlide threw: ${error && error.message ? error.message : String(error)}`,
        });
      }

      if (errors.length === 0 && plan) {
        try {
          const validation = engine.validate(plan);
          const validatedErrors = validation && Array.isArray(validation.errors) ? validation.errors : [];
          stats.validateErrors += validatedErrors.length;
          errors = mergeErrors(plan, validatedErrors);
        } catch (error) {
          stats.engineErrors += 1;
          errors.push({
            code: "VALIDATE_THREW",
            path: "$",
            message: `validate threw: ${error && error.message ? error.message : String(error)}`,
          });
        }
      }

      let detected = null;
      if (plan && typeof plan === "object" && process.env.VISUAL_AUDIT_SKIP_DETECTOR !== "1") {
        try {
          detected = detectHallucinations(plan, lesson, slide, engine, lessonGrounding);
        } catch (error) {
          stats.engineErrors += 1;
          errors.push({
            code: "DETECTOR_THREW",
            path: "$",
            message: `independent grounding detector threw: ${error && error.message ? error.message : String(error)}`,
          });
        }
      }
      if (detected) {
        const info = detected.info || {};
        /* «Предмет на абстрактной/групповой теме» — это нарушение только тогда, когда
           детектор признал объект неподтверждённым. Разрешённые случаи (map→landscape,
           объект назван в заголовке слайда, естественный природный объект) нарушением не являются. */
        const ungrounded = (detected.errors || []).some((e) => e && e.code === "UNGROUNDED_OBJECT");
        stats.topicTypes[info.topicType] = (stats.topicTypes[info.topicType] || 0) + 1;
        subjectStat.topicTypes[info.topicType] += 1;
        formatStat.topicTypes[info.topicType] += 1;
        const isFlux = plan.editorial_check && plan.editorial_check.visual_strategy === "flux_generation";
        if (isFlux) {
          stats.fluxPlans += 1;
          subjectStat.flux += 1;
          formatStat.flux += 1;
        }
        if (info.symbolic) {
          stats.symbolicPlans += 1;
          subjectStat.symbolic += 1;
          formatStat.symbolic += 1;
          if (isFlux) stats.symbolicFluxPlans += 1;
        }
        if (info.symbolicMeta) stats.symbolicMetaPlans += 1;
        if (info.symbolicPrompt) stats.symbolicPromptPlans += 1;
        if (info.metaAvailable) stats.groundingMetaPlans += 1;
        if (info.mapReplacement) {
          stats.mapLandscapePlans += 1;
          subjectStat.mapLandscapePlans += 1;
          formatStat.mapLandscapePlans += 1;
        }
        if (ungrounded && info.hasObject) {
          if (info.topicType === "abstract") {
            stats.abstractTopicObjects += 1;
            subjectStat.abstractTopicObjects += 1;
            formatStat.abstractTopicObjects += 1;
          }
          if (info.topicType === "group") {
            stats.groupTopicObjects += 1;
            subjectStat.groupTopicObjects += 1;
            formatStat.groupTopicObjects += 1;
          }
          if (info.metaTopicType && info.metaTopicType !== "object") stats.metaTopicObjects += 1;
        }
        for (const error of detected.errors) {
          stats.hallucCodes.set(error.code, (stats.hallucCodes.get(error.code) || 0) + 1);
          if (error.cause) {
            stats.hallucCauses.set(error.cause, (stats.hallucCauses.get(error.cause) || 0) + 1);
            subjectStat.hallucCauses.set(error.cause, (subjectStat.hallucCauses.get(error.cause) || 0) + 1);
            formatStat.hallucCauses.set(error.cause, (formatStat.hallucCauses.get(error.cause) || 0) + 1);
          }
          subjectStat.halluc += 1;
          subjectStat.hallucCodes.set(error.code, (subjectStat.hallucCodes.get(error.code) || 0) + 1);
          formatStat.halluc += 1;
          formatStat.hallucCodes.set(error.code, (formatStat.hallucCodes.get(error.code) || 0) + 1);
          const lessonKey = `${lesson.subject}\u0000${lesson.grade}\u0000${normKey(lesson.topic)}`;
          let lessonEntry = stats.hallucLessons.get(lessonKey);
          if (!lessonEntry) {
            lessonEntry = {
              subject: lesson.subject,
              grade: lesson.grade,
              topic: lesson.topic,
              slides: new Set(),
              codes: new Set(),
              causes: new Set(),
              objects: new Set(),
              topicTypes: new Set(),
            };
            stats.hallucLessons.set(lessonKey, lessonEntry);
          }
          lessonEntry.slides.add(slide.title);
          lessonEntry.codes.add(error.code);
          if (error.cause) lessonEntry.causes.add(error.cause);
          for (const key of info.objectKeys || []) lessonEntry.objects.add(key);
          for (const key of info.templateKeys || []) lessonEntry.objects.add(key);
          lessonEntry.topicTypes.add(info.topicType);
          const hallucExamples = stats.hallucExamples.get(error.code) || [];
          if (hallucExamples.length < 8) {
            hallucExamples.push({
              code: error.code,
              cause: error.cause || "",
              subject: lesson.subject,
              grade: lesson.grade,
              topic: lesson.topic,
              slide_title: slide.title,
              slide_number: slideIndex + 1,
              topic_type: info.topicType,
              meta_topic_type: info.metaTopicType,
              symbolic: !!info.symbolic,
              object_keys: info.objectKeys || [],
              template_keys: info.templateKeys || [],
              source_keys: info.sourceKeys || [],
              anchor: clip(plan.editorial_check && plan.editorial_check.visual_anchor, 160),
              message: clip(error.message, 260),
            });
            stats.hallucExamples.set(error.code, hallucExamples);
          }
          if (!errors.some((item) => item.code === error.code)) errors.push(error);
        }
      }

      if (plan && typeof plan === "object") {
        const strategy = plan.editorial_check && plan.editorial_check.visual_strategy;
        if (STRATEGIES.includes(strategy)) {
          stats.strategies.set(strategy, stats.strategies.get(strategy) + 1);
          subjectStat.strategies[strategy] += 1;
          formatStat.strategies[strategy] += 1;
        } else {
          stats.unknownStrategy += 1;
        }
        if (typeof plan.image_prompt === "string" && plan.image_prompt.trim() !== "") {
          stats.promptsNonEmpty += 1;
        }
        if (typeof plan.image_prompt === "string" && plan.image_prompt.endsWith(NEG_TAIL)) {
          stats.promptTail += 1;
        }
        if (errors.length === 0) {
          const example = {
            subject: lesson.subject,
            grade: lesson.grade,
            topic: lesson.topic,
            slide_title: slide.title,
            slide_facts: slide.facts,
            plan,
          };
          const key = exampleKeyOf(example);
          if (!stats.exampleKeys.has(key)) {
            stats.exampleKeys.add(key);
            stats.fallbackExamples.push(example);
            if (stats.fallbackExamples.length > 6) stats.fallbackExamples.pop();
            if (
              STRATEGIES.includes(strategy) &&
              stats.planExamples.length < 3 &&
              !stats.exampleStrategies.has(strategy)
            ) {
              stats.exampleStrategies.add(strategy);
              stats.planExampleKeys.add(key);
              stats.planExamples.push(example);
            }
          }
        }
      }

      if (errors.length === 0) {
        validSlidesInLesson += 1;
        subjectStat.validSlides += 1;
        formatStat.validSlides += 1;
      } else {
        for (const error of errors) {
          stats.codes.set(error.code, (stats.codes.get(error.code) || 0) + 1);
          const sourceCodes =
            error.source === "validate"
              ? stats.validateCodes
              : error.source === "grounding"
                ? stats.groundingCodes
                : stats.independentCodes;
          sourceCodes.set(error.code, (sourceCodes.get(error.code) || 0) + 1);
          subjectStat.errors += 1;
          formatStat.errors += 1;
          formatStat.codes.set(error.code, (formatStat.codes.get(error.code) || 0) + 1);
          lessonErrorCodes.add(error.code);
          const examples = stats.codeExamples.get(error.code) || [];
          if (examples.length < errorLimit) {
            examples.push({
              code: error.code,
              source: error.source || "validate",
              subject: lesson.subject,
              grade: lesson.grade,
              topic: lesson.topic,
              slide_title: slide.title,
              slide_number: slideIndex + 1,
              path: error.path,
              message: error.message,
            });
            stats.codeExamples.set(error.code, examples);
          }
        }
      }
    }

    if (validSlidesInLesson > 0) {
      stats.lessonsWithValidSlide += 1;
      subjectStat.validLessons += 1;
      formatStat.validLessons += 1;
    } else {
      stats.lessonsWithoutValidSlide.push({
        subject: lesson.subject,
        grade: lesson.grade,
        topic: lesson.topic,
        error_codes: [...lessonErrorCodes].sort(),
      });
    }
  }

  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;

  // Добираем примеры до трёх валидными планами (обычно хватает диверсификации
  // по стратегиям, но движок может вернуть меньше трёх разных стратегий).
  for (const example of stats.fallbackExamples) {
    if (stats.planExamples.length >= 3) break;
    const key = exampleKeyOf(example);
    if (stats.planExampleKeys.has(key)) continue;
    stats.planExampleKeys.add(key);
    stats.planExamples.push(example);
  }

  return { stats, elapsedMs };
}

function exampleKeyOf(example) {
  return [example.subject, example.grade, example.topic, example.slide_title].join("\u0000");
}

function injectDemoFault(plan, lessonIndex, slideIndex) {
  if (!plan || typeof plan !== "object") return plan;
  const copy = { ...plan };
  if (lessonIndex % 11 === 0 && slideIndex === 3) {
    copy.image_prompt = "Карта местности " + NEG_TAIL;
  } else if (lessonIndex % 13 === 0 && slideIndex === 5) {
    copy.image_prompt = "";
  } else if (lessonIndex % 17 === 0 && slideIndex === 2) {
    copy.image_prompt = "Scheme with 3 parts " + NEG_TAIL;
  }
  return copy;
}

function newTopicTypeMap() {
  return { object: 0, group: 0, abstract: 0, unknown: 0 };
}

function getSubjectStat(stats, subject) {
  if (!stats.perSubject.has(subject)) {
    stats.perSubject.set(subject, {
      subject,
      lessons: 0,
      slides: 0,
      validLessons: 0,
      validSlides: 0,
      errors: 0,
      strategies: Object.fromEntries(STRATEGIES.map((strategy) => [strategy, 0])),
      topicTypes: newTopicTypeMap(),
      lessonTopicTypes: newTopicTypeMap(),
      flux: 0,
      symbolic: 0,
      abstractTopicObjects: 0,
      groupTopicObjects: 0,
      mapLandscapePlans: 0,
      halluc: 0,
      hallucCodes: new Map(),
      hallucCauses: new Map(),
    });
  }
  return stats.perSubject.get(subject);
}

function getFormatStat(stats, format) {
  if (!stats.perFormat.has(format)) {
    stats.perFormat.set(format, {
      format,
      lessons: 0,
      slides: 0,
      validLessons: 0,
      validSlides: 0,
      errors: 0,
      codes: new Map(),
      strategies: Object.fromEntries(STRATEGIES.map((strategy) => [strategy, 0])),
      topicTypes: newTopicTypeMap(),
      lessonTopicTypes: newTopicTypeMap(),
      flux: 0,
      symbolic: 0,
      abstractTopicObjects: 0,
      groupTopicObjects: 0,
      mapLandscapePlans: 0,
      halluc: 0,
      hallucCodes: new Map(),
      hallucCauses: new Map(),
    });
  }
  return stats.perFormat.get(format);
}

/* ------------------------------------------------------------------ */
/* Отчёт                                                              */
/* ------------------------------------------------------------------ */

function buildReport(engineInfo, lessons, options, audit) {
  const stats = audit.stats;
  const total = stats.plans;

  const strategyReport = {};
  for (const strategy of STRATEGIES) {
    const count = stats.strategies.get(strategy) || 0;
    strategyReport[strategy] = { count, percent: percent(count, total) };
  }

  const codes = {};
  for (const code of [...stats.codes.keys()].sort()) codes[code] = stats.codes.get(code);

  const svgCount = Object.entries(codes)
    .filter(([code]) => code.startsWith(SVG_PREFIX))
    .reduce((sum, [, value]) => sum + value, 0);

  const requiredZero = {};
  for (const code of REQUIRED_ZERO) requiredZero[code] = codes[code] || 0;
  requiredZero[`${SVG_PREFIX}*`] = svgCount;

  const requiredZeroPassed = Object.values(requiredZero).every((value) => value === 0);
  const everyLessonOk = stats.lessonsWithoutValidSlide.length === 0;
  const runtimeOk = audit.elapsedMs < MAX_SECONDS * 1000;
  const engineErrorsOk = stats.engineErrors === 0;
  const portraitViaFlux = codes.PORTRAIT_VIA_FLUX || 0;
  const allViolationsTotal = Object.values(codes).reduce((sum, value) => sum + value, 0);
  const allViolationsZero = allViolationsTotal === 0;
  const QA_NEW_CODES = ["FAKE_PORTRAIT", "WIKI_TITLE_IMPLAUSIBLE", "FAKE_REPRO"];
  const qaNewCodes = {};
  for (const code of QA_NEW_CODES) qaNewCodes[code] = codes[code] || 0;
  const qaNewCodesZero = Object.values(qaNewCodes).every((value) => value === 0);

  // CONTRACT v1.2 / v1.2.1: grounded-only.
  const groundingRequired = {};
  for (const code of GROUNDING_REQUIRED_ZERO) groundingRequired[code] = codes[code] || 0;
  const groundingOptional = {};
  for (const code of GROUNDING_OPTIONAL_ZERO) groundingOptional[code] = codes[code] || 0;
  const groundingRequiredZero = Object.values(groundingRequired).every((value) => value === 0);
  const symbolicWithObjectZero = Object.values(groundingOptional).every((value) => value === 0);
  const topicTypeObjectsOk = stats.abstractTopicObjects === 0 && stats.groupTopicObjects === 0;
  const groundedOnlyPassed = groundingRequiredZero && symbolicWithObjectZero && topicTypeObjectsOk;

  const topicTypePercents = (map) => {
    const sum = Object.values(map).reduce((acc, value) => acc + value, 0);
    return Object.fromEntries(Object.entries(map).map(([key, value]) => [key, percent(value, sum)]));
  };

  const hallucCodesReport = {};
  for (const code of GROUNDING_CODES) hallucCodesReport[code] = stats.hallucCodes.get(code) || 0;
  const hallucExamples = {};
  for (const code of GROUNDING_CODES) {
    const list = stats.hallucExamples.get(code);
    if (list && list.length) hallucExamples[code] = list;
  }

  const hallucinationLessons = [...stats.hallucLessons.values()]
    .map((item) => ({
      subject: item.subject,
      grade: item.grade,
      topic: item.topic,
      slide_count: item.slides.size,
      codes: [...item.codes].sort(),
      causes: [...item.causes].sort(),
      objects: [...item.objects].sort(),
      topic_types: [...item.topicTypes].sort(),
    }))
    .sort(
      (a, b) =>
        a.subject.localeCompare(b.subject, "en") ||
        compareGrades(a.grade, b.grade) ||
        a.topic.localeCompare(b.topic, "ru"),
    );

  const symbolicShare = {
    count: stats.symbolicPlans,
    percent_of_all_plans: percent(stats.symbolicPlans, stats.plans),
    flux_plans: stats.fluxPlans,
    count_among_flux: stats.symbolicFluxPlans,
    percent_of_flux: percent(stats.symbolicFluxPlans, stats.fluxPlans),
    detected_by_engine_meta: stats.symbolicMetaPlans,
    detected_by_prompt_marker: stats.symbolicPromptPlans,
  };

  const metaAvailability = {
    contract_requires: "VisualPlan.grounding(plan) + VisualPlan.isSymbolic(plan) (CONTRACT v1.2 §5)",
    plans_with_engine_meta: stats.groundingMetaPlans,
    plans_without_engine_meta: total - stats.groundingMetaPlans,
    engine_has_grounding: typeof engineInfo.api.grounding === "function",
    engine_has_isSymbolic: typeof engineInfo.api.isSymbolic === "function",
  };

  const errorExamples = {};
  for (const code of [...stats.codeExamples.keys()].sort()) {
    errorExamples[code] = stats.codeExamples.get(code);
  }

  const report = {
    schema: "visual-audit/2.0",
    engine: {
      file: engineInfo.file,
      version: engineInfo.api.VERSION || null,
      demo: engineInfo.demo,
      bytes: engineInfo.bytes || null,
      sha256: engineInfo.sha256 || null,
      strategies_declared:
        Array.isArray(engineInfo.api.STRATEGIES) && engineInfo.api.STRATEGIES.length
          ? engineInfo.api.STRATEGIES.slice()
          : null,
    },
    scope: {
      subjects: [...new Set(lessons.map((lesson) => lesson.subject))].sort(),
      subject_count: new Set(lessons.map((lesson) => lesson.subject)).size,
      grade_count: new Set(lessons.map((lesson) => `${lesson.subject}:${lesson.grade}`)).size,
      lessons: lessons.length,
      lessons_by_format: {
        frp_plans: lessons.filter((lesson) => lesson.format === "frp_plans").length,
        rich_topics: lessons.filter((lesson) => lesson.format === "rich_topics").length,
      },
      lesson_key: "subject|grade|normalized(topic): ведущая нумерация ФРП снята",
      slides_per_lesson: 6,
      slides: stats.slides,
      plans: stats.plans,
      data_files: options.dataFiles,
      data_sources: options.dataFormats,
      filters: {
        subject: options.subject || null,
        limit: options.limit || null,
      },
    },
    criteria: {
      required_zero: requiredZero,
      required_zero_passed: requiredZeroPassed,
      every_lesson_has_valid_slide: {
        passed: everyLessonOk,
        lessons_with_valid_slide: stats.lessonsWithValidSlide,
        lessons_without_valid_slide: stats.lessonsWithoutValidSlide.length,
      },
      runtime_under_limit: { passed: runtimeOk, limit_seconds: MAX_SECONDS },
      engine_errors_zero: { passed: engineErrorsOk, count: stats.engineErrors },
      contract_critical: {
        portrait_via_flux: portraitViaFlux,
        passed: portraitViaFlux === 0,
      },
      all_violations_zero: { passed: allViolationsZero, total: allViolationsTotal },
      qa_new_codes: { passed: qaNewCodesZero, by_code: qaNewCodes },
      grounded_only: {
        contract: "CONTRACT.md v1.2 (grounded-only) + v1.2.1 (объект только для предметной темы)",
        required_zero: groundingRequired,
        required_zero_passed: groundingRequiredZero,
        optional_zero: groundingOptional,
        optional_zero_passed: symbolicWithObjectZero,
        topic_type_objects: {
          abstract_topics_with_object: stats.abstractTopicObjects,
          group_topics_with_object: stats.groupTopicObjects,
          passed: topicTypeObjectsOk,
        },
        engine_meta_topic_objects: stats.metaTopicObjects,
        passed: groundedOnlyPassed,
      },
      passed:
        requiredZeroPassed &&
        everyLessonOk &&
        runtimeOk &&
        engineErrorsOk &&
        portraitViaFlux === 0 &&
        allViolationsZero &&
        qaNewCodesZero &&
        groundedOnlyPassed,
    },
    prompts: {
      total: stats.plans,
      non_empty: stats.promptsNonEmpty,
      non_empty_percent: percent(stats.promptsNonEmpty, stats.plans),
      with_neg_tail: stats.promptTail,
      with_neg_tail_percent: percent(stats.promptTail, stats.plans),
    },
    strategies: strategyReport,
    strategies_unknown_or_missing: stats.unknownStrategy,
    grounding: {
      contract: "CONTRACT.md v1.2 (grounded-only) + v1.2.1 (объект только для предметной темы)",
      detector: "независимый детектор tools/visual-audit.mjs, не полагается только на VisualPlan.validate",
      engine_api: {
        grounding: typeof engineInfo.api.grounding === "function",
        isSymbolic: typeof engineInfo.api.isSymbolic === "function",
      },
      meta: metaAvailability,
      topic_types: {
        by_lessons: { ...stats.lessonTopicTypes },
        by_lessons_percent: topicTypePercents(stats.lessonTopicTypes),
        by_plans: { ...stats.topicTypes },
        by_plans_percent: topicTypePercents(stats.topicTypes),
      },
      symbolic_plans: symbolicShare,
      map_landscape_allowed: {
        count: stats.mapLandscapePlans,
        rule: "карта/план местности заменяется живым ландшафтом (river valley/hills), без условных знаков — разрешено",
        percent_of_plans: percent(stats.mapLandscapePlans, stats.plans),
      },
      codes: hallucCodesReport,
      codes_all_sources: { ...groundingRequired, ...groundingOptional },
      causes: sortedCounts(stats.hallucCauses),
      examples: hallucExamples,
      violation_lesson_count: hallucinationLessons.length,
      violation_lessons: hallucinationLessons.slice(0, 500),
    },
    lessons: {
      total: lessons.length,
      with_valid_slide: stats.lessonsWithValidSlide,
      without_valid_slide: stats.lessonsWithoutValidSlide.length,
      without_valid_slide_examples: stats.lessonsWithoutValidSlide.slice(0, 10),
    },
    errors: {
      total: [...stats.codes.values()].reduce((sum, value) => sum + value, 0),
      by_source: {
        validate: [...stats.validateCodes.values()].reduce((sum, value) => sum + value, 0),
        independent: [...stats.independentCodes.values()].reduce((sum, value) => sum + value, 0),
        grounding: [...stats.groundingCodes.values()].reduce((sum, value) => sum + value, 0),
      },
      by_code: codes,
      by_code_validate: sortedCounts(stats.validateCodes),
      by_code_independent: sortedCounts(stats.independentCodes),
      by_code_grounding: sortedCounts(stats.groundingCodes),
      examples: errorExamples,
    },
    subjects: [...stats.perSubject.values()]
      .sort((a, b) => a.subject.localeCompare(b.subject, "en"))
      .map((item) => ({
        subject: item.subject,
        lessons: item.lessons,
        slides: item.slides,
        lessons_with_valid_slide: item.validLessons,
        valid_slides: item.validSlides,
        errors: item.errors,
        strategies: item.strategies,
        topic_types: item.topicTypes,
        lesson_topic_types: item.lessonTopicTypes,
        flux_plans: item.flux,
        symbolic_plans: item.symbolic,
        symbolic_percent_of_flux: percent(item.symbolic, item.flux),
        map_landscape_plans: item.mapLandscapePlans,
        abstract_topics_with_object: item.abstractTopicObjects,
        group_topics_with_object: item.groupTopicObjects,
        hallucination_violations: item.halluc,
        hallucination_by_code: Object.fromEntries([...item.hallucCodes.entries()].sort(([a], [b]) => a.localeCompare(b))),
        hallucination_by_cause: Object.fromEntries([...item.hallucCauses.entries()].sort(([a], [b]) => a.localeCompare(b))),
      })),
    formats: [...stats.perFormat.values()]
      .sort((a, b) => a.format.localeCompare(b.format, "en"))
      .map((item) => ({
        format: item.format,
        lessons: item.lessons,
        slides: item.slides,
        lessons_with_valid_slide: item.validLessons,
        valid_slides: item.validSlides,
        errors_total: item.errors,
        errors_by_code: Object.fromEntries([...item.codes.entries()].sort(([a], [b]) => a.localeCompare(b))),
        strategies: Object.fromEntries(
          STRATEGIES.map((strategy) => [
            strategy,
            { count: item.strategies[strategy], percent: percent(item.strategies[strategy], item.slides) },
          ]),
        ),
        topic_types: item.topicTypes,
        lesson_topic_types: item.lessonTopicTypes,
        flux_plans: item.flux,
        symbolic_plans: item.symbolic,
        symbolic_percent_of_flux: percent(item.symbolic, item.flux),
        map_landscape_plans: item.mapLandscapePlans,
        abstract_topics_with_object: item.abstractTopicObjects,
        group_topics_with_object: item.groupTopicObjects,
        hallucination_violations: item.halluc,
        hallucination_by_code: Object.fromEntries([...item.hallucCodes.entries()].sort(([a], [b]) => a.localeCompare(b))),
        hallucination_by_cause: Object.fromEntries([...item.hallucCauses.entries()].sort(([a], [b]) => a.localeCompare(b))),
      })),
    plans_examples: stats.planExamples.slice(0, 3).map((example) => ({
      lesson: {
        subject: example.subject,
        grade: example.grade,
        topic: example.topic,
        slide_title: example.slide_title,
        slide_facts: example.slide_facts,
      },
      plan: example.plan,
    })),
    reports: {
      json: options.reportPaths.json,
      markdown: options.reportPaths.markdown,
    },
  };

  return report;
}

function buildMarkdown(report) {
  const lines = [];
  const push = (line = "") => lines.push(line);

  push("# Отчёт визуального аудита «Учу по ФРП»");
  push();
  push(`Схема отчёта: \`${report.schema}\`.`);
  push();
  push("## Параметры запуска");
  push();
  push("| Параметр | Значение |");
  push("|---|---|");
  push(`| Движок | \`${report.engine.file}\` v${report.engine.version || "?"}${report.engine.demo ? " (демо-заглушка)" : ""} |`);
  if (report.engine.sha256) {
    push(`| Движок: размер и SHA256 | ${report.engine.bytes} Б, \`${report.engine.sha256}\` |`);
  }
  push(`| Предметы | ${report.scope.subject_count} (${report.scope.subjects.join(", ")}) |`);
  push(`| Классы (предмет+класс) | ${report.scope.grade_count} |`);
  push(`| Файлы данных | ${report.scope.data_files.length} |`);
  const sourceEntries = Object.entries(report.scope.data_sources || {});
  const frpFiles = sourceEntries.filter(([, kind]) => kind === "frp_plans").map(([name]) => name);
  const richFiles = sourceEntries.filter(([, kind]) => kind === "rich_topics").map(([name]) => name);
  push(
    `| Источники данных | FRPPlans2025: ${frpFiles.length} файлов; rich-topics: ${richFiles.join(", ") || "нет"}; metadata: index.js |`,
  );
  push(
    `| Уроки по форматам | frp_plans ${report.scope.lessons_by_format.frp_plans}, rich_topics ${report.scope.lessons_by_format.rich_topics} |`,
  );
  push(`| Уроки (после дедупликации) | ${report.scope.lessons} |`);
  push(`| Слайды (6 на урок) | ${report.scope.slides} |`);
  push(`| Фильтр предмета | ${report.scope.filters.subject || "все"} |`);
  push(`| Ограничение «--limit» | ${report.scope.filters.limit || "нет"} |`);
  push("| Время прогона | выводится в консоль; в файл не пишется, чтобы отчёт был детерминированным |");
  push();

  push("## Критерии приёмки");
  push();
  push("| Критерий | Требование | Факт | Итог |");
  push("|---|---|---|---|");
  const zeroRows = [
    ["EMPTY_SLIDE", report.criteria.required_zero.EMPTY_SLIDE],
    ["NULL_PROMPT", report.criteria.required_zero.NULL_PROMPT],
    ["MAP_REQUEST", report.criteria.required_zero.MAP_REQUEST],
    ["PROMPT_CYRILLIC", report.criteria.required_zero.PROMPT_CYRILLIC],
    ["PROMPT_DIGITS", report.criteria.required_zero.PROMPT_DIGITS],
    ["SVG_*", report.criteria.required_zero["SVG_*"]],
  ];
  for (const code of GROUNDING_CODES) zeroRows.push([code, report.criteria.required_zero[code] || 0]);
  for (const [code, value] of zeroRows) {
    push(`| ${code} | 0 | ${value} | ${value === 0 ? "✓" : "✗"} |`);
  }
  push(
    `| Уроков с валидным слайдом | все | ${report.criteria.every_lesson_has_valid_slide.lessons_with_valid_slide} из ${report.scope.lessons} | ${
      report.criteria.every_lesson_has_valid_slide.passed ? "✓" : "✗"
    } |`,
  );
  push(
    `| Время аудита | < ${report.criteria.runtime_under_limit.limit_seconds} с | проверено | ${
      report.criteria.runtime_under_limit.passed ? "✓" : "✗"
    } |`,
  );
  push(
    `| Ошибки движка | 0 | ${report.criteria.engine_errors_zero.count} | ${
      report.criteria.engine_errors_zero.passed ? "✓" : "✗"
    } |`,
  );
  push(
    `| PORTRAIT_VIA_FLUX (критично по контракту) | 0 | ${report.criteria.contract_critical.portrait_via_flux} | ${
      report.criteria.contract_critical.passed ? "✓" : "✗"
    } |`,
  );
  push(
    `| Все нарушения (любой код валидатора) | 0 | ${report.criteria.all_violations_zero.total} | ${
      report.criteria.all_violations_zero.passed ? "✓" : "✗"
    } |`,
  );
  const qaCodesText = Object.entries(report.criteria.qa_new_codes.by_code)
    .map(([code, value]) => `${code}=${value}`)
    .join(", ");
  const qaCodesTotal = Object.values(report.criteria.qa_new_codes.by_code).reduce((sum, value) => sum + value, 0);
  push(
    `| Новые коды QA (${qaCodesText}) | 0 | ${qaCodesTotal} | ${
      report.criteria.qa_new_codes.passed ? "✓" : "✗"
    } |`,
  );
  push(
    `| Abstract-темы с НЕПОДТВЕРЖДЁННЫМ предметом | 0 | ${report.criteria.grounded_only.topic_type_objects.abstract_topics_with_object} | ${
      report.criteria.grounded_only.topic_type_objects.abstract_topics_with_object === 0 ? "✓" : "✗"
    } |`,
  );
  push(
    `| Group-темы с НЕПОДТВЕРЖДЁННЫМ предметом | 0 | ${report.criteria.grounded_only.topic_type_objects.group_topics_with_object} | ${
      report.criteria.grounded_only.topic_type_objects.group_topics_with_object === 0 ? "✓" : "✗"
    } |`,
  );
  push(
    `| Grounded-only (CONTRACT v1.2/v1.2.1) | все проверки | ${report.criteria.grounded_only.passed ? "PASS" : "FAIL"} | ${
      report.criteria.grounded_only.passed ? "✓" : "✗"
    } |`,
  );
  push();
  push(`**Итог: ${report.criteria.passed ? "PASS" : "FAIL"}.**`);
  push();

  push("## Grounding v1.2: типы тем, символические планы, стратегии");
  push();
  const grounding = report.grounding;
  push(`Контракт: ${grounding.contract}.`);
  push();
  push("### Мета движка");
  push();
  push("| Показатель | Значение |");
  push("|---|---:|");
  push(`| Планов с \`VisualPlan.grounding/isSymbolic\` | ${grounding.meta.plans_with_engine_meta} |`);
  push(`| Планов без меты (эвристики аудита) | ${grounding.meta.plans_without_engine_meta} |`);
  push(`| Движок предоставляет \`grounding()\` | ${grounding.meta.engine_has_grounding ? "да" : "нет"} |`);
  push(`| Движок предоставляет \`isSymbolic()\` | ${grounding.meta.engine_has_isSymbolic ? "да" : "нет"} |`);
  push();
  push("### Типы тем (independent classifier)");
  push();
  push("| Тип темы | Уроков | Доля уроков | Слайдов | Доля слайдов |");
  push("|---|---:|---:|---:|---:|");
  for (const type of ["object", "group", "abstract", "unknown"]) {
    push(
      `| \`${type}\` | ${grounding.topic_types.by_lessons[type]} | ${grounding.topic_types.by_lessons_percent[type]}% | ` +
        `${grounding.topic_types.by_plans[type]} | ${grounding.topic_types.by_plans_percent[type]}% |`,
    );
  }
  push();
  push("### Символические планы");
  push();
  push("| Показатель | Значение |");
  push("|---|---:|");
  push(`| Символических планов всего | ${grounding.symbolic_plans.count} |`);
  push(`| Доля от всех планов | ${grounding.symbolic_plans.percent_of_all_plans}% |`);
  push(`| Flux-планов всего | ${grounding.symbolic_plans.flux_plans} |`);
  push(`| Из них символических | ${grounding.symbolic_plans.count_among_flux} |`);
  push(`| Доля символических среди flux | ${grounding.symbolic_plans.percent_of_flux}% |`);
  push(`| Определено по мете движка | ${grounding.symbolic_plans.detected_by_engine_meta} |`);
  push(`| Определено по маркеру промпта | ${grounding.symbolic_plans.detected_by_prompt_marker} |`);
  push(
    `| Map→landscape (разрешено правилом 4) | ${grounding.map_landscape_allowed.count} (${grounding.map_landscape_allowed.percent_of_plans}% планов) |`,
  );
  push();

  push("## Независимый детектор фантазий");
  push();
  push("Детектор работает поверх `VisualPlan.validate` и не полагается на него: собственный словарь");
  push("старых шаблонных объектов, независимая классификация темы (object/group/abstract), проверка");
  push("anchor-бойлерплейтов и эпох/регионов в паспорте.");
  push();
  push("| Код | Найдено |");
  push("|---|---:|");
  for (const code of GROUNDING_CODES) push(`| \`${code}\` | ${grounding.codes[code]} |`);
  push();
  const causes = Object.entries(grounding.causes);
  if (causes.length > 0) {
    push("Причины нарушений:");
    push();
    push("| Причина | Планов |");
    push("|---|---:|");
    for (const [cause, value] of causes) push(`| \`${cause}\` | ${value} |`);
    push();
  }
  const groundingExamples = Object.entries(grounding.examples);
  if (groundingExamples.length > 0) {
    push("Примеры нарушений detector-а:");
    push();
    push("| Код | Причина | Предмет | Класс | Урок | Слайд | Тип темы | Объект | Anchor |");
    push("|---|---|---|---|---|---|---|---|---|");
    for (const [code, list] of groundingExamples) {
      for (const item of list) {
        const objects = [...(item.object_keys || []), ...(item.template_keys || [])].join(", ");
        push(
          `| \`${code}\` | ${item.cause || ""} | ${item.subject} | ${item.grade} | ${escapeTable(item.topic)} | ` +
            `${item.slide_number}. ${escapeTable(item.slide_title)} | ${item.topic_type} | ${escapeTable(objects)} | ${escapeTable(
              item.anchor,
            )} |`,
        );
      }
    }
    push();
  }

  if (report.grounding.violation_lesson_count > 0) {
    push(
      `Уроков с нарушениями detector-а: **${report.grounding.violation_lesson_count}** (точные входы для движка):`,
    );
    push();
    push("| Предмет | Класс | Урок | Слайдов | Коды | Причины | Объекты | Тип темы |");
    push("|---|---:|---|---:|---|---|---|---|");
    for (const item of report.grounding.violation_lessons.slice(0, 120)) {
      push(
        `| ${item.subject} | ${item.grade} | ${escapeTable(item.topic)} | ${item.slide_count} | ` +
          `${item.codes.join(", ")} | ${item.causes.join(", ")} | ${escapeTable(item.objects.join(", "))} | ` +
          `${item.topic_types.join(", ")} |`,
      );
    }
    push();
  }

  push("### Grounding по предметам");
  push();
  push("| Предмет | Уроки | Flux | Символич. (доля flux) | object | group | abstract | unknown | Нарушения detector |");
  push("|---|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const item of report.subjects) {
    push(
      `| ${item.subject} | ${item.lessons} | ${item.flux_plans} | ${item.symbolic_plans} (${item.symbolic_percent_of_flux}%) | ` +
        `${item.topic_types.object} | ${item.topic_types.group} | ${item.topic_types.abstract} | ${item.topic_types.unknown} | ` +
        `${item.hallucination_violations} |`,
    );
  }
  push();
  push("### Grounding по форматам");
  push();
  push("| Формат | Уроки | Flux | Символич. (доля flux) | object | group | abstract | unknown | Нарушения detector |");
  push("|---|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const item of report.formats) {
    push(
      `| \`${item.format}\` | ${item.lessons} | ${item.flux_plans} | ${item.symbolic_plans} (${item.symbolic_percent_of_flux}%) | ` +
        `${item.topic_types.object} | ${item.topic_types.group} | ${item.topic_types.abstract} | ${item.topic_types.unknown} | ` +
        `${item.hallucination_violations} |`,
    );
  }
  push();

  push("## Распределение стратегий");
  push();
  push("| Стратегия | Слайдов | Доля |");
  push("|---|---:|---:|");
  for (const strategy of STRATEGIES) {
    const item = report.strategies[strategy];
    push(`| \`${strategy}\` | ${item.count} | ${item.percent}% |`);
  }
  if (report.strategies_unknown_or_missing > 0) {
    push(`| без корректной стратегии | ${report.strategies_unknown_or_missing} | ${percent(report.strategies_unknown_or_missing, report.scope.plans)}% |`);
  }
  push();
  push(
    `Доля слайдов с непустым \`image_prompt\`: **${report.prompts.non_empty_percent}%** ` +
      `(${report.prompts.non_empty} из ${report.prompts.total}); ` +
      `с \`NEG_TAIL\`: ${report.prompts.with_neg_tail_percent}%.`,
  );
  push();

  push("## Разрез по формату данных");
  push();
  push("| Формат | Уроки | Слайды | Уроки с валидным слайдом | Нарушения |");
  push("|---|---:|---:|---:|---:|");
  for (const item of report.formats) {
    push(
      `| \`${item.format}\` | ${item.lessons} | ${item.slides} | ${item.lessons_with_valid_slide} | ${item.errors_total} |`,
    );
  }
  push();
  if (report.formats.length > 0) {
    push("Стратегии по форматам (количество и доля внутри формата):");
    push();
    push(`| Стратегия | ${report.formats.map((item) => `\`${item.format}\``).join(" | ")} |`);
    push(`|---|${report.formats.map(() => "---:").join("|")}|`);
    for (const strategy of STRATEGIES) {
      const cells = report.formats.map((item) => {
        const entry = item.strategies[strategy];
        return `${entry.count} (${entry.percent}%)`;
      });
      push(`| \`${strategy}\` | ${cells.join(" | ")} |`);
    }
    push();
    const rich = report.formats.find((item) => item.format === "rich_topics");
    if (rich) {
      const wiki = rich.strategies.ru_wikipedia_api.count + rich.strategies.en_wikimedia_api.count;
      const wikiPercent = percent(wiki, rich.slides);
      const fluxPercent = rich.strategies.flux_generation.percent;
      push(
        `Литература rich-topics: wiki-стратегии ${wikiPercent}%, flux ${fluxPercent}% ` +
          `(${fluxPercent > 50 ? "сигнал: flux преобладает" : "wiki преобладают, как ожидается"}).`,
      );
      push();
    }
  }

  push("## Нарушения по кодам");
  push();
  const codeEntries = Object.entries(report.errors.by_code);
  if (codeEntries.length === 0) {
    push("Нарушений не найдено.");
    push();
  } else {
    push(
      `Источник нарушений: \`VisualPlan.validate\` — ${report.errors.by_source.validate}, ` +
        `независимые проверки аудита — ${report.errors.by_source.independent}, ` +
        `независимый grounded-only детектор — ${report.errors.by_source.grounding}.`,
    );
    push();
    push("| Код | Всего | validate | независимые | grounding-детектор |");
    push("|---|---:|---:|---:|---:|");
    for (const [code, value] of codeEntries) {
      const fromValidate = report.errors.by_code_validate[code] || 0;
      const fromIndependent = report.errors.by_code_independent[code] || 0;
      const fromGrounding = report.errors.by_code_grounding[code] || 0;
      push(`| \`${code}\` | ${value} | ${fromValidate} | ${fromIndependent} | ${fromGrounding} |`);
    }
    push();
    const examples = Object.entries(report.errors.examples);
    if (examples.length > 0) {
      push("Примеры нарушений:");
      push();
      push("| Код | Источник | Предмет | Класс | Урок | Слайд | Сообщение |");
      push("|---|---|---|---|---|---|---|");
      for (const [code, list] of examples) {
        for (const item of list) {
          push(
            `| \`${code}\` | ${item.source || "validate"} | ${item.subject} | ${item.grade} | ${escapeTable(item.topic)} | ${item.slide_number}. ${escapeTable(
              item.slide_title,
            )} | ${escapeTable(item.message)} |`,
          );
        }
      }
      push();
    }
  }

  push("## Уроки без валидного слайда");
  push();
  if (report.lessons.without_valid_slide === 0) {
    push("Нет — каждый урок даёт хотя бы один валидный слайд.");
  } else {
    push(`Таких уроков: **${report.lessons.without_valid_slide}**. Примеры:`);
    push();
    push("| Предмет | Класс | Урок | Коды |");
    push("|---|---|---|---|");
    for (const item of report.lessons.without_valid_slide_examples) {
      push(`| ${item.subject} | ${item.grade} | ${escapeTable(item.topic)} | ${item.error_codes.join(", ")} |`);
    }
  }
  push();

  push("## Статистика по предметам");
  push();
  push("| Предмет | Уроки | Слайды | Уроки с валидным слайдом | Нарушения |");
  push("|---|---:|---:|---:|---:|");
  for (const item of report.subjects) {
    push(
      `| ${item.subject} | ${item.lessons} | ${item.slides} | ${item.lessons_with_valid_slide} | ${item.errors} |`,
    );
  }
  push();

  push("## Примеры полных JSON-планов");
  push();
  if (report.plans_examples.length === 0) {
    push("Примеры недоступны.");
  } else {
    report.plans_examples.forEach((example, index) => {
      push(`### Пример ${index + 1}: ${example.lesson.subject}, ${example.lesson.grade} класс`);
      push();
      push(`Урок: **${example.lesson.topic}**; слайд: «${example.lesson.slide_title}».`);
      push();
      push("```json");
      push(JSON.stringify({ lesson: example.lesson, plan: example.plan }, null, 2));
      push("```");
      push();
    });
  }

  push("## Как читать отчёт");
  push();
  push("- `criteria.required_zero` — жёсткие нули: любое значение > 0 означает FAIL и exit code 1.");
  push("- `criteria.grounded_only` — CONTRACT v1.2/v1.2.1: 0 `UNGROUNDED_OBJECT`/`FAKE_OBJECT`/`GENERIC_ANCHOR`/`UNSUPPORTED_ERA`, 0 abstract/group-тем с предметом, 0 `SYMBOLIC_WITH_OBJECT`.");
  push("- `grounding.topic_types` — независимая классификация тем: `object` (конкретный предмет/существо/орган), `group` (множества/классы), `abstract` (процессы/свойства/теории/институты).");
  push("- `grounding.symbolic_plans` — доля символических планов (по мете движка и по маркеру промпта), в том числе среди flux.");
  push("- `grounding.codes` / `grounding.causes` — находки независимого детектора фантазий с причинами.");
  push("- `criteria.every_lesson_has_valid_slide` — каждый урок должен дать хотя бы один слайд без ошибок.");
  push("- `criteria.contract_critical.portrait_via_flux` — FLUX не должен рисовать реальных людей.");
  push("- `errors.by_code` — все коды нарушений `VisualPlan.validate`, независимых проверок аудита и grounded-only детектора.");
  push("- `plans_examples` — три полных плана (по возможности из разных стратегий) для ревью.");
  push();
  push("Отчёт детерминирован: без дат, случайных значений и абсолютных путей.");
  push();

  return lines.join("\n");
}

function escapeTable(value) {
  return String(value == null ? "" : value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function writeReports(outDir, report) {
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "visual-audit.json");
  const mdPath = path.join(outDir, "visual-audit.md");
  const jsonText = JSON.stringify(report, null, 2) + "\n";
  const mdText = buildMarkdown(report).replace(/\r\n/g, "\n") + "\n";
  fs.writeFileSync(jsonPath, jsonText, { encoding: "utf8" });
  fs.writeFileSync(mdPath, mdText, { encoding: "utf8" });
  return { jsonPath, mdPath };
}

/* ------------------------------------------------------------------ */
/* CLI                                                                */
/* ------------------------------------------------------------------ */

function usage() {
  return [
    "Использование: node tools/visual-audit.mjs [--limit N] [--subject bio] [--out dir]",
    "",
    "  --limit N    проверить только первые N уроков (детерминированный порядок)",
    "  --subject s  только один предмет (код из data/frp2025, например bio)",
    "  --out dir    каталог отчётов (по умолчанию tools/reports, относительно корня репозитория)",
    "",
    "Служебный флаг самопроверки (не для приёмки):",
    "  --debug-topics  вывести независимую классификацию всех тем object/group/abstract/unknown",
    "",
    "Exit code: 0 — все критерии выполнены; 1 — нарушения/ошибки/нет движка.",
  ].join("\n");
}

function parsePositiveInt(value, flag) {
  if (!/^\d+$/u.test(String(value || ""))) fail(`${flag}: нужно положительное целое число`, 2);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) fail(`${flag}: нужно положительное целое число`, 2);
  return number;
}

function parseArgs(argv) {
  const options = {
    limit: null,
    subject: null,
    outDir: DEFAULT_OUT,
    demoEngine: false,
    demoFault: false,
    debugTopics: false,
    debugClassify: null,
    selfTest: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--limit") {
      options.limit = parsePositiveInt(argv[++index], "--limit");
    } else if (arg === "--subject") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) fail("--subject: нужен код предмета", 2);
      options.subject = value;
    } else if (arg === "--out") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) fail("--out: нужен каталог", 2);
      options.outDir = path.isAbsolute(value) ? value : path.resolve(ROOT, value);
    } else if (arg === "--demo-engine") {
      options.demoEngine = true;
    } else if (arg === "--demo-fault") {
      options.demoFault = true;
    } else if (arg === "--debug-topics") {
      options.debugTopics = true;
    } else if (arg === "--debug-classify") {
      const value = argv[++index];
      if (!value) fail("--debug-classify: нужен текст темы", 2);
      options.debugClassify = value;
    } else if (arg === "--self-test") {
      options.selfTest = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      fail(`неизвестный аргумент: ${arg}\n\n${usage()}`, 2);
    }
  }
  return options;
}

/* ------------------------------------------------------------------ */
/* main                                                               */
/* ------------------------------------------------------------------ */

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage() + "\n");
    return;
  }

  if (options.selfTest) {
    const ok = runSelfTest();
    process.exitCode = ok ? 0 : 1;
    return;
  }

  const data = loadData();

  if (options.subject && !data.subjects.includes(options.subject)) {
    fail(`неизвестный предмет «${options.subject}». Доступны: ${data.subjects.join(", ")}`, 2);
  }

  let lessons = data.lessons;
  if (options.subject) lessons = lessons.filter((lesson) => lesson.subject === options.subject);
  if (options.limit) lessons = lessons.slice(0, options.limit);

  if (options.debugClassify) {
    const text = options.debugClassify;
    const norm = normRuText(text);
    process.stdout.write(`Текст: ${text}\n`);
    process.stdout.write(`Тип: ${classifyTopicType(text, "")}\n`);
    process.stdout.write(`Концепты: ${[...conceptsOfRu(norm)].sort().join(", ") || "нет"}\n`);
    process.stdout.write(`Abstract: ${ABSTRACT_MARKERS.filter((re) => re.test(norm)).map((re) => re.source).join(" | ") || "нет"}\n`);
    process.stdout.write(`Group: ${GROUP_MARKERS.filter((re) => re.test(norm)).map((re) => re.source).join(" | ") || "нет"}\n`);
    process.stdout.write(`Relational: ${RELATIONAL_FRAMES.filter((re) => re.test(norm)).map((re) => re.source).join(" | ") || "нет"}\n`);
    process.stdout.write(`Process: ${PROCESS_MARKERS.filter((re) => re.test(norm)).map((re) => re.source).join(" | ") || "нет"}\n`);
    return;
  }

  if (options.debugTopics) {
    const groups = { object: [], group: [], abstract: [], unknown: [] };
    for (const lesson of lessons) {
      const type = classifyTopicType(lesson.topic, "");
      const concepts = [...conceptsOfRu(normRuText(lesson.topic))].sort().join(",");
      groups[type].push(`${lesson.subject}/${lesson.grade}: ${lesson.topic}${concepts ? ` [${concepts}]` : ""}`);
    }
    process.stdout.write(`Тем по независимому классификатору: ${lessons.length}\n`);
    for (const type of ["object", "group", "abstract", "unknown"]) {
      process.stdout.write(`\n=== ${type} (${groups[type].length}) ===\n`);
      for (const line of groups[type].slice(0, 500)) process.stdout.write(`- ${line}\n`);
    }
    return;
  }

  let engineInfo;
  if (fs.existsSync(ENGINE_FILE)) {
    engineInfo = loadEngine();
    const engineBytes = fs.readFileSync(ENGINE_FILE);
    engineInfo.bytes = engineBytes.length;
    engineInfo.sha256 = crypto.createHash("sha256").update(engineBytes).digest("hex");
  } else if (options.demoEngine) {
    engineInfo = { api: makeDemoEngine(), file: "js/visualplan.js (демо-заглушка)", demo: true };
  } else {
    fail(
      `не найден ${ENGINE_REL} — движок VisualPlan ещё не готов. ` +
        "Аудит запускается только с реальным движком (для самопроверки каркаса: --demo-engine).",
    );
  }

  const outDir = options.outDir;
  const reportPaths = {
    json: relPath(path.join(outDir, "visual-audit.json")),
    markdown: relPath(path.join(outDir, "visual-audit.md")),
  };

  const audit = runAudit(engineInfo, lessons, {
    demoFault: options.demoFault && engineInfo.demo,
    dataFiles: data.files,
    dataFormats: data.fileFormats,
    subject: options.subject,
    limit: options.limit,
    reportPaths,
  });

  const report = buildReport(engineInfo, lessons, {
    demoFault: options.demoFault && engineInfo.demo,
    dataFiles: data.files,
    dataFormats: data.fileFormats,
    subject: options.subject,
    limit: options.limit,
    reportPaths,
  }, audit);

  const written = writeReports(outDir, report);

  const total = report.scope.plans;
  process.stdout.write("Аудит визуальных планов «Учу по ФРП»\n");
  process.stdout.write(
    `Движок: ${report.engine.file} v${report.engine.version || "?"}${engineInfo.demo ? " (ДЕМО)" : ""}\n`,
  );
  process.stdout.write(
    `Объём: предметов ${report.scope.subject_count}, уроков ${report.scope.lessons}, слайдов ${report.scope.slides}` +
      `${options.limit ? ` (--limit ${options.limit})` : ""}${options.subject ? ` (--subject ${options.subject})` : ""}\n`,
  );
  process.stdout.write("Стратегии: ");
  process.stdout.write(
    STRATEGIES.map((strategy) => `${strategy} ${report.strategies[strategy].percent}%`).join(", ") + "\n",
  );
  process.stdout.write(
    `Промпты непустые: ${report.prompts.non_empty_percent}% (${report.prompts.non_empty}/${total})\n`,
  );
  const grounding = report.grounding;
  process.stdout.write(
    `Темы: object ${grounding.topic_types.by_lessons.object}, group ${grounding.topic_types.by_lessons.group}, ` +
      `abstract ${grounding.topic_types.by_lessons.abstract}, unknown ${grounding.topic_types.by_lessons.unknown} (по урокам)\n`,
  );
  process.stdout.write(
    `Символические планы: ${grounding.symbolic_plans.count} (${grounding.symbolic_plans.percent_of_all_plans}% всех, ` +
      `${grounding.symbolic_plans.percent_of_flux}% flux)\n`,
  );
  const codeLine = Object.entries(report.errors.by_code)
    .map(([code, value]) => `${code}=${value}`)
    .join(", ");
  process.stdout.write(
    `Нарушения: ${report.errors.total} (validate ${report.errors.by_source.validate}, независимые ${report.errors.by_source.independent}, ` +
      `grounding ${report.errors.by_source.grounding})` +
      `${codeLine ? ` [${codeLine}]` : ""}\n`,
  );
  const groundedCodes = Object.entries(grounding.codes)
    .map(([code, value]) => `${code}=${value}`)
    .join(", ");
  process.stdout.write(`Grounded-only detector: ${groundedCodes}; причины: ${
    Object.entries(grounding.causes).map(([cause, value]) => `${cause}=${value}`).join(", ") || "нет"
  }\n`);
  process.stdout.write(
    `Уроки с валидным слайдом: ${report.lessons.with_valid_slide}/${report.lessons.total}` +
      `${report.lessons.without_valid_slide ? `, без валидного слайда: ${report.lessons.without_valid_slide}` : ""}\n`,
  );
  process.stdout.write(`Время: ${(audit.elapsedMs / 1000).toFixed(1)} с (лимит ${MAX_SECONDS} с)\n`);
  process.stdout.write(`Отчёты: ${relPath(written.jsonPath)}, ${relPath(written.mdPath)}\n`);
  process.stdout.write(`Итог: ${report.criteria.passed ? "PASS" : "FAIL"}\n`);

  if (!report.criteria.passed) {
    process.exitCode = 1;
    for (const [code, examples] of Object.entries(report.errors.examples)) {
      const example = examples[0];
      if (!example) continue;
      process.stderr.write(
        `  ${code}: ${example.subject}/${example.grade} «${example.topic}» — ${example.message}\n`,
      );
    }
    if (report.lessons.without_valid_slide > 0) {
      const example = report.lessons.without_valid_slide_examples[0];
      if (example) {
        process.stderr.write(
          `  без валидного слайда: ${example.subject}/${example.grade} «${example.topic}» [${example.error_codes.join(", ")}]\n`,
        );
      }
    }
    if (!report.criteria.runtime_under_limit.passed) {
      process.stderr.write(`  превышен лимит времени: ${(audit.elapsedMs / 1000).toFixed(1)} с\n`);
    }
  }
}

main();
