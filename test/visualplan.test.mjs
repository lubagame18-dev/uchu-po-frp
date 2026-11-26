/* Тесты движка визуальных планов «Учу по ФРП» (node --test, без зависимостей).
   Покрывают контракт tools/visual-plan/CONTRACT.md целиком: API, схемы, 5 стратегий,
   запреты карт и FLUX-портретов, промпты, SVG, acquire, валидатор и фузз 500+ тем. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const V = require("../js/visualplan.js");

const NEG_TAIL =
  "Clean educational visual style, scientifically accurate proportions, soft even studio lighting, " +
  "uncluttered background with ample negative space, strictly zero text, no letters, no numbers, " +
  "no labels, no calligraphy, no watermarks.";

const CYRILLIC = /[А-Яа-яЁё]/;

/* ---------- вспомогательные ---------- */
function planOf(subject, grade, topic, slide) {
  return V.planForSlide({ subject, grade, topic, slide: slide || { title: topic, body: "", facts: [] } });
}

function clonePlan(plan) {
  return JSON.parse(JSON.stringify(plan));
}

function assertValid(plan, label) {
  const result = V.validate(plan);
  assert.equal(result.ok, true, (label || "план") + " должен быть валиден: " + JSON.stringify(result.errors));
  return result;
}

function svgPlan(markup) {
  return {
    title: "Схема",
    facts: ["Первый тезис схемы", "Второй тезис схемы", "Третий тезис схемы"],
    editorial_check: {
      visual_anchor: "Одна строгая схема",
      historical_or_scientific_passport: "Точные пропорции и латинские обозначения",
      cut_out_noise: "Без лишних подписей и декора",
      visual_strategy: "svg_code"
    },
    image_prompt: "A clean geometric diagram of simple lines and one smooth curve. " + NEG_TAIL,
    extra_sources: { library_tags: [], ru_wiki_title: null, en_wiki_query: null, svg_markup: markup }
  };
}

function fluxPlan(overrides) {
  const plan = {
    title: "Слайд",
    facts: ["Первый тезис", "Второй тезис", "Третий тезис"],
    editorial_check: {
      visual_anchor: "Один главный объект",
      historical_or_scientific_passport: "Материалы и эпоха по теме урока",
      cut_out_noise: "Без текста и лишних объектов",
      visual_strategy: "flux_generation"
    },
    image_prompt: "A single clear educational illustration of one calm natural object in a quiet room. " + NEG_TAIL,
    extra_sources: { library_tags: [], ru_wiki_title: null, en_wiki_query: null, svg_markup: null }
  };
  return Object.assign(plan, overrides || {});
}

function tagCount(markup) {
  return (markup.match(/<([A-Za-z][A-Za-z0-9:_-]*)(?:"[^"]*"|'[^']*'|[^>"'])*>/g) || [])
    .filter(t => !/^<svg[\s>]/i.test(t)).length;
}

/* =================================================================
   1. Публичный API и константы
   ================================================================= */
test("API: ровно контрактные константы и функции", () => {
  assert.equal(V.VERSION, "1.0.0");
  assert.deepEqual(V.STRATEGIES, [
    "site_library", "ru_wikipedia_api", "en_wikimedia_api", "svg_code", "flux_generation"
  ]);
  assert.equal(V.NEG_TAIL, NEG_TAIL);
  for (const fn of ["planForSlide", "planForLesson", "resolveQuery", "acquire", "validate", "fallbackSvg", "templateFor"]) {
    assert.equal(typeof V[fn], "function", fn + " должен быть функцией");
  }
  for (const tpl of ["functionGraph", "triangle", "circleWithTriangle", "circuit", "forces"]) {
    assert.equal(typeof V.svgTemplates[tpl], "function", "svgTemplates." + tpl);
  }
});

/* =================================================================
   2. Схема плана слайда и урока
   ================================================================= */
test("planForSlide: схема ответа строго по контракту", () => {
  const plan = planOf("bio", "7", "Инфузория-туфелька", {
    title: "Кто такая инфузория-туфелька",
    body: "Инфузория-туфелька — одноклеточное животное. Она передвигается с помощью ресничек. Живёт в пресной воде."
  });
  assert.deepEqual(Object.keys(plan).sort(), ["editorial_check", "extra_sources", "facts", "image_prompt", "title"].sort());
  assert.equal(plan.title, "Кто такая инфузория-туфелька");
  assert.ok(Array.isArray(plan.facts));
  assert.ok(plan.facts.length >= 1 && plan.facts.length <= 5, "facts: 1–5, получено " + plan.facts.length);
  assert.equal(new Set(plan.facts.map(f => f.trim())).size, plan.facts.length, "facts без дублей");
  assert.deepEqual(Object.keys(plan.editorial_check).sort(), [
    "visual_anchor", "historical_or_scientific_passport", "cut_out_noise", "visual_strategy"
  ].sort());
  assert.deepEqual(Object.keys(plan.extra_sources).sort(), [
    "library_tags", "ru_wiki_title", "en_wiki_query", "svg_markup"
  ].sort());
  for (const field of ["visual_anchor", "historical_or_scientific_passport", "cut_out_noise"]) {
    assert.ok(plan.editorial_check[field].trim().length > 0, field);
  }
  assert.ok(V.STRATEGIES.includes(plan.editorial_check.visual_strategy));
  assertValid(plan, "planForSlide");
  assert.deepEqual(plan.extra_sources, { library_tags: [], ru_wiki_title: null, en_wiki_query: null, svg_markup: null });
});

test("planForSlide: facts берутся из slide.facts, из body; мета-строка — только если фактов нет", () => {
  const given = planOf("bio", "7", "Клетка", { title: "Клетка", facts: ["Клетка — единица строения", "Есть ядро", "Есть цитоплазма", "Есть мембрана"] });
  assert.deepEqual(given.facts.slice(0, 4), ["Клетка — единица строения", "Есть ядро", "Есть цитоплазма", "Есть мембрана"]);
  assert.equal(given.facts.length, 4);

  const fromBody = planOf("bio", "7", "Клетка", {
    title: "Клетка",
    body: "- Клетка — единица строения живого\n- В клетке есть ядро\n- Цитоплазма заполняет клетку"
  });
  assert.ok(fromBody.facts.length >= 3);
  assert.ok(fromBody.facts.some(f => /ядро/.test(f)), JSON.stringify(fromBody.facts));

  const empty = planOf("bio", "7", "Клетка", { title: "", body: "", facts: [] });
  assert.equal(empty.facts.length, 1, "без материала — ровно одна мета-строка");
  assert.ok(/7 класс/.test(empty.facts[0]) && /Биология/.test(empty.facts[0]), JSON.stringify(empty.facts));
  assertValid(empty, "пустой вход");

  const oneFact = planOf("bio", "7", "Клетка", { title: "Клетка", facts: ["Клетка — единица строения"] });
  assert.deepEqual(oneFact.facts, ["Клетка — единица строения"], "один реальный факт не разбавляем метаданными");

  const person = planOf("lit", "9", "А. С. Пушкин", { title: "Пушкин", facts: ["Пушкин — русский поэт"] });
  assert.ok(person.facts.some(f => /Годы жизни/.test(f) && /роль/.test(f)), JSON.stringify(person.facts));

  const noSlide = V.planForSlide({ subject: "math", grade: "5", topic: "Дроби" });
  assert.ok(noSlide.title.length > 0);
  assertValid(noSlide, "вход без slide");
});

test("planForLesson: meta, сквозная визуальная тема и slide_number", () => {
  const lesson = { subject: "bio", grade: "7", topic: "Растения" };
  const slides = [
    { title: "Растения", facts: ["Растения — живые организмы", "У растений есть листья", "Растения растут"] },
    "## Строение листа\n\nЛист состоит из пластинки и черешка.",
    { title: "Итог", body: "- Растения важны\n- Листья фотосинтезируют\n- Итог урока" }
  ];
  const plan = V.planForLesson(lesson, slides);
  assert.deepEqual(Object.keys(plan.lesson_meta).sort(), ["subject", "grade", "topic", "visual_theme"].sort());
  assert.equal(plan.lesson_meta.subject, "bio");
  assert.equal(plan.lesson_meta.grade, "7");
  assert.equal(plan.lesson_meta.topic, "Растения");
  assert.ok(plan.lesson_meta.visual_theme.length > 0);
  assert.equal(plan.slides.length, 3);
  plan.slides.forEach((slide, i) => assert.equal(slide.slide_number, i + 1));
  assert.equal(new Set(plan.slides.map(s => s.slide_number)).size, 3);
  const theme = plan.lesson_meta.visual_theme;
  assert.ok(theme);
  assertValid(plan, "planForLesson");
});

test("planForLesson принимает lesson.params и lesson.slides", () => {
  const plan = V.planForLesson({ params: { subject: "math", grade: 6, topic: "Дроби" }, slides: [{ title: "Дроби", facts: ["Дробь — часть целого", "Числитель сверху", "Знаменатель снизу"] }] });
  assert.equal(plan.lesson_meta.subject, "math");
  assert.equal(plan.lesson_meta.grade, "6");
  assert.equal(plan.slides.length, 1);
  assertValid(plan, "lesson.params");
});

test("детерминизм: одинаковый вход — одинаковый план", () => {
  const input = {
    subject: "hist", grade: "8", topic: "Бородинское сражение на карте",
    slide: { title: "Бородино на карте", facts: ["Сражение произошло в 1812 году", "Кутузов командовал армией", "Бородино — важная битва"] }
  };
  const a = V.planForSlide(input);
  const b = V.planForSlide(input);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(JSON.stringify(V.planForLesson({ subject: "bio", grade: 7, topic: "Клетка" }, [{ title: "Клетка" }, { title: "Ядро" }])),
    JSON.stringify(V.planForLesson({ subject: "bio", grade: 7, topic: "Клетка" }, [{ title: "Клетка" }, { title: "Ядро" }])));
});

/* =================================================================
   3. Пять стратегий достижимы
   ================================================================= */
test("5 стратегий достижимы на примерах школьных предметов", () => {
  const cases = [
    ["биология → FLUX", "bio", "7", "Инфузория-туфелька", { title: "Строение инфузории", facts: ["Инфузория — одноклеточное", "Передвигается ресничками", "Живёт в воде"] }, "flux_generation"],
    ["литература → RU-Википедия", "lit", "9", "А. С. Пушкин. «Евгений Онегин»", { title: "Пушкин — автор романа", facts: ["Пушкин родился в 1799 году", "Он написал «Евгения Онегина»", "Пушкин — русский поэт"] }, "ru_wikipedia_api"],
    ["история/зарубежная персона → Wikimedia", "hist", "8", "Наполеон Бонапарт", { title: "Портрет Наполеона", facts: ["Наполеон — французский император", "Он родился на Корсике", "Вёл войны в Европе"] }, "en_wikimedia_api"],
    ["география → библиотека сайта", "geo", "7", "Природные зоны России", { title: "Природные зоны России", facts: ["В России несколько природных зон", "Тайга — самая большая", "Есть тундра и степь"] }, "site_library"],
    ["математика → SVG", "math", "9", "График функции", { title: "Строим график функции", facts: ["График функции — множество точек", "Парабола — график квадратичной функции", "Оси координат пересекаются в начале"] }, "svg_code"]
  ];
  for (const [label, subject, grade, topic, slide, expected] of cases) {
    const plan = V.planForSlide({ subject, grade, topic, slide });
    assert.equal(plan.editorial_check.visual_strategy, expected, label);
    assertValid(plan, label);
  }
});

test("шедевры: русские и мировые — только поиск подлинника", () => {
  const ru = planOf("izo", "6", "И. И. Шишкин. «Утро в сосновом лесу»", { title: "Рассматриваем картину", facts: ["Картину написал Шишкин", "На картине медведи", "Картина в Третьяковке"] });
  assert.equal(ru.editorial_check.visual_strategy, "ru_wikipedia_api");
  assert.match(ru.extra_sources.ru_wiki_title, /Утро в сосновом лесу/);

  const world = planOf("mhk", "10", "Мона Лиза Леонардо да Винчи", { title: "Мона Лиза", facts: ["Мону Лизу написал Леонардо", "Портрет в Лувре", "Улыбка загадочна"] });
  assert.equal(world.editorial_check.visual_strategy, "en_wikimedia_api");
  assert.match(world.extra_sources.en_wiki_query, /Mona Lisa/);

  assertValid(ru, "русский шедевр");
  assertValid(world, "мировой шедевр");
});

/* =================================================================
   4. Карты и портреты запрещены
   ================================================================= */
test("карта никогда не выбирается как стратегия, MAP_REQUEST ловится", () => {
  const mapTopics = [
    ["geo", "7", "Физическая карта России", "Работа с картой"],
    ["geo", "6", "Контурная карта Африки", "Заполняем контурную карту"],
    ["hist", "9", "Сражение на карте: Бородино", "Схема сражения со стрелками"],
    ["hist", "7", "Атлас по истории России", "Работа с атласом"],
    ["geo", "8", "План местности", "Читаем план местности"],
    ["geo", "10", "Political map of Europe", "Map of Europe"]
  ];
  for (const [subject, grade, topic, title] of mapTopics) {
    const plan = V.planForSlide({ subject, grade, topic, slide: { title, facts: ["Тема урока: " + topic, "Главное — понять материал", "Итог урока"] } });
    assert.equal(plan.editorial_check.visual_strategy, "flux_generation", topic + " должна уйти в FLUX с ландшафтом");
    assertValid(plan, "карта: " + topic);
    assert.equal(/карт[аыуе]|\bmap|\batlas\b|атлас|план местности/i.test(plan.editorial_check.visual_anchor + " " + plan.editorial_check.historical_or_scientific_passport), false, "в полях плана не должно быть запроса карты");
  }

  const broken = fluxPlan({ editorial_check: Object.assign({}, fluxPlan().editorial_check, { visual_anchor: "Карта природных зон России" }) });
  const res = V.validate(broken);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some(e => e.code === "MAP_REQUEST"), JSON.stringify(res.errors));

  const negated = fluxPlan({ editorial_check: Object.assign({}, fluxPlan().editorial_check, { cut_out_noise: "Без картографических обозначений и лишних знаков" }) });
  assertValid(negated, "отрицание карты");
});

test("портрет реального человека никогда не уходит в FLUX", () => {
  const persons = [
    ["lit", "9", "Александр Сергеевич Пушкин. Жизнь и творчество", "Портрет Пушкина"],
    ["hist", "8", "Наполеон Бонапарт: портрет и биография", "Портрет Наполеона"],
    ["lit", "8", "Уильям Шекспир. «Ромео и Джульетта»", "Шекспир: жизнь и творчество"],
    ["mus", "5", "Пётр Ильич Чайковский", "Портрет Чайковского"]
  ];
  for (const [subject, grade, topic, title] of persons) {
    const plan = planOf(subject, grade, topic, { title, facts: ["Великий деятель", "Оставил наследие", "Изучаем его жизнь"] });
    assert.ok(["ru_wikipedia_api", "en_wikimedia_api"].includes(plan.editorial_check.visual_strategy), title + ": " + plan.editorial_check.visual_strategy);
    assertValid(plan, title);
  }

  const fluxPortrait = fluxPlan({
    title: "Портрет Пушкина",
    facts: ["Александр Сергеевич Пушкин — русский поэт", "Написал «Евгения Онегина»", "Жил в XIX веке"]
  });
  const res = V.validate(fluxPortrait);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some(e => e.code === "PORTRAIT_VIA_FLUX"), JSON.stringify(res.errors));
});

