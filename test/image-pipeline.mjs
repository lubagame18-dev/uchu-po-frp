/* Сквозной пайплайн ИИ-картинок: промпт по предмету → ответ API → буфер в памяти → вставка на слайд.
   Запуск: node test/image-pipeline.mjs
   Проверяем: разбор ответов API (base64/URL/data URL), стиль предмета в промпте, бюджет на картинки,
   единый процесс «презентация + картинки» (файлы не выдаются, пока картинки не вставлены). */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = f => fs.readFileSync(path.join(root, f), "utf8");
const imgSrc = read("js/imagegen.js");
const appSrc = read("js/app-part2.js");
const slidesSrc = read("js/slides.js");
let failed = 0;
const ok = (cond, name, extra = "") => { if (cond) console.log(`  ok   ${name}`); else { failed++; console.log(`  FAIL ${name}${extra ? " — " + extra : ""}`); } };

/* ---------- 1. ImageGen в песочнице: разбор ответов, стили, бюджет ---------- */
const store = new Map();
const localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const ctx = vm.createContext({
  window: {}, console: { log() { }, warn() { }, error() { } }, localStorage,
  document: { createElement: () => ({ getContext: () => ({}) }) },
  Image: function () { }, FileReader: function () { }, fetch: () => Promise.reject(new Error("no net")),
  Blob, atob, btoa, AbortController, setTimeout, clearTimeout, setTimeout, navigator: {}, URL, Date, Math, JSON, String, Number, Array, Object, RegExp, Error, Promise,
});
vm.runInContext(imgSrc, ctx);
const ImageGen = vm.runInContext("ImageGen", ctx);
ok(!!ImageGen && typeof ImageGen.extractImage === "function", "ImageGen загрузился, extractImage доступен");

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const fixtures = [
  ["data[0].b64_json", { data: [{ b64_json: PNG }] }, "raw"],
  ["data[0].url", { data: [{ url: "https://cdn.example.com/a.png" }] }, "url"],
  ["data[0].b64_json уже data URL", { data: [{ b64_json: "data:image/png;base64," + PNG }] }, "data"],
  ["top-level image", { image: "data:image/png;base64," + PNG }, "data"],
  ["images[] строками", { images: ["https://cdn.example.com/b.jpg"] }, "url"],
  ["output[0].base64", { output: [{ base64: PNG }] }, "raw"],
  ["chat message.images", { choices: [{ message: { images: [{ image_url: { url: "https://cdn.example.com/c.png" } }] } }] }, "url"],
  ["пустой ответ", {}, null],
  ["ошибка вместо картинки", { error: { message: "bad" } }, null],
];
for (const [name, fixture, kind] of fixtures) {
  const got = ImageGen.extractImage(fixture);
  ok((got && got.kind) === kind || (!got && kind === null), "ответ API: " + name + (kind ? ` → ${kind}` : " → пусто"), JSON.stringify(got)?.slice(0, 120));
}
ok(ImageGen.toDataUrl("image/png", "data:image/png;base64," + PNG) === "data:image/png;base64," + PNG, "toDataUrl не добавляет второй префикс к data URL");
ok(ImageGen.toDataUrl("image/jpeg", PNG) === "data:image/jpeg;base64," + PNG, "toDataUrl собирает data URL из чистого base64");

const styleOf = s => ImageGen.styleFor({ subject: s, grade: 8 });
const groups = { phys: "exact", chem: "exact", bio: "science", math: "exact", inf: "exact", hist: "humanities", lit: "humanities", geo: "humanities", mhk: "humanities" };
for (const [subj, group] of Object.entries(groups)) {
  const st = styleOf(subj);
  const word = group === "exact" ? /infographic|3D model|schematic/i : group === "science" ? /scientific illustration|cross-section/i : /Historically accurate|photo-realistic/i;
  ok(!!st && word.test(st.style) && /no /i.test(st.negative), `стиль ${subj}: ${group} (схемы/3D или историческая достоверность)`);
}
ok(ImageGen.styleFor({ subject: "phys", grade: 3 }).group === "primary school", "1–4 классы получают детский стиль");

