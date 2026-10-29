/* «Учу по ФРП» — общий мозг ботов (Telegram и MAX).
   Что умеет:
     • понимать свободную фразу: предмет, класс, тему, нужные материалы;
     • если чего-то не хватает — спрашивать по одному (кнопками) в любом порядке;
     • когда всё известно — подтвердить набор материалов и генерировать;
     • помнить предмет и класс, чтобы не спрашивать каждый раз;
     • собирать конспект и файлы .docx и отдавать их в чат.
   Адаптеры (telegram.js, maxbot.js) дают send/sendDoc/keyboard и хранилище памяти. */
"use strict";
const zlib = require("zlib");

const SITE = "https://uchu-po-frp.ru/";
const BOT_TG = "https://t.me/Uchu_po_frp_bot";
const BOT_MAX = "https://max.ru/se14825349_bot";

/* предметы: как учитель может их назвать → каноническое имя */
const SUBJECTS = [
  { id: "ru", name: "Русский язык", keys: ["русский язык", "русский", "рус яз", "русс"] },
{ id: "lit1", name: "Литературное чтение", keys: ["литературное чтение", "лит чтение", "чтение"] },
  { id: "lit", name: "Литература", keys: ["литератур", "лит-ра", "лит "] },
  { id: "math", name: "Математика", keys: ["математик", "матем", "алгебр", "геометр"] },
  { id: "hist", name: "История", keys: ["истори"] },
  { id: "eng", name: "Английский язык", keys: ["английский язык", "английск", "англ"] },
  { id: "bio", name: "Биология", keys: ["биолог"] },
  { id: "geo", name: "География", keys: ["географ"] },
  { id: "phys", name: "Физика", keys: ["физик"] },
  { id: "chem", name: "Химия", keys: ["хими"] },
  { id: "soc", name: "Обществознание", keys: ["обществ", "общество"] },
  { id: "inf", name: "Информатика", keys: ["информат", "информ"] },
  { id: "obzh", name: "ОБЖ/ОБЗР", keys: ["обж", "обзр", "безопасност"] },
  { id: "mhk", name: "МХК", keys: ["мхк", "мировая художественная"] },
  { id: "pe", name: "Физкультура", keys: ["физкультур", "физра"] },
  { id: "tech", name: "Технология", keys: ["технолог", "труд"] },
  { id: "okr", name: "Окружающий мир", keys: ["окружающ", "окр мир"] },
  { id: "izo", name: "ИЗО", keys: ["изо", "изобразительн"] },
  { id: "mus", name: "Музыка", keys: ["музык"] },
  { id: "vis", name: "Вероятность и статистика", keys: ["вероятност", "статистик"] },
  { id: "astr", name: "Астрономия", keys: ["астроном"] },
  { id: "ru1", name: "Русский язык (начальная)", keys: ["русский 1", "русский язык 1", "русский начальн"] },
  { id: "orkse", name: "ОРКСЭ", keys: ["орксэ", "основы религиозных"] }
];
const FORMATS = [
  { id: "conspect", name: "Конспект урока", keys: ["конспект", "конспек"] },
  { id: "slides", name: "Презентация", keys: ["презентац", "слайд", "презу"] },
  { id: "worksheet", name: "Рабочий лист", keys: ["рабочий лист", "рабоч лист", "лист"] },
  { id: "tech", name: "Технологическая карта", keys: ["техкарт", "тех карт", "технологическ"] }
];

const norm = s => String(s || "").toLowerCase().replace(/ё/g, "е");
const pick = (text, list) => {
  const t = norm(text);
  for (const item of list) if (item.keys.some(k => t.includes(norm(k)))) return item;
  return null;
};