test("регрессия Lead: факты с именами не делают FLUX-план портретом", () => {
  const plan = planOf("eng", "10", "1.1 Повседневная жизнь семьи. Межличностные отношения", {
    title: "Проверяем понимание",
    facts: ["Семейные обязанности и правила помогают избегать конфликтов.", "В семье важны уважение и поддержка.", "Общение помогает решать проблемы."]
  });
  assert.equal(plan.editorial_check.visual_strategy, "flux_generation");
  assertValid(plan, "семья/межличностные отношения");
});

/* =================================================================
   5. image_prompt: всегда английский, без цифр, с NEG_TAIL
   ================================================================= */
test("image_prompt: непустой, английский, без цифр, с NEG_TAIL, 50–900 символов", () => {
  const plans = [
    planOf("bio", "7", "Инфузория-туфелька", { title: "Инфузория", facts: ["Одноклеточное", "Реснички", "Пресная вода"] }),
    planOf("lit", "9", "А. С. Пушкин", { title: "Пушкин", facts: ["Поэт", "Родился в 1799", "Автор романа"] }),
    planOf("math", "7", "График функции", { title: "График", facts: ["Оси", "Кривая", "Точки"] }),
    planOf("geo", "7", "Природные зоны России", { title: "Природные зоны", facts: ["Тайга", "Тундра", "Степь"] }),
    planOf("hist", "9", "Наполеон Бонапарт", { title: "Портрет Наполеона", facts: ["Император", "Франция", "Войны"] })
  ];
  for (const plan of plans) {
    const prompt = plan.image_prompt;
    assert.equal(typeof prompt, "string");
    assert.ok(prompt.trim().length > 0);
    assert.ok(prompt.length >= 50 && prompt.length <= 900, "длина " + prompt.length);
    assert.equal(CYRILLIC.test(prompt), false, "кириллица в промпте");
    assert.equal(/\d/.test(prompt), false, "цифры в промпте");
    assert.ok(prompt.endsWith(V.NEG_TAIL), "промпт должен заканчиваться NEG_TAIL");
    const words = prompt.split(/\s+/).filter(Boolean).length;
    assert.ok(words >= 60 && words <= 120, "слов в промпте: " + words);
  }
});

test("регрессия Lead: «География в эпоху Средневековья» — символический план, без предметов и карт", () => {
  const plan = planOf("geo", "5", "География в эпоху Средневековья", {
    title: "География в эпоху Средневековья",
    facts: ["В Средние века географы составляли описания земель.", "Появились первые компас и астролябия.", "Знания накапливались в монастырях."]
  });
  assert.equal(plan.editorial_check.visual_strategy, "flux_generation");
  assertValid(plan, "средневековая география");
  /* v1.2: объекта в теме нет — символический план без астролябии/компаса/рукописи. */
  assert.equal(V.isSymbolic(plan), true);
  assert.match(plan.editorial_check.visual_anchor, /Символический образ темы/);
  assert.match(plan.image_prompt, /symbolic composition of soft geometric shapes/);
  assert.equal(/astrolabe|compass|manuscript|illustration of a single central composition/i.test(plan.image_prompt), false);
  assert.equal(/map|atlas/i.test(plan.image_prompt), false);
  /* Эпоха следует из темы («Средние века») — её можно писать в паспорте. */
  assert.match(plan.editorial_check.historical_or_scientific_passport, /эпоха: Средние века/);
});

test("регрессия Lead: символический FLUX-план для темы без предмета (семья), без шаблона предмета", () => {
  const plan = planOf("eng", "5", "Моя семья", { title: "My family", facts: ["A family can be big or small.", "Families spend time together.", "We love our family."] });
  assert.equal(plan.editorial_check.visual_strategy, "flux_generation");
  assert.equal(V.isSymbolic(plan), true);
  assert.match(plan.image_prompt, /symbolic composition of soft geometric shapes/);
  assert.equal(/family table|family scene|family dinner|portrait of|one tidy|illustration of a single central composition/i.test(plan.image_prompt), false);
  assertValid(plan, "eng family");
});

/* =================================================================
   6. SVG: только строгие схемы ≤ 12 элементов
   ================================================================= */
test("svgTemplates: все шаблоны проходят validate", () => {
  const variants = {
    functionGraph: [{ kind: "linear" }, { kind: "parabola" }, { kind: "sine" }],
    triangle: [{ kind: "right" }, { kind: "isosceles" }],
    circleWithTriangle: [{}],
    circuit: [{ kind: "series" }, { kind: "parallel" }],
    forces: [{ kind: "two" }, { kind: "three" }]
  };
  for (const [name, options] of Object.entries(variants)) {
    for (const opts of options) {
      const markup = V.svgTemplates[name](opts);
      assert.ok(/^<svg[\s>]/.test(markup), name);
      assert.ok(markup.includes('viewBox="0 0 800 600"'), name + " viewBox");
      assert.ok(markup.includes("#F8FAFC"), name + " фон");
      assert.ok(tagCount(markup) <= 12, name + " элементов: " + tagCount(markup));
      assert.equal(CYRILLIC.test(markup), false, name + " без кириллицы");
      const result = V.validate(svgPlan(markup));
      assert.equal(result.ok, true, name + " " + JSON.stringify(opts) + ": " + JSON.stringify(result.errors));
    }
  }
});

test("templateFor: строгие схемы → шаблон, обычные темы → null", () => {
  assert.ok(/^<svg/.test(V.templateFor({ subject: "math", topic: "График функции", slide: { title: "График функции" } })));
  assert.match(V.templateFor({ subject: "math", topic: "Треугольник", slide: { title: "Треугольник ABC" } }), /polygon/);
  assert.match(V.templateFor({ subject: "math", topic: "Окружность", slide: { title: "Окружность" } }), /circle/);
  assert.match(V.templateFor({ subject: "phys", topic: "Электрическая цепь", slide: { title: "Электрическая цепь" } }), /rect/);
  assert.match(V.templateFor({ subject: "phys", topic: "Силы", slide: { title: "Равнодействующая сил" } }), /polygon/);
  assert.equal(V.templateFor({ subject: "bio", topic: "Клетка", slide: { title: "Клетка" } }), null);
  assert.equal(V.templateFor({ subject: "lit", topic: "Пушкин", slide: { title: "Пушкин" } }), null);
});

test("регрессия Lead: электрическая цепь выбирает svg_code", () => {
  const plan = planOf("phys", "8", "Электрическая цепь", { title: "Простая электрическая цепь", facts: ["Источник тока", "Резистор", "Провода"] });
  assert.equal(plan.editorial_check.visual_strategy, "svg_code");
  assertValid(plan, "электрическая цепь");
});

test("ломающий SVG отвергается валидатором", () => {
  const broken = {
    "SVG_INVALID": '<svg viewBox="0 0 100 100"><rect x="0" y="0" width="100" height="100" fill="#F8FAFC"/></svg>',
    "SVG_NO_BACKGROUND": '<svg viewBox="0 0 800 600"><circle cx="400" cy="300" r="50"/></svg>',
    "SVG_HAS_WORDS": '<svg viewBox="0 0 800 600"><rect x="0" y="0" width="800" height="600" fill="#F8FAFC"/><text x="400" y="300">Привет</text></svg>',
    "SVG_TOO_MANY_ELEMENTS": '<svg viewBox="0 0 800 600"><rect x="0" y="0" width="800" height="600" fill="#F8FAFC"/>' +
      Array.from({ length: 13 }, (_, i) => '<circle cx="' + (200 + i * 10) + '" cy="300" r="5"/>').join("") + '</svg>',
    "SVG_OUT_OF_BOUNDS": '<svg viewBox="0 0 800 600"><rect x="0" y="0" width="800" height="600" fill="#F8FAFC"/><circle cx="50" cy="50" r="20"/></svg>',
    "SVG_TEXT_ON_VERTEX": '<svg viewBox="0 0 800 600"><rect x="0" y="0" width="800" height="600" fill="#F8FAFC"/><circle cx="400" cy="300" r="80"/><text x="400" y="300">A</text></svg>',
    "SVG_MISSING": ""
  };
  for (const [code, markup] of Object.entries(broken)) {
    const result = V.validate(svgPlan(markup));
    assert.equal(result.ok, false, code + " должен ловиться");
    assert.ok(result.errors.some(e => e.code === code), code + ": " + JSON.stringify(result.errors.map(e => e.code)));
  }
});

/* =================================================================
   7. fallbackSvg
   ================================================================= */
test("fallbackSvg: валидная пиктограмма без текста, ≤ 12 элементов, внутри рамок", () => {
  const subjects = ["lit", "bio", "geo", "hist", "math", "phys", "chem", "mus", "izo", "mystery"];
  for (const subject of subjects) {
    const svg = V.fallbackSvg(subject + "|7|Тема|Слайд", subject);
    assert.ok(/^<svg[\s>]/.test(svg), subject);
    assert.ok(svg.includes('viewBox="0 0 800 600"'), subject);
    assert.ok(svg.includes("#F8FAFC"), subject);
    assert.equal(svg.includes("<text"), false, subject + ": в fallbackSvg не должно быть текста");
    assert.ok(tagCount(svg) <= 12, subject + " элементов: " + tagCount(svg));
    assert.equal(CYRILLIC.test(svg), false, subject + ": кириллица");
    assert.ok(!/[0-9]/.test(svg.replace(/<[^>]+>/g, "").trim()), subject + ": цифры в тексте");
    const result = V.validate(svgPlan(svg));
    assert.equal(result.ok, true, subject + ": " + JSON.stringify(result.errors));
  }
});

test("fallbackSvg: детерминирован, subject-aware, работает без subject", () => {
  assert.equal(V.fallbackSvg("seed-1"), V.fallbackSvg("seed-1"));
  assert.notEqual(V.fallbackSvg("seed-1"), V.fallbackSvg("seed-2"));
  const lit = V.fallbackSvg("lit|7|Книга|Слайд", "lit");
  const bio = V.fallbackSvg("bio|7|Клетка|Слайд", "bio");
  const geo = V.fallbackSvg("geo|7|Горы|Слайд", "geo");
  assert.notEqual(lit, bio);
  assert.notEqual(bio, geo);
  assert.notEqual(lit, geo);
  const noSubject = V.fallbackSvg("bio|7|Клетка|Слайд");
  assert.ok(/^<svg/.test(noSubject), "fallbackSvg(seed) без subject должен работать");
  assert.ok(V.fallbackSvg("").length > 100, "пустой seed тоже даёт SVG");
});

/* =================================================================
   8. resolveQuery
   ================================================================= */