/* бюджет: 6 картинок за заход по умолчанию; при маленьком бюджете — меньше; расход учитывается */
store.clear();
/* подключён платный ключ Intelion (≈0,32 ₽ за картинку), иначе генератор бесплатный и бюджет не нужен */
store.set("uchu:img", JSON.stringify({ provider: "intelion", key: "ic-test-key-123456", base: "https://aiapi.intelion.cloud/v1", model: "flux.1-schnell", on: true }));
const b0 = ImageGen.budget({ max: 6 });
ok(b0.max === 6 && b0.per > 0, "бюджет: 6 картинок за заход", JSON.stringify(b0));
store.set("uchu:img-budget", JSON.stringify({ rub: 1, perRun: 6 }));
const b1 = ImageGen.budget({ max: 6 });
ok(b1.max === 3, "бюджет 1 ₽ режет заход до 3 картинок (≈0,32 ₽ за кадр)", JSON.stringify(b1));
store.set("uchu:img-spent", JSON.stringify({ month: new Date().toISOString().slice(0, 7), rub: 1, n: 3 }));
const b2 = ImageGen.budget({ max: 6 });
ok(b2.max === 0 && /бюджет/i.test(b2.reason), "исчерпанный бюджет не даёт рисовать", JSON.stringify(b2));

/* буфер в памяти: байты → Blob без записи на диск */
const blob = ImageGen.dataUrlToBlob("data:image/png;base64," + PNG);
ok(blob instanceof Blob && blob.type === "image/png" && blob.size > 10, "байты картинки живут в Blob (RAM), формат читается");

/* ---------- 2. Промпт: контекст слайда + предмет + стиль + запрет текста ---------- */
function extractFn(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) return "";
  /* сначала закрываем скобки параметров (в них бывают {} по умолчанию), потом ищем тело функции */
  let i = src.indexOf("(", start), pd = 0;
  for (; i < src.length; i++) { if (src[i] === "(") pd++; else if (src[i] === ")") { pd--; if (!pd) break; } }
  i = src.indexOf("{", i); let depth = 0;
  for (; i < src.length; i++) { if (src[i] === "{") depth++; else if (src[i] === "}") { depth--; if (!depth) break; } }
  return src.slice(start, i + 1);
}
const promptFn = extractFn(appSrc, "deckImagePrompt");
ok(!!promptFn, "функция deckImagePrompt найдена");
const pctx = vm.createContext({
  window: { ImageGen }, console: { warn() { } }, Media: { RE: /!\[([^\]]*)\]\(([^)]+)\)/g },
  subjName: s => ({ phys: "Физика", hist: "История" }[s] || "Предмет"),
  String, JSON, Math, RegExp, Array, Object,
});
vm.runInContext(promptFn, pctx);
const prompt = vm.runInContext("deckImagePrompt({subject:'phys',grade:8,topic:'Тепловые явления',wishes:'больше наглядности'}, {title:'Внутренняя энергия',body:'- молекулы движутся'})", pctx);
ok(/Subject style \(exact sciences\)/.test(prompt), "промпт содержит стиль точных наук");
ok(/no text, no letters, no words/i.test(prompt), "промпт строго запрещает текст на картинке");
ok(/Тепловые явления/.test(prompt) && /Внутренняя энергия/.test(prompt), "промпт знает тему урока и контекст слайда");
ok(/больше наглядности/.test(prompt), "промпт учитывает пожелания основного промпта урока");
ok(/light|illustration|infographic|model/i.test(prompt) && /physics/i.test(prompt), "в промпте предмет и стиль по-английски (модель не рисует русские подписи)");
const hprompt = vm.runInContext("deckImagePrompt({subject:'hist',grade:8,topic:'Реформы'}, {title:'XIX век',body:'текст'})", pctx);
ok(/Subject style \(humanities\)/.test(hprompt) && /Historically accurate|photo-realistic/i.test(hprompt), "для истории промпт требует исторической достоверности");

