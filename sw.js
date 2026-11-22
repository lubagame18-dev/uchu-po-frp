/* «Учу по ФРП» — работа без интернета (service worker).
   • Файлы сайта (страница, стили, модули, встроенная база и ФРП) хранятся в кэше браузера:
     сайт открывается и собирает уроки по локальным алгоритмам даже без сети.
   • Свои файлы сайта: сначала сеть (чтобы обновления с GitHub приходили сразу), без сети — кэш.
   • Библиотеки (Word, PowerPoint, PDF, шрифты): из кэша, если уже были загружены.
   • Ответы Википедии и Викитеки запоминаются: урок по той же теме без сети соберётся с ними.
   • Ключи нейросетей, запросы к нейросетям и к GitHub в кэш не попадают. */
const VERSION = "uchu-v5.491-worksheet-print";
const SHELL = ["./", "index.html", "css/v5.css", "data/base.js", "data/own.js", "data/extra.js", "data/frp.js", "data/promo.js", "data/legal.js", "data/culture.js", "manifest.json",
  "vendor/marked.umd.js", "vendor/purify.min.js", "vendor/turndown.js", "vendor/turndown-plugin-gfm.js", "vendor/pptxgen.bundle.js", "vendor/jszip.min.js", "vendor/docx.umd.js",
  ...["log", "cleaner", "learn", "learn2", "variety", "methodbase", "plans-loader", "kits-loader", "imagegen", "frpkit", "subjects", "lesson-quality", "usage", "heur", "litkit", "notes", "dictation", "verify", "ocr", "materials", "collect", "devmode", "devcover", "accounts-config", "accounts-backend", "privacy", "account", "presence", "cloudbase", "rules", "schemes", "tablekit", "layout", "lessonnotes", "tutor", "mnemo", "themes", "themes2", "artdirection", "video", "photostk", "access", "rukit", "deck", "slides", "culture", "publish", "sync", "worksearch", "ai", "blobs", "qr", "quizlink"].map(n => `js/${n}.js`)];
SHELL.push("data/people.js", "data/lesson-images.js", "vendor/html2pdf.bundle.min.js",
  ...["app-part1", "app-part2", "supportlib", "materialresolver", "cardsplus", "subjects-base", "subjects-depth",
    "litsec", "rusec", "teacherrules", "methodology", "dossier", "conventions"].map(n => `js/${n}.js`));
/* официальные планы 2025 (лениво грузятся по предмету; кэшируем для офлайна) */
SHELL.push("data/frp2025/index.js", "data/frp2025/lit.js",
  ...["math", "inf", "phys", "chem", "bio", "geo", "hist", "soc", "izo", "mus", "tech", "pe", "okr", "eng", "ru1", "lit1", "obzh", "orkse"].map(s => `data/frp2025/${s}.js`));
const CDN = /^https:\/\/(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;
const NOCACHE = /\/js\/(?:accounts-config|yandex-auth)\.js(?:\?|$)|\/(?:yandex|google|accounts-confirm)\.html(?:\?|$)|supabase\.co\/|\/api\/uchu(?:\/|$)|\/api\/collections(?:\/|$)/; // облако кабинета и OAuth callback — всегда напрямую
const WIKI = /^https:\/\/ru\.(wikipedia|wikisource)\.org\/w\/api\.php/;

self.addEventListener("install", e => {
  const critical = new Set(["./", "index.html", "js/app-part1.js", "js/app-part2.js"]);
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: "reload" })).catch(error => {
    if (critical.has(u)) throw error;
  })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("uchu-") && k !== VERSION && k !== "uchu-runtime").map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const timeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
async function networkFirst(req, cacheName, ms) {
  const c = await caches.open(cacheName);
  try { const r = await timeout(fetch(req), ms); if (r && r.ok) c.put(req, r.clone()); return r; }
  catch { const hit = await c.match(req, { ignoreSearch: req.mode === "navigate" }); if (hit) return hit; if (req.mode === "navigate") { const idx = await c.match("index.html"); if (idx) return idx; } throw new Error("offline"); }
}
async function cacheFirst(req) {
  const c = await caches.open("uchu-runtime");
  const hit = await c.match(req); if (hit) return hit;
  const r = await fetch(req); if (r && (r.ok || r.type === "opaque")) c.put(req, r.clone()); return r;
}
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (NOCACHE.test(req.url)) { e.respondWith(fetch(req, {cache:"no-store"})); return; }
  if (url.origin === location.origin) { e.respondWith(networkFirst(req, VERSION, /\/data\//.test(url.pathname) ? 15000 : 4000)); return; }
  if (CDN.test(req.url)) { e.respondWith(cacheFirst(req)); return; }
  if (WIKI.test(req.url)) { e.respondWith(networkFirst(req, "uchu-runtime", 8000)); return; }
});
self.addEventListener("message", e => {
  if (e.data?.type === "precache" && Array.isArray(e.data.urls)) {
    e.waitUntil(caches.open("uchu-runtime").then(c => Promise.all(e.data.urls.map(u => c.match(u).then(h => h || fetch(u, { mode: "cors" }).then(r => (r.ok || r.type === "opaque") && c.put(u, r)).catch(() => null))))).then(() => e.source?.postMessage({ type: "precached" })));
  }
});