test("resolveQuery: представление плана для механизма картинок сайта", () => {
  assert.deepEqual(V.resolveQuery(planOf("geo", "7", "Природные зоны России: тайга", { title: "Природные зоны", facts: ["Тайга", "Тундра", "Степь"] })),
    { kind: "library", value: "природные зоны тайга ландшафт" });
  assert.deepEqual(V.resolveQuery(planOf("lit", "9", "А. С. Пушкин", { title: "Пушкин", facts: ["Поэт", "Родился в 1799", "Автор романа"] })),
    { kind: "search", value: "Пушкин, Александр Сергеевич" });
  const en = V.resolveQuery(planOf("hist", "8", "Наполеон Бонапарт", { title: "Портрет Наполеона", facts: ["Император", "Франция", "Войны"] }));
  assert.equal(en.kind, "commons");
  assert.equal(en.value, "Napoleon Bonaparte portrait");
  const svg = V.resolveQuery(planOf("math", "7", "График функции", { title: "График", facts: ["Оси", "Кривая", "Точки"] }));
  assert.equal(svg.kind, "data");
  assert.ok(svg.value.startsWith("data:image/svg+xml;charset=utf-8,"));
  assert.ok(decodeURIComponent(svg.value.split(",").slice(1).join(",")).startsWith("<svg"));
  const flux = V.resolveQuery(planOf("bio", "7", "Инфузория", { title: "Инфузория", facts: ["Одноклеточное", "Реснички", "Вода"] }));
  assert.equal(flux.kind, "flux");
  assert.ok(flux.value.endsWith(V.NEG_TAIL));
  assert.deepEqual(V.resolveQuery({ editorial_check: { visual_strategy: "unknown" }, image_prompt: "x" }), { kind: "flux", value: "x" });
});

/* =================================================================
   9. acquire: гарантия непустого url
   ================================================================= */
test("acquire: все адаптеры null → fallback-url", async () => {
  const plan = fluxPlan();
  const adapters = { library: async () => null, wikiRu: async () => null, wikiEn: async () => null, flux: async () => null, svg: async () => null, fallback: async () => "data:image/svg+xml,fallback" };
  const hit = await V.acquire(plan, adapters);
  assert.deepEqual(hit, { url: "data:image/svg+xml,fallback", source: "fallback" });
});

test("acquire: порядок обхода и source", async () => {
  const libPlan = planOf("geo", "7", "Природные зоны России", { title: "Природные зоны", facts: ["Тайга", "Тундра", "Степь"] });
  let called = [];
  const libHit = await V.acquire(libPlan, {
    library: async (tags) => { called.push("library:" + tags); return "data:image/png,library"; },
    flux: async () => "data:image/png,flux",
    fallback: async () => "data:image/png,fallback"
  });
  assert.equal(libHit.source, "library");
  assert.ok(called[0].startsWith("library:природные зоны"));

  const personPlan = planOf("lit", "9", "А. С. Пушкин", { title: "Пушкин", facts: ["Поэт", "Родился в 1799", "Автор романа"] });
  const ruFlux = await V.acquire(personPlan, {
    wikiRu: async () => null,
    flux: async (prompt) => { assert.ok(prompt.endsWith(V.NEG_TAIL)); return "data:image/png,flux"; },
    fallback: async () => "data:image/png,fallback"
  });
  assert.deepEqual(ruFlux, { url: "data:image/png,flux", source: "flux" });

  const enPerson = planOf("hist", "8", "Наполеон Бонапарт", { title: "Портрет Наполеона", facts: ["Император", "Франция", "Войны"] });
  let fluxCalled = false;
  const enHit = await V.acquire(enPerson, {
    wikiEn: async () => null,
    flux: async () => { fluxCalled = true; return "data:image/png,flux"; },
    fallback: async () => "data:image/png,fallback"
  });
  assert.equal(fluxCalled, false, "портрет не должен идти в FLUX");
  assert.equal(enHit.source, "fallback");

  const svgPlanData = planOf("math", "7", "График функции", { title: "График", facts: ["Оси", "Кривая", "Точки"] });
  const svgHit = await V.acquire(svgPlanData, { fallback: async () => "data:image/png,fallback" });
  assert.equal(svgHit.source, "svg");
  assert.ok(svgHit.url.startsWith("data:image/svg+xml;charset=utf-8,"));

  const svgFallback = await V.acquire(svgPlanData, { svg: async () => null, fallback: async () => "data:image/png,fallback" });
  assert.equal(svgFallback.source, "fallback");
  assert.equal(svgFallback.url, "data:image/png,fallback");
});

test("acquire: исключения адаптеров и отсутствие fallback не ломают гарантию url", async () => {
  const plan = fluxPlan();
  const throwers = {
    library: () => { throw new Error("boom"); },
    wikiRu: async () => { throw new Error("boom"); },
    wikiEn: async () => { throw new Error("boom"); },
    flux: async () => { throw new Error("boom"); },
    svg: async () => { throw new Error("boom"); },
    fallback: async () => { throw new Error("boom"); }
  };
  const hit = await V.acquire(plan, throwers);
  assert.equal(hit.source, "fallback");
  assert.ok(typeof hit.url === "string" && hit.url.length > 0);
  assert.ok(hit.url.startsWith("data:image/svg+xml"), "встроенный резерв — data:URL SVG");

  const noAdapters = await V.acquire(plan, null);
  assert.ok(noAdapters.url.length > 0);

  const unknown = await V.acquire({ editorial_check: { visual_strategy: "неизвестно" }, image_prompt: "x" }, { fallback: async () => "data:image/png,fb" });
  assert.equal(unknown.source, "fallback");
});

test("acquire: детерминированный seed = subject|grade|topic|slide.title", async () => {
  const plan = planOf("bio", "7", "Инфузория-туфелька", { title: "Кто такая инфузория", facts: ["Одноклеточное", "Реснички", "Вода"] });
  const seeds = [];
  await V.acquire(plan, { fallback: async seed => { seeds.push(seed); return "data:image/png,fb"; } });
  await V.acquire(plan, { fallback: async seed => { seeds.push(seed); return "data:image/png,fb"; } });
  assert.equal(seeds[0], seeds[1]);
  assert.equal(seeds[0], "bio|7|Инфузория-туфелька|Кто такая инфузория");
});

/* =================================================================
   10. Валидатор: негативы по каждому коду
   ================================================================= */
test("validate: негативы промпта", () => {
  const cases = [
    ["NULL_PROMPT", p => { p.image_prompt = null; }],
    ["PROMPT_CYRILLIC", p => { p.image_prompt = "A clean illustration of a leaf. Текст. " + V.NEG_TAIL; }],
    ["PROMPT_DIGITS", p => { p.image_prompt = "A clean illustration of 3 leaves in a calm room. " + V.NEG_TAIL; }],
    ["PROMPT_TAIL_MISSING", p => { p.image_prompt = "A clean illustration of a leaf in a quiet room without any extra details at all"; }],
    ["PROMPT_TOO_SHORT", p => { p.image_prompt = "A leaf."; }],
    ["PROMPT_TAG_LIST", p => { p.image_prompt = "A leaf, stem, root, soil, water, light, air, pot, table, window, wall, room " + V.NEG_TAIL; }],
    ["PROMPT_TEXT_WORDS", p => { p.image_prompt = "A clean illustration with text in the corner and a calm room. " + V.NEG_TAIL; }],
    ["PROMPT_PERSON_NAME", p => { p.image_prompt = "A clean illustration of Ivan Petrovich in a quiet room. " + V.NEG_TAIL; }],
    ["MAP_REQUEST", p => { p.image_prompt = "A clean map of the region with a river and calm colors. " + V.NEG_TAIL; }]
  ];
  for (const [code, mutate] of cases) {
    const plan = clonePlan(fluxPlan());
    mutate(plan);
    const result = V.validate(plan);
    assert.equal(result.ok, false, code + " должен ловиться");
    assert.ok(result.errors.some(e => e.code === code), code + ": " + JSON.stringify(result.errors.map(e => e.code)));
  }
});

test("validate: негативы схемы и редакторских полей", () => {
  const emptySlide = V.validate({});
  assert.equal(emptySlide.ok, false);
  assert.ok(emptySlide.errors.some(e => e.code === "EMPTY_SLIDE"));

  const titleEmpty = clonePlan(fluxPlan());
  titleEmpty.title = "";
  assert.ok(V.validate(titleEmpty).errors.some(e => e.code === "TITLE_EMPTY"));

  const factsEmpty = clonePlan(fluxPlan());
  factsEmpty.facts = [];
  assert.ok(V.validate(factsEmpty).errors.some(e => e.code === "FACTS_EMPTY"));

  const factsNotArray = clonePlan(fluxPlan());
  factsNotArray.facts = "строка";
  assert.ok(V.validate(factsNotArray).errors.some(e => e.code === "FACTS_NOT_ARRAY"));

  const noStrategy = clonePlan(fluxPlan());
  delete noStrategy.editorial_check.visual_strategy;
  assert.ok(V.validate(noStrategy).errors.some(e => e.code === "NO_STRATEGY"));

  const badStrategy = clonePlan(fluxPlan());
  badStrategy.editorial_check.visual_strategy = "magic";
  assert.ok(V.validate(badStrategy).errors.some(e => e.code === "STRATEGY_INVALID"));

  const emptyEditorial = clonePlan(fluxPlan());
  emptyEditorial.editorial_check.cut_out_noise = "  ";
  assert.ok(V.validate(emptyEditorial).errors.some(e => e.code === "EDITORIAL_FIELD_EMPTY"));

  const wikiMissing = clonePlan(fluxPlan());
  wikiMissing.editorial_check.visual_strategy = "ru_wikipedia_api";
  assert.ok(V.validate(wikiMissing).errors.some(e => e.code === "WIKI_TITLE_MISSING"));

  const enMissing = clonePlan(fluxPlan());
  enMissing.editorial_check.visual_strategy = "en_wikimedia_api";
  assert.ok(V.validate(enMissing).errors.some(e => e.code === "EN_QUERY_MISSING"));

  const libMissing = clonePlan(fluxPlan());
  libMissing.editorial_check.visual_strategy = "site_library";
  libMissing.extra_sources.library_tags = ["один тег"];
  assert.ok(V.validate(libMissing).errors.some(e => e.code === "LIBRARY_TAGS_MISSING"));

  const stray = clonePlan(fluxPlan());
  stray.editorial_check.visual_strategy = "svg_code";
  stray.extra_sources.svg_markup = V.svgTemplates.triangle({ kind: "right" });
  stray.extra_sources.en_wiki_query = "William Shakespeare portrait";
  assert.ok(V.validate(stray).errors.some(e => e.code === "EXTRA_SOURCE_STRAY"));
});

test("validate: lessonPlan обходит слайды и отдаёт путь ошибки", () => {
  const lesson = V.planForLesson({ subject: "bio", grade: 7, topic: "Клетка" }, [
    { title: "Клетка", facts: ["Клетка — единица строения", "Есть ядро", "Есть мембрана"] },
    { title: "Ядро", facts: ["Ядро хранит наследственность", "Ядро внутри клетки", "Ядро важный органоид"] }
  ]);
  assertValid(lesson, "lessonPlan");
  lesson.slides[1].image_prompt = "";
  const result = V.validate(lesson);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.code === "NULL_PROMPT" && e.path === "slides[1].image_prompt"), JSON.stringify(result.errors));
});

test("validate: не падает на мусоре", () => {
  for (const value of [null, undefined, 42, "строка", [], { slides: [] }, { slides: [null] }]) {
    const result = V.validate(value);
    assert.equal(typeof result.ok, "boolean");
    assert.ok(Array.isArray(result.errors));
  }
});

/* =================================================================
   11. Фузз: 500+ тем без EMPTY_SLIDE/NULL_PROMPT и с ok:true
   ================================================================= */
