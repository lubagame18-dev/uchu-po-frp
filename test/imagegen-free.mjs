/* Проверка запасного бесплатного генератора картинок (js/imagegen.js).
   Запуск: node test/imagegen-free.mjs           — офлайн, на заглушках
           node test/imagegen-free.mjs --live    — плюс настоящий запрос к image.pollinations.ai
   Правила, которые проверяем:
   1) сервер сайта сломан (5xx) — картинку рисует бесплатный генератор, картинка помечена free;
   2) отказ по входу/тарифу/лимиту (401/403/402) не обходим — запасной генератор не зовём;
   3) если сервер работает — запасной генератор не зовём;
   4) если сломан и запасной — показываем понятную ошибку, а не молчим;
   5) свой ключ разработчика важнее: при нём бесплатный генератор не зовём;
   6) бесплатный генератор можно выключить в настройках (free: false). */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SITE = "https://uchu-po-frp.ru/js/imagegen.js";
/* --remote — проверяем не локальный файл, а тот, который уже выложен на сайте */
let source = fs.readFileSync(path.join(root, "js", "imagegen.js"), "utf8");
if (process.argv.includes("--remote")) {
  const r = await fetch(SITE, { headers: { "Cache-Control": "no-cache" } });
  if (!r.ok) throw new Error("не удалось взять живой js/imagegen.js: HTTP " + r.status);
  source = await r.text();
  console.log(`Источник: живой сайт, ${source.length} символов\n`);
}
const SITE_FN = "https://functions.yandexcloud.net/d4ek0q8grbhn7q5muf24";
let failed = 0;
const ok = (cond, name, extra = "") => { if (cond) console.log(`  ok   ${name}`); else { failed++; console.log(`  FAIL ${name}${extra ? " — " + extra : ""}`); } };

function makeCtx() { const o = { measureText: () => ({ width: 10 }), createRadialGradient: () => ({ addColorStop() { } }) }; return new Proxy(o, { get: (t, p) => (p in t ? t[p] : () => { }), set: (t, p, v) => { t[p] = v; return true; } }); }
function makeCanvas() { return { width: 0, height: 0, getContext: () => makeCtx(), toDataURL: t => `data:${t};base64,TUlOSQ==` }; }

function jsonRes(status, body) { return { ok: status >= 200 && status < 300, status, json: async () => body, blob: async () => ({ type: "image/jpeg", arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer }), text: async () => JSON.stringify(body) }; }

function harness({ server, free, imgCfg = {}, site = SITE_FN, now = Date.now } = {}) {
  const calls = [];
  const fetchMock = async (url, opts) => { const u = String(url); calls.push(u); if (u.includes("pollinations")) return free ? free(u, opts) : jsonRes(429, { error: "no free" }); return server(u, opts); };
  const store = { "uchu:img": JSON.stringify({ free: true, ...imgCfg }) };
  const ctx = {
    console: { log() { }, warn() { }, error() { } },
    setTimeout, clearTimeout, setInterval, clearInterval, Promise, Math, Date: { now }, JSON, Error, String, Number, Array, Object, RegExp, encodeURIComponent, decodeURIComponent, btoa, atob,
    AbortController,
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    document: { createElement: () => makeCanvas() },
    Image: class { set src(v) { this._src = v; setTimeout(() => { this.width = 1024; this.height = 576; this.onload && this.onload(); }, 0); } get src() { return this._src; } },
    FileReader: class { readAsDataURL(b) { const self = this; if (b && typeof b.arrayBuffer === "function") b.arrayBuffer().then(buf => { self.result = "data:image/jpeg;base64," + Buffer.from(new Uint8Array(buf)).toString("base64"); self.onload && self.onload(); }, err => self.onerror && self.onerror(err)); else setTimeout(() => { self.result = "data:image/jpeg;base64,TUlOSQ=="; self.onload && self.onload(); }, 0); } },
    fetch: fetchMock,
  };
  ctx.window = { UCHU_SITE: { yandexFunction: site }, Access: { commercial: () => true, isDev: () => false }, Account: { session: { access: "user-token" } } };
  ctx.Access = ctx.window.Access; // в браузере Access — глобальная переменная, а не только window.Access
  ctx.Account = ctx.window.Account;
  vm.createContext(ctx);
  vm.runInContext(source, ctx, { filename: "js/imagegen.js" });
  return { gen: ctx.window.ImageGen, calls };
}

