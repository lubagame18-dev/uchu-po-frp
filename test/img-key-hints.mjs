/* Проверка подсказок для общих ключей картинок (кабинет разработчика).
   Запуск: node test/img-key-hints.mjs
   История: в слот вставили ключ Intelion (ic-…), а адрес API не задали — пул ушёл
   в AITUNNEL по умолчанию, и сервис ответил 401 «недействительный токен».
   Теперь мастер-форма сама распознаёт такой ключ, ставит адрес и модель,
   а адрес, вписанный в «Название», переносит в «Свой адрес API». */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = f => fs.readFileSync(path.join(root, f), "utf8");
let failed = 0;
const ok = (cond, name, extra = "") => { if (cond) console.log(`  ok   ${name}`); else { failed++; console.log(`  FAIL ${name}${extra ? " — " + extra : ""}`); } };

const gen = (() => {
  const store = {};
  const ctx = {
    window: {}, console: { log() { }, warn() { }, error() { } },
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    setTimeout, clearTimeout, Promise, Math, Date, JSON, Error, String, Number, Array, Object, RegExp, encodeURIComponent, decodeURIComponent, AbortController
  };
  vm.createContext(ctx);
  vm.runInContext(read("js/imagegen.js"), ctx, { filename: "js/imagegen.js" });
  return ctx.window.ImageGen;
})();

console.log("1. Случай со скриншота: ключ Intelion, адрес вписан в «Название»");
{
  const r = gen.fixSlotForm({ label: "aiapi.intelion.cloud", url: "", model: "flux-schnell", keyHint: "ic-…ba72" });
  ok(r.url === "https://aiapi.intelion.cloud/v1", "адрес перенесён и дополнен /v1", r.url);
  ok(r.label === "", "в названии не осталось адреса", JSON.stringify(r.label));
  ok(r.model === "flux.1-schnell", "модель заменена на intelion flux.1-schnell", r.model);
  ok(r.moves.length >= 2, "пользователю показано, что исправлено", r.moves.join("; "));
}

console.log("2. Адрес не задан, но ключ Intelion в слоте");
{
  const r = gen.fixSlotForm({ label: "Intelion", url: "", model: "", keyHint: "ic-…ba72" });
  ok(r.url === "https://aiapi.intelion.cloud/v1", "подставлен адрес Intelion", r.url);
  ok(r.model === "flux.1-schnell", "подставлена модель", r.model);
  ok(r.label === "Intelion", "название не тронуто", r.label);
}

console.log("3. Адрес без https:// и со слэшем");
{
  const r = gen.fixSlotForm({ label: "слот", url: "aiapi.intelion.cloud/", model: "", keyHint: "" });
  ok(r.url === "https://aiapi.intelion.cloud/v1", "адрес нормализован", r.url);
  ok(r.model === "flux.1-schnell", "модель Intelion", r.model);
}

console.log("4. Другой сервис: ничего не подменяем");
{
  const r = gen.fixSlotForm({ label: "AITUNNEL", url: "", model: "flux-schnell", keyHint: "sk-…1234" });
  ok(r.url === "", "адрес не выдумываем (сервер и так идёт в AITUNNEL)", JSON.stringify(r.url));
  ok(r.model === "flux-schnell", "модель не тронута", r.model);
  ok(r.moves.length === 0, "лишних правок нет", r.moves.join("; "));
}

console.log("5. Распознавание ключа и адреса");
{
  ok(gen.keyProvider("ic-abcdef")?.name === "Intelion", "ic- → Intelion");
  ok(gen.keyProvider("sk-abcdef")?.name === "AITUNNEL", "sk- → AITUNNEL");
  ok(gen.keyProvider("ключ") === null, "неизвестный ключ → без догадок");
  ok(gen.looksLikeUrl("aiapi.intelion.cloud") === true, "домен похож на адрес");
  ok(gen.looksLikeUrl("https://api.example.ru/v1") === true, "URL похож на адрес");
  ok(gen.looksLikeUrl("Intelion") === false, "подпись — не адрес");
  ok(gen.looksLikeUrl("Мой общий ключ") === false, "фраза — не адрес");
}

console.log("6. Интерфейс кабинета использует эти подсказки");
{
  const dev = read("js/devmode.js");
  ok(dev.includes("fixSlotForm"), "форма вызывает fixSlotForm");
  ok(dev.includes("Подставить адрес Intelion"), "есть кнопка «Подставить адрес Intelion»");
  ok(dev.includes("AITUNNEL такой ключ не принимает"), "предупреждение о несовпадении ключа и адреса");
  ok(dev.includes("Куда уходят запросы"), "видно, куда уходят запросы слота");
  ok(dev.includes("Название (подпись, не адрес)"), "поле названия подписано понятно");
}

console.log("7. Сервис по умолчанию у каждого пула свой (текст — DeepSeek, картинки — AITUNNEL)");
{
  const dev = read("js/devmode.js");
  ok(dev.includes('defaultName: "DeepSeek"'), "текстовому пулу передан DeepSeek");
  ok(dev.includes('defaultName: "AITUNNEL"'), "пулу картинок передан AITUNNEL");
  ok(dev.includes("esc(o.defaultName"), "предупреждение берёт сервис из пула, а не жёстко AITUNNEL");
  const bad = /color:#b42318">Адрес API не задан/.test(dev);
  ok(!bad, "нет красного «уходят в AITUNNEL» для всех пулов сразу");
  ok(dev.includes("https://api.deepseek.com"), "в подсказке текста указан адрес DeepSeek");
  ok(/o\.images && !x\.empty && !x\.url && icKey/.test(dev), "предупреждение про Intelion только для пула картинок");
}

if (failed) { console.log(`\nПРОВАЛ: ${failed}`); process.exit(1); }
console.log("\nВсе проверки пройдены.");
