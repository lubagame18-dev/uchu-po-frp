/* «Учу по ФРП» — Telegram-бот @Uchu_po_frp_bot.
   Работает двумя способами:
     • вебхук в Яндекс-функции (durable): POST /telegram/webhook;
     • локальный опрос getUpdates для проверки.
   Сценарий: /start → пишите тему (можно сразу «тема, предмет, класс»).
   Бот уточняет предмет/класс, собирает конспект через ИИ и отправляет:
     • короткий конспект сообщением (по частям);
     • файл .md с конспектом;
     • ссылку на сайт с уже заполненными параметрами — там можно скачать Word/PDF.
   Все секреты — только в переменных окружения, не в коде. */
"use strict";

const SITE = "https://uchu-po-frp.ru/";
const FN = (process.env.YANDEX_FUNCTION_URL || "https://functions.yandexcloud.net/d4ek0q8grbhn7q5muf24").replace(/\/+$/, "");
const TOKEN = () => process.env.TELEGRAM_BOT_TOKEN || "";

const SUBJECTS = ["русский язык", "литература", "математика", "история", "английский язык", "биология", "география", "физика", "химия", "обществознание", "информатика", "ОБЖ", "МХК", "физкультура", "технология", "окружающий мир", "ИЗО", "музыка", "вероятность и статистика", "астрономия"];
const SUBJECT_IDS = { "русский язык": "ru", "литература": "lit", "математика": "math", "история": "hist", "английский язык": "eng", "биология": "bio", "география": "geo", "физика": "phys", "химия": "chem", "обществознание": "soc", "информатика": "inf", "обж": "obzh", "мхк": "mhk", "физкультура": "pe", "технология": "tech", "окружающий мир": "okr", "изо": "izo", "музыка": "mus", "вероятность и статистика": "vis", "астрономия": "astr" };

const state = new Map(); // chatId → { subject, grade, topic, busy }

/* ---------- Telegram API ---------- */
async function api(method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return res.json().catch(() => ({}));
}
const esc = s => String(s || "").replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));

async function send(chatId, text, keyboard) {
  const chunks = chunk(text, 3800);
  for (let i = 0; i < chunks.length; i++) {
    await api("sendMessage", {
      chat_id: chatId,
      text: chunks[i],
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: i === chunks.length - 1 ? keyboard : undefined
    });
  }
}
function chunk(text, size) {
  const out = [];
  let rest = String(text || "");
  while (rest.length > size) {
    let cut = rest.lastIndexOf("\n", size);
    if (cut < size * 0.5) cut = size;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n+/, "");
  }
  if (rest) out.push(rest);
  return out;
}

/* ---------- ИИ через функцию сайта ---------- */
async function ai(prompt, maxTokens) {
  const url = FN + "?path=" + encodeURIComponent("/deepseek/v1/chat/completions");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: prompt }], max_tokens: maxTokens || 2200, stream: false })
  });
  const text = await res.text();
  let j = {};
  try { j = JSON.parse(text); } catch { }
  if (!res.ok) throw new Error(j.error || ("HTTP " + res.status));
  const out = j.choices?.[0]?.message?.content;
  if (!out) throw new Error(j.error || "нейросеть не ответила");
  return String(out).trim();
}

/* ---------- разбор темы ---------- */
function guess(text) {
  const t = String(text).toLowerCase();
  let subject = null;
  for (const s of SUBJECTS) if (t.includes(s)) { subject = s; break; }
  const mGrade = t.match(/(\d{1,2})\s*(?:класс|кл\b)/);
  let grade = mGrade ? +mGrade[1] : null;
  if (grade && (grade < 1 || grade > 11)) grade = null;
  let topic = String(text).trim();
  if (mGrade) topic = topic.replace(/(\d{1,2})\s*(?:класс|кл\b)/ig, "");
  if (subject) topic = topic.replace(new RegExp(subject, "ig"), "");
  topic = topic.replace(/^[\s,;:—\-]+/, "").replace(/[\s,;:—\-]+$/, "").replace(/\s{2,}/g, " ").trim();
  return { subject, grade, topic: topic || String(text).trim() };
}

/* ---------- сценарий ---------- */
async function onStart(chatId) {
  state.delete(chatId);
  await send(chatId,
    "<b>Учу по ФРП</b> — соберу урок по вашей теме.\n\n" +
    "Напишите тему одним сообщением, можно сразу с предметом и классом:\n" +
    "<i>«Строение клетки, биология, 5 класс»</i>\n\n" +
    "Я подготовлю конспект и файл, а на сайте можно скачать Word, PDF и презентацию.",
    { inline_keyboard: [[{ text: "Открыть сайт", url: SITE }]] });
}