const serverOk = () => jsonRes(200, { image: "QUJD" });
const freeOk = () => jsonRes(200, { image: "QUJD" });
const PROMPT = "Educational illustration about the lesson topic, no text, no letters. " + "x".repeat(600);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log("1. Сервер сайта сломан (502) — рисовать должен бесплатный генератор");
  {
    let serverCalls = 0;
    const { gen, calls } = harness({ server: () => { serverCalls++; return jsonRes(502, { error: "Картинку не удалось нарисовать ни на одном общем ключе: HTTP 401 ..." }); }, free: freeOk });
    const r = await gen.image(PROMPT, { aspect: "16:9", maxW: 1280 });
    ok(r && r.free === true, "картинка помечена free", JSON.stringify(r));
    ok(String(r.url).startsWith("data:image/"), "картинка — data URL");
    ok(serverCalls === 1, "сервер не мучали повторами", `вызовов сервера: ${serverCalls}`);
    ok(calls.some(u => u.includes("image.pollinations.ai/prompt/")), "бесплатный генератор вызван");
    const u = calls.find(x => x.includes("pollinations"));
    ok(/width=1280&height=720/.test(u), "размер 16:9 (1280×720)", u.slice(0, 120));
    ok(decodeURIComponent(u).includes("no text, no letters"), "промпт доехал (конец сохранён)");
    const t = await gen.test();
    ok(t.ok === true && t.free === true, "ImageGen.test() показывает бесплатный генератор");
  }

  console.log("2. Отказ по входу (401) — тариф и вход не обходим");
  {
    const { gen, calls } = harness({ server: () => jsonRes(401, { error: "Войдите в личный кабинет." }), free: freeOk });
    let err = "";
    try { await gen.image(PROMPT, { aspect: "16:9" }); } catch (e) { err = String(e.message || e); }
    ok(/войдите/i.test(err), "ошибка про вход", err);
    ok(!calls.some(u => u.includes("pollinations")), "запасной генератор не звали");
  }

  console.log("2а. После сбоя проверяем актуальный ответ сервера");
  {
    let clock = Date.now();
    let status = 0;
    const { gen, calls } = harness({ now: () => clock, server: () => {
      if (!status) throw new TypeError("Failed to fetch");
      return jsonRes(status, {});
    }, free: freeOk });
    const result = await gen.image(PROMPT);
    ok(result.free === true, "сетевой сбой переключает на запасной генератор");
    clock += 121000;
    status = 429;
    let error;
    try { await gen.image(PROMPT); } catch (e) { error = e; }
    ok(error?.status === 429 && calls.length === 3, "после восстановления лимит сервера не обходится и запрос не повторяется");
  }

  console.log("3. Сервер работает — бесплатный генератор не нужен");
  {
    const { gen, calls } = harness({ server: serverOk, free: freeOk });
    const r = await gen.image(PROMPT, { aspect: "1:1" });
    ok(!r.free, "картинка от сервера");
    ok(!calls.some(u => u.includes("pollinations")), "запасной генератор не звали");
  }

  console.log("4. Сломан и сервер, и запасной генератор — понятная ошибка");
  {
    const { gen } = harness({ server: () => jsonRes(503, { error: "на сервере не подключён ни один общий ключ для картинок", reason: "no_key" }), free: () => jsonRes(429, { error: "queue full" }) });
    let err = "";
    try { await gen.image(PROMPT, { aspect: "16:9" }); } catch (e) { err = String(e.message || e); }
    ok(/запасной бесплатный генератор/.test(err), "в тексте ошибки виден запасной генератор", err);
    ok(/лимит|перегружен|429/.test(err), "видна причина (лимит/перегрузка)", err);
  }

  console.log("4а. Лимит бесплатного тарифа («одна картинка в 45 секунд») — ждём и повторяем");
  {
    let freeCalls = 0;
    const free = () => { freeCalls++; return freeCalls === 1 ? jsonRes(402, { error: { code: "FREE_LIMIT", message: "Free limit reached: 1 image every 45 seconds per IP. Retry after 1s" } }) : freeOk(); };
    const { gen } = harness({ server: () => jsonRes(502, { error: "сломан" }), free });
    const t0 = Date.now();
    const r = await gen.image(PROMPT, { aspect: "16:9" });
    ok(r.free === true, "после ожидания картинка получена");
    ok(freeCalls === 2, "бесплатный генератор вызван дважды (лимит → повтор)", `вызовов: ${freeCalls}`);
    ok(Date.now() - t0 >= 2500, "подождали столько, сколько просил сервис", `${Date.now() - t0} мс`);
  }

  console.log("5. Свой ключ разработчика — бесплатный генератор не трогаем");
  {
    const { gen, calls } = harness({ server: u => (u.includes("yandexcloud") ? jsonRes(500, { error: "нельзя" }) : jsonRes(200, { data: [{ b64_json: "QUJD" }] })), free: freeOk, imgCfg: { provider: "images", key: "sk-own", base: "https://api.example.ru/v1", model: "flux-schnell" } });
    const r = await gen.image(PROMPT, { aspect: "16:9" });
    ok(!r.free, "картинка по своему ключу");
    ok(calls.some(u => u.startsWith("https://api.example.ru/v1/images/generations")), "запрос ушёл на свой адрес");
    ok(!calls.some(u => u.includes("pollinations")), "бесплатный генератор не звали");
    ok(!calls.some(u => u.includes("functions.yandexcloud.net")), "сервер сайта не звали");
  }

  console.log("6. Бесплатный генератор можно выключить (free: false)");
  {
    const { gen, calls } = harness({ server: () => jsonRes(502, { error: "сломан" }), free: freeOk, imgCfg: { free: false } });
    let err = "";
    try { await gen.image(PROMPT, { aspect: "16:9" }); } catch (e) { err = String(e.message || e); }
    ok(/сервер сайта/.test(err), "ошибка про сервер сайта", err);
    ok(!calls.some(u => u.includes("pollinations")), "запасной генератор выключен");
    ok(gen.configured() === false || gen.freeOn() === false, "configured()/freeOn() учитывают выключение");
  }

  console.log("7. Одна сломанная сборка не долбит сервер каждую картинку");
  {
    let serverCalls = 0;
    const { gen } = harness({ server: () => { serverCalls++; return jsonRes(502, { error: "сломан" }); }, free: freeOk });
    await gen.image(PROMPT, { aspect: "16:9" });
    await gen.image(PROMPT + " 2", { aspect: "16:9" });
    await gen.image(PROMPT + " 3", { aspect: "16:9" });
    ok(serverCalls === 1, "сервер спросили один раз, дальше сразу бесплатный", `вызовов: ${serverCalls}`);
  }

  console.log("8. Адрес сервера не задан вовсе — сразу бесплатный генератор, без пустого запроса");
  {
    const { gen, calls } = harness({ site: "", server: () => jsonRes(500, { error: "нельзя" }), free: freeOk });
    const r = await gen.image(PROMPT, { aspect: "16:9" });
    ok(r.free === true, "картинка от запасного генератора");
    ok(!calls.some(u => u.includes("yandexcloud")), "на пустой адрес сервера не стучались");
  }

  console.log("9. Окно с ошибкой показываем только при отказе по тарифу, а не при поломке сервера");
  {
    const app = fs.readFileSync(path.join(root, "js", "app-part2.js"), "utf8");
    const line = app.split("\n").find(l => l.startsWith("const imgTechFail = "));
    ok(!!line, "правило imgTechFail найдено в app-part2.js");
    const expr = line.slice(line.indexOf("=") + 1, line.lastIndexOf(";")).trim();
    const techFail = vm.runInNewContext(`(${expr})`);
    const cases = [
      ["сервер сайта: 502 ошибка сервиса: Картинку не удалось нарисовать ни на одном общем ключе: HTTP 401 ...", true],
      ["сервер сайта: 502 ошибка сервиса: ...; запасной бесплатный генератор лимит бесплатного тарифа (одна картинка в 45 секунд)", true],
      ["войдите в личный кабинет", false],
      ["картинки входят в тариф «С ИИ»: 6 листов в месяц", false],
      ["Лимит листов с картинками на этот месяц исчерпан (6 в месяц). Он обновится в начале следующего месяца.", false],
      ["Нейросеть не нарисовала картинки: ваш ключ: 402 недостаточно средств на счёте", false],
    ];
    for (const [msg, want] of cases) ok(techFail(msg) === want, `imgTechFail(${msg.slice(0, 42)}…) = ${want}`);
  }

  if (process.argv.includes("--live")) {
    console.log("10. Живой запрос к бесплатному генератору (интернет)");
    const { gen } = harness({ server: () => jsonRes(200, { image: "QUJD" }), free: (u, o) => globalThis.fetch(u, o) /* настоящий запрос, не заглушка */ });
    const t0 = Date.now();
    const u = await gen.freeRaw("A friendly smiling sun in pastel colours, flat vector, white background, no text", "1:1");
    const ms = Date.now() - t0;
    ok(typeof u === "string" && u.startsWith("data:image/"), "живая картинка получена", String(u).slice(0, 40));
    ok(u.length > 5000, "картинка не пустая", `${Math.round(u.length / 1024)} КБ, ${ms} мс`);
  }

  await sleep(10);
  if (failed) { console.log(`\nПРОВАЛ: ${failed}`); process.exit(1); }
  console.log("\nВсе проверки пройдены.");
}

main().catch(e => { console.error("Ошибка проверки:", e); process.exit(1); });
