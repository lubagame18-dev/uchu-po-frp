/* Английский язык (5–11 класс): уроки по ФРП «Иностранный (английский) язык» без нейросети.
   Методика: коммуникативно-деятельностный подход ФГОС. Грамматика — индуктивно: примеры в ситуации →
   наблюдение → ученики формулируют правило → схема → упражнения по образцу → речевые упражнения → речь в парах.
   Лексика — презентация (картинка, контекст, проверка понимания) → фонетическая отработка → тренировка →
   диалог по образцу. Предложения и ответы собирает сайт (формы глаголов — из таблицы, не «на глаз»).
   Лексические темы — js/engdata.js. */
const EngKit = (() => {
  /* ---------- служебное ---------- */
  function rngOf(seed) { let h = 2166136261; for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1e6) / 1e6; }; }
  const pick = (r, a) => a[Math.floor(r() * a.length)];
  const shuffle = (r, a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const cap = s => String(s).replace(/^./, c => c.toUpperCase());

  /* ---------- словарь для упражнений ---------- */
  // [base, 3-е лицо, -ing, past, 3-я форма, перевод, правильный?, дополнения]
  const V = [
    ["play", "plays", "playing", "played", "played", "играть", 1, ["football", "tennis", "chess", "computer games"]],
    ["watch", "watches", "watching", "watched", "watched", "смотреть", 1, ["TV", "cartoons", "a film"]],
    ["cook", "cooks", "cooking", "cooked", "cooked", "готовить", 1, ["dinner", "pancakes", "soup"]],
    ["visit", "visits", "visiting", "visited", "visited", "навещать, посещать", 1, ["the museum", "our granny", "the zoo"]],
    ["help", "helps", "helping", "helped", "helped", "помогать", 1, ["our mum", "the teacher"]],
    ["clean", "cleans", "cleaning", "cleaned", "cleaned", "убирать", 1, ["the room", "the kitchen"]],
    ["study", "studies", "studying", "studied", "studied", "изучать", 1, ["English", "history", "maths"]],
    ["wash", "washes", "washing", "washed", "washed", "мыть", 1, ["the dishes", "the car"]],
    ["listen to", "listens to", "listening to", "listened to", "listened to", "слушать", 1, ["music", "the radio"]],
    ["paint", "paints", "painting", "painted", "painted", "рисовать красками", 1, ["pictures", "the fence"]],
    ["go", "goes", "going", "went", "gone", "идти, ходить", 0, ["to school", "to the park", "to the swimming pool"]],
    ["read", "reads", "reading", "read", "read", "читать", 0, ["books", "a magazine", "a fairy tale"]],
    ["write", "writes", "writing", "wrote", "written", "писать", 0, ["a letter", "an email", "a story"]],
    ["swim", "swims", "swimming", "swam", "swum", "плавать", 0, ["in the river", "in the pool"]],
    ["drink", "drinks", "drinking", "drank", "drunk", "пить", 0, ["milk", "tea", "orange juice"]],
    ["eat", "eats", "eating", "ate", "eaten", "есть", 0, ["porridge", "an apple", "ice cream"]],
    ["ride", "rides", "riding", "rode", "ridden", "кататься (верхом, на велосипеде)", 0, ["a bike", "a horse"]],
    ["buy", "buys", "buying", "bought", "bought", "покупать", 0, ["bread", "a new bag", "flowers"]],
    ["make", "makes", "making", "made", "made", "делать, изготавливать", 0, ["a cake", "a model plane"]],
    ["sing", "sings", "singing", "sang", "sung", "петь", 0, ["songs", "in the choir"]],
    ["draw", "draws", "drawing", "drew", "drawn", "рисовать", 0, ["pictures", "a map"]],
    ["see", "sees", "seeing", "saw", "seen", "видеть", 0, ["this film", "the sea"]],
    ["take", "takes", "taking", "took", "taken", "брать; делать (фото)", 0, ["photos", "the bus"]],
    ["speak", "speaks", "speaking", "spoke", "spoken", "говорить", 0, ["English", "French"]],
    ["do", "does", "doing", "did", "done", "делать", 0, ["homework", "exercises"]]
  ].map(([b, s, ing, past, pp, ru, reg, objs]) => ({ b, s, ing, past, pp, ru, reg: !!reg, objs }));
  const VR = V.filter(v => v.reg), VI = V.filter(v => !v.reg);
  // подлежащие: k — «1» (I), «3» (he/she/it), «p» (you/we/they)
  const SUBJ = [["I", "1"], ["You", "p"], ["We", "p"], ["They", "p"], ["He", "3"], ["She", "3"], ["My brother", "3"], ["My friends", "p"], ["Tom", "3"], ["Ann", "3"], ["The children", "p"]];
  const subj = r => { const [s, k] = pick(r, SUBJ); return { s, k }; };
  const lc = s => /^(I|Tom|Ann)$/.test(s) ? s : s.replace(/^./, c => c.toLowerCase());
  const be = k => k === "1" ? "am" : k === "3" ? "is" : "are";
  const was = k => k === "p" ? "were" : "was";
  const has = k => k === "3" ? "has" : "have";
  const dO = k => k === "3" ? "does" : "do";
  const neg = { am: "am not", is: "isn't", are: "aren't", was: "wasn't", were: "weren't", has: "hasn't", have: "haven't", does: "doesn't", do: "don't" };
  const T_PS = ["every day", "on Sundays", "every evening", "after school"], ADV = ["usually", "often", "always", "sometimes"];
  const T_PC = ["now", "at the moment"], LOOK = ["Look!", "Listen!"];
  const T_PAST = ["yesterday", "last Sunday", "last week", "two days ago", "last summer"];
  const T_FUT = ["tomorrow", "next week", "next Sunday", "in two days"];
  const T_PCONT = ["at 5 o'clock yesterday", "at this time yesterday", "from 3 to 5 yesterday"];
  const vo = (r, list = V) => { const v = pick(r, list); return { v, o: pick(r, v.objs) }; };
  // предложение с «( )» — ответ: только нужная форма
  const gap = (q, a, full) => ({ q, a, full });

  /* ---------- грамматика: правила и генераторы ---------- */
  const F = [
    { id: "passPast", name: "Страдательный залог: Past Simple Passive", re: /passive.*past|past simple passive|страдательн[а-я]* залог.*прошедш/i,
      rule: ["Страдательный залог — действие совершается над предметом: The telephone was invented by Bell.", "Past Simple Passive: was / were + третья форма глагола.", "by — кем выполнено действие."],
      notice: "Кто совершил действие и над чем? Что стоит на первом месте? Как построено сказуемое?",
      ccq: ["America was discovered by Columbus. — Америка открыла Колумба? (Нет, Колумб открыл Америку.)"],
      mistakes: ["пропускают was/were: «America discovered by Columbus»", "ставят вторую форму вместо третьей"],
      task: (r, l) => { if (l === 1) { const [x, v, f, rest] = pick(r, [["The telephone", "invent", "was invented", "by Alexander Graham Bell in 1876"], ["America", "discover", "was discovered", "by Christopher Columbus in 1492"], ["The Mona Lisa", "paint", "was painted", "by Leonardo da Vinci"], ["«War and Peace»", "write", "was written", "by Leo Tolstoy"], ["St Petersburg", "found", "was founded", "by Peter the Great in 1703"], ["The first satellite", "launch", "was launched", "in 1957"], ["The pyramids", "build", "were built", "many centuries ago"], ["Penicillin", "discover", "was discovered", "by Alexander Fleming"]]); return gap(`${x} (${v}) ${rest}.`, f); } const [q, a] = pick(r, [["Columbus discovered America in 1492.", "America was discovered by Columbus in 1492."], ["Leonardo da Vinci painted the Mona Lisa.", "The Mona Lisa was painted by Leonardo da Vinci."], ["Leo Tolstoy wrote «War and Peace».", "«War and Peace» was written by Leo Tolstoy."], ["Peter the Great founded St Petersburg.", "St Petersburg was founded by Peter the Great."], ["Bell invented the telephone.", "The telephone was invented by Bell."]]); return { q: `Перестройте в страдательный залог: ${q}`, a }; },
      oral: r => { const v = pick(r, VI); return { q: `${v.b} — 3-я форма?`, a: v.pp }; },
      trap: () => ({ q: "The telephone invented by Bell.", a: "The telephone was invented by Bell." }),
      speak: "Викторина «Кем и когда это было создано?»: команды задают друг другу вопросы в страдательном залоге.", sit: "Who invented the telephone? Who wrote «War and Peace»?" },
    { id: "passPres", name: "Страдательный залог: Present Simple Passive", re: /passive|страдательн/i,
      rule: ["Страдательный залог — важен не тот, кто действует, а предмет, над которым совершается действие.", "Present Simple Passive: am / is / are + третья форма глагола: English is spoken in many countries.", "by — кем выполняется действие (если это важно)."],
      notice: "Кто выполняет действие? Важно ли это? Как построено сказуемое?",
      ccq: ["Cars are made in this factory. — Машины делают сами себя? (Нет, их делают люди.)"],
      mistakes: ["пропускают am/is/are: «English spoken»", "используют вторую форму вместо третьей"],
      task: (r, l) => { const [x, v, f, rest] = pick(r, [["English", "speak", "is spoken", "in many countries"], ["Tea", "grow", "is grown", "in China and India"], ["Paper", "make", "is made", "from wood"], ["Football", "play", "is played", "all over the world"], ["The Olympic Games", "hold", "are held", "every four years"], ["Bread", "bake", "is baked", "every morning"], ["Cars", "make", "are made", "in this factory"], ["Letters", "deliver", "are delivered", "every day"]]); return gap(`${x} (${v}) ${rest}.`, f); },
      oral: r => { const v = pick(r, VI); return { q: `${v.b} — 3-я форма?`, a: v.pp }; },
      trap: () => ({ q: "English speak in many countries.", a: "English is spoken in many countries." }),
      speak: "Расскажите, что и где производится в вашем регионе (5 предложений в страдательном залоге).", sit: "Where is tea grown? Where are cars made?" },
    { id: "cond2", name: "Условные предложения второго типа (Second Conditional)", re: /second conditional|втор[а-я]* тип|2-го типа/i,
      rule: ["Second Conditional — нереальное, воображаемое условие в настоящем или будущем.", "If + Past Simple, would + начальная форма: If I had a lot of money, I would travel.", "С to be обычно were для всех лиц: If I were you, I would…"],
      notice: "Это реальная ситуация или воображаемая? Какое время в части с if, а какое — в главной?",
      ccq: ["If I had a dog, I would walk it every day. — У меня есть собака? (Нет, это мечта.)"],
      mistakes: ["ставят would в части с if: «If I would have…»", "используют настоящее время: «If I have…, I would…»"],
      task: (r, l) => { const [a, b, c, d, fa, fc] = pick(r, [["I", "have a lot of money", "I", "buy a big house", "had", "would buy"], ["I", "be you", "I", "take an umbrella", "were", "would take"], ["he", "know her number", "he", "call her", "knew", "would call"], ["we", "live by the sea", "we", "swim every day", "lived", "would swim"], ["she", "have more time", "she", "learn Spanish", "had", "would learn"], ["I", "can fly", "I", "travel around the world", "could", "would travel"]]); const vb = b.split(" ")[0], rest = b.split(" ").slice(1).join(" "), vd = d.split(" ")[0], rd = d.split(" ").slice(1).join(" "); return gap(`If ${a} (${vb}) ${rest}, ${c} (${vd}) ${rd}.`, `${fa}; ${fc}`); },
      oral: r => { const x = pick(r, ["have", "be", "can", "know", "live"]); return { q: `If I … (${x})`, a: { have: "had", be: "were", can: "could", know: "knew", live: "lived" }[x] }; },
      trap: () => ({ q: "If I would have a car, I would drive to the sea.", a: "If I had a car, I would drive to the sea." }),
      speak: "Цепочка «Что бы ты сделал, если бы…?»: каждый отвечает и задаёт вопрос следующему.", sit: "What would you do if you were invisible?" },
    { id: "cond1", name: "Условные предложения первого типа (First Conditional)", re: /first conditional|conditional|условн/i,
      rule: ["First Conditional — реальное условие в будущем.", "If + Present Simple, will + начальная форма: If it rains, we will stay at home.", "В части с if не ставим will!"],
      notice: "Реальная это ситуация или выдуманная? Какое время после if? Какое — в главной части?",
      ccq: ["If it rains, we will stay at home. — Дождь возможен? (Да.) Это будет в будущем? (Да.)"],
      mistakes: ["ставят will после if: «If it will rain»"],
      task: (r, l) => { const [a, b3, b, c, d] = pick(r, [["it", "rains", "rain", "we", "stay at home"], ["you", "study", "study hard", "you", "pass the exam"], ["we", "hurry", "hurry", "we", "catch the bus"], ["she", "feels", "feel better", "she", "go to school"], ["I", "have", "have time", "I", "help you"], ["they", "invite", "invite us", "we", "come"], ["you", "eat", "eat too much", "you", "feel sick"]]); const [vb, ...rb] = b.split(" "), [vd, ...rd] = d.split(" "); const f1 = /^(he|she|it)$/.test(a) ? b3 : vb; return gap(`If ${a} (${vb}) ${rb.join(" ")}${rb.length ? " " : ""}, ${c} (${vd}) ${rd.join(" ")}.`.replace(/ ,/g, ","), `${f1}; will ${vd}`); },
      oral: r => { const x = pick(r, ["rain", "be late", "have time", "win"]); return { q: `If it … (${x === "rain" ? "rain" : x})`, a: x === "rain" ? "rains" : x === "be late" ? "is late" : x === "have time" ? "has time" : "wins" }; },
      trap: () => ({ q: "If it will rain, we will stay at home.", a: "If it rains, we will stay at home." }),
      speak: "Цепочка «Если…, то…»: продолжите предложение одноклассника.", sit: "What will you do if it snows tomorrow?" },
    { id: "reported", name: "Косвенная речь (Reported speech)", re: /reported|косвенн/i,
      rule: ["Косвенная речь передаёт чужие слова: Tom said, «I am tired». → Tom said (that) he was tired.", "Если глагол said — в прошедшем, время «сдвигается назад»: am / is → was; Present Simple → Past Simple; will → would; can → could; Present Perfect → Past Perfect.", "Меняются местоимения: I → he / she, my → his / her."],
      notice: "Сравните прямую и косвенную речь. Что изменилось: местоимения, время глагола?",
      ccq: ["Ann said that she liked ice cream. — Чьи это слова? (Анны.) Почему liked? (Сдвиг времени после said.)"],
      mistakes: ["не сдвигают время: «He said that he is tired»", "не меняют местоимения: «Ann said that I liked»"],
      task: (r, l) => { const [x, d, rep] = pick(r, [["Tom", "I am tired.", "he was tired"], ["Ann", "I like ice cream.", "she liked ice cream"], ["Mike", "I can swim.", "he could swim"], ["Kate", "I will call my mum.", "she would call her mum"], ["Tom", "I live in London.", "he lived in London"], ["Ann", "I have finished my work.", "she had finished her work"], ["Mike", "I am going to the park.", "he was going to the park"]]); return { q: `Передайте в косвенной речи: ${x} said, «${d}»`, a: `${x} said that ${rep}.` }; },
      oral: r => { const [a, b] = pick(r, [["am", "was"], ["will", "would"], ["can", "could"], ["like", "liked"], ["have done", "had done"]]); return { q: `${a} → ?`, a: b }; },
      trap: () => ({ q: "Tom said that he is tired.", a: "Tom said that he was tired." }),
      speak: "Игра «Испорченный телефон»: передайте слова одноклассника в косвенной речи.", sit: "What did your friend say?" },
    { id: "psPc", name: "Present Simple и Present Continuous", re: /present simple.*continuous|continuous.*present simple/i,
      rule: ["Present Simple — действие бывает регулярно, обычно: every day, usually, often, on Sundays.", "Present Continuous — действие происходит сейчас: now, at the moment, Look!, Listen!", "Present Simple: I play / He plays. Present Continuous: I am playing / He is playing."],
      notice: "Сравните пары предложений. Какое действие происходит сейчас, а какое — обычно? По каким словам это видно? Как меняется глагол?",
      ccq: ["Tom plays football every Sunday. — Он играет прямо сейчас? (Нет, обычно.)", "Look! Tom is playing football. — Действие происходит сейчас? (Да.)"],
      mistakes: ["путают маркеры времени: every day — Present Simple, now — Present Continuous", "забывают am/is/are в Present Continuous: «He playing»"],
      task: (r, l) => { const { s, k } = subj(r), { v, o } = vo(r); if (r() < 0.5) { const t = pick(r, T_PS); return gap(`${s} (${v.b}) ${o} ${t}.`, k === "3" ? v.s : v.b); } return pick(r, [0, 1]) ? gap(`${pick(r, LOOK)} ${s} (${v.b}) ${o}.`, `${be(k)} ${v.ing}`) : gap(`${s} (${v.b}) ${o} ${pick(r, T_PC)}.`, `${be(k)} ${v.ing}`); },
      oral: r => { const t = r() < 0.5 ? pick(r, T_PS) : pick(r, T_PC); return { q: `${t} — Present Simple или Continuous?`, a: T_PS.includes(t) ? "Present Simple" : "Present Continuous" }; },
      trap: r => { const { v, o } = vo(r); return { q: `Look! He plays ${o}.`, a: `Look! He is playing ${o}.` }; },
      speak: "Опишите картинку: что люди делают сейчас и что они обычно делают в выходные.", sit: "What are you doing now? What do you usually do on Sundays?" },
    { id: "ppPs", name: "Present Perfect и Past Simple", re: /present perfect.*past simple|past simple.*present perfect/i,
      rule: ["Past Simple — действие в прошлом с указанием времени: yesterday, last week, in 2020, ago.", "Present Perfect — результат к настоящему моменту, время не важно: already, just, never, ever, yet.", "I saw this film yesterday. — I have already seen this film."],
      notice: "В каких предложениях указано, когда было действие? Что важно в остальных: время или результат?",
      ccq: ["I have already done my homework. — Мы знаем, когда? (Нет.) Домашняя работа сделана? (Да.)", "I did my homework yesterday. — Мы знаем, когда? (Да, вчера.)"],
      mistakes: ["употребляют Present Perfect с yesterday, ago, last…", "используют вторую форму вместо третьей: «I have went»"],
      task: (r, l) => { const { s, k } = subj(r), { v, o } = vo(r); return r() < 0.5 ? gap(`${s} (${v.b}) ${o} ${pick(r, T_PAST)}.`, v.past) : gap(`${s} (already / ${v.b}) ${o}.`, `${has(k)} already ${v.pp}`); },
      oral: r => { const t = pick(r, ["yesterday", "already", "last year", "just", "two days ago", "never"]); return { q: `${t} — Past Simple или Present Perfect?`, a: /already|just|never/.test(t) ? "Present Perfect" : "Past Simple" }; },
      trap: r => { const { v, o } = vo(r, VI); return { q: `I have ${v.pp} ${o} yesterday.`, a: `I ${v.past} ${o} yesterday.` }; },
      speak: "Расскажите, что вы уже сделали на этой неделе и когда именно.", sit: "What have you already done this week? When did you do it?" },
    { id: "presS", name: "Present Simple", re: /present simple|настоящее простое/i,
      rule: ["Present Simple — действия, которые происходят регулярно, обычно, всегда.", "I / you / we / they + глагол: I play.", "He / she / it + глагол с окончанием -s (-es): He plays, she watches, he goes.", "Отрицание: don't / doesn't + глагол: He doesn't play. Вопрос: Do you play? Does he play?", "Слова-подсказки: every day, usually, often, always, sometimes, never, on Sundays."],
      notice: "Посмотрите на предложения. Как часто происходят эти действия? Что происходит с глаголом после he, she, my brother?",
      ccq: ["He plays football every day. — Это бывает регулярно? (Да.) Почему plays, а не play? (He — 3-е лицо, ед. число.)"],
      mistakes: ["забывают -s в 3-м лице: «He play»", "ставят -s после doesn't: «He doesn't plays»"],
      task: (r, l) => { const { s, k } = subj(r), { v, o } = vo(r), t = pick(r, T_PS), f = k === "3" ? v.s : v.b, full = `${s} ${f} ${o} ${t}.`;
        if (l === 1) return r() < 0.35 ? gap(`${s} ${pick(r, ADV)} (${v.b}) ${o}.`, f) : gap(`${s} (${v.b}) ${o} ${t}.`, f);
        return r() < 0.5 ? { q: `Сделайте предложение отрицательным: ${full}`, a: `${s} ${neg[dO(k)]} ${v.b} ${o} ${t}.` } : { q: `Задайте общий вопрос: ${full}`, a: `${cap(dO(k))} ${lc(s)} ${v.b} ${o} ${t}?` }; },
      oral: r => { const [s, k] = pick(r, SUBJ.filter(x => x[0] !== "I")), v = pick(r, V); return { q: `${s} + ${v.b}`, a: `${s} ${k === "3" ? v.s : v.b}` }; },
      trap: r => { const { v, o } = vo(r); return { q: `My brother ${v.b} ${o} every day.`, a: `My brother ${v.s} ${o} every day.` }; },
      speak: "Расскажите о своём обычном дне: 6 предложений с usually, often, always, never.", sit: "What do you usually do after school?" },
    { id: "presC", name: "Present Continuous", re: /present continuous|настоящее длительное/i,
      rule: ["Present Continuous — действие происходит сейчас, в момент речи.", "am / is / are + глагол с окончанием -ing: I am reading. He is playing. They are swimming.", "Отрицание: I'm not reading, he isn't playing. Вопрос: Is he playing? Are they swimming?", "Слова-подсказки: now, at the moment, Look!, Listen!"],
      notice: "Когда происходят эти действия — обычно или прямо сейчас? Из каких двух частей состоит сказуемое?",
      ccq: ["Look! She is dancing. — Она танцует сейчас? (Да.) Каждый день? (Мы не знаем.)"],
      mistakes: ["пропускают am/is/are: «She dancing»", "ошибаются в написании -ing: «swiming», «writeing»"],
      task: (r, l) => { const { s, k } = subj(r), { v, o } = vo(r), f = `${be(k)} ${v.ing}`, full = `${s} ${f} ${o} now.`;
        if (l === 1) return r() < 0.5 ? gap(`${pick(r, LOOK)} ${s} (${v.b}) ${o}.`, f) : gap(`${s} (${v.b}) ${o} ${pick(r, T_PC)}.`, f);
        if (k === "1" || r() < 0.5) return { q: `Сделайте предложение отрицательным: ${full}`, a: `${s} ${k === "1" ? "am not" : neg[be(k)]} ${v.ing} ${o} now.` };
        return { q: `Задайте общий вопрос: ${full}`, a: `${cap(be(k))} ${lc(s)} ${v.ing} ${o} now?` }; },
      oral: r => { const v = pick(r, V); return { q: `${v.b} → -ing`, a: v.ing }; },
      trap: r => { const { v, o } = vo(r); return { q: `Look! She ${v.ing} ${o}.`, a: `Look! She is ${v.ing} ${o}.` }; },
      speak: "Игра «Что я делаю?»: один показывает действие, другие спрашивают Are you …ing?", sit: "Look at the picture. What are the people doing?" },
    { id: "pastI", name: "Past Simple: неправильные глаголы", re: /past simple.*неправильн|неправильн[а-я]* глагол/i,
      rule: ["Past Simple — действие произошло в прошлом и закончилось.", "Неправильные глаголы образуют прошедшее время по-своему — их учат по таблице (вторая форма): go — went, see — saw, buy — bought.", "Отрицание и вопрос — с did + начальная форма: I didn't go. Did you go?", "Слова-подсказки: yesterday, last week, ago, in 2020."],
      notice: "Когда произошли эти действия? Как изменились глаголы? Можно ли здесь просто прибавить -ed?",
      ccq: ["I went to the park yesterday. — Это было в прошлом? (Да.) Почему не «goed»? (go — неправильный глагол.)"],
      mistakes: ["прибавляют -ed к неправильным глаголам: «goed», «buyed»", "после did ставят вторую форму: «Did you went?»"],
      task: (r, l) => { const { s } = subj(r), { v, o } = vo(r, VI), t = pick(r, T_PAST); if (l === 1) return gap(`${s} (${v.b}) ${o} ${t}.`, v.past); return r() < 0.5 ? { q: `Сделайте предложение отрицательным: ${s} ${v.past} ${o} ${t}.`, a: `${s} didn't ${v.b} ${o} ${t}.` } : { q: `Задайте общий вопрос: ${s} ${v.past} ${o} ${t}.`, a: `Did ${lc(s)} ${v.b} ${o} ${t}?` }; },
      oral: r => { const v = pick(r, VI); return { q: `${v.b} — ?`, a: v.past }; },
      trap: r => { const v = pick(r, VI.filter(x => x.b !== "read")); return { q: `Yesterday I ${v.b}ed ${v.objs[0]}.`, a: `Yesterday I ${v.past} ${v.objs[0]}.` }; },
      speak: "Расскажите, как вы провели прошлые выходные (6 предложений).", sit: "What did you do last weekend?" },
    { id: "pastR", name: "Past Simple: правильные глаголы", re: /past simple.*правильн|past simple|прошедшее простое/i,
      rule: ["Past Simple — действие произошло в прошлом и закончилось.", "Правильные глаголы: глагол + -ed: play — played, watch — watched; study — studied (y после согласной → i).", "Отрицание: didn't + начальная форма: I didn't play. Вопрос: Did you play?", "Слова-подсказки: yesterday, last week, ago, in 2020."],
      notice: "Когда произошли эти действия? Что общего у всех глаголов?",
      ccq: ["We visited the museum last Sunday. — Это происходит сейчас? (Нет, в прошлом.) Действие закончилось? (Да.)"],
      mistakes: ["после didn't оставляют -ed: «didn't played»", "ошибаются в написании: «studyed»"],
      task: (r, l) => { const { s } = subj(r), { v, o } = vo(r, VR), t = pick(r, T_PAST); if (l === 1) return gap(`${s} (${v.b}) ${o} ${t}.`, v.past); return r() < 0.5 ? { q: `Сделайте предложение отрицательным: ${s} ${v.past} ${o} ${t}.`, a: `${s} didn't ${v.b} ${o} ${t}.` } : { q: `Задайте общий вопрос: ${s} ${v.past} ${o} ${t}.`, a: `Did ${lc(s)} ${v.b} ${o} ${t}?` }; },
      oral: r => { const v = pick(r, VR); return { q: `${v.b} — ?`, a: v.past }; },
      trap: r => { const { v, o } = vo(r, VR); return { q: `We didn't ${v.past} ${o} yesterday.`, a: `We didn't ${v.b} ${o} yesterday.` }; },
      speak: "Расскажите, что вы делали вчера вечером (5–6 предложений).", sit: "What did you do yesterday?" },
    { id: "pastC", name: "Past Continuous", re: /past continuous|прошедшее длительное/i,
      rule: ["Past Continuous — действие длилось в определённый момент в прошлом.", "was / were + глагол с -ing: I was reading. They were playing.", "Отрицание: wasn't / weren't. Вопрос: Was he reading? Were they playing?", "Слова-подсказки: at 5 o'clock yesterday, at this time yesterday, from 3 to 5 yesterday."],
      notice: "Что делали эти люди в указанный момент в прошлом? Из каких частей состоит сказуемое? Когда was, а когда were?",
      ccq: ["At 5 o'clock yesterday I was reading. — Чтение было в прошлом? (Да.) В 5 часов оно уже закончилось? (Нет, продолжалось.)"],
      mistakes: ["путают was и were: «They was»", "используют Past Simple вместо процесса: «At 5 o'clock I read»"],
      task: (r, l) => { const { s, k } = subj(r), { v, o } = vo(r), t = pick(r, T_PCONT); if (l === 1) return gap(`${s} (${v.b}) ${o} ${t}.`, `${was(k)} ${v.ing}`); return { q: `Задайте общий вопрос: ${s} ${was(k)} ${v.ing} ${o} ${t}.`, a: `${cap(was(k))} ${lc(s)} ${v.ing} ${o} ${t}?` }; },
      oral: r => { const [s, k] = pick(r, SUBJ); return { q: `${s} — was или were?`, a: was(k) }; },
      trap: r => { const { v, o } = vo(r); return { q: `They was ${v.ing} ${o} at 5 o'clock yesterday.`, a: `They were ${v.ing} ${o} at 5 o'clock yesterday.` }; },
      speak: "Игра «Алиби»: что вы делали вчера с 6 до 8 вечера? Партнёр задаёт вопросы.", sit: "What were you doing at 7 o'clock yesterday evening?" },
    { id: "will", name: "Future Simple (will)", re: /future simple|\bwill\b|будущее простое/i,
      rule: ["Future Simple — действие произойдёт в будущем; предсказание, обещание, решение в момент речи.", "will + начальная форма глагола (для всех лиц): I will help. She will come.", "Отрицание: won't (will not). Вопрос: Will you help?", "Слова-подсказки: tomorrow, next week, in two days, soon, I think."],
      notice: "Когда произойдут эти действия? Меняется ли глагол после he, she?",
      ccq: ["I will call you tomorrow. — Это сейчас? (Нет, в будущем.)"],
      mistakes: ["ставят частицу to после will: «will to go»", "добавляют -s: «He will goes»"],
      task: (r, l) => { const { s } = subj(r), { v, o } = vo(r), t = pick(r, T_FUT); if (l === 1) return gap(`${s} (${v.b}) ${o} ${t}.`, `will ${v.b}`); return r() < 0.5 ? { q: `Сделайте предложение отрицательным: ${s} will ${v.b} ${o} ${t}.`, a: `${s} won't ${v.b} ${o} ${t}.` } : { q: `Задайте общий вопрос: ${s} will ${v.b} ${o} ${t}.`, a: `Will ${lc(s)} ${v.b} ${o} ${t}?` }; },
      oral: r => { const t = pick(r, ["tomorrow", "yesterday", "next week", "every day", "in two days", "now"]); return { q: `${t} — будущее время?`, a: /tomorrow|next|in two/.test(t) ? "да" : "нет" }; },
      trap: r => { const { v, o } = vo(r); return { q: `She will ${v.s} ${o} tomorrow.`, a: `She will ${v.b} ${o} tomorrow.` }; },
      speak: "Предскажите, какой будет жизнь через 50 лет (6 предложений с will / won't).", sit: "What will our school be like in 50 years?" },
    { id: "goingTo", name: "Конструкция to be going to", re: /going to/i,
      rule: ["to be going to — планы и намерения: что мы собираемся сделать.", "am / is / are + going to + начальная форма: I am going to visit my granny.", "Отрицание: He isn't going to play. Вопрос: Are you going to play?"],
      notice: "Это решения, принятые сейчас, или заранее задуманные планы? Из каких частей состоит конструкция?",
      ccq: ["I am going to visit my granny on Sunday. — Это план? (Да.) Решение принято заранее? (Да.)"],
      mistakes: ["пропускают am/is/are: «I going to»", "ставят глагол с -ing после going to: «going to visiting»"],
      task: (r, l) => { const { s, k } = subj(r), { v, o } = vo(r), t = pick(r, ["next week", "tomorrow", "this evening", "next summer"]); if (l === 1) return gap(`${s} (${v.b}) ${o} ${t}.`, `${be(k)} going to ${v.b}`); return { q: `Задайте общий вопрос: ${s} ${be(k)} going to ${v.b} ${o} ${t}.`, a: `${k === "1" ? "Am" : cap(be(k))} ${lc(s)} going to ${v.b} ${o} ${t}?` }; },
      oral: r => { const [s, k] = pick(r, SUBJ); return { q: `${s} … going to`, a: `${s} ${be(k)} going to` }; },
      trap: r => { const { v, o } = vo(r); return { q: `I going to ${v.b} ${o} tomorrow.`, a: `I am going to ${v.b} ${o} tomorrow.` }; },
      speak: "Расскажите о планах на каникулы (5 предложений с going to).", sit: "What are you going to do at the weekend?" },
    { id: "pp", name: "Present Perfect", re: /present perfect|настоящее совершённое|настоящее завершённое/i,
      rule: ["Present Perfect — действие завершилось к настоящему моменту, важен результат, а не время.", "have / has + третья форма глагола (Past Participle): I have finished. She has seen.", "Отрицание: haven't / hasn't. Вопрос: Have you finished? Has she seen?", "Слова-подсказки: already, just, never, ever, yet (в отрицании и вопросе, в конце)."],
      notice: "Указано ли, когда произошли действия? Что сейчас важно: время или результат? Какая форма глагола после have/has?",
      ccq: ["I have just cleaned my room. — Комната сейчас чистая? (Да.) Когда убрали? (Только что, точное время не важно.)"],
      mistakes: ["ставят вторую форму вместо третьей: «I have went»", "употребляют с yesterday, ago"],
      task: (r, l) => { const { s, k } = subj(r), { v, o } = vo(r), m = pick(r, ["already", "just", "never"]);
        if (l === 1) return gap(`${s} (${m} / ${v.b}) ${o}.`, `${has(k)} ${m} ${v.pp}`);
        return r() < 0.5 ? gap(`${s} (not / ${v.b}) ${o} yet.`, `${neg[has(k)]} ${v.pp}`) : gap(`${cap(has(k))} ${lc(s)} ever (${v.b}) ${o}?`, v.pp); },
      oral: r => { const v = pick(r, VI); return { q: `${v.b} — ${v.past} — ?`, a: v.pp }; },
      trap: r => { const { v, o } = vo(r, VI.filter(x => x.past !== x.pp)); return { q: `I have already ${v.past} ${o}.`, a: `I have already ${v.pp} ${o}.` }; },
      speak: "Игра «Have you ever…?»: найдите одноклассника, который когда-либо… (катался на лошади, видел море…).", sit: "What have you already done today?" },
    { id: "toBe", name: "Глагол to be", re: /to be|глагол be/i,
      rule: ["Глагол to be (быть, находиться) в настоящем времени: I am, he / she / it is, we / you / they are.", "Краткие формы: I'm, he's, they're.", "Отрицание: I'm not, he isn't, they aren't. Вопрос: Are you…? Is he…?"],
      notice: "Посмотрите на предложения: какая форма глагола после I? после he, she? после we, they?",
      ccq: ["She is happy. — Почему is? (She — она, одна.)"],
      mistakes: ["пропускают глагол: «She happy»", "путают формы: «They is»"],
      task: (r, l) => { const { s, k } = subj(r), c = pick(r, ["at home now", "at school", "happy today", "in the park", "tired", "from Russia"]); if (l === 1) return gap(`${s} ___ ${c}.`, be(k)); if (k === "1") return { q: `Сделайте предложение отрицательным: I am ${c}.`, a: `I'm not ${c}.` }; return { q: `Задайте общий вопрос: ${s} ${be(k)} ${c}.`, a: `${cap(be(k))} ${lc(s)} ${c}?` }; },
      oral: r => { const [s, k] = pick(r, SUBJ); return { q: `${s} — am / is / are?`, a: be(k) }; },
      trap: () => ({ q: "My friends is at school.", a: "My friends are at school." }),
      speak: "Представьтесь и представьте друга: имя, возраст, откуда, какой он.", sit: "Who are you? Where are you from? How old are you?" },
    { id: "haveGot", name: "Конструкция have got", re: /have got|has got/i,
      rule: ["have got / has got — «у меня есть».", "I / you / we / they have got; he / she / it has got.", "Отрицание: haven't got / hasn't got. Вопрос: Have you got…? Has he got…?"],
      notice: "Когда have got, а когда has got?",
      ccq: ["She has got a cat. — У неё есть кошка? (Да.) Почему has? (She.)"],
      mistakes: ["после he/she ставят have: «He have got»"],
      task: (r, l) => { const { s, k } = subj(r), o = pick(r, ["a dog", "two sisters", "a new bike", "a big family", "blue eyes", "a computer"]); if (l === 1) return gap(`${s} ___ got ${o}.`, has(k)); return r() < 0.5 ? { q: `Сделайте предложение отрицательным: ${s} ${has(k)} got ${o}.`, a: `${s} ${neg[has(k)]} got ${o}.` } : { q: `Задайте общий вопрос: ${s} ${has(k)} got ${o}.`, a: `${cap(has(k))} ${lc(s)} got ${o}?` }; },
      oral: r => { const [s, k] = pick(r, SUBJ); return { q: `${s} — have / has got?`, a: `${has(k)} got` }; },
      trap: () => ({ q: "My sister have got a cat.", a: "My sister has got a cat." }),
      speak: "Расскажите, что есть у вас и у вашего друга (I have got… He has got…).", sit: "What have you got in your schoolbag?" },
    { id: "plural", name: "Множественное число существительных", re: /множественн/i,
      rule: ["Обычно к существительному прибавляют -s: book — books.", "-es — после s, ss, sh, ch, x, o: box — boxes, watch — watches, potato — potatoes.", "y после согласной → ies: city — cities (но: toy — toys).", "f / fe → ves: leaf — leaves, knife — knives.", "Исключения: man — men, woman — women, child — children, tooth — teeth, foot — feet, mouse — mice, sheep — sheep, fish — fish."],
      notice: "Разделите слова на группы: как образовано множественное число? Какие слова «не подчиняются» правилу?",
      ccq: ["box — boxes: почему -es? (Слово оканчивается на x.)"],
      mistakes: ["пишут «childs», «mans»", "«tomatos», «citys»"],
      task: (r, l) => { const N = l === 1 ? [["book", "books"], ["box", "boxes"], ["city", "cities"], ["toy", "toys"], ["watch", "watches"], ["potato", "potatoes"], ["dress", "dresses"], ["baby", "babies"], ["day", "days"], ["bus", "buses"], ["cat", "cats"], ["tomato", "tomatoes"]] : [["child", "children"], ["man", "men"], ["woman", "women"], ["tooth", "teeth"], ["foot", "feet"], ["mouse", "mice"], ["leaf", "leaves"], ["knife", "knives"], ["sheep", "sheep"], ["fish", "fish"]]; const [a, b] = pick(r, N); return { q: `one ${a} — two ___`, a: b }; },
      oral: r => { const [a, b] = pick(r, [["pen", "pens"], ["box", "boxes"], ["child", "children"], ["city", "cities"], ["man", "men"], ["toy", "toys"]]); return { q: `${a} → ?`, a: b }; },
      trap: () => ({ q: "I have got two childs.", a: "I have got two children." }),
      speak: "Игра «Что в моей комнате?»: назовите как можно больше предметов во множественном числе.", sit: "What can you see in the picture? How many?" },
    { id: "thereIs", name: "Конструкция there is / there are", re: /there (is|are)/i,
      rule: ["there is / there are — «есть, находится» (говорим, что где-то что-то есть).", "there is + единственное число или неисчисляемое: There is a cat. There is some milk.", "there are + множественное число: There are two cats.", "Вопрос: Is there…? Are there any…? Отрицание: There isn't… There aren't any…"],
      notice: "Когда is, а когда are? На что надо смотреть — на место или на предмет?",
      ccq: ["There are three chairs in the room. — Почему are? (Стульев много.)"],
      mistakes: ["ставят is перед множественным числом: «There is two cats»"],
      task: (r, l) => { const P = ["in the kitchen", "in my room", "on the table", "in the park"]; if (l === 1) { const [th, f] = pick(r, [["a cat", "is"], ["a big sofa", "is"], ["a computer", "is"], ["two cats", "are"], ["three chairs", "are"], ["some books", "are"], ["many trees", "are"], ["some milk", "is"], ["some juice", "is"], ["some bread", "is"]]); return gap(`There ___ ${th} ${pick(r, P)}.`, f); } const [th, f] = pick(r, [["a lamp", "Is"], ["a TV", "Is"], ["any chairs", "Are"], ["any books", "Are"], ["any apples", "Are"], ["any milk", "Is"]]); return gap(`___ there ${th} ${pick(r, P)}?`, f); },
      oral: r => { const [th, f] = pick(r, [["a pen", "is"], ["two pens", "are"], ["some water", "is"], ["five apples", "are"]]); return { q: `There … ${th}`, a: f }; },
      trap: () => ({ q: "There is three apples on the table.", a: "There are three apples on the table." }),
      speak: "Опишите свою комнату (There is… There are…), партнёр рисует по описанию.", sit: "What is there in our classroom?" },
    { id: "can", name: "Модальный глагол can", re: /\bcan\b|модальн[а-я]* глагол can/i,
      rule: ["can — «могу, умею»: I can swim. После can — глагол в начальной форме без to.", "can одинаков для всех лиц: He can swim (без -s).", "Отрицание: can't (cannot). Вопрос: Can you swim?"],
      notice: "Что выражает can? Меняется ли can или глагол после he, she?",
      ccq: ["Fish can swim. — Рыбы умеют плавать? (Да.) Почему не «cans»? (can не меняется.)"],
      mistakes: ["ставят to после can: «can to swim»", "добавляют -s: «He cans», «He can swims»"],
      task: (r, l) => { if (l === 1) { const [x, y, z] = pick(r, [["Fish", "swim", "can"], ["Fish", "fly", "can't"], ["Birds", "fly", "can"], ["Cats", "climb trees", "can"], ["Dogs", "talk", "can't"], ["Penguins", "fly", "can't"], ["Penguins", "swim", "can"], ["Kangaroos", "jump", "can"], ["Babies", "drive a car", "can't"], ["Parrots", "talk", "can"]]); return gap(`${x} ___ ${y}.`, z); } const { s } = subj(r), a = pick(r, ["swim", "ride a bike", "speak English", "play the piano", "cook pancakes", "draw"]); return { q: `Задайте общий вопрос: ${s} can ${a}.`, a: `Can ${lc(s)} ${a}?` }; },
      oral: r => { const a = pick(r, ["fly", "swim", "ride a bike", "speak French", "sing"]); return { q: `Can you ${a}?`, a: `Yes, I can. / No, I can't.` }; },
      trap: () => ({ q: "He can swims very well.", a: "He can swim very well." }),
      speak: "Опрос «Найди того, кто умеет…»: задайте 5 вопросов Can you…? и запишите ответы.", sit: "What can you do? What can't you do?" },
    { id: "must", name: "Модальные глаголы must / mustn't, should", re: /\bmust\b|модальн|should/i,
      rule: ["must — «должен» (обязанность, правило): You must wash your hands.", "mustn't — «нельзя» (запрет): You mustn't run in the corridor.", "should — «следует» (совет): You should go to bed early.", "После модальных глаголов — начальная форма без to; -s не прибавляется."],
      notice: "Какие предложения — правила, какие — запреты, какие — советы?",
      ccq: ["You mustn't use your phone during the test. — Это разрешено? (Нет, запрещено.)"],
      mistakes: ["ставят to после must: «must to go»", "путают mustn't (нельзя) и don't have to (не обязательно)"],
      task: (r, l) => { const [q, a] = pick(r, [["You ___ cross the road at the red light.", "mustn't"], ["You ___ wear a seat belt in a car.", "must"], ["You ___ use your phone during the test.", "mustn't"], ["You ___ wash your hands before meals.", "must"], ["Pupils ___ be late for lessons.", "mustn't"], ["You ___ feed the animals at the zoo.", "mustn't"], ["You ___ brush your teeth twice a day.", "must"], ["You ___ be quiet in the library.", "must"], ["You ___ drop rubbish in the park.", "mustn't"]]); return gap(q, a); },
      oral: r => { const [q, a] = pick(r, [["run in the corridor", "mustn't"], ["do homework", "must"], ["shout in class", "mustn't"], ["listen to the teacher", "must"]]); return { q: `You … ${q}`, a }; },
      trap: () => ({ q: "You must to wear a uniform.", a: "You must wear a uniform." }),
      speak: "Составьте правила класса (5 правил с must / mustn't).", sit: "What are the rules in our school?" },
    { id: "poss", name: "Притяжательный падеж существительных", re: /притяжательн|possessive/i,
      rule: ["Притяжательный падеж отвечает на вопрос «чей?»: my sister's bag — сумка моей сестры.", "Единственное число: + 's (Tom's dog). Множественное число на -s: + ' (my parents' room).", "Множественное число не на -s: + 's (the children's toys)."],
      notice: "Где стоит апостроф? Чем отличаются Tom's, my parents' и the children's?",
      ccq: ["my parents' car — Машина одного родителя или двух? (Двух.)"],
      mistakes: ["ставят 's после множественного на -s: «my parents's»"],
      task: (r, l) => { const [o, f] = pick(r, [["my sister", "my sister's"], ["Tom", "Tom's"], ["my parents", "my parents'"], ["the children", "the children's"], ["my friends", "my friends'"], ["the teacher", "the teacher's"], ["the boys", "the boys'"], ["the women", "the women's"]]), th = pick(r, ["bag", "room", "car", "books", "dog"]); return { q: `the ${th} of ${o} → ___`, a: `${f} ${th}` }; },
      oral: r => { const [o, f] = pick(r, [["Ann", "Ann's"], ["my brothers", "my brothers'"], ["the children", "the children's"]]); return { q: `${o} + bag`, a: `${f} bag` }; },
      trap: () => ({ q: "This is my parents's car.", a: "This is my parents' car." }),
      speak: "Игра «Чьё это?»: учитель собирает вещи, ученики отвечают It's Masha's pen.", sit: "Whose things are these?" },
    { id: "compar", name: "Степени сравнения прилагательных", re: /степен[ия] сравнени|comparative|superlative/i,
      rule: ["Короткие прилагательные: + -er / the + -est: tall — taller — the tallest.", "Удвоение согласной: big — bigger — the biggest; y → i: happy — happier — the happiest.", "Длинные прилагательные: more / the most: interesting — more interesting — the most interesting.", "Исключения: good — better — the best; bad — worse — the worst.", "Сравнение: than — An elephant is bigger than a dog."],
      notice: "Как образованы формы от коротких и от длинных прилагательных? Какие слова «не подчиняются» правилу?",
      ccq: ["A plane is faster than a car. — Кто быстрее? (Самолёт.) Почему faster, а не more fast? (fast — короткое слово.)"],
      mistakes: ["«more bigger», «the most fastest» — двойное сравнение", "«gooder», «badder» вместо better, worse"],
      task: (r, l) => { if (l === 1) { const [x, a, y, f] = pick(r, [["An elephant", "big", "a dog", "bigger"], ["A plane", "fast", "a car", "faster"], ["The Volga", "long", "the Thames", "longer"], ["Summer", "hot", "spring", "hotter"], ["This book", "interesting", "that one", "more interesting"], ["This bag", "expensive", "that one", "more expensive"], ["My brother", "tall", "me", "taller"], ["Today the weather is", "good", "yesterday", "better"], ["This test is", "easy", "the last one", "easier"]]); return /is$/.test(x) ? gap(`${x} (${a}) than ${y}.`, f) : gap(`${x} is (${a}) than ${y}.`, f); } const [x, a, f] = pick(r, [["The Volga is", "long", "the longest river in Europe"], ["Moscow is", "big", "the biggest city in Russia"], ["Russia is", "big", "the biggest country in the world"], ["The cheetah is", "fast", "the fastest land animal"], ["Baikal is", "deep", "the deepest lake in the world"], ["Elbrus is", "high", "the highest mountain in Russia"], ["Jupiter is", "big", "the biggest planet in the Solar System"]]); return gap(`${x} (${a}) ${f.split(" ").slice(2).join(" ")}.`, f.split(" ").slice(0, 2).join(" ")); },
      oral: r => { const [a, c] = pick(r, [["big", "bigger"], ["happy", "happier"], ["good", "better"], ["bad", "worse"], ["interesting", "more interesting"], ["hot", "hotter"], ["long", "longer"]]); return { q: `${a} → ?`, a: c }; },
      trap: () => ({ q: "An elephant is more bigger than a horse.", a: "An elephant is bigger than a horse." }),
      speak: "Сравните два города (два вида спорта, двух животных) — не менее 5 предложений.", sit: "Which is bigger: an elephant or a giraffe? Which is faster: a car or a plane?" }
  ];

  /* ---------- темы по классам (грамматика + лексика) ---------- */
  const GR = { 5: ["Глагол to be", "Конструкция have got", "Множественное число существительных", "Конструкция there is / there are", "Модальный глагол can", "Present Simple", "Present Continuous"], 6: ["Present Simple и Present Continuous", "Past Simple: правильные глаголы", "Past Simple: неправильные глаголы", "Притяжательный падеж существительных", "Степени сравнения прилагательных", "Модальные глаголы must / mustn't, should"], 7: ["Past Continuous", "Future Simple (will)", "Конструкция to be going to", "Present Perfect", "Степени сравнения прилагательных"], 8: ["Present Perfect и Past Simple", "Страдательный залог: Present Simple Passive", "Страдательный залог: Past Simple Passive", "Условные предложения первого типа (First Conditional)", "Модальные глаголы must / mustn't, should"], 9: ["Условные предложения второго типа (Second Conditional)", "Косвенная речь (Reported speech)", "Страдательный залог: Past Simple Passive", "Present Perfect и Past Simple"], 10: ["Условные предложения первого типа (First Conditional)", "Условные предложения второго типа (Second Conditional)", "Страдательный залог: Present Simple Passive", "Косвенная речь (Reported speech)"], 11: ["Условные предложения второго типа (Second Conditional)", "Косвенная речь (Reported speech)", "Страдательный залог: Past Simple Passive", "Present Perfect и Past Simple"] };
  const VOC = () => window.EngVocab || [];
  function topics(grade) { let n = 0; const g = +grade; return [...VOC().filter(x => x.g.includes(g)).map(x => ({ n: ++n, title: x.t, section: "Лексика" })), ...(GR[g] || []).map(t => ({ n: ++n, title: t, section: "Грамматика" }))]; }
  const family = topic => F.find(f => f.re.test(topic)) || null;
  const vocab = topic => { const t = String(topic || "").toLowerCase(); return VOC().find(x => x.t.toLowerCase() === t) || (family(topic) ? null : VOC().find(x => x.re.test(t))) || null; };

  /* ---------- типы уроков ---------- */
  const TYPES = {
    gram: { id: "gram", name: "Урок формирования грамматических навыков", stages: ["Организационный момент. Речевая разминка", "Проверка домашнего задания", "Мотивация: ситуация общения, тема и цель урока", "Открытие грамматического правила: наблюдение на примерах", "Тренировочные упражнения (по образцу)", "Речевые упражнения: составляем свои предложения", "Речевая практика в парах", "Итог урока. Рефлексия", "Домашнее задание с инструктажем"], mins: [3, 4, 3, 9, 8, 6, 8, 2, 2] },
    lex: { id: "lex", name: "Урок формирования лексических навыков", stages: ["Организационный момент. Речевая разминка", "Проверка домашнего задания", "Мотивация: тема и цель урока", "Введение новой лексики: картинки, контекст, проверка понимания", "Фонетическая отработка: хором и индивидуально", "Тренировочные упражнения", "Речевая практика: диалог по образцу", "Итог урока. Рефлексия", "Домашнее задание с инструктажем"], mins: [3, 4, 3, 9, 4, 9, 9, 2, 2] },
    refl: { id: "refl", name: "Урок совершенствования навыков (закрепление)", stages: ["Организационный момент. Речевая разминка", "Проверка домашнего задания", "Актуализация: правило и образцы", "Тренировочные упражнения", "Упражнения в изменённых условиях", "Речевая практика в парах", "Самостоятельная работа с самопроверкой", "Итог урока. Рефлексия", "Домашнее задание с инструктажем"], mins: [3, 5, 4, 8, 8, 7, 6, 2, 2] },
    read: { id: "read", name: "Урок развития речи: чтение и говорение", stages: ["Организационный момент. Речевая разминка", "Проверка домашнего задания", "Повторение лексики темы (игра)", "Чтение текста: до чтения — во время чтения — после чтения", "Работа с текстом: верно / неверно, ответы на вопросы", "Речевая практика: монолог или диалог по теме", "Самостоятельная работа с самопроверкой", "Итог урока. Рефлексия", "Домашнее задание с инструктажем"], mins: [3, 5, 5, 8, 7, 8, 5, 2, 2] },
    gen: { id: "gen", name: "Урок обобщения и систематизации", stages: ["Организационный момент. Речевая разминка", "Проверка домашнего задания", "Обобщение: таблица правил и образцов", "Упражнения разных типов (работа в группах)", "Самостоятельная работа (формат проверочной)", "Итог урока. Рефлексия", "Домашнее задание с инструктажем"], mins: [3, 5, 8, 14, 11, 2, 2] },
    ctrl: { id: "ctrl", name: "Урок контроля", stages: ["Организационный момент", "Инструктаж по выполнению работы", "Проверочная работа (2 варианта)", "Итог урока: самооценка", "Домашнее задание"], mins: [1, 3, 37, 2, 2] }
  };
  function detectType({ topic, lessonNo }) {
    const t = String(topic).toLowerCase();
    if (/контрольн|проверочн|test\b/.test(t)) return TYPES.ctrl;
    if (/повторени|обобщени|систематизац|подготовк[а-я]* к (огэ|егэ|впр)/.test(t)) return TYPES.gen;
    const isVoc = !!vocab(topic) && !family(topic);
    if (lessonNo === 1) return isVoc ? TYPES.lex : TYPES.gram;
    return isVoc ? TYPES.read : TYPES.refl;
  }

  /* ---------- материал урока ---------- */
  function material(p) {
    const r = rngOf(p.topic + "|" + p.grade + "|" + new Date().toISOString().slice(0, 10) + "|" + (p.lessonNo || 1));
    const f = family(p.topic), W = f ? null : vocab(p.topic);
    // сначала — задания, которых ещё не было на уроке; если набор маленький, повторы допускаются, но не внутри одного упражнения
    const used = new Set(), T = (lvl, n) => { const out = []; if (!f) return out; for (let i = 0; i < n * 10 && out.length < n; i++) { const x = f.task(r, lvl); if (!x || used.has(x.q)) continue; used.add(x.q); out.push(x); } for (let i = 0; i < n * 10 && out.length < n; i++) { const x = f.task(r, lvl); if (x && !out.some(y => y.q === x.q)) out.push(x); } return out; };
    const uniq = (g, n) => { const out = [], s = new Set(); for (let i = 0; i < n * 8 && out.length < n; i++) { const x = g(r); if (!x || s.has(x.q)) continue; s.add(x.q); out.push(x); } return out; };
    const m = { f, W, r };
    if (f) Object.assign(m, { oral: uniq(f.oral, 5), obs: (() => { const c = T(1, 8), out = []; for (const x of c) if (out.length < 3 && !out.some(y => y.a === x.a)) out.push(x); for (const x of c) if (out.length < 3 && !out.includes(x)) out.push(x); return out; })(), ex: T(1, 1)[0], board: T(1, 4), boardHard: T(2, 3), v1: [...T(1, 3), ...T(2, 2)], v2: [...T(1, 3), ...T(2, 2)], hw: T(1, 5), hwHard: T(2, 3), trap: f.trap(r) });
    if (W) { const ws = shuffle(r, W.w); Object.assign(m, { words: W.w, match: ws.slice(0, 6), gapW: shuffle(r, W.w).slice(0, 5), trW: shuffle(r, W.w).slice(0, 6) }); }
    return m;
  }
  const qa = x => `${x.q} → ${x.a}`;
  const list = (arr, br = "<br>") => arr.map((x, i) => `${i + 1}) ${x.q}`).join(br);
  const keys = arr => arr.map((x, i) => `${i + 1}) ${x.a}`).join(arr.some(x => /[.?!]$/.test(x.a)) ? " " : "; ");
  const cell = s => String(s || "").replace(/\|/g, "∣").replace(/\n/g, "<br>");
  const ansW = w => { const [en, , ex] = w, mm = ex.match(new RegExp(`\\b${en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(s|es|ed|d|ing)?\\b`, "i")); return mm ? mm[0] : en; };
  const gapKey = arr => arr.map((w, k) => `${k + 1}) ${ansW(w)}`).join("; ");
  const blankW = (w) => { const [en, , ex] = w, re = new RegExp(`\\b${en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(s|es|ed|d|ing)?\\b`, "i"); return re.test(ex) ? ex.replace(re, "______") : ex; };
  const head = (p, type) => `**Класс:** ${p.grade} · **Предмет:** Английский язык · **Тип урока:** ${type.name} · **Длительность:** ${p.duration} мин`;
  const WARM = ["— Good morning! How are you? — What's the date today? — What's the weather like today?", "Фонетическая зарядка: повторяем за учителем скороговорку или рифмовку по теме.", "Речевая разминка «цепочкой»: каждый отвечает на вопрос и задаёт его соседу."];

  // подводящий диалог для грамматики: примеры в ситуации → вопросы → правило формулируют ученики → схема → проверка понимания
  function discover(m, br = "<br>") {
    const f = m.f, ex = (m.obs || []).map((x, k) => `${k + 1}) ${x.full || x.q.replace(/\(([^)]*)\)/, `**${x.a}**`).replace(/___/, `**${x.a}**`)}`);
    return [`**1. Наблюдение.** На доске примеры в ситуации «${f.sit}»:${br}${ex.join(br)}`,
      `**2. Вопросы учителя:** ${f.notice} *(Ученики сравнивают, выделяют формы цветом.)*`,
      `**3. Формулируем правило.** — Сформулируйте правило по-русски своими словами. *(Учитель уточняет.)*`,
      `**4. Запись в тетрадь (схема):**${br}${f.rule.join(br)}`,
      `**5. Проверка понимания (CCQ):**${br}${f.ccq.join(br)}`,
      f.mistakes?.length ? `**6. Где можно ошибиться?** — Предположите! *(Типичная ошибка: ${f.mistakes[0]}.)*` : ""].filter(Boolean).join(br);
  }
  const fill = s => String(s).replace(/\(([^)]*)\)|___/, "");

  /* ---------- технологическая карта ---------- */
  function conspect(p, type) {
    const m = material(p), f = m.f, W = m.W, S = type.stages, mins = type.mins;
    const goal = f ? `формирование грамматического навыка: употребление «${f.name}» в устной и письменной речи` : W ? `формирование лексического навыка по теме «${W.t}» и умения вести диалог по теме` : `формирование коммуникативных умений по теме «${p.topic}»`;
    let md = `# ${p.topic}\n\n${head(p, type)} · **Урок по теме:** ${p.lessonNo === 1 ? "1-й" : p.lessonNo + "-й"}\n\n**Цель:** ${type.id === "ctrl" ? `проверка уровня освоения темы «${p.topic}»` : goal}.\n\n`;
    md += `**Задачи:**\n\n- Обучающая: ${f ? `научить образовывать и употреблять ${f.name}; отработать по образцу и в речи` : W ? `ввести и активизировать ${W.w.length} лексических единиц; научить вести диалог по теме` : "отработать языковой материал темы"}.\n- Развивающая: развивать языковую догадку, внимание, умение работать в паре.\n- Воспитательная: воспитывать уважение к собеседнику, интерес к изучению английского языка.\n\n`;
    md += `**Планируемые результаты:**\n\n- Предметные: ${f ? `знать правило образования ${f.name}; употреблять в речи` : "знать и употреблять лексику темы; вести диалог по образцу"}.\n- Метапредметные: выявлять закономерность на примерах; планировать речевое высказывание; оценивать свою работу.\n- Личностные: проявлять интерес к языку и культуре англоязычных стран; доброжелательно общаться.\n\n`;
    md += `**Оборудование:** учебник, рабочая тетрадь, презентация, рабочий лист${W ? ", картинки по теме" : ""}${type.id === "ctrl" ? ", карточки с вариантами" : ""}.\n\n`;
    if (f) md += `> 📐 **Правило урока:** ${f.rule.join(" · ")}\n\n`;
    md += `---\n\n## План урока\n\n${S.map((s, i) => `${i + 1}. ${s} (${mins[i]} мин)`).join("\n")}\n\n---\n\n## Технологическая карта урока\n\n| Этап урока | Деятельность учителя | Деятельность учащихся | Задания / УУД |\n|---|---|---|---|\n`;
    const row = (i, t, s, z) => `| ${S[i]} (${mins[i]} мин) | ${cell(t)} | ${cell(s)} | ${cell(z)} |\n`, R = [];
    S.forEach((st, i) => {
      if (/^Организационный момент$/.test(st)) R.push(row(i, "Приветствует учащихся, проверяет готовность к уроку.", "Приветствуют учителя.", "Регулятивные: самоорганизация."));
      else if (/Речевая разминка/.test(st)) R.push(row(i, `${WARM[0]}${f ? `<br>Разминка по теме:<br>${list(m.oral)}` : W ? `<br>— What do you know about «${W.t.replace(/^.*\(|\)$/g, "")}»? *(Мозговой штурм: слова, которые уже знаем.)*` : ""}`, `Отвечают на вопросы учителя.${f ? ` Ответы: ${keys(m.oral)}.` : ""}`, "Коммуникативные: речевое взаимодействие."));
      else if (/Проверка домашнего/.test(st)) { const H = Subjects.hwCheck(p); R.push(row(i, H.teacher, H.students, "Регулятивные: контроль и коррекция.")); }
      else if (/^Мотивация/.test(st)) R.push(row(i, f ? `Ситуация общения: «${f.sit}» — ученики отвечают, учитель записывает ответы на доске.<br>— Каких слов (форм) нам не хватало, чтобы ответить точно? Сформулируйте тему и цель урока.` : W ? `Показывает картинки по теме «${W.t}».<br>— Что изображено? О чём будем говорить? Какие слова нам понадобятся?<br>Цель: научиться говорить на тему «${W.t}».` : "Создаёт ситуацию общения, подводит к теме и цели урока.", `Отвечают, формулируют тему и цель урока.`, "Регулятивные: целеполагание."));
      else if (/Открытие грамматического/.test(st)) R.push(row(i, f ? discover(m) : "Наблюдение на примерах из учебника → ученики формулируют правило → схема → проверка понимания.", "Наблюдают, сравнивают формы, формулируют правило, записывают схему, отвечают на вопросы на понимание.", "Познавательные: анализ, обобщение, вывод правила."));
      else if (/Введение новой лексики/.test(st)) R.push(row(i, W ? `Новые слова (картинка → слово → пример → проверка понимания):<br>${W.w.map(w => `**${w[0]}** — ${w[1]}. *${w[2]}*`).join("<br>")}<br>Проверка понимания: учитель показывает картинку — ученики называют слово; «верно / неверно» по картинке.` : "Новые слова по теме — с картинками, в контексте, с проверкой понимания.", "Слушают, повторяют, догадываются о значении по картинке и контексту; записывают слова в словарь.", "Познавательные: языковая догадка; смысловое восприятие."));
      else if (/Фонетическая/.test(st)) R.push(row(i, W ? `Хоровое и индивидуальное повторение слов за учителем (диктором): ${W.w.map(w => w[0]).join(", ")}.<br>Игра «Громко — тихо», «Поймай слово».` : "Отработка произношения.", "Повторяют хором и индивидуально.", "Коммуникативные: произносительные навыки."));
      else if (/Тренировочные упражнения \(по образцу\)|^Тренировочные упражнения$/.test(st)) R.push(row(i, f ? `Раскройте скобки / вставьте форму (по образцу):<br>${list(m.board)}<br>Образец: ${qa(m.ex)}` : W ? `1) Соотнесите слова и переводы: ${m.match.map(w => w[0]).join(", ")}.<br>2) Вставьте слова в предложения:<br>${m.gapW.map((w, k) => `${k + 1}) ${blankW(w)}`).join("<br>")}` : "Упражнения учебника по образцу.", f ? `Выполняют письменно, проверяют по цепочке. Ответы: ${keys(m.board)}.` : W ? `Выполняют, проверяют в парах. Ответы: ${gapKey(m.gapW)}.` : "Выполняют упражнения.", "Познавательные: действие по образцу; регулятивные: самоконтроль."));
      else if (/Речевые упражнения|изменённых условиях/.test(st)) R.push(row(i, f ? `${/изменённых/.test(st) ? "Задания повышенного уровня" : "Составляем свои предложения по образцу"}:<br>${list(m.boardHard)}` : W ? `Ответьте на вопросы, используя новые слова:<br>${W.ph.filter(x => /\?$/.test(x)).join("<br>")}` : "Упражнения в изменённых условиях.", f ? `Выполняют устно и письменно. Ответы: ${keys(m.boardHard)}.` : "Отвечают на вопросы.", "Познавательные: перенос в новые условия."));
      else if (/Речевая практика/.test(st)) R.push(row(i, f ? `${f.speak}<br>Опора на доске: правило и образцы.` : W ? `Диалог по образцу (опора):<br>${W.ph.join("<br>")}<br>Задание: ${W.speak}` : "Речевая практика по теме.", "Работают в парах, разыгрывают диалоги, 2–3 пары выступают.", "Коммуникативные: диалогическая и монологическая речь."));
      else if (/Повторение лексики/.test(st)) R.push(row(i, W ? `Игра «Угадай слово»: учитель (ученик) описывает или показывает слово — команды называют: ${W.w.slice(0, 8).map(w => w[0]).join(", ")}.` : "Повторение лексики темы.", "Играют, называют слова.", "Коммуникативные: взаимодействие в группе."));
      else if (/Чтение текста/.test(st)) R.push(row(i, W ? `До чтения: — Look at the title. What is the text about?<br>Во время чтения: прочитайте текст и найдите новые слова темы.<br>«${W.text}»` : "Чтение текста учебника.", "Предполагают содержание, читают про себя, находят слова темы.", "Познавательные: смысловое чтение."));
      else if (/Работа с текстом/.test(st)) R.push(row(i, W ? `True or False?<br>${W.tf.map((x, k) => `${k + 1}) ${x[0]}`).join("<br>")}<br>— Исправьте неверные утверждения.` : "Задания к тексту.", W ? `Ответы: ${W.tf.map((x, k) => `${k + 1}) ${x[1] ? "True" : "False"}`).join("; ")}.` : "Выполняют задания.", "Познавательные: понимание прочитанного."));
      else if (/Актуализация: правило/.test(st)) R.push(row(i, f ? `— Вспомните правило: ${f.rule[1] || f.rule[0]}<br>Разминка:<br>${list(m.oral)}` : "Повторение правила и образцов.", f ? `Формулируют правило, отвечают. Ответы: ${keys(m.oral)}.` : "Повторяют.", "Познавательные: актуализация."));
      else if (/Обобщение: таблица/.test(st)) R.push(row(i, f ? `Таблица-опора: ${f.rule.join("<br>")}<br>— Где чаще всего ошибаются? *(${f.mistakes.join("; ")})*` : W ? `Кластер «${W.t}»: слова темы по группам.` : "Опорная таблица темы.", "Заполняют таблицу (кластер), приводят примеры.", "Познавательные: систематизация."));
      else if (/работа в группах/.test(st)) R.push(row(i, f ? `Каждая группа — свой тип задания:<br>${list(m.boardHard)}<br>${m.trap ? `Найди ошибку: «${m.trap.q}»` : ""}` : "Задания разных типов по группам.", f ? `Выполняют, представляют. Ответы: ${keys(m.boardHard)}${m.trap ? `; ошибка: ${m.trap.a}` : ""}.` : "Выполняют задания.", "Коммуникативные: сотрудничество."));
      else if (/Самостоятельная работа|Проверочная работа/.test(st)) R.push(row(i, f ? `**Вариант 1:** ${list(m.v1)}<br>**Вариант 2:** ${list(m.v2)}${/Проверочная/.test(st) ? "" : "<br>Самопроверка по ключу на слайде."}` : W ? `Переведите слова: ${m.trW.map(w => w[1]).join(", ")}.<br>Вставьте слова в предложения (см. рабочий лист).` : "Самостоятельная работа по учебнику.", f ? `Выполняют.<br>**Ключ, В-1:** ${keys(m.v1)}<br>**Ключ, В-2:** ${keys(m.v2)}` : W ? `Ключ: ${m.trW.map(w => w[0]).join(", ")}.` : "Выполняют.", "Регулятивные: самоконтроль."));
      else if (/Инструктаж/.test(st)) R.push(row(i, "Объясняет порядок работы, критерии оценивания, время.", "Подписывают работу, задают вопросы.", "Регулятивные: планирование."));
      else if (/Итог|Рефлексия/.test(st)) R.push(row(i, `— What have we learnt today? ${f ? "Сформулируйте правило урока." : "Назовите 5 новых слов."}<br>— Оцените себя: «могу сам(а)», «нужна подсказка», «надо повторить».`, "Подводят итог, оценивают свою работу.", "Регулятивные: рефлексия."));
      else if (/Домашнее/.test(st)) R.push(row(i, f ? `**Базовый уровень:** ${list(m.hw)}<br>**Повышенный уровень:** ${list(m.hwHard)}<br>Инструктаж: «Смотрите правило и образец в тетради».` : W ? `**Базовый уровень:** выучить слова темы (${W.w.length}); составить 5 предложений с новыми словами.<br>**Повышенный уровень:** ${W.speak}` : "Задание из учебника с инструктажем.", f ? `Записывают. Ключ: ${keys(m.hw)}; ${keys(m.hwHard)}.` : "Записывают задание.", "Регулятивные: планирование."));
      else R.push(row(i, "", "", ""));
    });
    md += R.join("") + "\n";
    return md;
  }

  /* ---------- конспект для учителя ---------- */
  function lesson(p, type) {
    const m = material(p), f = m.f, W = m.W, mins = type.mins;
    let md = `# ${p.topic}\n\n${head(p, type)}\n\n`;
    if (f) md += `> 📐 **Правило урока:**<br>${f.rule.join("<br>")}\n\n`;
    md += `---\n\n## Ход урока\n\n`;
    const box = (title, lines) => `| ${title} |\n|---|\n${lines.filter(Boolean).map(l => `| ${cell(l)} |`).join("\n")}\n\n`;
    type.stages.forEach((st, i) => {
      md += `### ${i + 1}. ${st} · ${mins[i]} мин\n\n`;
      if (/^Организационный момент$/.test(st)) md += "📌 Приветствие, проверка готовности к уроку.\n\n";
      else if (/Речевая разминка/.test(st)) md += box("Речевая разминка", [`**❓ Учитель:** ${WARM[0]}`, f ? `**Разминка по теме:**<br>${list(m.oral)}` : "", f ? `**🔑 Ответы:** ${keys(m.oral)}` : W ? `**❓ Учитель:** What words do you know on the topic «${W.t.replace(/^.*\(|\)$/g, "")}»?` : ""]);
      else if (/Проверка домашнего/.test(st)) md += box("Проверка домашнего задания", Subjects.hwCheck(p).box);
      else if (/^Мотивация/.test(st)) md += box("Мотивация", f ? [`**❓ Учитель:** ${f.sit}`, "**💬 Ученики:** отвечают; учитель записывает ответы на доске.", "**❓ Учитель:** Каких форм нам не хватило, чтобы ответить точно? Сформулируйте тему и цель урока."] : W ? [`**❓ Учитель:** (картинки) What can you see? What are we going to talk about?`, `**✅ Цель:** научиться говорить на тему «${W.t}».`] : ["Ситуация общения → тема и цель урока."]);
      else if (/Открытие грамматического/.test(st)) md += box("Открытие правила (подводящий диалог)", f ? discover(m).split("<br>").reduce((a, l) => { if (/^\*\*\d\./.test(l) || !a.length) a.push(l); else a[a.length - 1] += "<br>" + l; return a; }, []) : ["Наблюдение → правило → схема → проверка понимания."]);
      else if (/Введение новой лексики/.test(st)) md += box("Новые слова", W ? [W.w.map(w => `**${w[0]}** — ${w[1]}. *${w[2]}*`).join("<br>"), "**Порядок:** картинка → слово (учитель произносит) → пример в контексте → вопрос на понимание («Is it a … or a …?»)."] : ["Новые слова с картинками и в контексте."]);
      else if (/Фонетическая/.test(st)) md += box("Фонетическая отработка", [W ? `Хором и индивидуально: ${W.w.map(w => w[0]).join(", ")}.` : "Повторение за учителем.", "Игра «Поймай слово»: учитель произносит слова, ученики хлопают, услышав слово темы."]);
      else if (/Тренировочные упражнения \(по образцу\)|^Тренировочные упражнения$/.test(st)) md += box("Тренировочные упражнения", f ? [`**Образец:** ${qa(m.ex)}`, list(m.board), `**🔑 Ответы:** ${keys(m.board)}`] : W ? [`**Вставьте слова:**<br>${m.gapW.map((w, k) => `${k + 1}) ${blankW(w)}`).join("<br>")}`, `**🔑 Ответы:** ${gapKey(m.gapW)}`] : ["Упражнения учебника."]);
      else if (/Речевые упражнения|изменённых условиях/.test(st)) md += box(/изменённых/.test(st) ? "Упражнения в изменённых условиях" : "Речевые упражнения", f ? [list(m.boardHard), `**🔑 Ответы:** ${keys(m.boardHard)}`] : W ? [W.ph.filter(x => /\?$/.test(x)).join("<br>")] : ["Упражнения учебника."]);
      else if (/Речевая практика/.test(st)) md += box("Речевая практика", f ? [`**Задание:** ${f.speak}`] : W ? [`**Опора для диалога:**<br>${W.ph.join("<br>")}`, `**Задание:** ${W.speak}`] : ["Диалог по теме."]);
      else if (/Повторение лексики/.test(st)) md += box("Игра «Угадай слово»", [W ? W.w.slice(0, 8).map(w => w[0]).join(", ") : "Слова темы", "Ученик описывает слово по-английски (или показывает) — класс называет."]);
      else if (/Чтение текста/.test(st)) md += box("Чтение", W ? ["**До чтения:** Look at the title. What is the text about?", `**Текст:** ${W.text}`, "**Во время чтения:** найдите слова темы."] : ["Текст учебника."]);
      else if (/Работа с текстом/.test(st)) md += box("True or False?", W ? [W.tf.map((x, k) => `${k + 1}) ${x[0]}`).join("<br>"), `**🔑 Ответы:** ${W.tf.map((x, k) => `${k + 1}) ${x[1] ? "True" : "False"}`).join("; ")}`] : ["Задания к тексту."]);
      else if (/Актуализация: правило/.test(st)) md += box("Актуализация", f ? [`**❓ Учитель:** Вспомним правило. *(${f.rule[1] || f.rule[0]})*`, list(m.oral), `**🔑 Ответы:** ${keys(m.oral)}`] : ["Повторение правила."]);
      else if (/Обобщение: таблица/.test(st)) md += box("Опорная таблица", f ? [f.rule.join("<br>"), `**⚠️ Типичные ошибки:** ${f.mistakes.join("; ")}`] : ["Таблица темы."]);
      else if (/работа в группах/.test(st)) md += box("Работа в группах", f ? [list(m.boardHard), `**🔑 Ответы:** ${keys(m.boardHard)}`] : ["Задания по группам."]);
      else if (/Самостоятельная работа|Проверочная работа/.test(st)) md += box(/Проверочная/.test(st) ? "Проверочная работа" : "Самостоятельная работа", f ? [`**Вариант 1:**<br>${list(m.v1)}`, `**Вариант 2:**<br>${list(m.v2)}`, `**🔑 Ключ:** В-1: ${keys(m.v1)}; В-2: ${keys(m.v2)}`] : W ? [`**Переведите:** ${m.trW.map(w => w[1]).join(", ")}`, `**🔑 Ключ:** ${m.trW.map(w => w[0]).join(", ")}`] : ["Задания учебника."]);
      else if (/Инструктаж/.test(st)) md += "📌 Порядок работы, критерии оценивания, время.\n\n";
      else if (/Итог|Рефлексия/.test(st)) md += box("Итог и рефлексия", [`**❓ Учитель:** What have we learnt today? ${f ? "Сформулируйте правило." : "Назовите 5 новых слов."}`, "**💬 Ученики:** «могу сам(а)», «нужна подсказка», «надо повторить»."]);
      else if (/Домашнее/.test(st)) md += box("Домашнее задание", f ? [`**Базовый уровень:**<br>${list(m.hw)}`, `**Повышенный уровень:**<br>${list(m.hwHard)}`, `**🔑 Ключ (для учителя):** ${keys(m.hw)}; ${keys(m.hwHard)}`] : W ? [`**Базовый уровень:** выучить слова темы; составить 5 предложений с новыми словами.`, `**Повышенный уровень:** ${W.speak}`] : ["Задание учебника."]);
    });
    return md;
  }

  /* ---------- рабочий лист ---------- */
  function worksheet(p, type) {
    const m = material(p), f = m.f, W = m.W;
    let md = `# Worksheet\n\n**Topic:** ${p.topic}\n\n✍️ Name: ___________________________ | 📅 Date: _________ | 🏫 Form: ${p.grade}\n\n`;
    if (f) {
      md += `> 📐 **Запомни:**<br>${f.rule.join("<br>")}\n\n`;
      md += `### 🔓 Task 1. Look and think\n\nПрочитайте примеры и подчеркните формы, о которых говорит правило.\n\n${m.obs.map((x, k) => `${k + 1}) ${x.full || x.q.replace(/\(([^)]*)\)/, x.a).replace(/___/, x.a)}`).join("  \n")}\n\n`;
      md += `### 🔓 Task 2. Complete the sentences\n\n${m.board.map((x, k) => `${k + 1}) ${x.q}`).join("  \n")}\n\n`;
      md += `### 🔓 Task 3. Your turn\n\n${m.boardHard.map((x, k) => `${k + 1}) ${x.q}`).join("  \n")}\n\n[ ________________________________________ ]\n\n[ ________________________________________ ]\n\n`;
      if (m.trap) md += `### 🔍 Task 4. Find the mistake\n\n«${m.trap.q}»\n\nПравильно: ________________________________________\n\n`;
      md += `### ⭐ Task ${m.trap ? 5 : 4}. Speak / Write\n\n${f.speak}\n\n[ ________________________________________ ]\n\n[ ________________________________________ ]\n\n`;
      md += `### 🪞 Self-assessment\n\n☐ I can do it myself  ☐ I need help  ☐ I need more practice\n\n---\n\n## 🔑 Answers (для учителя)\n\nTask 2: ${keys(m.board)}  \nTask 3: ${keys(m.boardHard)}  \n${m.trap ? `Task 4: ${m.trap.a}` : ""}\n`;
      return md;
    }
    if (W) {
      md += `### 📖 Task 1. New words\n\n${W.w.map(w => `- **${w[0]}** — ${w[1]}`).join("\n")}\n\n`;
      const tr = shuffle(m.r, m.match);
      md += `### 🔓 Task 2. Match\n\n${m.match.map((w, k) => `${k + 1}) ${w[0]}`).join("  \n")}\n\n${tr.map((w, k) => `${"abcdef"[k]}) ${w[1]}`).join("  \n")}\n\n`;
      md += `### 🔓 Task 3. Fill in the gaps\n\n*Words: ${shuffle(m.r, m.gapW).map(w => w[0]).join(", ")}*\n\n${m.gapW.map((w, k) => `${k + 1}) ${blankW(w)}`).join("  \n")}\n\n`;
      md += `### 📗 Task 4. Read and answer: True or False?\n\n${W.text}\n\n${W.tf.map((x, k) => `${k + 1}) ${x[0]} ____`).join("  \n")}\n\n`;
      md += `### ⭐ Task 5. Speak\n\n${W.speak}\n\n*Опора:* ${W.ph.join(" / ")}\n\n`;
      md += `### 🪞 Self-assessment\n\n☐ I can do it myself  ☐ I need help  ☐ I need more practice\n\n---\n\n## 🔑 Answers (для учителя)\n\nTask 2: ${m.match.map((w, k) => `${k + 1}–${"abcdef"[tr.indexOf(w)]}`).join(", ")}  \nTask 3: ${gapKey(m.gapW)}  \nTask 4: ${W.tf.map((x, k) => `${k + 1}) ${x[1] ? "True" : "False"}`).join("; ")}\n`;
      return md;
    }
    return md + `### Task 1\n\n____________________\n\n### Task 2\n\n____________________\n`;
  }

  /* ---------- доп. листы ---------- */
  function extra(kind, p, type, o = {}) {
    const m = material(p), f = m.f, W = m.W;
    if (!f && !W) return `# ${kind === "memo" ? "Памятка" : kind === "homework" ? "Домашнее задание" : "Проверочная работа"}\n\n**Тема:** ${p.topic}\n\n1. ____________________\n\n2. ____________________\n\n3. ____________________\n`;
    if (kind === "control") {
      const name = { self: "Самостоятельная работа", check: "Проверочная работа", test: "Контрольная работа" }[o.ctrl || "self"];
      let md = `# ${name}\n\n**Тема:** ${p.topic} · **Класс:** ${p.grade}\n\n`;
      if (f) { const vs = o.variants && o.ctrl !== "self" ? [m.v1, m.v2] : [m.v1]; vs.forEach((v, i) => { md += `${vs.length > 1 ? `## Вариант ${i + 1}\n\n` : ""}✍️ Name: ___________________________ | 📅 Date: _________\n\n${v.map((x, k) => `**${k + 1}.** ${x.q}\n\n[ ________________________________________ ]`).join("\n\n")}\n\n`; }); md += `---\n\n**Критерии:** «5» — ${m.v1.length} верных, «4» — ${m.v1.length - 1}, «3» — ${m.v1.length - 2}.\n\n`; if (o.keys !== false) md += `# Ключи (для учителя)\n\n${vs.map((v, i) => `- ${vs.length > 1 ? `Вариант ${i + 1}: ` : ""}${keys(v)}`).join("\n")}\n`; return md; }
      md += `✍️ Name: ___________________________ | 📅 Date: _________\n\n**1. Переведите на английский:** ${m.trW.map(w => w[1]).join(", ")}\n\n[ ________________________________________ ]\n\n**2. Вставьте слова:**\n\n${m.gapW.map((w, k) => `${k + 1}) ${blankW(w)}`).join("  \n")}\n\n---\n\n**Критерии:** 11 баллов; «5» — 10–11, «4» — 8–9, «3» — 6–7.\n\n${o.keys !== false ? `# Ключи (для учителя)\n\n1) ${m.trW.map(w => w[0]).join(", ")}  \n2) ${gapKey(m.gapW)}\n` : ""}`;
      return md;
    }
    if (kind === "memo") return f ? `# Памятка\n\n**Тема:** ${p.topic}\n\n## 📐 Правило\n\n${f.rule.map(x => "- " + x).join("\n")}\n\n## ✍️ Образцы\n\n${m.obs.map(x => "- " + (x.full || x.q.replace(/\(([^)]*)\)/, x.a).replace(/___/, x.a))).join("\n")}\n\n## ⚠️ Не ошибись\n\n${f.mistakes.map(x => "- " + x).join("\n")}\n` : `# Памятка\n\n**Тема:** ${W.t}\n\n## 📖 Слова\n\n${W.w.map(w => `- **${w[0]}** — ${w[1]}`).join("\n")}\n\n## 💬 Фразы для диалога\n\n${W.ph.map(x => "- " + x).join("\n")}\n`;
    if (kind === "homework") return f ? `# Homework\n\n**Тема:** ${p.topic} · **Класс:** ${p.grade}\n\n> 📐 ${f.rule[1] || f.rule[0]}\n\n## Базовый уровень\n\n${list(m.hw, "  \n")}\n\n## Повышенный уровень\n\n${list(m.hwHard, "  \n")}\n\n---\n\n**🔑 Ключ (для учителя):** ${keys(m.hw)}; ${keys(m.hwHard)}\n` : `# Homework\n\n**Тема:** ${W.t} · **Класс:** ${p.grade}\n\n## Базовый уровень\n\n1) Выучите слова: ${W.w.map(w => w[0]).join(", ")}.  \n2) Вставьте слова в предложения:\n\n${shuffle(m.r, W.w).slice(0, 5).map((w, k) => `${k + 1}) ${blankW(w)}`).join("  \n")}\n\n## Повышенный уровень\n\n${W.speak}\n`;
    return "";
  }

  /* ---------- презентация ---------- */
  function cards(p, type) {
    const m = material(p), f = m.f, W = m.W, c = []; let n = 0;
    const add = x => c.push({ id: "e" + (++n), on: true, ...x });
    add({ kind: "title", title: p.topic, points: [`${p.grade} класс · Английский язык`], img: W ? W.t.replace(/^.*\(|\)$/g, "") : "" });
    { const H = Subjects.hw(p); if (type.id !== "ctrl" && H?.key) add({ kind: "cards", title: "Check your homework", points: H.key.split(/\n|;\s*/).filter(Boolean).slice(0, 8), notes: `Было задано: ${H.what.replace(/\n/g, " ")}` }); }
    if (f) {
      add({ kind: "list", title: "Warm-up", points: m.oral.map(x => x.q), notes: `Ответы: ${keys(m.oral)}` });
      add({ kind: "big", title: "Let's talk", lead: f.sit, notes: "Ученики отвечают; учитель записывает ответы — подводим к теме урока." });
      add({ kind: "list", title: "Look and think", points: m.obs.map(x => x.full || x.q.replace(/\(([^)]*)\)/, `**${x.a}**`).replace(/___/, `**${x.a}**`)), notes: f.notice });
      add({ kind: "cards", title: "Rule", points: f.rule, notes: "На слайд — после того, как ученики сформулировали правило." });
      add({ kind: "list", title: "Practice", points: m.board.map(x => x.q), notes: `Ответы: ${keys(m.board)}` });
      add({ kind: "list", title: "Your turn", points: m.boardHard.map(x => x.q), notes: `Ответы: ${keys(m.boardHard)}` });
      if (m.trap) add({ kind: "big", title: "Find the mistake", lead: m.trap.q, notes: `Верно: ${m.trap.a}` });
      add({ kind: "big", title: "Speaking", lead: f.speak });
      add({ kind: "cards", title: "Check yourself", points: [`В-1: ${keys(m.v1)}`, `В-2: ${keys(m.v2)}`] });
      add({ kind: "hw", title: "Homework", points: [`Базовый уровень: ${m.hw.map((x, i) => `${i + 1}) ${x.q}`).join("  ")}`, `Повышенный уровень: ${m.hwHard.map((x, i) => `${i + 1}) ${x.q}`).join("  ")}`] });
    } else if (W) {
      add({ kind: "big", title: "What are we going to talk about?", lead: W.t, img: W.t.replace(/^.*\(|\)$/g, "") });
      for (let i = 0; i < W.w.length; i += 4) add({ kind: "glossary", title: "New words", items: W.w.slice(i, i + 4).map(w => ({ word: w[0], def: `${w[1]} — ${w[2]}` })), img: W.w[i][0] });
      add({ kind: "list", title: "Fill in the gaps", points: m.gapW.map(w => blankW(w)), notes: `Ответы: ${gapKey(m.gapW)}` });
      if (type.id === "read") { add({ kind: "fragment", title: "Read the text", text: W.text }); add({ kind: "list", title: "True or False?", points: W.tf.map(x => x[0]), notes: W.tf.map((x, k) => `${k + 1}) ${x[1] ? "T" : "F"}`).join(" ") }); }
      add({ kind: "cards", title: "Let's speak", points: W.ph });
      add({ kind: "big", title: "Speaking", lead: W.speak });
      add({ kind: "hw", title: "Homework", points: ["Выучить слова темы; 5 предложений с новыми словами", W.speak] });
    }
    add({ kind: "list", title: "Reflection", points: ["What have we learnt today?", "I can do it myself / I need help / I need more practice"] });
    return c;
  }

  /* ---------- задание для нейросети ---------- */
  function prompt(kind, p, type, draft) {
    const m = material(p), f = m.f, W = m.W;
    const base = `Ты — опытный учитель английского языка и методист. Урок: «${p.topic}», ${p.grade} класс, ${p.duration} мин, тип: ${type.name}.
Методика: коммуникативно-деятельностный подход ФГОС; этапы: ${type.stages.join(" → ")}.
Обязательно: речевая разминка; проверка д/з (только по тому, что действительно задавали); грамматику вводим индуктивно (примеры в ситуации → наблюдение → ученики формулируют правило → схема → проверка понимания), лексику — с картинками, в контексте, с проверкой понимания и фонетической отработкой; упражнения от тренировочных к речевым; работа в парах; рефлексия; д/з двух уровней. Английские предложения пиши грамотно, указывай ответы.${p.wishes ? `\nПожелания учителя: ${p.wishes}` : ""}`;
    const H = Subjects.hw(p);
    const fx = (f ? `\nПравило: ${f.rule.join(" ")}\nПримеры: ${m.obs.map(qa).join("; ")}\nУпражнения (с ответами, проверены): ${[...m.board, ...m.boardHard].map(qa).join("; ")}\nСамостоятельная В-1: ${m.v1.map(qa).join("; ")}; В-2: ${m.v2.map(qa).join("; ")}\nД/з: ${[...m.hw, ...m.hwHard].map(qa).join("; ")}` : W ? `\nСлова: ${W.w.map(w => `${w[0]} — ${w[1]} (${w[2]})`).join("; ")}\nФразы: ${W.ph.join(" ")}\nТекст: ${W.text}` : "") + (H ? `\nД/з прошлого урока (проверить): ${H.what}${H.key ? `; ответы: ${H.key}` : ""}` : "\nСведений о прошлом д/з нет: проверку д/з сделай формальной, без выдуманных заданий.");
    const fmt = { conspect: "Составь технологическую карту урока в Markdown: шапка, план, таблица «Этап | Деятельность учителя (реплики) | Деятельность учащихся | Задания / УУД».", lesson: "Составь подробный конспект урока в Markdown: по этапам, с репликами учителя (на английском, с переводом трудных фраз), ожидаемыми ответами учеников, заданиями и ключами.", worksheet: "Составь рабочий лист ученика (Worksheet) в Markdown: задания от простых к сложным, в конце — ответы для учителя." }[kind] || "";
    return `${base}${fx}\n\n${fmt}\nВерни только документ.${draft ? `\n\nЧерновик сайта (улучши его, структуру и проверенные ответы сохрани):\n${draft.slice(0, 6000)}` : ""}`;
  }

  return { id: "eng", name: "Английский язык", topics, detectType, conspect, lesson, worksheet, extra, cards, prompt, family, vocab, TYPES, families: F };
})();
window.EngKit = EngKit;
