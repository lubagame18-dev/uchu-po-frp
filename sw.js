/* «Учу по ФРП» — работа без интернета (service worker).
   • Файлы сайта (страница, стили, модули, встроенная база и ФРП) хранятся в кэше браузера:
     сайт открывается и собирает уроки по локальным алгоритмам даже без сети.
   • Свои файлы сайта: сначала сеть (чтобы обновления с GitHub приходили сразу), без сети — кэш.
   • Библиотеки (Word, PowerPoint, PDF, шрифты): из кэша, если уже были загружены.
   • Ответы Википедии и Викитеки запоминаются: урок по той же теме без сети соберётся с ними.
   • Ключи нейросетей, запросы к нейросетям и к GitHub в кэш не попадают. */
const VERSION = "uchu-v5.215";
const SHELL = ["./", "index.html", "css/v5.css", "data/base.js", "data/own.js", "data/extra.js", "data/frp.js", "data/promo.js", "data/legal.js", "manifest.json",
  "vendor/marked.umd.js", "vendor/purify.min.js", "vendor/turndown.js", "vendor/turndown-plugin-gfm.js", "vendor/pptxgen.bundle.js", "vendor/jszip.min.js", "vendor/docx.umd.js",
  ...["log", "cleaner", "learn", "learn2", "variety", "methodbase", "plans-loader", "kits-loader", "imagegen", "frpkit", "subjects", "usage", "heur", "litkit", "notes", "verify", "ocr", "materials", "collect", "devmode", "devcover", "account", "cloudbase", "rules", "schemes", "layout", "lessonnotes", "tutor", "mnemo", "themes", "themes2", "video", "photostk", "access", "rukit", "deck", "slides", "publish", "sync", "worksearch", "ai", "blobs"].map(n => `js/${n}.js`)];
const CDN = /^https:\/\/(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;
const NOCACHE = /supabase\.co\//; // облако кабинета — всегда напрямую
const WIKI = /^https:\/\/ru\.(wikipedia|wikisource)\.org\/w\/api\.php/;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: "reload" })).catch(() => null)))).then(() => self.skipWaiting()));
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
  if (url.origin === location.origin) { e.respondWith(networkFirst(req, VERSION, /\/data\//.test(url.pathname) ? 15000 : 4000)); return; }
  if (CDN.test(req.url)) { e.respondWith(cacheFirst(req)); return; }
  if (WIKI.test(req.url)) { e.respondWith(networkFirst(req, "uchu-runtime", 8000)); return; }
});
self.addEventListener("message", e => {
  if (e.data?.type === "precache" && Array.isArray(e.data.urls)) {
    e.waitUntil(caches.open("uchu-runtime").then(c => Promise.all(e.data.urls.map(u => c.match(u).then(h => h || fetch(u, { mode: "cors" }).then(r => (r.ok || r.type === "opaque") && c.put(u, r)).catch(() => null))))).then(() => e.source?.postMessage({ type: "precached" })));
  }
});
