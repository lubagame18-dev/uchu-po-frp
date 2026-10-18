/* ===================================================================
   «Учу по ФРП» — распознавание сканов (OCR) прямо в браузере.
   PDF без текстового слоя: каждая страница рисуется в картинку (pdf.js)
   и распознаётся Tesseract (русский + английский). Работает очередью,
   по одной странице, с сохранением прогресса: если закрыть вкладку,
   распознавание продолжится со следующей страницы.
   Статусы: «в очереди», «распознаётся N из M», «распознано», «ошибка».
   После распознавания текст очищается (Cleaner) и становится доступен
   для чтения, поиска и копирования.
   =================================================================== */
const OCR = (() => {
  "use strict";
  const TESS = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
  let worker = null, running = false;
  const listeners = new Set();
  const emit = () => listeners.forEach(fn => { try { fn(); } catch { } });
  const blobKey = id => "blob:" + id;

  async function loadTess() {
    if (window.Tesseract) return;
    await new Promise((res, rej) => { const s = document.createElement("script"); s.src = TESS; s.onload = res; s.onerror = () => rej(new Error("не загрузился модуль распознавания (нужен интернет)")); document.head.appendChild(s); });
  }
  async function getWorker() {
    if (worker) return worker;
    await loadTess();
    worker = await window.Tesseract.createWorker(["rus", "eng"], 1, { logger: () => { } });
    return worker;
  }
  /* Сохранить исходный файл скана, чтобы его можно было распознать (и позже — повторно) */
  async function keepFile(id, file) { try { await Store.put("kv", blobKey(id), file); return true; } catch { return false; } }
  async function hasFile(id) { try { return !!(await Store.get("kv", blobKey(id))); } catch { return false; } }

  /* распознанный текст — дальше по тому же пути, что и обычный файл:
     у разработчика — в общую базу сайта, у учителя — автору сайта («Присланные учителями») */
  async function afterText(m) {
    try {
      if (m.devEmbed && window.CloudBase && window.Account?.session) { if (await CloudBase.publish(m)) { m.cloudAt = new Date().toISOString(); await Store.put("materials", m.id, m); } }
    } catch (e) { console.warn("ocr after", e); }
  }
  async function enqueue(m) {
    m.ocr = { status: "queue", page: 0, pages: m.pages || null, at: new Date().toISOString() };
    await Store.put("materials", m.id, m); emit(); run();
  }
  async function run() {
    if (running) return; running = true;
    try {
      while (true) {
        const all = await Store.all("materials");
        const m = all.find(x => x.ocr && (x.ocr.status === "queue" || x.ocr.status === "run"));
        if (!m) break;
        await one(m);
      }
    } finally { running = false; emit(); }
  }
  async function one(m) {
    const file = await Store.get("kv", blobKey(m.id)).catch(() => null);
    if (!file) { m.ocr = { ...m.ocr, status: "error", error: "нет исходного файла: прикрепите скан ещё раз" }; await Store.put("materials", m.id, m); emit(); return; }
    try {
      // картинка (фото страницы, скриншот): распознаём сразу
      if (/^image\//.test(file.type || "") || /\.(png|jpe?g|webp|bmp|gif|tiff?)$/i.test(m.name || "")) {
        const w = await getWorker(); m.ocr = { ...m.ocr, status: "run", pages: 1 }; emit();
        const r = await w.recognize(file);
        const raw = (r.data.text || "").trim();
        const cl = window.Cleaner ? Cleaner.clean(raw, {}) : { text: raw, report: [] };
        m.text = cl.text; m.chars = cl.text.length; m.scanned = false;
        m.ocr = { status: "done", page: 1, pages: 1, at: new Date().toISOString() };
        if (window.Materials) Object.assign(m, Materials.classify(m));
        await Store.put("materials", m.id, m); toast(`Распознано: «${m.title || m.name}»`, 5000); await afterText(m);
        if (typeof loadMaterials === "function") await loadMaterials();
        emit(); return;
      }
      await loadScript("pdfworker"); await loadScript("pdfjs");
      const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
      const w = await getWorker();
      m.ocr = { ...m.ocr, status: "run", pages: pdf.numPages };
      const parts = m.ocrParts || [];
      for (let i = (m.ocr.page || 0) + 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 2 });
        const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
        await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
        const r = await w.recognize(c);
        parts[i - 1] = (r.data.text || "").trim();
        m.ocrParts = parts; m.ocr.page = i;
        await Store.put("materials", m.id, m); emit();
      }
      const raw = parts.join("\n\f\n");
      const cl = window.Cleaner ? Cleaner.clean(raw, { pdf: true }) : { text: raw, report: [] };
      m.text = cl.text; m.chars = cl.text.length; m.scanned = false; delete m.ocrParts;
      m.cleaned = { summary: window.Cleaner ? Cleaner.summary(cl.report) : "", report: cl.report, at: new Date().toISOString() };
      m.ocr = { status: "done", page: pdf.numPages, pages: pdf.numPages, at: new Date().toISOString() };
      if (window.Materials) Object.assign(m, Materials.classify(m));
      await Store.put("materials", m.id, m); await afterText(m);
      toast(`Распознано: «${m.title || m.name}» — ${pdf.numPages} стр.`, 6000);
      if (typeof loadMaterials === "function") await loadMaterials();
    } catch (e) {
      m.ocr = { ...m.ocr, status: "error", error: String(e?.message || e) };
      await Store.put("materials", m.id, m);
    }
    emit();
  }
  function label(m) {
    const o = m.ocr;
    if (!o) return m.scanned ? { cls: "warn", text: "скан: нужно распознать" } : null;
    if (o.status === "queue") return { cls: "info", text: "OCR: в очереди" };
    if (o.status === "run") return { cls: "info", text: `OCR: ${o.page || 0} из ${o.pages || "?"} стр.` };
    if (o.status === "done") return { cls: "ok", text: "распознано" };
    if (o.status === "error") return { cls: "red", text: "OCR: ошибка" };
    return null;
  }
  return { enqueue, run, keepFile, hasFile, label, onChange: fn => listeners.add(fn), off: fn => listeners.delete(fn) };
})();
window.OCR = OCR;
document.addEventListener("uchu:ready", () => OCR.run().catch(() => { }));