/* ---------- 3. Единый процесс: презентация не выдаётся до картинок ---------- */
ok(/function deckMediaBusy/.test(appSrc) && /sessionStorage\.setItem\("uchu:deck-media-/.test(appSrc), "флаг «презентация не готова, пока нет картинок»");
ok(/const mediaPending = deckMediaBusy\(L\)/.test(appSrc), "панель «Скачать» скрывается, пока картинки не вставлены");
ok(/deckMediaBusy\(L\) \|\| \(state\.gen && state\.gen\.lessonId === L\.id\)/.test(appSrc), "скачивание презентации блокируется до конца единого процесса");
ok(/markDeckMedia\(L, true/.test(appSrc) && /markDeckMedia\(L, false\)/.test(appSrc), "флаг ставится и снимается вокруг процесса");
ok(/imgDeck: wantDeck/.test(appSrc), "задание «картинки в презентации» переживает обновление страницы");
ok(/if \(J\.imgDeck/.test(appSrc), "после перезагрузки картинки доделываются, а не теряются");
ok(/onStep: \(k, total/.test(appSrc) && /setDeckMediaPct/.test(appSrc), "прогресс единого процесса обновляется по шагам картинок");
ok(/window\.ImageGen\.budget/.test(appSrc), "количество картинок за заход ограничено бюджетом");
const refine = extractFn(appSrc, "refineDocs");
ok(/const wantPics = .*картин[\s\S]{0,400}if \(slidesScope && done && wantPics && window\.DeckAiPics\?\.run\)/.test(refine), "переделка презентации сама вставляет картинки в том же процессе (когда просьба про картинки)");
ok(/Рисуем, только если просьба про картинки/.test(appSrc), "догенерирование не растрачивает бюджет на каждую правку без картинок");
ok(/картинки не добавлены/.test(refine), "ошибка картинок логируется в консоль (не глотается)");
ok(/console\.warn\("\[картинки\] вставка в презентацию:"/.test(appSrc), "ошибка вставки на слайд выводится в консоль");
ok(/s\.addShape\(pptx\.ShapeType\.rect, \{ x: b\.x, y: b\.y, w: b\.w, h: b\.h, fill: \{ color: "F4F1EA"/.test(slidesSrc), "если картинка не вставилась в PowerPoint — рамка-плейсхолдер");

/* ---------- 4. Серверный пул: ответ сервиса → байты в памяти (data URL), без диска/S3 ---------- */
const { createRequire } = await import("node:module");
const require = createRequire(import.meta.url);
process.env.IMG_POOL = JSON.stringify([{ label: "test", key: "sk-test-123456789", url: "https://api.example.ru/v1", model: "flux-schnell" }]);
const IMG = require(path.join(root, "proxy", "image-pool.js"));
const PNG_BUF = Buffer.from(PNG, "base64");
const mkArgs = (body) => {
  const request = async () => ({ statusCode: 200 });
  const readAll = async () => JSON.stringify(body);
  const fetchImage = async url => ({ type: "image/png", buf: PNG_BUF });
  return [request, readAll, null, fetchImage];
};
try {
  const urlCase = await IMG.image("тест", "16:9", ...mkArgs({ data: [{ url: "https://cdn.example.com/a.png" }] }));
  ok(/^data:image\/png;base64,/.test(urlCase.image), "сервер: ссылку от сервиса скачивает сам и отдаёт data URL (CORS в браузере не мешает)");
  const prefixed = await IMG.image("тест", "16:9", ...mkArgs({ data: [{ b64_json: "data:image/png;base64," + PNG }] }));
  ok((prefixed.image.match(/^data:image\/png;base64,/g) || []).length === 1, "сервер: не добавляет второй префикс к data URL");
  const rawCase = await IMG.image("тест", "16:9", ...mkArgs({ data: [{ b64_json: PNG }] }));
  ok(/^data:image\/png;base64,/.test(rawCase.image) && Buffer.from(rawCase.image.split(",")[1], "base64").equals(PNG_BUF), "сервер: чистый base64 → data URL без потери байтов");
  let broken = "";
  try { await IMG.image("тест", "16:9", ...mkArgs({ data: [{ url: "https://cdn.example.com/x.png" }] }).map((v, i) => i === 3 ? async () => { throw new Error("нет сети"); } : v)); } catch (e) { broken = String(e.message || e); }
  ok(/ссылку/i.test(broken) && /скачать/i.test(broken), "сервер: если ссылку скачать не удалось, понятная ошибка", broken);
} catch (e) { ok(false, "серверный пул картинок", e.message); }

if (failed) { console.log(`\nПРОВАЛ: ${failed}`); process.exit(1); }
console.log("\nВсе проверки пайплайна картинок пройдены.");