async function onHelp(chatId) {
  await send(chatId,
    "<b>Как пользоваться</b>\n" +
    "1. Напишите тему урока (можно с предметом и классом).\n" +
    "2. Если чего-то не хватило, уточню предмет и класс.\n" +
    "3. Пришлю конспект, файл .md и ссылку на сайт — там Word/PDF/презентация.\n\n" +
    "Голосовые сообщения пока не распознаю — напишите текстом.\n" +
    "Команды: /start, /lesson, /site, /help",
    { inline_keyboard: [[{ text: "Открыть сайт", url: SITE }]] });
}

async function onSite(chatId) {
  await send(chatId, "Сайт «Учу по ФРП»: " + SITE, { inline_keyboard: [[{ text: "Открыть сайт", url: SITE }]] });
}

async function askSubject(chatId) {
  const rows = [];
  for (let i = 0; i < SUBJECTS.length; i += 2) {
    rows.push(SUBJECTS.slice(i, i + 2).map(s => ({ text: s, callback_data: "subj:" + SUBJECT_IDS[s] })));
  }
  await send(chatId, "Уточните предмет:", { inline_keyboard: rows.slice(0, 10) });
}
async function askGrade(chatId) {
  const rows = [];
  for (let g = 1; g <= 11; g += 3) rows.push([g, g + 1, g + 2].filter(x => x <= 11).map(x => ({ text: x + " класс", callback_data: "grade:" + x })));
  await send(chatId, "Уточните класс:", { inline_keyboard: rows });
}

/* Локальный конспект без ИИ: рамка урока, без выдуманных фактов.
   Используется, если нейросеть недоступна (нет входа в кабинет и т. п.). */