test("фузз 560 тем: валидные планы промпты, стратегии, SVG без кириллицы", () => {
  const SUBJECTS = ["bio", "ru", "lit", "math", "phys", "chem", "geo", "hist", "soc", "inf", "eng", "izo", "mus", "okr", "tech", "pe", "obzh", "orkse", "mhk", "astr", "vis", "lit1"];
  const POOLS = {
    bio: ["Клетка", "Бактерии", "Грибы", "Фотосинтез", "Кровообращение", "Скелет человека", "Рыбы", "Птицы", "Экосистема", "Дыхание растений", "Инфузория-туфелька", "Мхи и папоротники"],
    ru: ["Части речи", "Причастие", "Деепричастие", "Сложное предложение", "Правописание приставок", "Односоставные предложения", "Знаки препинания", "Лексика", "Фонетика", "Морфемика", "Наречие", "Обособленные члены"],
    lit: ["А. С. Пушкин. «Евгений Онегин»", "М. Ю. Лермонтов", "Н. В. Гоголь. «Ревизор»", "И. С. Тургенев. «Отцы и дети»", "Л. Н. Толстой", "А. П. Чехов", "Уильям Шекспир. «Гамлет»", "Былины", "Русские народные сказки", "Иллюстрации к сказке о царе Салтане", "Мона Лиза", "Сказка о царе Салтане"],
    math: ["График функции", "Треугольник и его элементы", "Окружность", "Дроби", "Проценты", "Уравнения", "Теорема Пифагора", "Площадь фигур", "Функция y = kx + b", "Вероятность", "Статистика", "Координатная плоскость"],
    phys: ["Электрическая цепь", "Сила тяжести", "Давление", "Оптика", "Свет и линзы", "Звук", "Тепловые явления", "Механическое движение", "Магнитное поле", "Агрегатные состояния", "Закон Ома", "Инерция"],
    chem: ["Атомы и молекулы", "Периодическая система", "Кислоты и щёлочи", "Реакции", "Металлы", "Вода", "Соли", "Оксиды", "Растворы", "Органические вещества", "Валентность", "Химическая связь"],
    geo: ["Природные зоны России", "Физическая карта России", "Климат", "Рельеф дна океана", "География в эпоху Средневековья", "Атлас мира", "Путешествия и открытия", "Почвы", "Минералы", "Океаны", "Материки", "План местности"],
    hist: ["Бородинское сражение на карте", "Наполеон Бонапарт", "Древний Египет", "Средние века", "Крещение Руси", "Пётр I", "Великая Отечественная война", "Первобытное общество", "Реформы Александра II", "Куликовская битва", "Исаак Ньютон", "Повседневная жизнь семьи"],
    soc: ["Семья и общество", "Право и закон", "Экономика семьи", "Политика", "Социальные отношения", "Конституция", "Рынок", "Труд", "Образование", "Государство", "Мораль", "Конфликты"],
    inf: ["Алгоритмы", "Компьютерные сети", "Файлы и данные", "Программирование", "Циклы", "Кодирование", "Моделирование", "Базы данных", "Интернет", "Безопасность", "Электронные таблицы", "Исполнитель"],
    eng: ["Моя семья", "Алфавит: буквы A–M", "Мой дом", "Школа", "Погода", "Еда", "Животные", "Путешествия", "Хобби", "Друзья", "Спорт", "Праздники"],
    izo: ["И. И. Шишкин. «Утро в сосновом лесу»", "Народные промыслы", "Пейзаж", "Натюрморт", "Портрет в искусстве", "Живопись", "Иллюстрация", "Фреска", "Скульптура", "Декоративное искусство", "Цветоведение", "Композиция"],
    mus: ["Пётр Ильич Чайковский", "Народная музыка", "Симфония", "Оркестр", "Ритм и мелодия", "Музыкальные инструменты", "Ноты", "Песня", "Марш", "Вальс", "Хор", "Композиторы"],
    okr: ["Времена года", "Животные леса", "Космос", "Моя семья", "Природа родного края", "Растения", "Погода", "Россия", "Здоровье", "Вода", "Почва", "Птицы"],
    tech: ["Металлы и инструменты", "Ткани", "Конструирование", "Моделирование", "Кулинария", "Электричество в быту", "Чертежи", "Древесина", "Бумага и картон", "Швы", "Техника", "Роботы"],
    pe: ["Гимнастика", "Лёгкая атлетика", "Баскетбол", "Волейбол", "Лыжная подготовка", "Плавание", "Футбол", "Закаливание", "Осанка", "Разминка", "Спортивные игры", "Олимпийские игры"],
    obzh: ["Пожарная безопасность", "Правила дорожного движения", "Первая помощь", "Безопасность в интернете", "Опасные вещества", "Терроризм", "Здоровый образ жизни", "Эвакуация", "Вода и безопасность", "Ориентирование", "Чрезвычайные ситуации", "Безопасный дом"],
    orkse: ["Православные праздники", "Семья в культуре", "Библия", "Храмы", "Милосердие", "Добро и зло", "Мечеть", "Синагога", "Культура народов", "Традиции", "Совесть", "Памятники культуры"],
    mhk: ["Мона Лиза Леонардо да Винчи", "Древнегреческая скульптура", "Русская икона", "Архитектура храма", "Барокко", "Русский музей", "Мифология в живописи", "Тайная вечеря", "Афинская школа", "Стили в искусстве", "Музыка и живопись", "Памятники архитектуры"],
    astr: ["Планеты Солнечной системы", "Звёзды", "Луна", "Солнце", "Галактики", "Космонавтика", "Метеориты", "Время и календарь", "Телескопы", "Вселенная", "Созвездия", "Земля и Луна"],
    vis: ["Вероятность", "Статистика", "Случайные события", "Графики и таблицы", "Средние величины", "Комбинаторика", "Диаграммы", "Выборка", "Частота", "Дерево вероятностей", "Множества", "Логика"],
    lit1: ["Русские народные сказки", "Стихи о природе", "Рассказы о животных", "Былины", "Сказка о царе Салтане", "Иллюстрации к сказкам", "Аленький цветочек", "Малые жанры фольклора", "Рассказы для детей", "Поэзия", "Весёлые рассказы", "Сказки народов мира"]
  };
  const GENERIC = ["Введение в тему", "Повторение изученного", "Практическая работа", "Итоговый урок", "Тема с числом 1812", "Карта мира", "Атлас", "Портрет Пушкина", "Эпоха Средневековья"];
  const fuzz = [];
  let seed = 20261125;
  const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 560; i++) {
    const subject = SUBJECTS[i % SUBJECTS.length];
    const pool = POOLS[subject].concat(GENERIC);
    const topic = pool[Math.floor(rnd() * pool.length)];
    const grade = String(1 + (i % 11));
    const mode = i % 5;
    let slide;
    if (mode === 0) slide = { title: topic, body: "", facts: [] };
    else if (mode === 1) slide = { title: "Слайд " + (i + 1), body: "- Первый тезис по теме " + topic + "\n- Второй тезис по теме\n- Третий тезис по теме", facts: [] };
    else if (mode === 2) slide = { title: "Проверяем понимание", facts: ["Вопрос по теме " + topic + ".", "Ответ связан с темой урока.", "Проверяем знание материала."] };
    else if (mode === 3) slide = { title: topic, body: "", facts: [topic + " — тема урока.", "Материал " + grade + " класса.", "Итог по теме."] };
    else slide = { title: topic, body: "Текст слайда по теме без фактов.", facts: [] };
    fuzz.push({ subject, grade, topic, slide });
  }
  assert.ok(fuzz.length >= 500);
  const strategies = new Set();
  for (const input of fuzz) {
    const plan = V.planForSlide(input);
    assert.ok(plan.title.trim().length > 0, "TITLE_EMPTY: " + JSON.stringify(input.topic));
    assert.ok(plan.image_prompt && plan.image_prompt.length > 0, "NULL_PROMPT: " + input.topic);
    const result = V.validate(plan);
    assert.equal(result.ok, true, "фузз «" + input.subject + " / " + input.topic + "»: " + JSON.stringify(result.errors));
    assert.ok(!result.errors.some(e => e.code === "EMPTY_SLIDE" || e.code === "NULL_PROMPT"));
    assert.equal(CYRILLIC.test(plan.image_prompt), false);
    assert.equal(/\d/.test(plan.image_prompt), false);
    assert.ok(plan.image_prompt.endsWith(V.NEG_TAIL));
    assert.ok(plan.image_prompt.length >= 50 && plan.image_prompt.length <= 900);
    const strategy = plan.editorial_check.visual_strategy;
    strategies.add(strategy);
    if (strategy === "svg_code") assert.equal(CYRILLIC.test(plan.extra_sources.svg_markup), false);
    if (strategy === "site_library") assert.ok(plan.extra_sources.library_tags.length >= 2 && plan.extra_sources.library_tags.length <= 4);
    if (strategy === "ru_wikipedia_api") assert.ok(plan.extra_sources.ru_wiki_title.trim().length > 0);
    if (strategy === "en_wikimedia_api") assert.ok(plan.extra_sources.en_wiki_query.trim().length > 0);
    const query = V.resolveQuery(plan);
    assert.ok(["library", "search", "commons", "data", "flux"].includes(query.kind));
  }
  assert.equal(strategies.size, 5, "фузз должен задевать все 5 стратегий: " + Array.from(strategies).join(","));
});

test("регрессия Lead: портреты в фактах — подлинник поиском, неизвестная персона — архив без имён", () => {
  const known = planOf("bio", "9", "Генетика", {
    title: "Демонстрации",
    facts: ["Демонстрации: Портреты: Ч. Дарвин, Г. Мендель, Н. К. Кольцов, Дж. Уотсон и Ф. Крик"]
  });
  assert.ok(["ru_wikipedia_api", "en_wikimedia_api"].includes(known.editorial_check.visual_strategy), known.editorial_check.visual_strategy);
  assertValid(known, "портреты учёных в фактах");

  const unknown = planOf("bio", "9", "Генетика", {
    title: "Демонстрации",
    facts: ["Портреты: Иван Неизвестнов, Пётр Загадочнов и другие исследователи"]
  });
  assert.equal(unknown.editorial_check.visual_strategy, "flux_generation");
  assertValid(unknown, "неизвестные портреты");
  assert.match(unknown.editorial_check.visual_anchor, /архив|рамы|без лиц/i);
  assert.equal(CYRILLIC.test(unknown.image_prompt), false);
  assert.equal(/Neizvestnov|Zagadochnov|Ivan|Petr/i.test(unknown.image_prompt), false, "имён в промпте быть не должно");
});

test("редакторские поля конкретны: якорь по слайду, паспорт без бойлерплейта", () => {
  const plans = [
    planOf("bio", "7", "Инфузория-туфелька", { title: "Кто такая инфузория-туфелька", facts: ["Инфузория — одноклеточное животное", "Живёт в пресной воде", "Передвигается ресничками"] }),
    planOf("lit", "9", "А. С. Пушкин", { title: "Пушкин", facts: ["Пушкин — русский поэт"] }),
    planOf("izo", "6", "И. И. Шишкин. «Утро в сосновом лесу»", { title: "Рассматриваем картину", facts: ["Картину написал Шишкин"] }),
    planOf("math", "7", "График функции", { title: "График функции", facts: ["Оси x и y"] }),
    planOf("geo", "7", "Природные зоны России", { title: "Природные зоны России", facts: ["Тайга — самая большая зона"] })
  ];
  for (const plan of plans) {
    const anchor = plan.editorial_check.visual_anchor;
    const passport = plan.editorial_check.historical_or_scientific_passport;
    assert.equal(/Один главный объект/.test(anchor), false, "бойлерплейт якоря: " + anchor);
    assert.equal(/уточняются по содержанию/.test(passport), false, "бойлерплейт паспорта: " + passport);
    assert.ok(anchor.length <= 180 && passport.length <= 240);
    assertValid(plan, "редакторские поля");
  }
  /* v1.2: anchor grounded-объекта называет предмет из темы, а не бойлерплейт. */
  assert.match(plans[0].editorial_check.visual_anchor, /^Объект: инфузория-туфелька/);
  assert.match(plans[0].editorial_check.historical_or_scientific_passport, /предмет назван в (?:теме урока|заголовке слайда)/);
  assert.match(plans[1].editorial_check.visual_anchor, /Портрет.*Пушкин/i);
  assert.match(plans[1].editorial_check.historical_or_scientific_passport, /Годы жизни/);
  assert.match(plans[2].editorial_check.visual_anchor, /Репродукция.*Утро в сосновом лесу/);
  assert.match(plans[3].editorial_check.visual_anchor, /Схема/);
  assert.match(plans[4].editorial_check.visual_anchor, /Типовая иллюстрация/);
});

test("SVG-шаблоны по ГОСТ: stroke-width 3 и font-size 22", () => {
  const variants = [
    V.svgTemplates.functionGraph({ kind: "parabola" }),
    V.svgTemplates.triangle({ kind: "right" }),
    V.svgTemplates.circleWithTriangle(),
    V.svgTemplates.circuit({ kind: "parallel" }),
    V.svgTemplates.forces({ kind: "three" })
  ];
  for (const markup of variants) {
    const strokes = [...markup.matchAll(/stroke-width="(\d+)"/g)].map(m => m[1]);
    assert.ok(strokes.length > 0);
    assert.ok(strokes.every(v => v === "3"), "stroke-width: " + strokes.join(","));
    const fonts = [...markup.matchAll(/font-size="(\d+)"/g)].map(m => m[1]);
    assert.ok(fonts.every(v => v === "22"), "font-size: " + fonts.join(","));
    assertValid(svgPlan(markup), "ГОСТ-шаблон");
  }
});

test("регрессия Lead: алфавит — библиотечная тема, а не абстрактная книга", () => {
  const plan = planOf("eng", "2", "Алфавит: буквы A–M", { title: "Буквы английского алфавита", facts: ["Буквы английского алфавита"] });
  assert.equal(plan.editorial_check.visual_strategy, "site_library");
  assert.ok(plan.extra_sources.library_tags.includes("английский алфавит"), JSON.stringify(plan.extra_sources.library_tags));
  assertValid(plan, "алфавит");
});

test("промпт: точка перед NEG_TAIL и RU→EN лексикон объекта", () => {
  const ciliate = planOf("bio", "7", "Инфузория-туфелька", { title: "Инфузория", facts: ["Инфузория — одноклеточное животное пресных вод"] });
  assert.ok(ciliate.image_prompt.includes(". " + V.NEG_TAIL), "перед NEG_TAIL должна быть точка");
  assert.match(ciliate.image_prompt, /ciliate/);
  const leaf = planOf("bio", "6", "Лист", { title: "Строение листа", facts: ["Лист имеет жилки и устьица"] });
  assert.match(leaf.image_prompt, /leaf/);
  assertValid(ciliate, "лексикон: инфузория");
  assertValid(leaf, "лексикон: лист");
});

test("редакторские поля не содержат запроса карты даже из фактов (банковская карта)", () => {
  const plan = planOf("soc", "8", "Банковские услуги", {
    title: "Банковские услуги",
    facts: ["Банковские услуги: депозит, кредит, платежная карта, денежные переводы, обмен валют"]
  });
  assertValid(plan, "банковская карта");
  assert.equal(/карт/i.test(plan.editorial_check.visual_anchor + plan.editorial_check.historical_or_scientific_passport + plan.editorial_check.cut_out_noise), false);
});

