/* «Учу по ФРП» — дополнение к английскому 5–11 без нейросети.
   К локальному уроку добавляет опорную теорию, алгоритм и практику с ответами
   по грамматическим и речевым темам. */
window.EngSec = (() => {
  "use strict";
  const norm = s => String(s || "").toLowerCase().replace(/ё/g, "е");
  const BANKS = [
    {
      re: /present simple|present continuous|настоящее/,
      name: "Present Simple / Present Continuous",
      theory: ["Present Simple: регулярное действие, расписание (I go to school every day).", "Present Continuous: действие сейчас или в этот период (I am reading now).", "Маркеры Simple: usually, often, every day; Continuous: now, at the moment.", "Вопросы: Do you...? / Are you ...ing?"],
      steps: ["Определи: регулярно или сейчас.", "Выбери время.", "Поставь глагол в нужную форму.", "Проверь вопрос/отрицание."],
      tasks: [["Раскрой: She (read) now.", "She is reading now."], ["Раскрой: He (go) to school every day.", "He goes to school every day."], ["Сделай вопрос: You / like / tea?", "Do you like tea?"], ["Сделай отрицание: They are playing.", "They are not playing."]]
    },
    {
      re: /past simple|past continuous|past perfect|прошедшее/,
      name: "Past Simple / Past Continuous / Past Perfect",
      theory: ["Past Simple: факт в прошлом (I went there yesterday).", "Past Continuous: действие в процессе в прошлом (I was reading at 5).", "Past Perfect: действие до другого прошлого (I had finished before he came).", "Неправильные глаголы нужно знать: go — went — gone."],
      steps: ["Определи последовательность событий.", "Выбери время.", "Поставь глагол.", "Проверь маркеры: yesterday, at 5, before."],
      tasks: [["Раскрой: I (go) to the park yesterday.", "I went to the park yesterday."], ["Раскрой: She (read) at 5 o'clock.", "She was reading at 5 o'clock."], ["Раскрой: He (finish) before they came.", "He had finished before they came."], ["Раскрой: They (not / play) yesterday.", "They did not play yesterday."]]
    },
    {
      re: /future|will|going to|будущ/,
      name: "Future forms",
      theory: ["will — решение сейчас, обещание, прогноз (I will help you).", "be going to — план или намерение (I am going to travel).", "Present Continuous — договорённость (I am meeting him tomorrow).", "В придаточных времени после when/if будущее заменяется на Present Simple."],
      steps: ["Определи: спонтанное решение, план или договорённость.", "Выбери форму.", "Составь предложение.", "Проверь придаточные времени."],
      tasks: [["Раскрой: I (help) you tomorrow.", "I will help you tomorrow."], ["Раскрой: They (travel) next summer. (план)", "They are going to travel next summer."], ["Раскрой: We (meet) at 5 tomorrow. (договорённость)", "We are meeting at 5 tomorrow."], ["Раскрой: When he (come), I will call you.", "When he comes, I will call you."]]
    },
    {
      re: /passive|пассив|страдательн/,
      name: "Passive Voice",
      theory: ["Passive: be + V3 (The book was written by him).", "Время меняется формой be: is written, was written, will be written.", "Деятель вводится предлогом by, инструмент — with.", "Passive используют, когда важно действие, а не исполнитель."],
      steps: ["Найди объект действия.", "Выбери время и форму be.", "Поставь глагол в V3.", "Добавь by, если нужен исполнитель."],
      tasks: [["Сделай пассив: They built the house in 1990.", "The house was built in 1990."], ["Сделай пассив: People speak English here.", "English is spoken here."], ["Сделай пассив: They will finish the work.", "The work will be finished."], ["Сделай пассив: Someone has broken the window.", "The window has been broken."]]
    },
    {
      re: /conditional|если|условн/,
      name: "Conditionals",
      theory: ["1st: If + Present Simple, will + V (реальное будущее).", "2nd: If + Past Simple, would + V (нереальное настоящее).", "3rd: If + Past Perfect, would have + V3 (нереальное прошлое).", "В условных придаточных после If будущее не используется."],
      steps: ["Определи тип условия.", "Поставь глаголы по формуле.", "Проверь порядок частей.", "Переведи для проверки смысла."],
      tasks: [["Раскрой: If it (rain), we will stay home.", "If it rains, we will stay home."], ["Раскрой: If I (be) you, I would go.", "If I were you, I would go."], ["Раскрой: If he (know), he would have helped.", "If he had known, he would have helped."], ["Раскрой: If you heat ice, it (melt).", "If you heat ice, it melts."]]
    },
    {
      re: /reported|косвенн/,
      name: "Reported Speech",
      theory: ["При переводе в косвенную речь время сдвигается назад (Present → Past).", "Местоимения и указатели времени меняются (now → then, today → that day).", "Вопросы в косвенной речи — прямой порядок слов, без do/does.", "Приказания передаются через told/asked + to + V."],
      steps: ["Определи тип предложения.", "Сдвинь время на шаг назад.", "Замени местоимения и указатели.", "Убери инверсию в вопросах."],
      tasks: [["Передай: He said, «I am busy».", "He said he was busy."], ["Передай: She asked, «Where do you live?»", "She asked where I lived."], ["Передай: He said, «I will come».", "He said he would come."], ["Передай: «Open the door», he said.", "He told me to open the door."]]
    },
    {
      re: /article|артикл|a\/an\/the/,
      name: "Articles",
      theory: ["a/an — неопределённый: предмет впервые упоминается, один из многих.", "the — определённый: предмет известен или единственный.", "Без артикля: множественное число в общем смысле, имена, города, страны (кроме исключений).", "a/an зависит от звука: a book, an hour."],
      steps: ["Определи: исчисляемое/неисчисляемое.", "Впервые или известно.", "Единственный предмет или нет.", "Поставь артикль."],
      tasks: [["Вставь: I saw _ dog.", "a dog"], ["Вставь: _ sun rises in the east.", "The sun"], ["Вставь: She is _ doctor.", "a doctor"], ["Вставь: _ books are interesting.", "— (без артикля)"]]
    },
    {
      re: /comparative|superlative|степен|сравнит/,
      name: "Comparatives and Superlatives",
      theory: ["Сравнительная: -er или more (bigger, more interesting).", "Превосходная: -est или the most (the biggest, the most interesting).", "Неправильные: good — better — the best; bad — worse — the worst.", "Сравнение: as ... as, not as ... as."],
      steps: ["Определи число слогов.", "Выбери -er/-est или more/most.", "Проверь неправильные формы.", "Построй предложение."],
      tasks: [["Сравни: big → ?", "bigger — the biggest"], ["Сравни: interesting → ?", "more interesting — the most interesting"], ["Сравни: good → ?", "better — the best"], ["Переведи: Он такой же высокий, как я.", "He is as tall as me."]]
    },
    {
      re: /modal|can|must|should|может/,
      name: "Modal verbs",
      theory: ["can — умение/возможность; must — обязанность; should — совет.", "may — разрешение; might — вероятность; have to — вынужденность.", "После модальных глаголов — инфинитив без to (кроме have to).", "Вопросы и отрицания строятся без do."],
      steps: ["Определи значение: умение, обязанность, совет.", "Выбери глагол.", "Поставь инфинитив без to.", "Проверь вопрос/отрицание."],
      tasks: [["Раскрой: I (can) swim.", "I can swim."], ["Раскрой: You (should) rest.", "You should rest."], ["Раскрой: He (must) go now.", "He must go now."], ["Сделай вопрос: You / can / help?", "Can you help?"]]
    },
    {
      re: /preposition|предлог|in\/on\/at/,
      name: "Prepositions",
      theory: ["in — внутри чего-то, месяцы, годы; on — поверхность, дни; at — точное место/время.", "Фразовые глаголы меняют смысл с предлогом (look for, look after).", "После прилагательных: good at, interested in, afraid of.", "Предлоги не переводятся дословно — учить в сочетаниях."],
      steps: ["Определи тип: место, время, сочетание.", "Вспомни устойчивую конструкцию.", "Поставь предлог.", "Проверь в контексте."],
      tasks: [["Вставь: I live _ London.", "in"], ["Вставь: The book is _ the table.", "on"], ["Вставь: We meet _ 5 o'clock.", "at"], ["Вставь: She is interested _ art.", "in"]]
    }
  ];

  function fill(p) {
    const t = norm(p.topic);
    const hit = BANKS.find(b => b.re.test(t));
    if (!hit) return null;
    return hit;
  }

  function md(p) {
    const hit = fill(p);
    if (!hit) return "";
    return [
      "",
      "## Опорная теория",
      hit.theory.map(x => "- " + x).join("\n"),
      "",
      "## Алгоритм",
      hit.steps.map((s, i) => `${i + 1}. ${s}`).join("\n"),
      "",
      "## Практика с ответами",
      hit.tasks.map(([q, a], i) => `${i + 1}) ${q} — ${a}`).join("\n")
    ].join("\n");
  }

  return { fill, md, BANKS };
})();

(function () {
  const E = window.EngKit;
  if (!E || E.__engSecPatched) return;
  ["conspect", "lesson", "worksheet"].forEach(fn => {
    if (typeof E[fn] !== "function") return;
    const orig = E[fn];
    E[fn] = function (p, t) {
      const out = orig.call(E, p, t);
      try {
        if (+p.grade >= 5 && window.EngSec) {
          const extra = window.EngSec.md(p);
          if (extra && !String(out).includes("Опорная теория")) return String(out) + extra;
        }
      } catch (e) { }
      return out;
    };
  });
  E.__engSecPatched = true;
})();
