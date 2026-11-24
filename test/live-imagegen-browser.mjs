/* Проверка на живом сайте в настоящем браузере (Chrome headless + CDP):
   берём уже выложенный js/imagegen.js, подменяем ответ сервера сайта на 502 (как сейчас,
   когда общий ключ картинок недействителен) и смотрим, что картинка всё равно появляется
   от бесплатного запасного генератора — по-настоящему, с CORS и настоящей сетью.
   Запуск: node test/live-imagegen-browser.mjs [url] */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const URL_SITE = process.argv[2] || "https://uchu-po-frp.ru/";
const CHROME = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9339;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "uchu-live-"));
let failed = 0;
const ok = (cond, name, extra = "") => { if (cond) console.log(`  ok   ${name}`); else { failed++; console.log(`  FAIL ${name}${extra ? " — " + extra : ""}`); } };

const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${userData}`, "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--disable-dev-shm-usage", "about:blank"], { stdio: "ignore" });

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl); this.id = 0; this.pending = new Map();
    this.ws.addEventListener("message", ev => { const m = JSON.parse(ev.data); const p = m.id && this.pending.get(m.id); if (p) { this.pending.delete(m.id); m.error ? p.no(new Error(m.error.message)) : p.ok(m.result); } });
    this.opened = new Promise((ok2, no2) => { this.ws.addEventListener("open", ok2, { once: true }); this.ws.addEventListener("error", () => no2(new Error("не удалось подключиться к браузеру")), { once: true }); });
  }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((ok2, no2) => this.pending.set(id, { ok: ok2, no: no2 })); }
  close() { try { this.ws.close(); } catch { } }
}

async function debugPort() {
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return await r.json(); } catch { }
    await sleep(400);
  }
  throw new Error("Chrome не открыл порт отладки");
}

async function main() {
  console.log(`Сайт: ${URL_SITE}`);
  await debugPort();
  const page = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(URL_SITE)}`, { method: "PUT" })).json();
  const cdp = new CDP(page.webSocketDebuggerUrl);
  await cdp.opened;
  await cdp.send("Runtime.enable");

  let ready = null;
  for (let i = 0; i < 90; i++) {
    const r = await cdp.send("Runtime.evaluate", { expression: "!!(window.ImageGen && document.readyState === 'complete')", returnByValue: true }).catch(() => null);
    if (r?.result?.value) { ready = true; break; }
    await sleep(500);
  }
  ok(!!ready, "страница сайта загрузилась, js/imagegen.js на месте");
  const info = await cdp.send("Runtime.evaluate", { expression: "JSON.stringify({v: (document.querySelector('script[src*=sw]')||{}).src || '', gen: !!window.ImageGen, free: window.ImageGen && window.ImageGen.freeOn && window.ImageGen.freeOn(), site: window.ImageGen && window.ImageGen.siteUrl && window.ImageGen.siteUrl()})", returnByValue: true });
  console.log("  окружение:", String(info?.result?.value || "").slice(0, 200));

  const expr = `(async () => {
    const t0 = Date.now(), realFetch = window.fetch.bind(window);
    let intercepted = 0;
    window.fetch = function (u, o) {
      const s = String((u && u.url) || u || "");
      if (s.indexOf("functions.yandexcloud.net") >= 0) { intercepted++; return Promise.resolve(new Response(JSON.stringify({ error: "Картинку не удалось нарисовать ни на одном общем ключе: HTTP 401 {\\"error\\":{\\"code\\":401,\\"type\\":\\"authentication_failed\\"}}" }), { status: 502, headers: { "Content-Type": "application/json" } })); }
      return realFetch(u, o);
    };
    try {
      const r = await ImageGen.image("A friendly smiling sun in pastel colours, flat vector, white background, no text, no letters", { aspect: "1:1", maxW: 256 });
      window.fetch = realFetch;
      return { ok: true, free: !!r.free, len: r.url.length, w: r.w, h: r.h, ms: Date.now() - t0, intercepted, prefix: String(r.url).slice(0, 24) };
    } catch (e) { window.fetch = realFetch; return { ok: false, error: String(e.message || e), ms: Date.now() - t0, intercepted }; }
  })()`;
  const res = await cdp.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  const r = res?.result?.value || {};
  ok(r.ok === true, "картинка создалась, несмотря на сломанный сервер", r.error || "");
  ok(r.free === true, "включён бесплатный запасной генератор", JSON.stringify(r));
  ok(r.intercepted >= 1, "сервер сайта действительно ответил 502 (сценарий из окна на скриншоте)");
  ok(String(r.prefix || "").startsWith("data:image/"), "картинка пришла как data URL (CORS в браузере прошёл)", String(r.prefix || ""));
  ok(r.len > 3000, "картинка не пустая", `${Math.round((r.len || 0) / 1024)} КБ, ${r.ms} мс`);
  cdp.close();
}

main().catch(e => { failed++; console.error("Ошибка проверки в браузере:", e.message || e); })
  .finally(async () => { try { chrome.kill(); } catch { } await sleep(300); try { fs.rmSync(userData, { recursive: true, force: true }); } catch { } if (failed) { console.log(`\nПРОВАЛ: ${failed}`); process.exit(1); } console.log("\nЖивая проверка в браузере пройдена."); });