test("аудит: словоформы карт/плана местности ловятся, «картина/картотека» — нет", () => {
  const probe = anchor => {
    const plan = clonePlan(fluxPlan());
    plan.editorial_check.visual_anchor = anchor;
    return V.validate(plan).errors.some(e => e.code === "MAP_REQUEST");
  };
  for (const anchor of ["Сравнение карт Эратосфена и Птолемея", "по плану местности", "Планы местности", "карта мира", "атлас России", "картосхема", "топографические элементы"]) {
    assert.equal(probe(anchor), true, "должно ловиться: " + anchor);
  }
  for (const anchor of ["Картина «Утро в сосновом лесу»", "Картотека растений", "Карточки для урока"]) {
    assert.equal(probe(anchor), false, "не должно ловиться: " + anchor);
  }
  const negated = clonePlan(fluxPlan());
  negated.editorial_check.historical_or_scientific_passport = "Вид местности без картографических обозначений";
  negated.editorial_check.cut_out_noise = "Исключены топографические элементы и условные знаки";
  assert.equal(V.validate(negated).ok, true, "отрицания карты допустимы");
});

test("аудит: 4 geo/5 темы с картами дают чистый ландшафтный план", () => {
  const topics = [
    "Представления о мире в древности. Практическая работа «Сравнение карт Эратосфена, Птолемея и современных карт по предложенным учителем вопросам» 0,5",
    "Виды изображения земной поверхности. Планы местности. Условные знаки",
    "Изображение на планах местности неровностей земной поверхности. Абсолютная и относительная высоты. Профессия топограф",
    "Ориентирование по плану местности. Разнообразие планов и области их применения. Практическая работа «Составление описания маршрута по плану местности» 0,5"
  ];
  for (const topic of topics) {
    const plan = planOf("geo", "5", topic, { title: "Проверяем понимание", body: "", facts: [topic] });
    assert.equal(plan.editorial_check.visual_strategy, "flux_generation", topic.slice(0, 40));
    assertValid(plan, "карта в теме: " + topic.slice(0, 40));
    assert.match(plan.editorial_check.visual_anchor, /Ландшафт/);
    assert.equal(/карт[а-яё]*|план[а-яё]*\s+местност|атлас/i.test(plan.editorial_check.visual_anchor), false, "anchor не повторяет тему с картой");
    assert.equal(/карт|map|atlas|атлас/i.test(plan.image_prompt), false, "промпт чистый");
    assert.match(plan.editorial_check.historical_or_scientific_passport, /без картографических обозначений/);
  }
});

test("аудит: «Музыкальные портреты» не превращаются в портрет персоны", () => {
  const plan = planOf("mus", "1", "Музыкальные портреты", {
    title: "Музыкальные портреты: примеры и практика",
    body: "",
    facts: ["Русские народные сказания, былины, песни.", "Музыкальные портреты в искусстве."]
  });
  assert.equal(plan.editorial_check.visual_strategy, "flux_generation");
  assertValid(plan, "музыкальные портреты");
  assert.equal(/Подлинный портрет/.test(plan.editorial_check.visual_anchor), false);
});

test("P0/P1: grounded-only — объект только из темы, без шаблонов SUBJECT_OBJECT", () => {
  const plan = (subject, grade, topic) => planOf(subject, grade, topic, { title: topic, body: "", facts: [] });
  const OLD_TEMPLATE = /three dimensional printer|food preparation|woodworking plane|modern technical object|gymnastics mat|one open exercise book|one tuning fork|one artist palette|one quiet architectural detail|one translucent living organism/i;

  const warAndPeace = plan("lit", "10", "Роман «Война и мир»");
  assert.equal(/Подлинный портрет/.test(warAndPeace.editorial_check.visual_anchor), false, "нельзя выдумывать автора-персону");
  assert.equal(warAndPeace.editorial_check.visual_strategy === "ru_wikipedia_api" && /Портрет/.test(String(warAndPeace.extra_sources.ru_wiki_title)), false);
  assertValid(warAndPeace, "Война и мир");

  const bapt = plan("hist", "6", "Крещение Руси");
  assert.equal(bapt.extra_sources.ru_wiki_title, null, "событие не персона");
  assertValid(bapt, "Крещение Руси");

  const krylov = plan("lit", "5", "Басни И. А. Крылова");
  assert.equal(krylov.editorial_check.visual_strategy, "ru_wikipedia_api", "явная фамилия остаётся персонажем");
  assert.match(krylov.extra_sources.ru_wiki_title, /Крылов/);

  /* v1.2: предмет, названный в теме, объект сохраняет. */
  const smartphone = plan("tech", "5", "Смартфоны и планшеты");
  assert.equal(V.grounding(smartphone).objectKey, "smartphone");
  assert.match(smartphone.image_prompt, /smartphone/);
  assert.equal(/wooden handle|metal blade/i.test(smartphone.image_prompt), false);
  assert.equal(/класс ·/.test(smartphone.editorial_check.visual_anchor), false, "anchor не из мета-строки");

  const sewing = plan("tech", "6", "Швейная машина");
  assert.equal(V.grounding(sewing).objectKey, "sewing");
  assert.match(sewing.image_prompt, /sewing machine/);
  assertValid(sewing, "швейная машина");

  const dish = plan("tech", "6", "Кулинария. Бутерброды");
  assert.equal(V.grounding(dish).objectKey, "food");
  assert.match(dish.image_prompt, /dish|ingredients/);
  assert.equal(/wooden handle|metal blade/i.test(dish.image_prompt), false);

  const periodic = plan("chem", "9", "Периодическая таблица");
  assert.equal(V.grounding(periodic).objectKey, "periodic");
  assert.match(periodic.image_prompt, /chart grid/);
  assert.equal(/flask/i.test(periodic.image_prompt), false, "периодическая таблица — не колба");

  const cosmos = plan("okr", "3", "Космос. Планеты Солнечной системы");
  assert.equal(V.grounding(cosmos).objectKey, "planet");
  assert.match(cosmos.image_prompt, /deep space|dark space|dark background/);
  assert.equal(/meadow|sunny/i.test(cosmos.image_prompt), false, "космос без луга");
  assert.match(cosmos.editorial_check.visual_anchor, /планет|космическ/);

  /* v1.2.1: тема не называет предмет — только символ, никаких шаблонных объектов. */
  const symbolic = [
    ["tech", "6", "3D-печать"],
    ["tech", "6", "Обработка древесины"],
    ["tech", "6", "Робототехника. Сборка модели"],
    ["tech", "7", "Технический прогресс"],
    ["inf", "5", "Алгоритмы и блок-схемы"],
    ["ru", "5", "Приставки"],
    ["pe", "5", "Гимнастика. Кувырок вперёд"]
  ];
  for (const [subject, grade, topic] of symbolic) {
    const p = plan(subject, grade, topic);
    assert.equal(p.editorial_check.visual_strategy, "flux_generation", topic);
    assert.equal(V.isSymbolic(p), true, topic + " должен быть символическим");
    assert.match(p.image_prompt, /symbolic composition of soft geometric shapes/, topic);
    assert.equal(OLD_TEMPLATE.test(p.image_prompt), false, topic + ": в промпте старый шаблонный объект");
    assert.match(p.editorial_check.visual_anchor, /^Символический образ темы/, topic);
    assertValid(p, topic);
  }

  /* v1.2 final: групповая тема с безопасными тегами — реальные изображения
     из библиотеки/поиска (природные классы, инструменты, вещества). */
  const instruments = plan("mus", "4", "Народные инструменты");
  assert.equal(instruments.editorial_check.visual_strategy, "site_library", "групповая тема — библиотека, не символы государства");
  assert.equal(V.isSymbolic(instruments), false);
  assert.ok(instruments.extra_sources.library_tags.length >= 2);
  assertValid(instruments, "инструменты → библиотека");
  assert.equal(/quill|inkwell/i.test(plan("ru", "5", "Приставки").image_prompt), false, "никакого гусиного пера на уроке русского");
});

test("QA V1/V2: дефисные персоны и честные anchor/ru_wiki_title", () => {
  const plan = (subject, grade, topic, title) => planOf(subject, grade, topic, { title: title || topic, body: "", facts: [] });

  const exupery = plan("lit", "7", "Антуан де Сент-Экзюпери. Повесть-сказка «Маленький принц». Жанр, тематика", "Из биографии");
  assert.ok(["ru_wikipedia_api", "en_wikimedia_api"].includes(exupery.editorial_check.visual_strategy), exupery.editorial_check.visual_strategy);
  assert.match(exupery.editorial_check.visual_anchor + " " + (exupery.extra_sources.ru_wiki_title || "") + " " + (exupery.extra_sources.en_wiki_query || ""), /Сент-Экзюпери|Saint-Exupery/);
  assert.equal(/-$/.test(exupery.editorial_check.visual_anchor), false, "anchor не обрывается на дефисе");
  assertValid(exupery, "Сент-Экзюпери");

  const saltykov = plan("lit", "10", "Основные этапы творчества М.Е. Салтыкова-Щедрина", "Ключевые понятия");
  assert.match(saltykov.extra_sources.ru_wiki_title || "", /Салтыков-Щедрин/);
  assertValid(saltykov, "Салтыков-Щедрин");

  const mamin = plan("lit1", "3", "Д.Н. Мамина-Сибиряка. Рассказы о природе", "Из биографии");
  assert.match(mamin.extra_sources.ru_wiki_title || "", /Мамин-Сибиряк/);
  assertValid(mamin, "Мамин-Сибиряк");

  const garin = plan("lit1", "4", "Н.Г. Гарина-Михайловского. Детство Тёмы", "Из биографии");
  assert.match(String(mamin.extra_sources.ru_wiki_title || "") + String(garin.extra_sources.ru_wiki_title || ""), /Мамин-Сибиряк/);
  assert.match(garin.extra_sources.ru_wiki_title || "", /Гарин-Михайловский/);
  assertValid(garin, "Гарин-Михайловский");

  const fakePortraitCases = [
    plan("izo", "6", "2.3 Вглядываясь в человека. Портрет", "Проблемный вопрос"),
    plan("lit1", "2", "Главный герой произведения. Характеристика", "Из биографии"),
    plan("lit1", "3", "Составление портрета главного героя рассказа Л.А. Кассиля «Алексей Андреевич»", "Главное по теме")
  ];
  for (const p of fakePortraitCases) {
    assert.equal(/Подлинный портрет/.test(p.editorial_check.visual_anchor), false, p.editorial_check.visual_anchor);
    assertValid(p, "без выдуманного портрета");
  }

  const storyPics = plan("lit1", "1", "Составление рассказов по сюжетным картинкам. Предложение и слово", "Ключевые понятия");
  assert.notEqual(storyPics.editorial_check.visual_strategy, "ru_wikipedia_api");
  assert.equal(storyPics.extra_sources.ru_wiki_title, null);
  assert.equal(/^Репродукция/.test(storyPics.editorial_check.visual_anchor), false);
  assertValid(storyPics, "сюжетные картинки");

  const genre = plan("izo", "6", "Пейзаж и тематическая картина", "Примеры");
  assert.equal(genre.editorial_check.visual_strategy, "ru_wikipedia_api");
  assert.match(genre.editorial_check.visual_anchor, /Пример произведения живописи по теме/);
  assert.equal(/^Репродукция/.test(genre.editorial_check.visual_anchor), false);
  assertValid(genre, "жанр пейзаж");
});

test("validate: новые коды FAKE_PORTRAIT / FAKE_REPRO / WIKI_TITLE_IMPLAUSIBLE", () => {
  const fakePortrait = clonePlan(fluxPlan());
  fakePortrait.editorial_check.visual_anchor = "Подлинный портрет: Неизвестный Человек";
  let res = V.validate(fakePortrait);
  assert.ok(res.errors.some(e => e.code === "FAKE_PORTRAIT"), JSON.stringify(res.errors));

  const fakeRepro = clonePlan(fluxPlan());
  fakeRepro.editorial_check.visual_anchor = "Репродукция: «Учебная тема урока»";
  res = V.validate(fakeRepro);
  assert.ok(res.errors.some(e => e.code === "FAKE_REPRO"), JSON.stringify(res.errors));

  const badTitle = clonePlan(fluxPlan());
  badTitle.editorial_check.visual_strategy = "ru_wikipedia_api";
  badTitle.editorial_check.visual_anchor = "Подлинный портрет: Пушкин, Александр Сергеевич";
  badTitle.extra_sources.ru_wiki_title = "Составление рассказов по сюжетным картинкам. Предложение и слово";
  res = V.validate(badTitle);
  assert.ok(res.errors.some(e => e.code === "WIKI_TITLE_IMPLAUSIBLE"), JSON.stringify(res.errors));
});

