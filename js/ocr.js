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
    try { await worker.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1" }); } catch (e) { console.warn("ocr params", e); }
    return worker;
  }
  async function ocrCanvas(src, mode = "normal") {
    let bmp = src;
    if (typeof HTMLCanvasElement === "undefined" || !(src instanceof HTMLCanvasElement)) {
      try { bmp = await createImageBitmap(src); }
      catch { bmp = await new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = URL.createObjectURL(src); }); }
    }
    const w0 = bmp.width || bmp.naturalWidth || 1600, h0 = bmp.height || bmp.naturalHeight || 2000;
    const scale = Math.min(2.2, Math.max(0.45, 2000 / Math.max(1, w0)));
    const c = document.createElement("canvas"); c.width = Math.round(w0 * scale); c.height = Math.round(h0 * scale);
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    try { ctx.filter = mode === "binary" ? "grayscale(1) contrast(1.7) brightness(1.08)" : "grayscale(1) contrast(1.28) brightness(1.04)"; } catch { }
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    try { ctx.filter = "none"; } catch { }
    if (mode === "binary") {
      try { const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data; for (let i = 0; i < d.length; i += 4) { const g = d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114; const v = g > 168 ? 255 : 0; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; } ctx.putImageData(img, 0, 0); } catch { }
    }
    if (bmp.close) { try { bmp.close(); } catch { } }
    return c;
  }
  function ocrTableMd(rows) {
    const clean = x => String(x == null ? "" : x).replace(/\|/g, "\\|").trim();
    const rs = (rows || []).map(r => r.map(clean)).filter(r => r.some(Boolean));
    if (rs.length < 2) return "";
    const n = Math.max(...rs.map(r => r.length));
    const norm = r => Array.from({ length: n }, (_, i) => r[i] || "");
    const head = norm(rs[0]);
    return [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rs.slice(1).map(r => `| ${norm(r).join(" | ")} |`)].join("\n");
  }
  function ocrStructure(data, text) {
    const lines = (data?.lines || []).map(l => String(l.text || "").trim()).filter(Boolean);
    const rows = [];
    for (const line of lines) { const cells = line.split(/\s{2,}|\t+/).map(x => x.trim()).filter(Boolean); if (cells.length >= 2) rows.push(cells); }
    if (rows.length >= 2) { const md = ocrTableMd(rows); if (md) return { text, markdown: `${text}\n\n${md}`, tables: [rows] }; }
    return { text, markdown: text, tables: [] };
  }
  async function recognizeBest(src) {
    const w = await getWorker();
    // Node/unit-test fallback: there is no Canvas; Tesseract mock/recognizer gets the source directly.
    if (typeof document === "undefined" || typeof HTMLCanvasElement === "undefined" || !document.createElement) {
      const plain = await w.recognize(src);
      return { data: plain.data, text: String(plain.data?.text || "") };
    }
    const first = await w.recognize(await ocrCanvas(src, "normal"));
    let best = { data: first.data, text: String(first.data?.text || "") };
    const conf = Number(first.data?.confidence) || 0;
    if (conf < 72 || String(best.text).replace(/\s/g, "").length < 24) {
      try {
        const second = await w.recognize(await ocrCanvas(src, "binary"));
        const c2 = Number(second.data?.confidence) || 0, len2 = String(second.data?.text || "").replace(/\s/g, "").length, len1 = String(best.text).replace(/\s/g, "").length;
        if (c2 > conf + 3 || (c2 > conf - 5 && len2 > len1 * 1.12)) best = { data: second.data, text: String(second.data?.text || "") };
      } catch (e) { console.warn("ocr second pass", e); }
    }
    return best;
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
        m.ocr = { ...m.ocr, status: "run", pages: 1 }; emit();
        const r = await recognizeBest(file);
        const raw = (r.text || "").trim();
        const cl = window.Cleaner ? Cleaner.clean(raw, {}) : { text: raw, report: [] };
        const st = ocrStructure(r.data, cl.text);
        m.text = cl.text; m.chars = cl.text.length; m.scanned = false;
        m.markdown = st.markdown; m.tables = st.tables; m.format = "ocr-image";
        m.ocr = { status: "done", page: 1, pages: 1, confidence: r.data?.confidence || null, at: new Date().toISOString() };
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
        const vp = page.getViewport({ scale: 3 });
        const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
        await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
        const r = await recognizeBest(c);
        parts[i - 1] = (r.text || "").trim();
        const stPage = ocrStructure(r.data, parts[i - 1]);
        m.ocrParts = parts; m.ocr.page = i;
        m.ocrTables = [...(m.ocrTables || []), ...stPage.tables];
        m.ocrMarkdownParts = [...(m.ocrMarkdownParts || []), stPage.markdown || parts[i - 1]];
        await Store.put("materials", m.id, m); emit();
      }
      const raw = parts.join("\n\f\n");
      const cl = window.Cleaner ? Cleaner.clean(raw, { pdf: true }) : { text: raw, report: [] };
      m.text = cl.text; m.chars = cl.text.length; m.scanned = false;
      m.markdown = (m.ocrMarkdownParts || []).length ? m.ocrMarkdownParts.join("\n\n") : cl.text;
      m.tables = m.ocrTables || []; m.format = "ocr-pdf";
      delete m.ocrParts; delete m.ocrTables; delete m.ocrMarkdownParts;
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
  /* Распознать одну картинку (фото страницы учебника, скан задания) прямо в текст.
     Используется кнопкой «Фото учебника» в заметках к уроку. */
  async function text(file) {
    const r = await recognizeBest(file);
    const raw = String(r?.text || "").trim();
    if (!raw) return "";
    if (Number.isFinite(r?.data?.confidence) && r.data.confidence < 35) throw new Error("текст распознан неуверенно — нужно более чёткое фото");
    return raw.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{4,}/g, "\n\n").trim();
  }
  return { enqueue, run, keepFile, hasFile, label, text, onChange: fn => listeners.add(fn), off: fn => listeners.delete(fn) };
})();
window.OCR = OCR;
document.addEventListener("uchu:ready", () => OCR.run().catch(() => { }));