function buildLocal(job) {
  const { subject, grade, topic } = job;
  const d = {
    "1-4": "10", "5-6": "15", "7-9": "20", "10-11": "20"
  }[+grade <= 4 ? "1-4" : +grade <= 6 ? "5-6" : +grade <= 9 ? "7-9" : "10-11"];
  const t = String(topic).trim();
  return [
    `# ${t}`,
    ``,
    `**Предмет:** ${subject} · **Класс:** ${grade} · **Время:** 45 минут`,
    ``,
    `## Цель`,
    `Сформировать представление по теме «${t}» и применить знания в практических заданиях.`,
    ``,
    `## Планируемые результаты`,
    `- **Предметные:** объяснять основные понятия темы «${t}», приводить примеры.`,
    `- **Метапредметные:** работать с информацией, строить рассуждение, делать вывод.`,
    `- **Личностные:** проявлять интерес к теме, уважение к мнению одноклассников.`,
    ``,
    `## Оборудование`,
    `Учебник, рабочая тетрадь, доска, раздаточные материалы.`,
    ``,
    `## Этапы урока`,
    `1. **Мотивация (2 мин).** Вопрос классу: что вы уже знаете о теме «${t}»?`,
    `2. **Актуализация (${d === "10" ? "3" : "4"} мин).** Разбор известных понятий, постановка учебной задачи.`,
    `3. **Изучение нового (${d} мин).** Объяснение ключевых понятий темы, работа с примерами.`,
    `4. **Первичное закрепление (${+d + 2} мин).** Задания по образцу, разбор типичных ошибок.`,
    `5. **Самостоятельная работа (5 мин).** Задание по теме, самопроверка.`,
    `6. **Рефлексия (2 мин).** Что узнали? Что осталось непонятным?`,
    `7. **Домашнее задание.** Повторить материал по теме «${t}», выполнить упражнение из учебника.`,
    ``,
    `## Вопросы для обсуждения`,
    `- Что главное в теме «${t}»?`,
    `- Как это связано с тем, что мы изучали раньше?`,
    `- Где это может пригодиться?`,
    ``,
    `## Критерии оценивания`,
    `Понимание понятий, правильность выполнения заданий, умение объяснить свой ответ.`,
    ``,
    `> Черновой конспект собран ботом без нейросети. Полный конспект, техкарту, презентацию и рабочий лист можно собрать на сайте — кнопка ниже.`
  ].join("\n");
}
async function generate(chatId, job) {
  const { subject, grade, topic } = job;
  await api("sendChatAction", { chat_id: chatId, action: "typing" });
  const prompt =
    `Ты методист-предметник. Составь подробный конспект урока по предмету «${subject}», ${grade} класс, тема «${topic}».\n` +
    "Структура: тема; класс; цель; планируемые результаты; оборудование; этапы урока (мотивация, актуализация, изучение нового, закрепление, рефлексия, домашнее задание) с временем; вопросы и задания; критерии оценивания.\n" +
    "Пиши по-русски, ясно и кратко, без дословных цитат учебников и чужих текстов, без вступлений и пояснений. Оформляй Markdown.";
  let text, source = "ИИ";
  try { text = await ai(prompt, 2600); }
  catch (e) { text = buildLocal(job); source = "локальный шаблон"; }
  const link = SITE + "?subject=" + encodeURIComponent(SUBJECT_IDS[String(subject).toLowerCase()] || "") +
    "&grade=" + encodeURIComponent(grade) + "&topic=" + encodeURIComponent(topic);
  const kb = { inline_keyboard: [[{ text: "Скачать Word/PDF на сайте", url: link }], [{ text: "Собрать ещё урок", callback_data: "again" }]] };
  await send(chatId, "<b>" + esc(topic) + "</b> · " + esc(subject) + ", " + grade + " класс" + (source === "ИИ" ? "" : " · <i>" + source + "</i>") + "\n\n" + esc(text), kb);
  try {
    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append("document", new Blob([text], { type: "text/markdown" }), "конспект-" + String(topic).slice(0, 40).replace(/[\\/:*?"<>|]/g, "") + ".md");
    form.append("caption", "Конспект в Markdown. Word и PDF — на сайте по кнопке выше.");
    await fetch(`https://api.telegram.org/bot${TOKEN()}/sendDocument`, { method: "POST", body: form });
  } catch (e) { /* файл не критичен */ }
  state.delete(chatId);
}

async function onText(chatId, text) {
  const job = state.get(chatId) || {};
  const g = guess(text);
  if (g.subject) job.subject = g.subject;
  if (g.grade) job.grade = g.grade;
  if (g.topic) job.topic = g.topic;
  if (!job.subject) { state.set(chatId, job); job.topic = job.topic || String(text).trim(); return askSubject(chatId); }
  if (!job.grade) { state.set(chatId, job); return askGrade(chatId); }
  job.subject = job.subject || "математика";
  state.delete(chatId);
  await generate(chatId, job);
}

async function onCallback(chatId, data) {
  const job = state.get(chatId) || {};
  if (data === "again") { state.delete(chatId); return onStart(chatId); }
  if (data.startsWith("subj:")) {
    const id = data.slice(5);
    const name = Object.keys(SUBJECT_IDS).find(k => SUBJECT_IDS[k] === id) || id;
    job.subject = name; state.set(chatId, job);
    if (!job.topic) return send(chatId, "Напишите тему урока.");
    return job.grade ? generate(chatId, job) : askGrade(chatId);
  }
  if (data.startsWith("grade:")) {
    job.grade = +data.slice(6); state.set(chatId, job);
    if (!job.topic) return send(chatId, "Напишите тему урока.");
    return job.subject ? generate(chatId, job) : askSubject(chatId);
  }
}

/* ---------- обработка обновления ---------- */
async function handle(update) {
  if (!update || !TOKEN()) return;
  try {
    if (update.message) {
      const chatId = update.message.chat.id;
      const text = String(update.message.text || "").trim();
      if (update.message.voice || update.message.audio) {
        return send(chatId, "Голосовые пока не распознаю — напишите тему текстом.", { inline_keyboard: [[{ text: "Открыть сайт", url: SITE }]] });
      }
      if (!text) return;
      if (/^\/start/.test(text)) return onStart(chatId);
      if (/^\/help/.test(text)) return onHelp(chatId);
      if (/^\/site/.test(text)) return onSite(chatId);
      if (/^\/lesson/.test(text)) { state.delete(chatId); return send(chatId, "Напишите тему урока (можно с предметом и классом)."); }
      return onText(chatId, text);
    }
    if (update.callback_query) {
      const q = update.callback_query;
      await api("answerCallbackQuery", { callback_query_id: q.id });
      return onCallback(q.message.chat.id, String(q.data || ""));
    }
  } catch (e) {
    try { if (update.message) await send(update.message.chat.id, "Ошибка: " + esc(e.message).slice(0, 200)); } catch { }
  }
}

module.exports = { handle, guess, ai, onStart, onText, send, state, buildLocal };