test("финальная редактура: контекст по интенту и сцена без дублей", () => {
  const ciliate = planOf("bio", "7", "Инфузория-туфелька", { title: "Инфузория", facts: ["Инфузория — одноклеточное животное пресных вод"] });
  assert.match(ciliate.image_prompt, /laboratory-like/);
  assert.equal(/linen|clay/i.test(ciliate.image_prompt), false, "для микро-био не должно быть clay/linen");
  assert.equal((ciliate.image_prompt.match(/drop of [a-z ]*water/gi) || []).length, 1, "сцена с каплей воды не должна дублироваться");
  assertValid(ciliate, "микро-контекст");

  const war = planOf("hist", "9", "Отечественная война 1812 года", { title: "Бородинское сражение", facts: ["Бородинское сражение произошло в 1812 году.", "Кутузов командовал русской армией."] });
  /* v1.2: сражение — не предмет; план символический, но дата из источника сохраняется. */
  assert.equal(war.editorial_check.visual_strategy, "flux_generation");
  assert.equal(V.isSymbolic(war), true);
  assert.match(war.editorial_check.visual_anchor, /^Символический образ темы/);
  assert.equal(/барабан|произошло/i.test(war.editorial_check.visual_anchor), false, "anchor — символический образ, а не выдуманная сцена");
  assert.match(war.editorial_check.historical_or_scientific_passport, /1812/);
  assert.match(war.image_prompt, /symbolic composition of soft geometric shapes/);
  assert.equal(/clay and linen|illustration of a single central composition/i.test(war.image_prompt), false);
  assert.equal(/\d/.test(war.image_prompt), false);
  assertValid(war, "историческое событие");

  const taiga = planOf("geo", "7", "Природные зоны России: тайга", { title: "Тайга", facts: ["Тайга — хвойный лес."] });
  assert.equal(taiga.editorial_check.visual_strategy, "site_library");
  assert.match(taiga.image_prompt, /taiga/);
  assert.equal(/small animal|nature study/i.test(taiga.image_prompt), false, "fallback-промпт библиотеки должен строиться из тегов");

  const alphabet = planOf("eng", "2", "Алфавит: буквы A–M", { title: "Буквы английского алфавита", facts: ["Буквы английского алфавита."] });
  assert.match(alphabet.image_prompt, /alphabet/);
  assert.equal(/nature study/i.test(alphabet.image_prompt), false);
});

/* =================================================================
   v1.2 / v1.2.1: grounded-only (запрет фантазий)
   ================================================================= */
test("v1.2: API isSymbolic/grounding; служебная мета не попадает в JSON", () => {
  assert.equal(typeof V.isSymbolic, "function");
  assert.equal(typeof V.grounding, "function");

  const symbolic = planOf("bio", "5", "Биология – наука о живой природе");
  assert.equal(V.isSymbolic(symbolic), true);
  assert.deepEqual(V.grounding(symbolic), {
    grounded: false, objectKey: null, sourceWords: [], symbolic: true, topicType: "abstract",
    intent: "flux-symbolic", slideLevel: false, allowed: false, reason: "", groundSource: ""
  });

  const ciliate = planOf("bio", "7", "Инфузория-туфелька", { title: "Строение инфузории", facts: ["Инфузория — одноклеточное"] });
  assert.equal(V.isSymbolic(ciliate), false);
  const gr = V.grounding(ciliate);
  assert.equal(gr.grounded, true);
  assert.equal(gr.objectKey, "ciliate");
  assert.equal(gr.symbolic, false);
  assert.equal(gr.topicType, "object");
  assert.ok(gr.sourceWords.length >= 1 && gr.sourceWords.some(w => /^инфузори/.test(w)), JSON.stringify(gr.sourceWords));

  /* Публичная JSON-схема не меняется: меты в JSON нет. */
  const json = JSON.parse(JSON.stringify(ciliate));
  assert.deepEqual(Object.keys(json).sort(), ["editorial_check", "extra_sources", "facts", "image_prompt", "title"]);
  assert.equal("__vp_meta" in json, false);
  assert.equal(JSON.stringify(ciliate).indexOf("__vp_meta"), -1);

  /* Внешний JSON без меты: символичность — по промпту (здесь промпт предметный). */
  assert.equal(V.isSymbolic(json), false);
  assert.equal(V.grounding(json).symbolic, false);
  assert.equal(V.grounding(json).grounded, false);
  assert.equal(V.grounding(json).topicType, "abstract");
  assert.equal(V.grounding(null).topicType, "abstract");
  assert.equal(V.isSymbolic(null), false);
});

test("v1.2.1: классификация темы object / group / abstract", () => {
  const type = (subject, topic, title) => V.grounding(planOf(subject, "7", topic, { title: title || topic, body: "", facts: [] })).topicType;
  assert.equal(type("bio", "Инфузория-туфелька"), "object");
  assert.equal(type("bio", "Строение инфузории"), "object");
  assert.equal(type("math", "Треугольник и его элементы"), "object");
  assert.equal(type("bio", "Сердце человека"), "object");
  assert.equal(type("mus", "Жанры музыки"), "group");
  assert.equal(type("bio", "Одноклеточные животные – простейшие"), "group");
  assert.equal(type("lit1", "Сказки"), "group");
  assert.equal(type("bio", "Классификация животных"), "abstract");
  assert.equal(type("bio", "Генетика – наука о наследственности и изменчивости"), "abstract");
  assert.equal(type("ru1", "Приставки"), "abstract");
  assert.equal(type("pe", "Значение физической культуры"), "abstract");
  assert.equal(type("geo", "Население России"), "abstract");
});

test("v1.2.1: абстрактные темы — символический план без предмета; группы — реальная библиотека", () => {
  const abstractCases = [
    ["bio", "5", "Биология – наука о живой природе"],
    ["bio", "10", "Генетика – наука о наследственности и изменчивости"],
    ["bio", "7", "Классификация животных"],
    ["bio", "6", "Фотосинтез"],
    ["bio", "6", "Дыхание растений"],
    ["ru1", "2", "Приставки"],
    ["ru", "5", "Орфография"],
    ["pe", "8", "Значение физической культуры"],
    ["obzh", "8", "Безопасность в быту"],
    ["obzh", "9", "Теоретические основы безопасности жизнедеятельности"],
    ["geo", "8", "Население России"],
    ["geo", "7", "Климат"],
    ["math", "7", "Функции"],
    ["soc", "8", "Экономика"]
  ];
  for (const [subject, grade, topic] of abstractCases) {
    const plan = planOf(subject, grade, topic);
    assert.equal(plan.editorial_check.visual_strategy, "flux_generation", subject + "/" + topic);
    assert.equal(V.isSymbolic(plan), true, subject + "/" + topic);
    const gr = V.grounding(plan);
    assert.equal(gr.grounded, false, subject + "/" + topic);
    assert.equal(gr.symbolic, true, subject + "/" + topic);
    assert.equal(gr.objectKey, null, subject + "/" + topic);
    assert.match(plan.image_prompt, /symbolic composition of soft geometric shapes/, subject + "/" + topic);
    assert.equal(/educational illustration of a single central composition/i.test(plan.image_prompt), false, subject + "/" + topic);
    assert.match(plan.editorial_check.visual_anchor, /^Символический образ темы/, subject + "/" + topic);
    assert.match(plan.editorial_check.historical_or_scientific_passport, /Предметная атрибуция отсутствует/, subject + "/" + topic);
    assert.equal(plan.extra_sources.ru_wiki_title, null);
    assert.equal(plan.extra_sources.en_wiki_query, null);
    assert.equal(plan.extra_sources.library_tags.length, 0);
    assertValid(plan, subject + "/" + topic);
  }

  /* v1.2 final: групповые темы с безопасными тегами — реальные изображения
     из библиотеки/поиска (CONTRACT v1.2.1 п.2), а не FLUX-фантазия. */
  for (const [subject, grade, topic] of [
    ["mus", "4", "Народные инструменты"],
    ["bio", "8", "Одноклеточные животные – простейшие"]
  ]) {
    const plan = planOf(subject, grade, topic);
    assert.equal(plan.editorial_check.visual_strategy, "site_library", subject + "/" + topic);
    assert.equal(V.isSymbolic(plan), false, subject + "/" + topic);
    assert.ok(plan.extra_sources.library_tags.length >= 2, subject + "/" + topic);
    assert.equal(plan.extra_sources.ru_wiki_title, null);
    assert.equal(V.grounding(plan).grounded, false, subject + "/" + topic);
    assertValid(plan, subject + "/" + topic);
  }
  /* Литература/фольклор остаются символическими: «сказки» — не предмет. */
  const tales = planOf("lit1", "2", "Сказки народов России");
  assert.equal(V.isSymbolic(tales), true);
  assertValid(tales, "сказки");
  /* Группа без надёжных тегов изображения — тоже символ (люди/события). */
  const genres = planOf("mus", "7", "Жанры музыки");
  assert.equal(V.isSymbolic(genres), true);
  assertValid(genres, "жанры музыки");
});

test("v1.2: «Биология — наука о живой природе» — символический план без организма", () => {
  const plan = planOf("bio", "5", "Биология – наука о живой природе", { title: "Биология – наука о живой природе", body: "", facts: [] });
  assert.equal(plan.editorial_check.visual_strategy, "flux_generation");
  assert.equal(V.isSymbolic(plan), true);
  assert.equal(V.grounding(plan).grounded, false);
  assert.match(plan.image_prompt, /symbolic composition of soft geometric shapes/);
  /* Никаких «живых организмов», клеток, инфузорий — тема не предметная. */
  assert.equal(/ciliate|infusoria|cell cross|organism|heart|leaf|volcano|animal/i.test(plan.image_prompt), false);
  assert.match(plan.editorial_check.visual_anchor, /^Символический образ темы/);
  assert.equal(/организм|инфузори|клетк|орган/i.test(plan.editorial_check.visual_anchor + " " + plan.editorial_check.historical_or_scientific_passport), false);
  assertValid(plan, "биология — наука");
});

test("v1.2.1: grounded-темы сохраняют объект (инфузория, сердце, вулканы, треугольник, лыжи)", () => {
  const cases = [
    ["bio", "7", "Инфузория-туфелька", "Строение инфузории", "flux_generation", "ciliate", /slipper shaped ciliate/],
    ["bio", "8", "Сердце человека", "Строение сердца", "flux_generation", "heart", /human heart model/],
    ["geo", "6", "Вулканы", "Строение вулкана", "flux_generation", "volcano", /volcano cutaway/],
    ["math", "7", "Треугольник и его элементы", "Треугольник ABC", "svg_code", "triangle", /geometric diagram/],
    ["pe", "8", "Лыжная подготовка", "Лыжная подготовка", "flux_generation", "skis", /cross-country skis/]
  ];
  for (const [subject, grade, topic, title, strategy, key, promptRe] of cases) {
    const plan = planOf(subject, grade, topic, { title, body: "", facts: [] });
    const gr = V.grounding(plan);
    assert.equal(gr.topicType, "object", topic);
    assert.equal(gr.grounded, true, topic);
    assert.equal(gr.objectKey, key, topic);
    assert.equal(gr.symbolic, false, topic);
    assert.equal(plan.editorial_check.visual_strategy, strategy, topic);
    assert.match(plan.image_prompt, promptRe, topic);
    assertValid(plan, topic);
  }
});

test("v1.2.1: Шишкин и Пушкин остаются подлинниками, а не символикой", () => {
  const shishkin = planOf("izo", "6", "И. И. Шишкин. «Утро в сосновом лесу»", { title: "Рассматриваем картину", body: "", facts: ["Картину написал Шишкин"] });
  assert.equal(shishkin.editorial_check.visual_strategy, "ru_wikipedia_api");
  assert.equal(shishkin.extra_sources.ru_wiki_title, "Утро в сосновом лесу");
  assert.match(shishkin.editorial_check.visual_anchor, /^Репродукция: «Утро в сосновом лесу»/);
  assert.match(shishkin.image_prompt, /museum hall/);
  assert.equal(/no people/.test(shishkin.image_prompt), true);
  assert.equal(V.isSymbolic(shishkin), false);
  assertValid(shishkin, "Шишкин");

  const pushkin = planOf("lit", "9", "А. С. Пушкин. «Евгений Онегин»", { title: "Пушкин — автор романа", body: "", facts: [] });
  assert.equal(pushkin.editorial_check.visual_strategy, "ru_wikipedia_api");
  assert.match(pushkin.extra_sources.ru_wiki_title, /Пушкин, Александр Сергеевич/);
  assert.match(pushkin.editorial_check.visual_anchor, /^Подлинный портрет: Пушкин/);
  assert.match(pushkin.editorial_check.historical_or_scientific_passport, /1799/);
  assert.equal(V.isSymbolic(pushkin), false);
  assertValid(pushkin, "Пушкин");
});

test("v1.2 final: «Солдатская шинель» — без чужой «Шинели» (повести Гоголя) и без «Репродукции»", () => {
  const topics = [
    "Солдатская шинель",
    "Сказки о животных «Журавль и цапля». Бытовые сказки «Солдатская шинель»"
  ];
  const slideTitles = ["Рассматриваем картину", "Иллюстрация к теме", "Живопись на уроке", "Цели урока", "Итог урока"];
  for (const topic of topics) {
    for (const title of [topic].concat(slideTitles)) {
      const plan = planOf("lit", "5", topic, { title, body: "", facts: [] });
      const text = [plan.editorial_check.visual_anchor, plan.editorial_check.historical_or_scientific_passport, plan.image_prompt].join(" ");
      assert.equal(/Репродукция/i.test(plan.editorial_check.visual_anchor), false, topic + " / " + title + ": " + plan.editorial_check.visual_anchor);
      assert.equal(/Шинель|Overcoat/i.test(text), false, topic + " / " + title + ": чужая «Шинель» в плане");
      assert.equal(plan.extra_sources.ru_wiki_title, null, topic + " / " + title);
      assert.equal(plan.extra_sources.en_wiki_query, null, topic + " / " + title);
      assert.equal(V.isSymbolic(plan), true, topic + " / " + title);
      assert.match(plan.image_prompt, /symbolic composition of soft geometric shapes/, topic + " / " + title);
      assertValid(plan, "Солдатская шинель: " + title);
    }
  }
});

