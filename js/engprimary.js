/* «Учу по ФРП» — английский язык 2–4 классов без нейросети.
   Локальная сборка урока: словарь по темам, грамматика, диалоги, игры,
   задания с ответами и рабочий лист. */
window.EngPrimary = (() => {
  "use strict";
  const cap = s => String(s || "").replace(/^./, c => c.toUpperCase());
  const norm = s => String(s || "").toLowerCase().replace(/ё/g, "е");
  const rnd = seed => { let h = 2166136261; for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; }; };
  const pick = (r, a) => a[Math.floor(r() * a.length)];

  const VOC = {
    alphabet: [["A", "эй"], ["B", "би"], ["C", "си"], ["D", "ди"], ["E", "и"], ["F", "эф"]],
    numbers: [["one", "один"], ["two", "два"], ["three", "три"], ["four", "четыре"], ["five", "пять"], ["ten", "десять"]],
    colours: [["red", "красный"], ["blue", "синий"], ["green", "зелёный"], ["yellow", "жёлтый"], ["black", "чёрный"], ["white", "белый"]],
    animals: [["cat", "кошка"], ["dog", "собака"], ["fox", "лиса"], ["bear", "медведь"], ["mouse", "мышь"], ["bird", "птица"]],
    family: [["mother", "мама"], ["father", "папа"], ["sister", "сестра"], ["brother", "брат"], ["grandmother", "бабушка"], ["grandfather", "дедушка"]],
    school: [["school", "школа"], ["pen", "ручка"], ["pencil", "карандаш"], ["book", "книга"], ["bag", "портфель"], ["ruler", "линейка"]],
    food: [["apple", "яблоко"], ["bread", "хлеб"], ["milk", "молоко"], ["tea", "чай"], ["soup", "суп"], ["cake", "торт"]],
    body: [["head", "голова"], ["eyes", "глаза"], ["nose", "нос"], ["mouth", "рот"], ["ears", "уши"], ["hands", "руки"]],
    clothes: [["coat", "пальто"], ["hat", "шапка"], ["shoes", "обувь"], ["dress", "платье"], ["shirt", "рубашка"], ["trousers", "брюки"]],
    weather: [["sunny", "солнечно"], ["rainy", "дождливо"], ["cold", "холодно"], ["hot", "жарко"], ["windy", "ветрено"], ["snowy", "снежно"]],
    actions: [["run", "бегать"], ["jump", "прыгать"], ["read", "читать"], ["write", "писать"], ["sing", "петь"], ["play", "играть"]]
  };

  function topicKey(topic) {
    const t = norm(topic);
    if (/алфавит|alphabet|букв|звук/.test(t)) return "alphabet";
    if (/числ|счёт|number/.test(t)) return "numbers";
    if (/цвет|colour|color/.test(t)) return "colours";
    if (/животн|animal|звер/.test(t)) return "animals";
    if (/семь|family|мама|папа/.test(t)) return "family";
    if (/школ|school|класс|портфел/.test(t)) return "school";
    if (/ед[аы]|food|фрукт|овощ/.test(t)) return "food";
    if (/тело|body|лицо|части тела/.test(t)) return "body";
    if (/одежд|clothes|обув/.test(t)) return "clothes";
    if (/погод|weather|времена года/.test(t)) return "weather";
    if (/глагол|action|движен|что дела/.test(t)) return "actions";
    return "school";
  }

  function grammar(topic) {
    const t = norm(topic);
    if (/to be|am|is|are/.test(t)) return "tobe";
    if (/have got|has got|have|has/.test(t)) return "havegot";
    if (/can|could|уме/.test(t)) return "can";
    if (/present simple|настоящее|like|likes/.test(t)) return "simple";
    return "mixed";
  }

  function tasks(topic, grade, seed) {
    const r = rnd(seed), key = topicKey(topic), g = +grade, out = [];
    const add = (q, a) => out.push({ q, a });
    const bank = VOC[key];
    const word = () => pick(r, bank);
    // лексика
    bank.slice(0, 3).forEach(([en, ru]) => add(`Переведи на русский: ${en}`, ru));
    add(`Переведи на английский: ${word()[1]}`, word()[0]);
    // грамматика
    const gr = grammar(topic);
    if (gr === "tobe" || gr === "mixed") {
      add("Вставь am/is/are: I ___ a pupil.", "I am a pupil.");
      add("Вставь am/is/are: She ___ my sister.", "She is my sister.");
      add("Вставь am/is/are: They ___ at school.", "They are at school.");
    }
    if (gr === "havegot" || gr === "mixed") {
      add("Вставь have got/has got: I ___ a cat.", "have got");
      add("Вставь have got/has got: He ___ a dog.", "has got");
    }
    if (gr === "can" || gr === "mixed") {
      add("Составь предложение: I / can / jump.", "I can jump.");
      add("Что умеет: sing, run, read? Ответь: I can ___.", "I can sing/run/read.");
    }
    if (gr === "simple" || gr === "mixed") {
      add("Выбери: He like / likes apples.", "likes");
      add("Вставь do/does: ___ you like milk?", "Do");
    }
    // диалог
    add("Ответь на вопрос: What is your name?", "My name is ...");
    add("Ответь на вопрос: How old are you?", "I am ... years old.");
    add("Составь вопрос: you / like / cats?", "Do you like cats?");
    return out;
  }

  function conspect(p) {
    const g = +p.grade || 2, key = topicKey(p.topic), ts = tasks(p.topic, g, p.topic + g), bank = VOC[key];
    const vocab = bank.map(([en, ru]) => `${en} — ${ru}`).join(", ");
    const rows = [
      ["1", "Greeting / Приветствие", "1–2", "Hello! How are you? Речевая зарядка, повторение фраз."],
      ["2", "Warm-up / Разминка", "3–4", "Песенка или рифмовка по теме, повторение звуков."],
      ["3", "Vocabulary / Слова", "8–10", `Вводим слова: ${vocab}. Показываем картинки, повторяем хором, играем в «эхо».`],
      ["4", "Grammar / Грамматика", "8–10", `${key === "actions" ? "Can + глагол." : "Глагол to be: am/is/are."} Объясняем на примерах, составляем предложения.`],
      ["5", "Физминутка", "2", "Stand up! Clap your hands! Движения по командам на английском."],
      ["6", "Practice / Практика", "9–10", `Задания: ${ts.slice(0, 3).map(x => x.q).join("; ")}. Работа у доски и в парах.`],
      ["7", "Reading / Reading dialogue", "5–6", "Читаем мини-диалог по ролям, отвечаем на вопросы."],
      ["8", "Game / Игра", "3–4", "Игра «Найди пару», «Что пропало?» со словами урока."],
      ["9", "Итог и рефлексия", "2–3", "Что запомнили? What new words do you know?"],
      ["10", "Homework", "1–2", "Выучить 5 слов, составить 3 предложения, повторить грамматику."]
    ];
    const table = "| № | Этап урока | Время | Что делает учитель и ученики |\n|---|---|---|---|\n" + rows.map(r => "| " + r.join(" | ") + " |").join("\n");
    const qaT = "| № | Задание | Ответ |\n|---|---|---|\n" + ts.map((x, i) => `| ${i + 1} | ${x.q} | ${x.a} |`).join("\n");
    return [
      `# ${p.topic}`,
      "",
      `**Класс:** ${g} · **Предмет:** Английский язык · **Время:** 45 минут`,
      "",
      "## Цель урока",
      `Формировать умение использовать лексику по теме «${p.topic}» и базовую грамматику в речи и диалоге.`,
      "",
      "## Планируемые результаты",
      "**Предметные:** знать слова темы, использовать am/is/are, have got, can, Present Simple; задавать и отвечать на вопросы.",
      "**Метапредметные:** сравнивать, работать в паре, понимать речь на слух.",
      "**Личностные:** интерес к языку, уважение к культуре, уверенность в общении.",
      "",
      "## Опорные знания",
      `Слова: ${vocab}.`,
      "Грамматика: I am / He is / They are; have got / has got; can + глагол; Present Simple.",
      "",
      "## Этапы урока",
      table,
      "",
      "## Задания с ответами",
      qaT,
      "",
      "## Речевые образцы",
      "— What is your name? — My name is ...  — How old are you? — I am ... years old.  — Do you like ...? — Yes, I do / No, I don't.",
      "",
      "## Оценивание",
      "Узнаёт слова, правильно использует грамматику, участвует в диалоге; ошибки исправляем доброжелательно.",
      "",
      "## Homework",
      "Выучить 5 слов по теме, составить 3 предложения, повторить грамматику."
    ].join("\n");
  }

  function worksheet(p) {
    const g = +p.grade || 2, key = topicKey(p.topic), ts = tasks(p.topic, g, p.topic + "ws"), bank = VOC[key];
    return [
      `# Рабочий лист: ${p.topic}`,
      "",
      `**Класс:** ${g} · **Имя:** ______________________`,
      "",
      "## 1. Соедини слово и перевод",
      bank.slice(0, 4).map(([en, ru]) => `${en} — _____`).join("   ") + "   |   " + bank.slice(0, 4).map(([, ru]) => ru).sort().join(", "),
      "",
      "## 2. Впиши пропущенное",
      ts.filter(x => /___/.test(x.q)).slice(0, 3).map((x, i) => `${i + 1}) ${x.q}`).join("\n"),
      "",
      "## 3. Составь предложение",
      "1) I / can / swim → ______________________",
      "2) She / is / my / sister → ______________________",
      "",
      "## 4. Ответь на вопросы",
      "1) What is your name? ______________________",
      "2) How old are you? ______________________",
      "",
      "## 5. Творческое задание",
      "Нарисуй и подпиши 3 слова по теме.",
      "",
      "## 6. Рефлексия",
      "Что запомнил? Что было трудно?"
    ].join("\n");
  }

  return { topicKey, tasks, grammar, conspect, worksheet, lesson: conspect, VOC };
})();