/* разбор фразы: что уже понятно, что спросить */
function parse(text, mem) {
  const t = String(text || "");
  const job = { subject: mem?.subject || null, grade: mem?.grade || null, topic: null, formats: null, requestedAll: false };
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const B = "[а-яёa-z]"; // граница «буква»
  const subj = pick(t, SUBJECTS);
  if (subj) job.subject = subj.name;
  const mGrade = t.match(/(\d{1,2})\s*(?:класс|кл)(?![а-яёa-z])/i) || t.match(/^\s*(\d{1,2})\s*$/);
  if (mGrade) { const g = +mGrade[1]; if (g >= 1 && g <= 11) job.grade = g; }
  const fmts = FORMATS.filter(f => f.keys.some(k => norm(t).includes(norm(k)))).map(f => f.name);
  if (/все|всё|полный|полностью|под ключ/i.test(t)) job.requestedAll = true;
  /* начальная/основная школа: один и тот же предмет называется по-разному */
  if (job.subject === "Русский язык" && job.grade && +job.grade <= 4) job.subject = "Русский язык (начальная)";
  if (job.subject === "Литература" && job.grade && +job.grade <= 4) job.subject = "Литературное чтение";
  if (job.subject === "Русский язык (начальная)" && job.grade && +job.grade > 4) job.subject = "Русский язык";
  if (job.subject === "Литературное чтение" && job.grade && +job.grade > 4) job.subject = "Литература";
  if (fmts.length) job.formats = fmts;

  let rest = t;
  /* предметы с любыми окончаниями */
  const subjAlt = SUBJECTS.flatMap(s => s.keys).map(k => escRe(k) + "[а-яё]*").join("|");
  rest = rest.replace(new RegExp(`(?<!${B})(${subjAlt})(?!${B})`, "gi"), " ");
  /* материалы */
  rest = rest.replace(new RegExp(`(?<!${B})(конспект[а-яё]*|презентац[а-яё]*|рабоч[а-яё]*\\s+лист[а-яё]*|тех[а-яё]*\\s*карт[а-яё]*|техкарт[а-яё]*|слайд[а-яё]*|материал[а-яё]*)(?!${B})`, "gi"), " ");
  /* классы и отдельные числа */
  rest = rest.replace(/(?<![а-яёa-z\d])\d{1,2}\s*(?:класс[а-яё]*|кл)(?![а-яёa-z])/gi, " ");
  rest = rest.replace(/(?<![а-яёa-z\d])\d{1,2}(?![а-яёa-z\d])/g, " ");
  /* служебные слова */
  rest = rest.replace(new RegExp(`(?<!${B})(созда[а-яё]*|сдела[а-яё]*|подготов[а-яё]*|собер[а-яё]*|нужен[а-яё]*|пожалуйста|все|всё|ещё|еще|урок[а-яё]*|тем[аыуе]|про|для|по|на|из)(?!${B})`, "gi"), " ");
  rest = rest.replace(/^[\s,;:—–\-+*\/\\|]+/, "").replace(/[\s,;:—–\-+*\/\\|]+$/, "");
  rest = rest.replace(/[,;:—–\-+*\/\\|]+/g, " ").replace(/\s{2,}/g, " ").trim();
  rest = rest.replace(/^[а-яёa-z]{1,2}\s+/i, "").replace(/^и\s+/i, "").replace(/\s+и$/i, "").trim();
  if (rest.length >= 2 && !/^(приложение|открой|помощь|старт|начать)$/i.test(rest)) job.topic = rest;
  return job;
}
/* ---------- DOCX без зависимостей: zip (store) + XML ---------- */
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = buf => { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function zipStore(entries) {
  const chunks = [], central = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8"), data = Buffer.from(e.data, "utf8"), crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10); local.writeUInt16LE(0, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    chunks.push(local, name, data);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(0, 10);
    cen.writeUInt16LE(0, 12); cen.writeUInt16LE(0, 14); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(data.length, 20); cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(name.length, 28); cen.writeUInt16LE(0, 30); cen.writeUInt16LE(0, 32); cen.writeUInt16LE(0, 34); cen.writeUInt16LE(0, 36);
    cen.writeUInt32LE(0, 38); cen.writeUInt32LE(offset, 42);
    central.push(cen, name);
    offset += local.length + name.length + data.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([...chunks, centralBuf, end]);
}
const xmlEsc = s => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function docx(input) {
  const paragraphs = input.filter(p => !/^\s*[#*_=~—–-]{3,}\s*$/.test(p)).map(p => String(p).replace(/\*{2,}/g, "").replace(/`{1,3}/g, ""));
  const body = paragraphs.map(p => {
    if (p === "") return "<w:p/>";
    const bold = /^#\s/.test(p) ? true : false;
    const text = xmlEsc(String(p).replace(/^#\s*/, "").replace(/\*\*/g, ""));
    return `<w:p><w:r><w:rPr>${bold ? "<w:b/>" : ""}<w:sz w:val="${bold ? 32 : 24}"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
  }).join("");
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>`;
  return zipStore([
    { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>` },
    { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>` },
    { name: "word/document.xml", data: document },
    { name: "word/styles.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="28"/><w:szCs w:val="28"/><w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>` },
    { name: "word/settings.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/></w:settings>` },
    { name: "word/_rels/document.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/></Relationships>` },
    { name: "docProps/core.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Материалы к уроку</dc:title><dc:creator>Учу по ФРП</dc:creator></cp:coreProperties>` },
    { name: "docProps/app.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Учу по ФРП</Application></Properties>` }
  ]);
}

/* ---------- содержание ---------- */
function buildConspect(job) {
  const { subject, grade, topic } = job;
  const t = String(topic || "Тема урока");
  const mins = +grade <= 4 ? "10" : +grade <= 6 ? "15" : "20";
  return [
    `# ${t}`,
    "",
    `Предмет: ${subject} · Класс: ${grade} · Время: 45 минут`,
    "",
    "## Цель",
    `Сформировать представление по теме «${t}» и применить знания в заданиях.`,
    "",
    "## Планируемые результаты",
    "- предметные: объяснять основные понятия темы, приводить примеры;",
    "- метапредметные: работать с информацией, строить рассуждение, делать вывод;",
    "- личностные: проявлять интерес к теме, уважать мнение одноклассников.",
    "",
    "## Оборудование",
    "Учебник, рабочая тетрадь, доска, раздаточные материалы.",
    "",
    "## Этапы урока",
    "1. Мотивация (2 мин). Вопрос классу: что вы уже знаете о теме?",
    `2. Актуализация (3 мин). Разбор известных понятий, постановка учебной задачи.`,
    `3. Изучение нового (${mins} мин). Объяснение ключевых понятий темы, примеры.`,
    `4. Первичное закрепление (${+mins + 2} мин). Задания по образцу, разбор типичных ошибок.`,
    "5. Самостоятельная работа (5 мин). Задание по теме, самопроверка.",
    "6. Рефлексия (2 мин). Что узнали? Что осталось непонятным?",
    `7. Домашнее задание. Повторить материал по теме «${t}», выполнить упражнение.`,
    "",
    "## Вопросы для обсуждения",
    `- Что главное в теме «${t}»?`,
    "- Как это связано с изученным ранее?",
    "- Где это может пригодиться?",
    "",
    "## Критерии оценивания",
    "Понимание понятий, правильность выполнения заданий, умение объяснить ответ."
  ];
}
function buildWorksheet(job) {
  const t = String(job.topic || "Тема урока");
  return [
    `# Рабочий лист: ${t}`,
    "",
    `Предмет: ${job.subject} · Класс: ${job.grade}`,
    "",
    "## Задание 1. Вспомните",
    "Запишите три понятия, которые относятся к теме.",
    "",
    "## Задание 2. Объясните",
    `Своими словами объясните, что такое «${t}».`,
    "",
    "## Задание 3. Приведите пример",
    "Приведите два примера по теме и объясните свой выбор.",
    "",
    "## Задание 4. Проверьте себя",
    "Верно ли утверждение? Отметьте «да» или «нет» и объясните ответ.",
    "",
    "## Рефлексия",
    "Что было легко? Что вызвало трудности?"
  ];
}
function buildTechCard(job) {
  const t = String(job.topic || "Тема урока");
  return [
    `# Технологическая карта: ${t}`,
    "",
    `Предмет: ${job.subject} · Класс: ${job.grade} · Время: 45 минут`,
    "",
    "## Этапы",
    "1. Мотивация (2 мин): вопрос классу, постановка задачи.",
    "2. Актуализация (3 мин): повторение известного.",
    "3. Изучение нового: объяснение понятий, примеры.",
    "4. Закрепление: задания по образцу, разбор ошибок.",
    "5. Самостоятельная работа: задание и самопроверка.",
    "6. Рефлексия: итог, вопросы.",
    "7. Домашнее задание: повторение темы и упражнение.",
    "",
    "## Планируемые результаты",
    "- предметные: знать понятия темы, применять их;",
    "- метапредметные: работать с информацией, делать вывод;",
    "- личностные: интерес к теме, уважение к мнению других.",
    "",
    "## Организация",
    "Фронтальная, парная и индивидуальная работа; материалы: учебник, доска, раздаточные листы."
  ];
}
function buildSlidesOutline(job) {
  const t = String(job.topic || "Тема урока");
  return [
    `# Презентация: ${t}`,
    "",
    "1. Титульный слайд — тема, класс, предмет.",
    "2. Что мы знаем — вопросы к классу.",
    "3. Ключевые понятия темы.",
    "4. Пример и разбор.",
    "5. Практика: задание для класса.",
    "6. Итог и рефлексия.",
    "7. Домашнее задание.",
    "",
    "> Полноценную презентацию с оформлением можно собрать на сайте — ссылка ниже."
  ];
}

const ok = m => `✅ ${m}`;

/* ---------- состояние диалога ---------- */
function createBrain(opts) {
  const { store, send, sendDoc, links, platform } = opts; // store: {get(id), set(id, mem)}
  const sessions = new Map();

  const getSession = id => {
    if (!sessions.has(id)) sessions.set(id, { step: "idle", job: {}, mem: store.get(id) || {} });
    return sessions.get(id);
  };
  const saveMem = (id, mem) => { store.set(id, mem); const s = getSession(id); s.mem = mem; };

  function subjectKeyboard() {
    return [
      ["Русский язык", "Литература", "Математика"],
      ["История", "Английский язык", "Биология"],
      ["География", "Физика", "Химия"],
      ["Обществознание", "Информатика", "ОБЖ"],
      ["МХК", "Физкультура", "Технология"],
      ["Окружающий мир", "ИЗО", "Музыка"],
      ["Вероятность и статистика", "Астрономия", "Литературное чтение"]
    ].map(row => row.map(name => ({ text: name, data: "subj:" + name })));
  }
  const gradeKeyboard = () => {
    const rows = [];
    for (let g = 1; g <= 11; g += 4) rows.push([g, g + 1, g + 2, g + 3].filter(x => x <= 11).map(n => ({ text: n + " класс", data: "grade:" + n })));
    return rows;
  };
  const formatsKeyboard = () => [
    [{ text: "Всё подряд", data: "fmt:all" }],
    [{ text: "Только конспект", data: "fmt:conspect" }],
    [{ text: "Конспект и рабочий лист", data: "fmt:conspect,worksheet" }],
    [{ text: "Презентация и рабочий лист", data: "fmt:slides,worksheet" }]
  ];

  async function askNext(id, s) {
    const job = s.job;
    if (!job.topic) {
      await send(id, "Напишите тему урока.\nМожно вместе с предметом и классом: «Строение клетки, биология, 5 класс».");
      return;
    }
    if (!job.subject) { await send(id, "Уточните предмет:", subjectKeyboard()); return; }
    if (!job.grade) { await send(id, "Уточните класс:", gradeKeyboard()); return; }
    if (!job.formats) {
      await send(id,
        `Понял: «${job.topic}», ${job.subject.toLowerCase()}, ${job.grade} класс.\n\n` +
        "Нужен конспект, презентация и рабочий лист? Могу ещё технологическую карту.",
        formatsKeyboard());
      return;
    }
    await generate(id, s);
  }

  async function generate(id, s) {
    const job = s.job;
    const formats = job.formats && job.formats.length ? job.formats : ["Конспект урока", "Презентация", "Рабочий лист"];
    await send(id, `Генерирую: ${formats.join(", ").toLowerCase()}…`);
    const link = SITE + "?subject=" + encodeURIComponent(job.subject) + "&grade=" + encodeURIComponent(job.grade) + "&topic=" + encodeURIComponent(job.topic);
    const files = [];
    if (formats.includes("Рабочий лист")) files.push({ name: "рабочий-лист.docx", buf: docx(buildWorksheet(job)) });
    if (formats.includes("Презентация")) files.push({ name: "презентация-план.docx", buf: docx(buildSlidesOutline(job)) });
    if (formats.includes("Технологическая карта")) files.push({ name: "техкарта.docx", buf: docx(buildTechCard(job)) });
    files.push({ name: "конспект.docx", buf: docx(buildConspect(job)) });
    for (const f of files) {
      try { await sendDoc(id, f.buf, f.name, "Материал к уроку; полный набор с оформлением — на сайте."); } catch (e) { }
    }
    await send(id,
      ok(`Готово: «${job.topic}» · ${job.subject} · ${job.grade} класс`) +
      `\n\nФайлы прикреплены. Полные версии с оформлением, презентацией и тест-картой — на сайте по кнопке ниже.`,
      [[{ text: "Открыть урок на сайте", url: link }], [{ text: "Собрать ещё урок", data: "new" }]]);
    saveMem(id, { subject: job.subject, grade: job.grade });
    s.step = "idle"; s.job = {};
  }

  async function botRegister(chatId, email, password) {
    const url = process.env.BOT_REGISTER_URL || "https://functions.yandexcloud.net/d4ek0q8grbhn7q5muf24?path=/bot/register";
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Bot-Secret": process.env.BOT_SECRET || "" },
        body: JSON.stringify({ email, password, chat_id: String(chatId), platform: platform || "tg" })
      });
      const j = await res.json().catch(() => ({}));
      return { ok: res.ok && j.ok, error: j.error };
    } catch (e) { return { ok: false, error: "сервис недоступен" }; }
  }

  async function beginRegistration(id) {
    const s = getSession(id);
    if (s.mem.email) return send(id, `Кабинет уже привязан к этому чату: ${s.mem.email}.\nВход на сайте — та же почта и пароль.`);
    s.step = "email";
    return send(id, "Создам личный кабинет «Учу по ФРП» прямо здесь.\n\nНапишите почту — на неё будет аккаунт (подтверждение не потребуется).", [[{ text: "Отмена", data: "cancel" }]]);
  }

  function start(id, preset) {
    const s = getSession(id);
    s.step = "idle"; s.job = {};
    const mem = s.mem;
    const hint = mem.subject && mem.grade ? `\n\nВ прошлый раз: ${mem.subject.toLowerCase()}, ${mem.grade} класс — по умолчанию оставлю.` : "";
    return send(id,
      "Создам материалы к уроку.\n\nНапишите тему — можно сразу с предметом и классом:\n«Строение клетки, биология, 5 класс»." + hint +
      "\n\nЧтобы сохранять уроки и скачивать материалы без ограничений, подключите личный кабинет: войдите на сайте и подтвердите почту — кнопка «Войти в кабинет».\n\nИли откройте приложение на телефоне.",
      preset || [[{ text: "Создать кабинет здесь", data: "reg" }, { text: "Открыть приложение", url: SITE }]]);
  }

  async function onText(id, text) {
    const s = getSession(id);
    const t = String(text || "").trim();
    if (s.step === "email") {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t)) return send(id, "Похоже, это не почта. Напишите адрес вида name@mail.ru — или нажмите «Отмена».", [[{ text: "Отмена", data: "cancel" }]]);
      s.pendingEmail = t.toLowerCase(); s.step = "password";
      return send(id, "Почта принята. Придумайте пароль (минимум 6 символов) и отправьте его одним сообщением.");
    }
    if (s.step === "password") {
      if (t.length < 6) return send(id, "Пароль короче 6 символов — придумайте подлиннее.");
      const email = s.pendingEmail || "";
      s.step = "idle"; s.pendingEmail = "";
      await send(id, "Создаю кабинет…");
      const r = await botRegister(id, email, t);
      if (!r.ok) {
        s.step = "idle";
        return send(id, "Не получилось создать кабинет: " + (r.error || "ошибка сервиса") + ".\nМожно зарегистрироваться на сайте.", [[{ text: "Открыть сайт", url: SITE }]]);
      }
      saveMem(id, { ...s.mem, email });
      return send(id, `Готово: кабинет ${email} создан и привязан к этому чату.\n\nВход на сайте — та же почта и пароль. Подтверждение почты не нужно. Можно сразу собирать материалы.`);
    }
    if (/(кабинет|регистрац|войти|привяз)/i.test(t)) return beginRegistration(id);
    if (/^\/(start|new)\b/i.test(t)) return start(id);
    if (/^\/(app|site)\b/i.test(t) || /^(приложение|открой приложение|скачать приложение)/i.test(t)) {
      return send(id, "Приложение «Учу по ФРП» ставится из сайта: откройте его и нажмите «Установить приложение» (Android/Chrome) или «Поделиться → На экран „Домой“» (iPhone).", [[{ text: "Открыть сайт", url: SITE }]]);
    }
    if (/^\/help\b/i.test(t)) {
      return send(id, "Напишите тему урока: «Война и мир, литература, 10 класс».\nЕсли чего-то не хватит — спрошу. Потом пришлю файлы и ссылку на сайт.", [[{ text: "Открыть сайт", url: SITE }]]);
    }
    const parsed = parse(t, s.mem);
    const job = s.job || {};
    for (const k of ["subject", "grade", "formats"]) if (parsed[k]) job[k] = parsed[k];
    if (parsed.topic) job.topic = parsed.topic;
    if (parsed.requestedAll) job.formats = FORMATS.map(f => f.name);
    s.job = job;
    return askNext(id, s);
  }

  async function onCallback(id, data) {
    const s = getSession(id);
    if (data === "new") return start(id);
    if (data === "reg") return beginRegistration(id);
    if (data === "cancel") { const s2 = getSession(id); s2.step = "idle"; s2.pendingEmail = ""; return send(id, "Хорошо, отменил. Напишите тему урока, когда будете готовы."); }
    if (data.startsWith("subj:")) { s.job.subject = data.slice(5); return askNext(id, s); }
    if (data.startsWith("grade:")) { s.job.grade = +data.slice(6); return askNext(id, s); }
    if (data.startsWith("fmt:")) {
      const v = data.slice(4);
      if (v === "all") s.job.formats = FORMATS.map(f => f.name);
      else s.job.formats = v.split(",").map(id2 => FORMATS.find(f => f.id === id2)?.name).filter(Boolean);
      return generate(id, s);
    }
    return;
  }

  return { start, onText, onCallback, parse, buildConspect, docx, SUBJECTS, FORMATS };
}

module.exports = { createBrain, parse, docx, buildConspect, buildWorksheet, buildSlidesOutline, buildTechCard, SUBJECTS, FORMATS, SITE, BOT_TG, BOT_MAX };