test("v1.2 final: «8 Марта» — без «Марта» Левитана и без «Репродукции»", () => {
  const cases = [
    ["ru1", "3", "8 Марта"],
    ["ru1", "3", "Пишем поздравительную открытку к празднику 8 Марта"],
    ["lit1", "2", "Праздник 8 Марта"]
  ];
  const slideTitles = ["Рассматриваем картину", "Иллюстрация к теме", "Живопись на уроке", "Цели урока"];
  for (const [subject, grade, topic] of cases) {
    for (const title of [topic].concat(slideTitles)) {
      const plan = planOf(subject, grade, topic, { title, body: "", facts: [] });
      const text = [plan.editorial_check.visual_anchor, plan.editorial_check.historical_or_scientific_passport, plan.image_prompt].join(" ");
      assert.equal(/Репродукция/i.test(plan.editorial_check.visual_anchor), false, topic + " / " + title);
      assert.equal(/Март|March|Левитан|Levitan/i.test(text), false, topic + " / " + title + ": «Март» — не наша картина");
      assert.equal(plan.extra_sources.ru_wiki_title, null, topic + " / " + title);
      assert.equal(plan.extra_sources.en_wiki_query, null, topic + " / " + title);
      assert.equal(V.isSymbolic(plan), true, topic + " / " + title);
      assertValid(plan, "8 Марта: " + title);
    }
  }
});

test("v1.2 final: «Репродукция» только при точном названии произведения", () => {
  const exact = planOf("izo", "6", "И. И. Шишкин. «Утро в сосновом лесу»", { title: "Рассматриваем картину", body: "", facts: [] });
  assert.match(exact.editorial_check.visual_anchor, /^Репродукция: «Утро в сосновом лесу»/);

  const mona = planOf("mhk", "10", "Мона Лиза Леонардо да Винчи", { title: "Мона Лиза", body: "", facts: [] });
  assert.match(mona.editorial_check.visual_anchor, /^Репродукция: «Мона Лиза»/);
  assert.equal(mona.extra_sources.en_wiki_query, "Leonardo da Vinci Mona Lisa painting");

  /* Название — только фрагмент чужого названия: не «Репродукция». */
  const fragment = planOf("lit", "5", "Стихотворение о «Марте»", { title: "Рассматриваем картину", body: "", facts: [] });
  assert.equal(/Репродукция|Март \(картина|March|Levitan/i.test(fragment.editorial_check.visual_anchor + " " + fragment.image_prompt), false);
  assert.equal(V.isSymbolic(fragment), true);
});

test("v1.2: эпоха/регион — только по источнику", () => {
  const egypt = planOf("hist", "5", "Древний Египет");
  assert.match(egypt.editorial_check.historical_or_scientific_passport, /эпоха: Древний мир/);
  assert.match(egypt.editorial_check.historical_or_scientific_passport, /регион: Восток/);
  assertValid(egypt, "Древний Египет");

  const baptism = planOf("hist", "6", "Крещение Руси");
  assert.equal(/эпоха:|регион:/.test(baptism.editorial_check.historical_or_scientific_passport), false, "в источнике нет эпохи/региона — не выдумываем");
  assertValid(baptism, "Крещение Руси");

  const medieval = planOf("geo", "5", "География в эпоху Средневековья", { title: "География в эпоху Средневековья", body: "", facts: [] });
  assert.match(medieval.editorial_check.historical_or_scientific_passport, /эпоха: Средние века/);
  assert.equal(/регион:/.test(medieval.editorial_check.historical_or_scientific_passport), false);
  assertValid(medieval, "средневековая география");

  const functions = planOf("math", "7", "Функции");
  assert.equal(/эпоха:|регион:/.test(functions.editorial_check.historical_or_scientific_passport), false);
  assertValid(functions, "Функции");
});

test("v1.2: «Биология — наука о живой природе» без организма на всех слайдах урока", () => {
  const lesson = V.planForLesson({ subject: "bio", grade: "5", topic: "Биология – наука о живой природе" }, [
    { title: "Биология – наука о живой природе", facts: ["Биология изучает живую природу.", "Живые организмы окружают нас.", "Наука помогает понять мир."] },
    { title: "Цели урока", facts: ["Познакомиться с биологией.", "Узнать, что изучает наука.", "Понять значение биологии."] },
    { title: "Итог урока", facts: ["Биология — наука о живом.", "Живое разнообразно.", "Наука важна для человека."] }
  ]);
  assertValid(lesson, "урок «Биология — наука»");
  for (const slide of lesson.slides) {
    assert.equal(V.isSymbolic(slide), true, slide.title);
    assert.equal(V.grounding(slide).objectKey, null, slide.title);
    assert.equal(/illustration of a single central composition/i.test(slide.image_prompt), false, slide.title);
  }
});

test("v1.2: объект берётся и из заголовка слайда, а не только из темы урока", () => {
  const lesson = V.planForLesson({ subject: "bio", grade: "7", topic: "Биология – наука о живой природе" }, [
    { title: "Строение инфузории-туфельки", facts: ["Инфузория — одноклеточное животное.", "Передвигается ресничками.", "Живёт в пресной воде."] },
    { title: "Итог урока", facts: ["Биология изучает живую природу.", "Живые организмы разнообразны.", "Наука важна."] }
  ]);
  assert.equal(V.grounding(lesson.slides[0]).objectKey, "ciliate", "слайд называет инфузорию — объект допустим");
  assert.match(lesson.slides[0].image_prompt, /slipper shaped ciliate/);
  assert.equal(V.grounding(lesson.slides[1]).objectKey, null, "без предмета в слайде — символ");
  assert.equal(V.isSymbolic(lesson.slides[1]), true);
  assertValid(lesson, "объект из заголовка слайда");
});

test("validate v1.2: UNGROUNDED_OBJECT — предмет в промпте без опоры в теме/фактах", () => {
  const plan = fluxPlan();
  plan.image_prompt = "A single precise scientific educational illustration of one human heart model with visible chambers, on a pale surface. " + NEG_TAIL;
  const res = V.validate(plan);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some(e => e.code === "UNGROUNDED_OBJECT"), JSON.stringify(res.errors));

  const grounded = clonePlan(plan);
  grounded.facts = ["Сердце человека — орган кровообращения", "Сердце сокращается ритмично", "Сердце находится в грудной клетке"];
  assert.equal(V.validate(grounded).errors.some(e => e.code === "UNGROUNDED_OBJECT"), false, "опора в фактах снимает ошибку");
});

test("validate v1.2: GENERIC_ANCHOR — запрещённый бойлерплейт в anchor", () => {
  const anchors = [
    "Живой объект крупным планом",
    "Прибор и явление крупным планом",
    "Предметы эпохи",
    "Объекты безопасности",
    "Учебные материалы урока"
  ];
  for (const anchor of anchors) {
    const plan = clonePlan(fluxPlan());
    plan.editorial_check.visual_anchor = anchor;
    const res = V.validate(plan);
    assert.equal(res.ok, false, anchor);
    assert.ok(res.errors.some(e => e.code === "GENERIC_ANCHOR"), anchor + ": " + JSON.stringify(res.errors));
  }
});

test("validate v1.2: FAKE_OBJECT — старый шаблонный объект SUBJECT_OBJECT", () => {
  const prompts = [
    "A single clear educational illustration of one wooden musical instrument with warm reflections on a dark wooden desk. " + NEG_TAIL,
    "A single clear educational illustration of one open exercise book with a soft light on a school desk. " + NEG_TAIL,
    "A single clear educational illustration of one tuning fork and a shallow bowl on a pale table. " + NEG_TAIL
  ];
  for (const prompt of prompts) {
    const plan = clonePlan(fluxPlan());
    plan.image_prompt = prompt;
    const res = V.validate(plan);
    assert.equal(res.ok, false, prompt.slice(0, 60));
    assert.ok(res.errors.some(e => e.code === "FAKE_OBJECT"), prompt.slice(0, 60) + ": " + JSON.stringify(res.errors));
  }
});

test("validate v1.2: UNSUPPORTED_ERA — эпоха/регион, которых нет в источнике", () => {
  const era = clonePlan(fluxPlan());
  era.editorial_check.historical_or_scientific_passport = "Материалы по теме; эпоха: XIX век.";
  let res = V.validate(era);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some(e => e.code === "UNSUPPORTED_ERA"), JSON.stringify(res.errors));

  const eraOk = clonePlan(era);
  eraOk.title = "История XIX века";
  assert.equal(V.validate(eraOk).errors.some(e => e.code === "UNSUPPORTED_ERA"), false, "XIX век есть в заголовке — эпоха оправдана");

  const region = clonePlan(fluxPlan());
  region.editorial_check.historical_or_scientific_passport = "Материалы по теме; регион: Россия.";
  res = V.validate(region);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some(e => e.code === "UNSUPPORTED_ERA"), JSON.stringify(res.errors));

  const regionOk = clonePlan(region);
  regionOk.title = "Россия в начале века";
  assert.equal(V.validate(regionOk).errors.some(e => e.code === "UNSUPPORTED_ERA"), false, "Россия есть в заголовке — регион оправдан");
});

test("validate v1.2: SYMBOLIC_WITH_OBJECT — символический план с конкретным предметом", () => {
  const plan = planOf("bio", "10", "Генетика – наука о наследственности и изменчивости");
  assert.equal(V.isSymbolic(plan), true);
  plan.image_prompt = "A single precise scientific educational illustration of one slipper shaped ciliate with fine cilia in a drop of pond water. " + NEG_TAIL;
  const res = V.validate(plan);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some(e => e.code === "SYMBOLIC_WITH_OBJECT"), JSON.stringify(res.errors));
});

test("v1.2: планы движка проходят validate, в том числе после JSON-сериализации", () => {
  const plans = [
    planOf("bio", "5", "Биология – наука о живой природе"),
    planOf("bio", "7", "Инфузория-туфелька", { title: "Строение инфузории", facts: ["Инфузория — одноклеточное"] }),
    planOf("izo", "6", "И. И. Шишкин. «Утро в сосновом лесу»", { title: "Рассматриваем картину", facts: [] }),
    planOf("math", "7", "График функции", { title: "График функции", facts: ["Оси x и y"] })
  ];
  for (const plan of plans) {
    const json = clonePlan(plan);
    assertValid(json, "JSON-план: " + plan.title);
    assert.equal(V.validate(plan).ok, true, "план с метой: " + plan.title);
  }
});

test("v1.2 final: объект уровня слайда — заголовок называет предмет («Народные инструменты» → «Балалайка»)", () => {
  const slide = planOf("mus", "4", "Народные инструменты", { title: "Балалайка", body: "", facts: [] });
  const gr = V.grounding(slide);
  assert.equal(gr.topicType, "object", "слайд называет балалайку — объект допустим");
  assert.equal(gr.grounded, true);
  assert.equal(gr.objectKey, "balalaika");
  assert.equal(gr.slideLevel, true);
  assert.match(slide.image_prompt, /balalaika/);
  assert.match(slide.editorial_check.historical_or_scientific_passport, /заголовке слайда: «Балалайка»/);
  assertValid(slide, "слайд-объект: балалайка");

  const generic = planOf("mus", "4", "Народные инструменты", { title: "Жанры музыки", body: "", facts: [] });
  assert.equal(V.grounding(generic).topicType, "group");
  assert.equal(generic.editorial_check.visual_strategy, "site_library", "группа — реальная библиотека");
  assert.equal(V.isSymbolic(generic), false);
  assertValid(generic, "слайд без объекта");
});

test("v1.2 final: разрешённые сцены помечены в мете (карта→ландшафт, архив, пример жанра)", () => {
  /* Правило 4: карта заменяется живым ландшафтом — это не выдуманный предмет. */
  const map = planOf("geo", "6", "Физическая карта России", { title: "Работа с картой", body: "", facts: [] });
  const mapGr = V.grounding(map);
  assert.equal(map.editorial_check.visual_strategy, "flux_generation");
  assert.equal(mapGr.allowed, true);
  assert.equal(mapGr.reason, "map_replaced_by_landscape");
  assert.equal(mapGr.symbolic, false);
  assert.equal(mapGr.grounded, false);
  assert.match(map.editorial_check.visual_anchor, /^Ландшафт:/);
  assert.match(map.editorial_check.historical_or_scientific_passport, /без картографических обозначений/);
  assertValid(map, "карта → ландшафт");

  /* Архив без лиц — резерв для вымышленных портретов героев, не реальная персона. */
  const archive = planOf("bio", "9", "Генетика", {
    title: "Демонстрации",
    facts: ["Портреты: Иван Неизвестнов, Пётр Загадочнов и другие исследователи"]
  });
  const archiveGr = V.grounding(archive);
  assert.equal(archive.editorial_check.visual_strategy, "flux_generation");
  assert.equal(archiveGr.allowed, true);
  assert.equal(archiveGr.reason, "archive_atmosphere_without_faces");
  assert.match(archive.editorial_check.visual_anchor, /архив|рамы|без лиц/i);
  assertValid(archive, "архив без лиц");

  /* «Пример произведения живописи по теме» — жанр с честной атрибуцией, не подделка. */
  const genre = planOf("izo", "6", "Портрет в искусстве", { title: "Портрет героя", body: "", facts: [] });
  const genreGr = V.grounding(genre);
  assert.equal(genre.editorial_check.visual_strategy, "ru_wikipedia_api");
  assert.equal(genreGr.allowed, true);
  assert.equal(genreGr.reason, "art_genre_example_attributed");
  assert.match(genre.editorial_check.visual_anchor, /^Пример произведения живописи по теме: портрет/);
  assert.equal(/^Репродукция/.test(genre.editorial_check.visual_anchor), false);
  assertValid(genre, "жанр с атрибуцией");
});

