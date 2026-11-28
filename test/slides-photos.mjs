/* Фотографии на слайдах презентации: проверка в настоящем браузере (Chrome headless + CDP).
   Запуск: node test/slides-photos.mjs
   Проверяем:
   1) своя база портретов не отбрасывается проверкой «как у Викисклада» — портрет Пушкина
      реально выбирается для слайда «портрет»;
   2) при сборке презентации «commons:портрет» получает родной портрет из базы сайта,
      а не пустую схему-заглушку;
   3) подобранная фотография действительно отображается на слайде (у <img> есть размеры). */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CHROME = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9494;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
let failed = 0;
const ok = (cond, name, extra = "") => { if (cond) console.log("  ok   " + name); else { failed++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); } };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/") p = "/index.html";
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(buf);
  });
});

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "uchu-photos-"));
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=" + PORT, "--user-data-dir=" + userData,
  "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--no-sandbox",
  "--disable-dev-shm-usage", "--disable-crash-reporter", "about:blank"], { stdio: "ignore" });

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
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch("http://127.0.0.1:" + PORT + "/json/version"); if (r.ok) return await r.json(); } catch { }
    await sleep(400);
  }
  throw new Error("Chrome не открыл порт отладки");
}
async function ev(cdp, expression, awaitPromise = false) {
  const r = await cdp.send("Runtime.evaluate", { expression, awaitPromise, returnByValue: true });
  if (r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description || r.exceptionDetails.text || "ошибка в странице").split("\n")[0]);
  return r.result?.value;
}

async function main() {
  await new Promise(res => server.listen(0, "127.0.0.1", res));
  const site = "http://127.0.0.1:" + server.address().port + "/index.html";
  console.log("Сайт: " + site);
  await debugPort();
  const page = await (await fetch("http://127.0.0.1:" + PORT + "/json/new?" + encodeURIComponent("about:blank"), { method: "PUT" })).json();
  const cdp = new CDP(page.webSocketDebuggerUrl);
  await cdp.opened;
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");
  await cdp.send("Page.navigate", { url: site });
  let ready = false;
  for (let i = 0; i < 140; i++) {
    const r = await ev(cdp, "typeof Media !== 'undefined' && typeof SlideEditor !== 'undefined' && Object.keys(window.UCHU_PEOPLE?.people||{}).length > 100").catch(() => false);
    if (r === true) { ready = true; break; }
    await sleep(500);
  }
  ok(ready, "сайт загрузился, база портретов на месте");
  if (!ready) return;

  /* 1. Выбор родного портрета для запроса «Пушкин портрет» */
  const pick = await ev(cdp, `(async () => {
    const items = await Media.search("Пушкин портрет", 12, { yandex: false });
    const picked = Media.pickBest("Пушкин портрет", items, null, Media.artIntent("Пушкин портрет"), "Пушкин портрет");
    return { n: items.length, url: picked ? String(picked.url) : "", title: picked ? String(picked.title || "") : "" };
  })()`, true);
  ok(pick.n > 0, "в базе сайта есть портрет Пушкина", JSON.stringify(pick));
  ok(/img\/people\//.test(pick.url), "для «портрет Пушкина» выбирается портрет из базы сайта, а не пусто", JSON.stringify(pick));
  ok(/Пушкин/.test(pick.title), "подпись портрета — имя писателя", pick.title);

  /* 2. Сборка слайда: «commons:портрет» получает фото из базы, а не заглушку */
  const fill = await ev(cdp, `(async () => {
    const md = "## Портрет писателя\\n\\nАлександр Сергеевич Пушкин — автор романа «Евгений Онегин».\\n\\n![Портрет Пушкина](commons:" + encodeURIComponent("Пушкин портрет") + " \\"q=Пушкин портрет\\")";
    const out = await SlideEditor.fillImages(md, { subject: "lit", grade: 9, topic: "А.С. Пушкин. «Евгений Онегин»" });
    const m = new RegExp(Media.RE.source).exec(out);
    return { out, src: m ? String(m[2]) : "", cap: m ? String(m[1]) : "" };
  })()`, true);
  ok(!/^(search|commons):/.test(fill.src), "незаполненной заготовки на слайде не осталось", fill.src);
  ok(!/^data:image\/svg/.test(fill.src), "вместо схемы-заглушки на слайде фотография", fill.src.slice(0, 60));
  ok(/Пушкин/.test(fill.cap), "фото подписано (портрет конкретного писателя)", fill.cap);

  /* 3. Фотография действительно отображается на слайде */
  const shown = await ev(cdp, `(async () => {
    const host = document.createElement("div");
    host.id = "photo-check";
    host.style.cssText = "position:fixed;left:0;top:0;width:900px;background:#fff;z-index:99999";
    document.body.appendChild(host);
    host.innerHTML = SlideEditor.slideHtml({ title: "Портрет писателя", body: "Пушкин — автор романа.\\n\\n![" + "Портрет Пушкина](img/people/pushkin.webp \\"q=Пушкин портрет\\")", set: {}, notes: "" }, 0);
    await Media.hydrate(host);
    await new Promise(r => setTimeout(r, 500));
    const img = host.querySelector("figure.pic img");
    return { exists: !!img, w: img ? img.naturalWidth : 0, placeholder: !!host.querySelector(".pic-empty") };
  })()`, true);
  ok(shown.exists && shown.w > 0, "фото на слайде отрисовано (не «Изображение недоступно»)", JSON.stringify(shown));
  ok(!shown.placeholder, "вместо фото не появилась заглушка", JSON.stringify(shown));
  cdp.close();
}

main().catch(e => { failed++; console.error("Ошибка проверки в браузере:", e.message || e); })
  .finally(async () => {
    try { chrome.kill(); } catch { }
    try { server.close(); } catch { }
    await sleep(300);
    try { fs.rmSync(userData, { recursive: true, force: true }); } catch { }
    if (failed) { console.log(`\nПРОВАЛ: ${failed}`); process.exit(1); }
    console.log("\nЖивая проверка фото на слайдах пройдена.");
  });
