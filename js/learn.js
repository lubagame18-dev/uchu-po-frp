/* ===================================================================
   «Учу по ФРП» — самообучение без ИИ.
   Система читает разработки уроков и методички (встроенные и загруженные
   пользователем) и извлекает из них:
     • вопросы и их типы (методика вопросов — из файлов, не выдумывается);
     • структуры уроков (этапы и шаги) по типам уроков;
     • приёмы и форматы заданий;
     • отдельные уроки из сборников планов-конспектов («УРОК № 5. Тема…»).
   Знания пересобираются автоматически, когда меняется набор материалов.
   Каждое обновление — версия: видно, что добавилось, и его можно откатить.
   =================================================================== */
const Learn = (() => {
  "use strict";

  /* ---------- Типы вопросов. Источник — разработки уроков из базы ---------- */
  // Э/С/Ф — «вопросы на разные сферы восприятия» (урок Лукьяновой по Ахматовой);
  // смысл/подтекст и комментарии — комментированное чтение (Рожкова, «Поединок»);
  // чтение и интонация — исполнительский анализ («Анчар»); контекст, проблема — уроки по Мандельштаму и Маяковскому.
  const CATS = {
    E: { label: "Эмоции (Э)", src: "урок Лукьяновой: вопросы на сферы восприятия", re: /(чувств|эмоци|настроени|пережива|впечатлени|волну|трога|груст|радост|тревог|страх|печал|нежн|боль|отклик|задел|понравил|удивил)/i },
    S: { label: "Представление, воображение (С)", src: "урок Лукьяновой: вопросы на сферы восприятия", re: /(представ(ьте|ля)|вообраз|видите|слышите|рису(ет|ется|ем)|картин|мысленн|цвет|звук|запах|кадр|увидел|услышал|как выгляд)/i },
    F: { label: "Форма и средства (Ф)", src: "урок Лукьяновой: вопросы на сферы восприятия", re: /(средств|при[её]м|эпитет|метафор|сравнени|олицетвор|антитез|анафор|повтор|рифм|размер|ритм|строф|строк|звукопис|аллитерац|лексик|слов[оа]? (выбран|подобран|употреблен)|ключев[A-Za-z0-9_А-Яа-яЁё]* слов|интонац|глагол|прилагательн|местоимени|знак|тире|многоточ|синтаксис|жанр)/i },
    M: { label: "Смысл и подтекст", src: "комментированное чтение (Рожкова, «Поединок»)", re: /(смысл|значит|означа|подтекст|символ|иде[яиюей]|главн[A-Za-z0-9_А-Яа-яЁё]* мысл|почему автор|зачем автор|как понимаете|что хотел сказать|о ч[её]м (же )?(это|стихотворени|произведени)|на самом деле|скрыт)/i },
    K: { label: "Контекст: эпоха и биография", src: "уроки по Мандельштаму и Маяковскому", re: /(эпох|истори|биограф|современник|время|век[ае]?(?:(?<=[A-Za-z0-9_А-Яа-яЁё])(?![A-Za-z0-9_А-Яа-яЁё])|(?<![A-Za-z0-9_А-Яа-яЁё])(?=[A-Za-z0-9_А-Яа-яЁё]))|судьб|обстоятельств|написан|создан|в ссылке|период|годы)/i },
    C: { label: "Сопоставление", src: "урок Лукьяновой: сопоставительный анализ", re: /(сравн|сопостав|общего|отлича|различ|сходств|похож|перекликается|в отличие)/i },
    P: { label: "Проблемный вопрос", src: "урок по Мандельштаму: проблемный вопрос", re: /(можно ли|прав ли|согласны ли|оправда|виноват|кто прав|спор|проблем|что важнее|достоин|кто сильнее|возможно ли)/i },
    L: { label: "Личный опыт", src: "урок Лукьяновой: ориентация на личностный опыт", re: /((?:(?<=[A-Za-z0-9_А-Яа-яЁё])(?![A-Za-z0-9_А-Яа-яЁё])|(?<![A-Za-z0-9_А-Яа-яЁё])(?=[A-Za-z0-9_А-Яа-яЁё]))вы(?:(?<=[A-Za-z0-9_А-Яа-яЁё])(?![A-Za-z0-9_А-Яа-яЁё])|(?<![A-Za-z0-9_А-Яа-яЁё])(?=[A-Za-z0-9_А-Яа-яЁё]))|(?:(?<=[A-Za-z0-9_А-Яа-яЁё])(?![A-Za-z0-9_А-Яа-яЁё])|(?<![A-Za-z0-9_А-Яа-яЁё])(?=[A-Za-z0-9_А-Яа-яЁё]))вас(?:(?<=[A-Za-z0-9_А-Яа-яЁё])(?![A-Za-z0-9_А-Яа-яЁё])|(?<![A-Za-z0-9_А-Яа-яЁё])(?=[A-Za-z0-9_А-Яа-яЁё]))|(?:(?<=[A-Za-z0-9_А-Яа-яЁё])(?![A-Za-z0-9_А-Яа-яЁё])|(?<![A-Za-z0-9_А-Яа-яЁё])(?=[A-Za-z0-9_А-Яа-яЁё]))вам(?:(?<=[A-Za-z0-9_А-Яа-яЁё])(?![A-Za-z0-9_А-Яа-яЁё])|(?<![A-Za-z0-9_А-Яа-яЁё])(?=[A-Za-z0-9_А-Яа-яЁё]))|(?:(?<=[A-Za-z0-9_А-Яа-яЁё])(?![A-Za-z0-9_А-Яа-яЁё])|(?<![A-Za-z0-9_А-Яа-яЁё])(?=[A-Za-z0-9_А-Яа-яЁё]))ваш|у вас|в вашей|вы бы|на вашем месте|любите ли|задумывались ли)/i },
    R: { label: "Чтение и интонация", src: "исполнительский анализ («Анчар»)", re: /(как (следует |нужно |надо |бы )?(читать|прочитать|прочесть)|читать (эт|кажд|вслух)|интонаци|пауз|логическ[A-Za-z0-9_А-Яа-яЁё]* ударени|темп(?:(?<=[A-Za-z0-9_А-Яа-яЁё])(?![A-Za-z0-9_А-Яа-яЁё])|(?<![A-Za-z0-9_А-Яа-яЁё])(?=[A-Za-z0-9_А-Яа-яЁё]))|голосом|выразительн[A-Za-z0-9_А-Яа-яЁё]* чтени)/i },
    H: { label: "Герой и поступок", src: "комментированное чтение («Капитанская дочка»)", re: /(геро[йяюе]|персонаж|поступ|характер|выбор|почему (он|она)|как (он|она) |поведени|честь|совест)/i },
    T: { label: "Композиция", src: "монографический урок (Подорова, «Послушайте!»)", re: /(композиц|част[ьи] |финал|начал[оа]|кульминац|развязк|завязк|эпизод|сцен[аеу]|кольцев|перелом|построен)/i }
  };
  const ORDER = ["R", "E", "S", "F", "T", "M", "H", "C", "K", "P", "L"];
  function classify(q) {
    const s = String(q);
    // от частного к общему: сначала узкие признаки
    for (const k of ["R", "C", "P", "F", "S", "E", "T", "H", "K", "M", "L"]) if (CATS[k].re.test(s)) return k;
    return "M";
  }

  /* ---------- Разбор текста ---------- */
  // Деление на предложения, не разрывая инициалы («А. С. Пушкин»), «т. е.», «XIX в.»
  function sentences(text) {
    const PROT = "\u0001";
    const t = String(text || "")
      .replace(/(?:(?<=[A-Za-z0-9_А-Яа-яЁё])(?![A-Za-z0-9_А-Яа-яЁё])|(?<![A-Za-z0-9_А-Яа-яЁё])(?=[A-Za-z0-9_А-Яа-яЁё]))([А-ЯЁA-Z])\.\s?(?=[А-ЯЁA-Z][.а-яё])/g, "$1" + PROT)
      .replace(/(?:(?<=[A-Za-z0-9_А-Яа-яЁё])(?![A-Za-z0-9_А-Яа-яЁё])|(?<![A-Za-z0-9_А-Яа-яЁё])(?=[A-Za-z0-9_А-Яа-яЁё]))(т|е|д|п|г|гг|вв|в|с|см|стр|др|пр|им|ул|изд|рис|ср|напр|т\.\s?е|т\.\s?д|т\.\s?п)\.(?=\s*[а-яё0-9,;)])/gi, "$1" + PROT)
      .replace(/(\d)\.(?=\d)/g, "$1" + PROT);
    return t.split(/(?<=[.!?…])\s+(?=[«"—–(]?\s*[А-ЯЁA-Z0-9])|\n+/).map(s => s.replace(new RegExp(PROT, "g"), ".").trim()).filter(Boolean);
  }
  const QSTART = /^(как|какой|какая|какое|какие|каким|какую|каков|какова|каково|каковы|почему|зачем|отчего|что|чем|чему|чего|о ч[её]м|в ч[её]м|на ч[её]м|с ч[её]м|где|когда|куда|откуда|кто|кого|кому|кем|сколько|можно ли|можем ли|согласны ли|прав ли|права ли|есть ли|был ли|была ли|было ли|были ли|задумывались ли|любите ли|удалось ли|как вы думаете|как вы считаете|как по-вашему|по-вашему|по вашему мнению|представьте|вообразите|если бы|найдите|объясните|докажите|сравните|сопоставьте|назовите|определите|подумайте)/i;
  const PRON = /(^|[^а-яё])(он|она|оно|они|его|её|ее|их|ему|ей|им|него|неё|нему|ней|ним|ними|нём|нем|сам|сама)(?=[^а-яё]|$)/i;
  const ARCH = /(^|[^а-яё])(али|аль|иль|уж|ль|сей|сия|доколе|отколе|кабы|ужель|нешто|ваше величество)(?=[^а-яё]|$)/i;
  const GENERIC_NOUN = /(стихотворени|произведени|текст|автор|поэт|писател|геро|персонаж|строф|строк|финал|образ|эпизод|настроени|слов|картин|част[ьи]|рассказ|роман|повест|поэм|пьес|сцен|глав|заглави|назван|интонац|средств|при[её]м|вопрос|урок|чтени|жанр|лирическ|мысл|смысл|чувств|тем[аеуы](?:(?<=[A-Za-z0-9_А-Яа-яЁё])(?![A-Za-z0-9_А-Яа-яЁё])|(?<![A-Za-z0-9_А-Яа-яЁё])(?=[A-Za-z0-9_А-Яа-яЁё]))|идея|иде[июе])/i;
  const THIS_OK = /(эт(от|а|о|и|у|ой|ом|их|им|ими))\s+([а-яё]+)/gi;
  const THIS_NOUN = /^(стихотворени|произведени|текст|эпизод|рассказ|роман|повест|поэм|пьес|строф|глав|сцен|урок|геро|образ|финал|автор|поэт|писател|част)/i;
  const CONTEXT = /(^|[^а-яё])(так(ой|ая|ое|ие|ую|им|их|ого)|данн(ый|ая|ое|ом|ой)|здесь|тут|вышеуказ)(?=[^а-яё]|$)/i;

  /* Вопрос годится как образец методики для любого произведения? */
  const ORG = /(нет на уроке|цел[ьи] (нашего )?урока|тем[ау] урока|записали|домашн|откройте|готовы ли|что мы (сегодня )?(будем|узнаем)|чему мы научились)/i;
  /* Слова, обычные для вопросов о любом произведении; если в вопросе больше одного «особого» слова
     (сицилийская лошадка, пропавшая грамота), он привязан к конкретному тексту и как образец не годится */
  const COMMON = ["стихотв", "произв", "текст", "автор", "поэт", "писат", "геро", "персон", "строф", "строк", "финал", "образ", "эпизод", "настро", "заглав", "назван", "приём", "прием", "средств", "чувств", "мысл", "смысл", "иде", "тем", "част", "начал", "конц", "главн", "основн", "важн", "ключев", "особен", "сильн", "слов", "картин", "детал", "портрет", "пейзаж", "мир", "жизн", "любов", "природ", "челов", "читат", "книг", "литерат", "лирич", "эпитет", "метафор", "сравнен", "олицетв", "антитез", "повтор", "интонац", "ритм", "рифм", "размер", "композ", "сюжет", "конфлик", "кульмин", "развяз", "заверш", "отношен", "поступ", "характ", "судьб", "выбор", "чест", "совест", "добр", "красот", "правд", "свобод", "родин", "врем", "эпох", "истор", "событ", "вопрос", "ответ", "урок", "класс", "мнен", "впечатл", "эмоц", "радост", "груст", "тревог", "надежд", "состоян", "душ", "сердц", "голос", "звук", "цвет", "свет", "говор", "показ", "раскры", "помог", "созда", "изобра", "чита", "дума", "счита", "звуч", "меня", "вызыв", "связ", "отлича", "сравн", "объясн", "относ", "види", "видит", "представ", "рису", "поним", "значи", "означ", "выраж", "переда", "подчерк", "исполь", "стро", "заканч", "начина", "отраж", "волну", "оста", "происх", "проявл", "характер", "оцени", "хоч", "мож", "долж", "кажет", "прочит", "получ", "найд", "подтвер", "докаж", "согла", "почему", "какое", "какая", "какой", "каким", "какие", "каков", "котор", "снача", "потом", "сегод", "вашем", "вашей", "ваших", "своей", "своего", "свою", "другой", "других", "разных", "разные", "общего", "общее", "сходст", "различ", "похож", "лучше", "больше", "сильнее", "самым", "самое", "самый", "вообще", "сейчас", "сегодня", "зовут", "извест", "знаем", "знает", "собой", "между", "через", "после", "перед", "автору", "своим", "своих", "своё", "свое", "почем", "откуда", "зачем", "каждой", "каждый", "каждая", "нашей", "наших", "вокруг", "внутр", "чтени", "прочт", "вызвал", "первое", "последн", "сначал", "второ"];
  const specific = q => (q.toLowerCase().replace(/ё/g, "е").match(/[а-я]{5,}/g) || []).filter(w => !COMMON.some(c => w.startsWith(c))).length;
  function isGeneric(q) {
    if (q.length < 18 || q.length > 120) return false;
    if (/[А-ЯЁ]\.\s?([А-ЯЁ]\.\s?)?[А-ЯЁ][а-яё]+/.test(q)) return false; // инициалы и фамилии
    if (specific(q) > 0) return false;
    if (q.split(/\s+/).length < 4 || /^(как вы думаете|как вы считаете|по-вашему),?\s*(почему|зачем|что)\?$/i.test(q)) return false; // вопрос без предмета
    if (/(изобразили|нарисовали|выбрали бы)\?$/.test(q) && q.split(/\s+/).length < 6) return false;
    if (ORG.test(q)) return false;
    if (!QSTART.test(q)) return false;
    if (/[«"“]|\d{3,}/.test(q)) return false;                 // цитаты, даты
    if (/[а-яё,;:]\s+[А-ЯЁ][а-яё]{2,}/.test(q.slice(1))) return false; // имена собственные внутри
    if (ARCH.test(q) || PRON.test(q)) return false;           // реплики из текста и вопросы, понятные только в контексте
    if (CONTEXT.test(q)) return false;
    let thisOk = true;
    for (const m of q.matchAll(THIS_OK)) if (!THIS_NOUN.test(m[3])) thisOk = false;
    if (!thisOk) return false;
    return GENERIC_NOUN.test(q) || /((?:(?<=[A-Za-z0-9_А-Яа-яЁё])(?![A-Za-z0-9_А-Яа-яЁё])|(?<![A-Za-z0-9_А-Яа-яЁё])(?=[A-Za-z0-9_А-Яа-яЁё]))вы(?:(?<=[A-Za-z0-9_А-Яа-яЁё])(?![A-Za-z0-9_А-Яа-яЁё])|(?<![A-Za-z0-9_А-Яа-яЁё])(?=[A-Za-z0-9_А-Яа-яЁё]))|(?:(?<=[A-Za-z0-9_А-Яа-яЁё])(?![A-Za-z0-9_А-Яа-яЁё])|(?<![A-Za-z0-9_А-Яа-яЁё])(?=[A-Za-z0-9_А-Яа-яЁё]))вас(?:(?<=[A-Za-z0-9_А-Яа-яЁё])(?![A-Za-z0-9_А-Яа-яЁё])|(?<![A-Za-z0-9_А-Яа-яЁё])(?=[A-Za-z0-9_А-Яа-яЁё]))|(?:(?<=[A-Za-z0-9_А-Яа-яЁё])(?![A-Za-z0-9_А-Яа-яЁё])|(?<![A-Za-z0-9_А-Яа-яЁё])(?=[A-Za-z0-9_А-Яа-яЁё]))вам(?:(?<=[A-Za-z0-9_А-Яа-яЁё])(?![A-Za-z0-9_А-Яа-яЁё])|(?<![A-Za-z0-9_А-Яа-яЁё])(?=[A-Za-z0-9_А-Яа-яЁё]))|(?:(?<=[A-Za-z0-9_А-Яа-яЁё])(?![A-Za-z0-9_А-Яа-яЁё])|(?<![A-Za-z0-9_А-Яа-яЁё])(?=[A-Za-z0-9_А-Яа-яЁё]))ваш)/i.test(q);
  }
  /* Все вопросы из текста; таблицы (| … |) и маркеры списков не мешают */
  function questionsFrom(text, src) {
    const flat = String(text || "").replace(/[+=]{4,}|-{5,}/g, "\n").replace(/\s*\|\s*/g, "\n").replace(/^[\s•·*–—-]+/gm, "");
    const out = [], seen = new Set();
    for (let s of sentences(flat)) {
      s = s.replace(/^(\d{1,2}[.)]|[а-е]\)|[IVX]+\.)\s*/, "").replace(/^(Учитель|У|Уч\.)\s*[:.]\s*/i, "").replace(/^[—–-]\s*/, "").trim();
      if (!s.endsWith("?") || s.length < 15 || s.length > 260) continue;
      if (!/^[«"(]?[А-ЯЁA-Z]/.test(s)) continue;
      const k = s.toLowerCase(); if (seen.has(k)) continue; seen.add(k);
      out.push({ text: s, cat: classify(s), generic: isGeneric(s), src });
    }
    return out;
  }
  /* Зачины вопросов («Как вы думаете,», «Представьте,») — для разнообразия формулировок */
  function openerOf(q) {
    const m = q.match(/^(как вы думаете|как вы считаете|как по-вашему|по-вашему|по вашему мнению|представьте|вообразите|подумайте|обратите внимание|давайте|попробуйте)[,!:]?/i);
    return m ? m[0].replace(/[,!:]$/, "") : null;
  }

  /* Этапы урока: «I. Организационный этап», «2. Беседа», строки таблицы техкарты, «а) …» */
  function stagesFrom(text) {
    const lines = String(text || "").split("\n").map(l => l.replace(/^\|\s*|\s*\|.*$/g, "").trim()).filter(Boolean);
    const main = [], sub = [];
    let cur = null;
    for (const l of lines) {
      let m = l.match(/^([IVX]{1,5})\.\s+(.{3,90})$/);
      if (m && !/[?]$/.test(m[2])) {
        if (main.some(x => x.name === m[2].replace(/[.:]$/, "")) || (cur && /домашн/i.test(cur.name))) break; // начался следующий урок
        cur = { name: m[2].replace(/[.:]$/, ""), steps: [] }; main.push(cur); continue;
      }
      m = l.match(/^(\d{1,2})\.\s+([А-ЯЁ][^.?!]{3,80})\.?$/);
      if (m && cur && !/[?]/.test(m[2]) && cur.steps.length < 12) { cur.steps.push(m[2]); continue; }
      m = l.match(/^[а-е]\)\s*([А-ЯЁ][^?]{3,90})$/);
      if (m && cur && cur.steps.length < 12) { cur.steps.push(m[1].replace(/[.]$/, "")); continue; }
    }
    // запасной вариант — первый столбец техкарты «Этап урока»
    if (main.length < 3) {
      const rows = String(text || "").split("\n").filter(l => /^\|/.test(l)).map(l => l.split("|")[1]?.trim()).filter(x => x && x.length > 3 && x.length < 90 && !/^[-=+]+$/.test(x) && !/этап урока/i.test(x));
      const uniq = [...new Set(rows)];
      if (uniq.length >= 3) return uniq.slice(0, 14).map(name => ({ name, steps: [] }));
    }
    sub.length = 0;
    return main;
  }

  /* Приёмы: известные названия из методбазы + «приём „…“» в тексте */
  const KNOWN_TECH = [
    ["Эмоциональная установка", /эмоциональн[A-Za-z0-9_А-Яа-яЁё]* установк/i], ["Ассоциативный ряд", /ассоциати/i], ["Целевая установка на чтение (ЦУ)", /(?:(?<=[A-Za-z0-9_А-Яа-яЁё])(?![A-Za-z0-9_А-Яа-яЁё])|(?<![A-Za-z0-9_А-Яа-яЁё])(?=[A-Za-z0-9_А-Яа-яЁё]))ЦУ(?:(?<=[A-Za-z0-9_А-Яа-яЁё])(?![A-Za-z0-9_А-Яа-яЁё])|(?<![A-Za-z0-9_А-Яа-яЁё])(?=[A-Za-z0-9_А-Яа-яЁё]))|целев[A-Za-z0-9_А-Яа-яЁё]* установк/i],
    ["Одно слово после чтения", /одно слово/i], ["Вопросы на сферы восприятия", /сфер[A-Za-z0-9_А-Яа-яЁё]* восприятия/i], ["Цветовые ассоциации", /цветов[A-Za-z0-9_А-Яа-яЁё]* ассоциац/i],
    ["Творческая деформация / прогнозирование", /творческ[A-Za-z0-9_А-Яа-яЁё]* деформац|прогнозировани/i], ["Колесо эмоций Плутчика", /плутчик/i], ["Бинарные оппозиции", /бинарн[A-Za-z0-9_А-Яа-яЁё]* оппозиц/i],
    ["Кластер", /кластер/i], ["Партитура чтения", /партитур/i], ["Диалог искусств", /диалог искусств/i], ["Сопоставительный анализ", /сопоставительн[A-Za-z0-9_А-Яа-яЁё]* анализ/i],
    ["Сильная позиция текста", /сильн[A-Za-z0-9_А-Яа-яЁё]* позици/i], ["Незаконченное предложение", /незаконченн[A-Za-z0-9_А-Яа-яЁё]* предложени/i], ["Синквейн", /синквейн/i],
    ["Цитатная схема-конспект", /цитатн[A-Za-z0-9_А-Яа-яЁё]* (схем|план)/i], ["Опережающее задание", /опережающ[A-Za-z0-9_А-Яа-яЁё]* задани/i], ["Работа в парах/группах", /работа в (парах|группах)/i],
    ["Слушание творческих работ", /слушание .{0,20}творческих работ/i], ["Аналитическая беседа", /аналитическ[A-Za-z0-9_А-Яа-яЁё]* беседа/i], ["Тезисы лекции", /тезис/i],
    ["Комментированное чтение", /комментированн[A-Za-z0-9_А-Яа-яЁё]* чтени/i], ["Исполнительский анализ", /исполнительск[A-Za-z0-9_А-Яа-яЁё]* (анализ|задач)/i], ["Работа с эпиграфом", /эпиграф/i]
  ];
  function techniquesFrom(text) {
    const out = new Set();
    for (const [name, re] of KNOWN_TECH) if (re.test(text)) out.add(name);
    for (const m of String(text).matchAll(/при[её]м[A-Za-z0-9_А-Яа-яЁё]*\s+«([^»]{3,40})»/gi)) out.add(m[1].charAt(0).toUpperCase() + m[1].slice(1));
    return [...out];
  }

  /* ---------- Отдельные уроки из сборника («УРОК № 5 / Тема. …») и одиночные разработки ---------- */
  function splitLessons(m) {
    const text = String(m.text || "");
    const marks = [...text.matchAll(/^\s*УРОК(?:И)?\s*№\s*(\d{1,3})(?:\s*[–-]\s*(\d{1,3}))?\s*$/gm)];
    const segs = [];
    if (m.collection && marks.length >= 3) {
      marks.forEach((mk, k) => {
        const body = text.slice(mk.index, k + 1 < marks.length ? marks[k + 1].index : text.length);
        const topic = (body.match(/Тема\s*[.:]\s*([^\n]+(?:\n(?![A-ZА-ЯЁ][а-яё]+\s*:)[^\n]{0,120})?)/) || [])[1];
        if (!topic) return;
        segs.push(lessonRecord(m, body, topic.replace(/\s+/g, " ").trim(), +mk[1]));
      });
    } else {
      const topic = m.topic || (text.match(/Тема(?: урока)?\s*[.:]\s*([^\n]{5,200})/i) || [])[1] || m.title || m.name;
      segs.push(lessonRecord(m, text, String(topic).trim(), null));
    }
    return segs;
  }
  function lessonRecord(m, body, topic, num) {
    const typeLine = (body.match(/Тип урока\s*:?\s*([^\n]{3,160})/i) || [])[1] || "";
    const goal = (body.match(/Цель\s*:?\s*([^\n]{10,400})/i) || [])[1] || "";
    const epi = (body.match(/\n((?:[^\n]{8,80}\n){1,10})([А-ЯЁ]\.\s?(?:[А-ЯЁ]\.\s?)?[А-ЯЁ][а-яё]+)\s*\nХОД УРОКА/) || []);
    return {
      id: m.id + (num ? "#" + num : ""), src: m.author ? `${m.author}${m.grade ? `, ${m.grade} кл.` : ""}` : String(m.title || m.name).slice(0, 70), srcId: m.id, num, topic, grade: m.grade || null, subject: m.subject || "lit",
      typeLine, goal: goal.trim(), epigraph: epi[1] ? { text: epi[1].trim(), author: epi[2] } : null,
      stages: stagesFrom(body), questions: questionsFrom(body, (m.title || m.name) + (num ? `, урок № ${num}` : "")), techniques: techniquesFrom(body), text: body
    };
  }

  /* ---------- Сборка знаний ---------- */
  const KEY = "learn:state", HIST = "learn:versions";
  let K = null; // текущие знания (в памяти)
  function sourcesNow() {
    const mats = (typeof state !== "undefined" ? state.materials : []).filter(m => !m.scanned && m.text && /^(lesson|method)$/.test(m.kind));
    const base = ((window.UCHU_BASE && window.UCHU_BASE.lessons) || []).map((l, i) => ({ id: "base-lesson-" + i, title: l.title, name: l.title, text: l.t, kind: "lesson", subject: "lit", grade: l.grade, topic: l.title, builtin: true, baseType: l.type }));
    const seen = new Set(), out = [];
    for (const m of [...base, ...mats]) { if (seen.has(m.id)) continue; seen.add(m.id); out.push(m); }
    return out;
  }
  function build(excluded = []) {
    const ex = new Set(excluded);
    const src = sourcesNow().filter(m => !ex.has(m.id));
    const lessons = [], questions = [], techniques = new Map(), openers = {}, structures = {}, perSource = {};
    for (const m of src) {
      const segs = splitLessons(m);
      let qn = 0, sn = 0;
      for (const s of segs) {
        lessons.push(s);
        s.questions.forEach(q => { questions.push(q); qn++; const o = openerOf(q.text); if (o) { openers[q.cat] = openers[q.cat] || {}; openers[q.cat][o] = (openers[q.cat][o] || 0) + 1; } });
        s.techniques.forEach(t => { if (!techniques.has(t)) techniques.set(t, new Set()); techniques.get(t).add(m.title || m.name); });
        if (s.stages.length >= 3) {
          const tid = typeIdFor(s, m);
          structures[tid] = structures[tid] || [];
          if (structures[tid].length < 40) structures[tid].push({ stages: s.stages, src: s.src + (s.num ? `, урок № ${s.num}` : ""), topic: s.topic });
          sn++;
        }
      }
      perSource[m.id] = { title: m.title || m.name, lessons: segs.length, questions: qn, structures: sn, builtin: !!m.builtin };
    }
    const generic = questions.filter(q => q.generic);
    const byCat = {}; generic.forEach(q => { (byCat[q.cat] = byCat[q.cat] || []).push(q); });
    for (const k in byCat) { const seen = new Set(); byCat[k] = byCat[k].filter(q => { const key = q.text.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; }); }
    const weights = {}; questions.forEach(q => { weights[q.cat] = (weights[q.cat] || 0) + 1; });
    return {
      builtAt: new Date().toISOString(), excluded: [...ex],
      counts: { sources: src.length, lessons: lessons.length, questions: questions.length, generic: generic.length, techniques: techniques.size, structures: Object.values(structures).reduce((a, x) => a + x.length, 0) },
      sources: perSource, byCat, weights, openers,
      techniques: [...techniques].map(([name, s]) => ({ name, src: [...s].slice(0, 3) })),
      structures, lessons
    };
  }
  function typeIdFor(s, m) {
    if (m.baseType) return m.baseType;
    try { return Engine.detectType({ subject: "lit", topic: s.topic, lessonNo: 1 }).id; } catch { return "lit"; }
  }

  /* Версии: храним сводку (без тяжёлых текстов), чтобы видеть изменения и откатываться */
  const snapshot = k => ({ v: Date.now(), at: k.builtAt, counts: k.counts, sources: Object.fromEntries(Object.entries(k.sources).map(([id, s]) => [id, { title: s.title, questions: s.questions, structures: s.structures, lessons: s.lessons }])), excluded: k.excluded, techniques: k.techniques.map(t => t.name) });
  async function versions() { try { return (await Store.get("kv", HIST)) || []; } catch { return []; } }
  async function excludedNow() { try { return ((await Store.get("kv", KEY)) || {}).excluded || []; } catch { return []; } }

  /* Пересобрать знания; если что-то изменилось — новая версия и сообщение «система обновилась» */
  async function update({ quiet = false } = {}) {
    const excluded = await excludedNow();
    K = build(excluded);
    const hist = await versions(), last = hist[hist.length - 1];
    const snap = snapshot(K);
    const added = Object.keys(snap.sources).filter(id => !last || !last.sources[id]);
    const removed = last ? Object.keys(last.sources).filter(id => !snap.sources[id]) : [];
    const changed = !last || added.length || removed.length || last.counts.questions !== snap.counts.questions;
    if (changed) {
      snap.added = added.map(id => snap.sources[id].title); snap.removed = removed.map(id => last.sources[id].title);
      snap.delta = last ? { questions: snap.counts.questions - last.counts.questions, structures: snap.counts.structures - last.counts.structures, techniques: snap.techniques.filter(t => !last.techniques.includes(t)) } : null;
      hist.push(snap); while (hist.length > 15) hist.shift();
      try { await Store.put("kv", HIST, hist); await Store.put("kv", KEY, { excluded }); } catch { }
      if (last && !quiet && (added.length || removed.length) && typeof toast === "function")
        toast(`Система обновилась: ${added.length ? `изучено материалов +${added.length}` : ""}${removed.length ? ` убрано ${removed.length}` : ""}; вопросов ${snap.delta.questions >= 0 ? "+" : ""}${snap.delta.questions}, структур уроков ${snap.delta.structures >= 0 ? "+" : ""}${snap.delta.structures}. Подробности — «Материалы» → «Чему научилась система».`, 8000);
    }
    document.dispatchEvent(new CustomEvent("uchu:learned", { detail: { changed } }));
    return K;
  }
  /* Откат к версии: материалы, изученные после неё, исключаются из обучения (сами файлы не удаляются) */
  async function rollback(v) {
    const hist = await versions(), target = hist.find(h => h.v === v); if (!target) return false;
    const now = build([]);
    const keep = new Set(Object.keys(target.sources));
    const excluded = Object.keys(now.sources).filter(id => !keep.has(id));
    try { await Store.put("kv", KEY, { excluded }); } catch { }
    await update({ quiet: true });
    return true;
  }
  async function include(id) { const ex = (await excludedNow()).filter(x => x !== id); try { await Store.put("kv", KEY, { excluded: ex }); } catch { } return update({ quiet: true }); }
  async function exclude(id) { const ex = [...new Set([...(await excludedNow()), id])]; try { await Store.put("kv", KEY, { excluded: ex }); } catch { } return update({ quiet: true }); }

  /* ---------- Запросы ---------- */
  const get = () => K || (K = build([]));
  /* Уроки-образцы по теме: совпадение основ слов темы (автор + произведение) */
  function lessonsFor(topic, grade, max = 3, subject = "lit") {
    const k = get(); if (!k.lessons.length || typeof FRP === "undefined") return [];
    const st = FRP.stems(String(topic).replace(/урок|тема/gi, ""));
    if (!st.size) return [];
    const works = (String(topic).match(/«([^»]+)»/g) || []).map(w => w.toLowerCase().replace(/ё/g, "е"));
    return k.lessons.filter(l => (l.subject || "lit") === subject).map(l => {
      const lt = l.topic.toLowerCase().replace(/ё/g, "е");
      const workHit = works.some(w => lt.includes(w.replace(/[«»]/g, "").slice(0, 24)));
      // если в теме названо произведение, образец должен быть про это же произведение; без этого — не дальше двух классов
      if (works.length && !workHit) return { l, s: 0 };
      if (!works.length && grade && l.grade && Math.abs(l.grade - grade) > 2) return { l, s: 0 };
      let s = FRP.score(l.topic, st) * 3 + (workHit ? 6 : 0) + (grade && l.grade === grade ? 1 : 0);
      return { l, s };
    }).filter(x => x.s >= Math.min(6, st.size * 3)).sort((a, b) => b.s - a.s).slice(0, max).map(x => x.l);
  }
  function genericQuestions(cat) { return (get().byCat[cat] || []); }
  function openers(cat) { return Object.entries(get().openers[cat] || {}).sort((a, b) => b[1] - a[1]).map(([o]) => o); }
  function structuresFor(typeId) { return get().structures[typeId] || []; }
  function techniques() { return get().techniques; }

  return { CATS, ORDER, classify, sentences, questionsFrom, isGeneric, stagesFrom, techniquesFrom, splitLessons, build, update, rollback, include, exclude, versions, excludedNow, get, lessonsFor, genericQuestions, openers, structuresFor, techniques };
})();
window.Learn = Learn;