/* =================================================================
   v1.2 final: уровень слайда и расширенный школьный лексикон
   ================================================================= */
test("v1.2 final: слайд классифицируется по заголовку и первому факту", () => {
  const lessonTopic = "Биология – наука о живой природе";
  const cell = planOf("bio", "5", lessonTopic, { title: "Строение клетки", body: "", facts: [] });
  const cellGr = V.grounding(cell);
  assert.equal(cellGr.topicType, "object");
  assert.equal(cellGr.grounded, true);
  assert.equal(cellGr.objectKey, "cell");
  assert.equal(cellGr.slideLevel, true);
  assert.equal(cellGr.groundSource, "title");
  assert.match(cell.editorial_check.historical_or_scientific_passport, /заголовке слайда/);
  assertValid(cell, "слайд «Строение клетки»");

  const balalaika = planOf("mus", "5", "Музыка", { title: "Балалайка", body: "", facts: [] });
  assert.equal(V.grounding(balalaika).objectKey, "balalaika");
  assert.equal(V.grounding(balalaika).slideLevel, true);
  assertValid(balalaika, "слайд «Балалайка»");

  const pyramid = planOf("hist", "5", "Древний Египет", { title: "Пирамида", body: "", facts: [] });
  assert.equal(V.grounding(pyramid).objectKey, "pyramid");
  assert.equal(V.grounding(pyramid).slideLevel, true);

  /* Первый факт учитывается в классификации, но объект в промпт добавляется
     только если он назван в теме/заголовке или это природный объект: иначе
     независимый аудит считает предмет выдуманным. */
  const factPlan = planOf("hist", "5", "Древний Египет", { title: "Цели урока", body: "", facts: ["Пирамиды — усыпальницы фараонов."] });
  assert.equal(V.grounding(factPlan).grounded, false);
  assert.equal(V.grounding(factPlan).objectKey, null);
  assert.equal(V.isSymbolic(factPlan), true);
  assertValid(factPlan, "факт без предмета в заголовке");

  /* Без предмета в заголовке/фактах — по-прежнему символ. */
  const empty = planOf("bio", "5", lessonTopic, { title: "Цели урока", body: "", facts: [] });
  assert.equal(V.isSymbolic(empty), true);
  assert.equal(V.grounding(empty).grounded, false);
  assert.equal(empty.editorial_check.visual_strategy, "flux_generation");
});

test("v1.2 final: «Природные зоны России» → слайд «Тайга» — не символический план", () => {
  const plan = planOf("geo", "7", "Природные зоны России", { title: "Тайга", body: "", facts: ["Тайга — хвойный лес."] });
  assert.equal(plan.editorial_check.visual_strategy, "site_library", "реальные изображения тайги из библиотеки");
  assert.equal(V.isSymbolic(plan), false);
  assert.ok(plan.extra_sources.library_tags.includes("тайга"), JSON.stringify(plan.extra_sources.library_tags));
  assertValid(plan, "Тайга");
});

test("v1.2 final: расширенный лексикон — предметы по всем предметам (RU→EN, grounded)", () => {
  const cases = [
    ["bio", "6", "Лист", "leaf", /green leaf cross section/],
    ["geo", "6", "Гейзер", "geyser", /geyser jet/],
    ["chem", "8", "Кислород", "oxygen", /oxygen atoms/],
    ["phys", "8", "Пружина", "spring", /coiled metal spring/],
    ["math", "7", "Квадрат", "square", /square outline/],
    ["hist", "5", "Амфора", "amphora", /clay amphora/],
    ["mus", "4", "Скрипка", "violin", /violin with warm/],
    ["izo", "6", "Палитра", "palette", /painter palette/],
    ["tech", "6", "Отвёртка", "screwdriver", /screwdriver/],
    ["obzh", "8", "Аптечка", "firstaid", /first aid kit/],
    ["pe", "5", "Гимнастический мат", "gymmat", /gymnastics mat/],
    ["okr", "2", "Автобус", "bus", /city bus/],
    ["orkse", "4", "Синагога", "synagogue", /synagogue building/]
  ];
  for (const [subject, grade, topic, key, re] of cases) {
    const plan = planOf(subject, grade, topic);
    const gr = V.grounding(plan);
    assert.equal(gr.topicType, "object", subject + "/" + topic);
    assert.equal(gr.grounded, true, subject + "/" + topic);
    assert.equal(gr.objectKey, key, subject + "/" + topic);
    assert.match(plan.image_prompt, re, subject + "/" + topic);
    assert.match(plan.editorial_check.visual_anchor, /^Объект: /, subject + "/" + topic);
    assert.equal(CYRILLIC.test(plan.image_prompt), false);
    assert.equal(/\d/.test(plan.image_prompt), false);
    assertValid(plan, subject + "/" + topic);
  }
});

test("v1.2 final: абстрактные понятия не получают предмет по ассоциации/подстроке", () => {
  const cases = [
    ["bio", "6", "Обмен веществ"],
    ["bio", "6", "Значение воды"],
    ["bio", "9", "Кровообращение"],
    ["geo", "7", "Охрана природы"],
    ["obzh", "5", "Правила дорожного движения"],
    ["soc", "8", "Экономика"],
    ["soc", "9", "Право"],
    ["tech", "6", "Поездка на производство"],
    ["hist", "7", "Крепостное право"],
    ["bio", "8", "Печенье и здоровье"],
    ["lit", "6", "Сценарий праздника"]
  ];
  for (const [subject, grade, topic] of cases) {
    const plan = planOf(subject, grade, topic);
    const gr = V.grounding(plan);
    assert.equal(gr.grounded, false, subject + "/" + topic + ": нельзя выдумывать предмет");
    assert.equal(gr.objectKey, null, subject + "/" + topic);
    assert.equal(V.isSymbolic(plan), true, subject + "/" + topic + " должен быть символическим");
    assert.match(plan.image_prompt, /symbolic composition of soft geometric shapes/, subject + "/" + topic);
    assert.equal(/illustration of a single central composition/i.test(plan.image_prompt), false, subject + "/" + topic);
    assertValid(plan, subject + "/" + topic);
  }
});

test("v1.2 final: границы слов — «поездка» ≠ «поезд», «крепостное» ≠ «крепость», «уголь» ≠ «угол»", () => {
  const ids = [
    ["tech", "6", "Поездка на производство", "train"],
    ["hist", "7", "Крепостное право", "fortress"],
    ["chem", "9", "Уголь", "angle"],
    ["bio", "8", "Печенье и здоровье", "liver"],
    ["lit", "6", "Сценарий праздника", "stage"],
    ["bio", "9", "Кровообращение", "blood"]
  ];
  for (const [subject, grade, topic, forbiddenKey] of ids) {
    const gr = V.grounding(planOf(subject, grade, topic));
    assert.notEqual(gr.objectKey, forbiddenKey, topic + " не должен давать «" + forbiddenKey + "»");
    assert.equal(gr.grounded, false, topic);
  }
});

test("v1.2 final: «Музыка»/«Балалайка» и «биология»/«Строение сердца» — слайд-объект, а не символ", () => {
  const balalaika = planOf("mus", "5", "Музыка", { title: "Балалайка", body: "", facts: [] });
  assert.equal(V.isSymbolic(balalaika), false);
  assert.equal(V.grounding(balalaika).topicType, "object");
  assert.match(balalaika.editorial_check.visual_anchor, /^Объект: балалайка/);

  const heart = planOf("bio", "5", "Биология – наука о живой природе", { title: "Строение сердца", body: "", facts: [] });
  assert.equal(V.isSymbolic(heart), false);
  assert.equal(V.grounding(heart).objectKey, "heart");
  assert.equal(V.grounding(heart).groundSource, "title");
  assert.match(heart.image_prompt, /human heart model/);
  assertValid(heart, "слайд «Строение сердца»");
});

test("v1.2 final: факт без предмета не добавляет объект (0 выдумок на уровне слайда)", () => {
  const plan = planOf("bio", "5", "Биология – наука о живой природе", {
    title: "Цели урока",
    body: "",
    facts: ["Познакомиться с биологией как наукой.", "Понять, что изучает наука.", "Оценить значение биологии."]
  });
  assert.equal(V.isSymbolic(plan), true);
  assert.equal(V.grounding(plan).grounded, false);
  assert.equal(/ciliate|human heart|cell cross|volcano|animal|leaf|instrument/i.test(plan.image_prompt), false);
  assertValid(plan, "цели урока по биологии");
});

test("v1.2 final: мета слайд-уровня прозрачна для аудита (slideLevel/groundSource/intent/reason)", () => {
  const objectPlan = planOf("mus", "5", "Музыка", { title: "Балалайка", body: "", facts: [] });
  const objectGr = V.grounding(objectPlan);
  assert.equal(objectGr.intent, "flux-object");
  assert.equal(objectGr.slideLevel, true);
  assert.equal(objectGr.groundSource, "title");
  assert.equal(objectGr.allowed, false);
  assert.equal(objectGr.reason, "");

  const mapPlan = planOf("geo", "6", "Физическая карта России", { title: "Работа с картой", body: "", facts: [] });
  const mapGr = V.grounding(mapPlan);
  assert.equal(mapGr.intent, "map");
  assert.equal(mapGr.allowed, true);
  assert.equal(mapGr.reason, "map_replaced_by_landscape");
});

test("v1.2 final: алгоритм термина — предмет без EN-описания уходит в реальную библиотеку", () => {
  /* Чистый предметный термин, которого нет в EN-лексиконе: не FLUX-фантазия,
     а реальные изображения из библиотеки/поиска сайта. */
  for (const [subject, grade, topic, term] of [
    ["chem", "9", "Уголь", "уголь"],
    ["obzh", "9", "Цунами", "цунами"]
  ]) {
    const plan = planOf(subject, grade, topic);
    assert.equal(plan.editorial_check.visual_strategy, "site_library", topic);
    assert.equal(V.isSymbolic(plan), false, topic);
    assert.ok(plan.extra_sources.library_tags.includes(term), topic + ": " + JSON.stringify(plan.extra_sources.library_tags));
    assert.ok(plan.extra_sources.library_tags.length >= 2, topic);
    assert.equal(plan.extra_sources.ru_wiki_title, null, topic);
    assertValid(plan, topic);
  }

  /* Есть EN-описание — остаётся FLUX с grounded-объектом (как раньше). */
  const geyser = planOf("geo", "6", "Гейзер");
  assert.equal(geyser.editorial_check.visual_strategy, "flux_generation");
  assert.equal(V.grounding(geyser).objectKey, "geyser");

  /* Алгоритм не срабатывает на абстрактных/стоп-словах: 0 выдумок. */
  for (const [subject, grade, topic] of [
    ["chem", "9", "Химические реакции"],
    ["chem", "9", "Воздух"],
    ["bio", "6", "Признаки живого"],
    ["geo", "5", "История Земли как планеты"],
    ["chem", "10", "Органические вещества"]
  ]) {
    const plan = planOf(subject, grade, topic);
    assert.equal(V.isSymbolic(plan), true, subject + "/" + topic);
    assert.equal(V.grounding(plan).grounded, false, subject + "/" + topic);
    assert.match(plan.image_prompt, /symbolic composition of soft geometric shapes/, subject + "/" + topic);
    assertValid(plan, subject + "/" + topic);
  }
});

test("фузз: экзотические входы не роняют движок и дают валидный план", () => {
  const inputs = [
    undefined, null, {}, { subject: "неизвестный" }, { topic: "" },
    { subject: "bio", grade: 7, topic: "Клетка", slide: {} },
    { subject: "bio", grade: "7", topic: "Клетка", slide: { title: "", body: "", facts: [] } },
    { subject: "math", grade: "1", topic: "12345", slide: { title: "12345", facts: ["1", "2", "3"] } },
    { subject: "lit", topic: "Пушкин", slide: "## Пушкин\n\nТекст слайда." },
    { subject: "geo", grade: "7", topic: "Карта", slide: { title: "Карта", facts: ["Карта", "Атлас", "План местности"] } },
    { subject: "mhk", topic: "Портрет неизвестного художника", slide: { title: "Портрет", facts: ["Живопись", "Портрет", "Музей"] } }
  ];
  for (const input of inputs) {
    const plan = V.planForSlide(input);
    const result = V.validate(plan);
    assert.equal(result.ok, true, JSON.stringify(input) + ": " + JSON.stringify(result.errors));
  }
});

