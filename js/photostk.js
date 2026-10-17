/* ===================================================================
   «Учу по ФРП» — фото-наклейки поверх слайда.
   Любую картинку (своё фото, картинку со слайда, найденную в Яндексе)
   можно «вклеить» наклейкой: вырезать по контуру с белой обводкой,
   на рваной бумаге, полароидом, на скотче, маркой или кругом.
   Наклейка «запекается» в PNG с прозрачностью — поэтому одинаково
   выглядит в редакторе, в показе и в PowerPoint (там её можно двигать).
   =================================================================== */
const PhotoStk = (() => {
  "use strict";
  const STYLES = {
    cut: "Вырезка с белой обводкой", tornCut: "Вырезка, рваный край", torn: "Рваная бумага", polaroid: "Полароид",
    tape: "На скотче", stamp: "Марка", circle: "Круг", plain: "Просто фото с тенью"
  };
  const MAX = 900;
  const rnd = seed => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const loadImg = blob => new Promise((res, rej) => { const u = URL.createObjectURL(blob), im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = u; });
  const canvas = (w, h) => { const c = document.createElement("canvas"); c.width = Math.round(w); c.height = Math.round(h); return c; };
  const toBlob = c => new Promise(r => c.toBlob(r, "image/png"));
  function fit(im, max = MAX) { const k = Math.min(1, max / Math.max(im.width, im.height)); return [Math.round(im.width * k), Math.round(im.height * k)]; }
  function jagPath(g, x, y, w, h, amp, step, R) { // рваный прямоугольник
    const pts = [];
    const edge = (x1, y1, x2, y2) => { const L = Math.hypot(x2 - x1, y2 - y1), n = Math.max(3, Math.round(L / step)); for (let i = 0; i < n; i++) { const t = i / n, nx = -(y2 - y1) / L, ny = (x2 - x1) / L, d = (R() - .5) * amp * (R() < .15 ? 2.2 : 1); pts.push([x1 + (x2 - x1) * t + nx * d, y1 + (y2 - y1) * t + ny * d]); } };
    edge(x, y, x + w, y); edge(x + w, y, x + w, y + h); edge(x + w, y + h, x, y + h); edge(x, y + h, x, y);
    g.beginPath(); pts.forEach(([a, b], i) => i ? g.lineTo(a, b) : g.moveTo(a, b)); g.closePath();
  }
  // силуэт с обводкой: «раздуваем» альфу картинки по кругу
  function outline(im, w, h, r, color, rough, R) {
    const pad = r * 2 + 8, c = canvas(w + pad * 2, h + pad * 2), g = c.getContext("2d");
    const steps = 36;
    for (let k = 0; k < steps; k++) { const a = k / steps * Math.PI * 2, rr = rough ? r * (.65 + R() * .7) : r; g.drawImage(im, pad + Math.cos(a) * rr, pad + Math.sin(a) * rr, w, h); }
    g.drawImage(im, pad, pad, w, h);
    g.globalCompositeOperation = "source-in"; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
    return { c, pad };
  }
  function shadowed(src, blur = 14, dy = 8, op = .35) {
    const m = blur + dy + 4, c = canvas(src.width + m * 2, src.height + m * 2), g = c.getContext("2d");
    g.shadowColor = `rgba(0,0,0,${op})`; g.shadowBlur = blur; g.shadowOffsetY = dy; g.drawImage(src, m, m);
    return c;
  }
  function paperGrain(g, w, h, R, op = .05) { for (let k = 0; k < w * h / 900; k++) { g.fillStyle = `rgba(120,100,70,${op * R()})`; g.fillRect(R() * w, R() * h, 1 + R() * 2, 1 + R() * 2); } }
  async function removeBg(blob) { const lib = await import("https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.4.5/+esm"); return lib.removeBackground(blob); }

  /* Главное: из картинки — наклейка выбранного вида */
  async function make(blob, style = "torn", { cut = false, caption = "", seed = 7 } = {}) {
    const R = rnd(seed * 7919 + 13);
    if ((style === "cut" || style === "tornCut") && cut) blob = await removeBg(blob);
    const im = await loadImg(blob); const [w, h] = fit(im);
    let out;
    if (style === "cut" || style === "tornCut") {
      const r = Math.max(10, Math.round(Math.max(w, h) * .028));
      const o = outline(im, w, h, r, "#FFFFFF", style === "tornCut", R);
      const g = o.c.getContext("2d");
      if (style === "tornCut") { g.globalCompositeOperation = "source-atop"; paperGrain(g, o.c.width, o.c.height, R, .12); }
      g.globalCompositeOperation = "source-over"; g.drawImage(im, o.pad, o.pad, w, h);
      out = shadowed(o.c, 12, 6, .38);
    } else if (style === "torn") {
      const b = Math.round(Math.max(w, h) * .05), c = canvas(w + b * 2, h + b * 2), g = c.getContext("2d");
      g.save(); jagPath(g, 4, 4, c.width - 8, c.height - 8, b * .55, b * .55, R); g.fillStyle = "#FBF8F1"; g.fill(); g.clip(); paperGrain(g, c.width, c.height, R); g.restore();
      g.save(); jagPath(g, b, b, w, h, b * .35, b * .45, R); g.clip(); g.drawImage(im, b, b, w, h); g.restore();
      out = shadowed(c, 16, 8, .32);
    } else if (style === "polaroid") {
      const b = Math.round(Math.max(w, h) * .05), bot = Math.round(h * .2 + b), c = canvas(w + b * 2, h + b + bot), g = c.getContext("2d");
      g.fillStyle = "#FFFFFF"; g.fillRect(0, 0, c.width, c.height); paperGrain(g, c.width, c.height, R, .04);
      g.drawImage(im, b, b, w, h);
      if (caption) { g.fillStyle = "#2A2A2A"; g.font = `${Math.round(bot * .38)}px Caveat, 'Marck Script', 'Comic Sans MS', cursive`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(caption.slice(0, 40), c.width / 2, h + b + bot / 2, c.width - b * 2); }
      out = shadowed(c, 18, 10, .35);
    } else if (style === "tape") {
      const b = Math.round(Math.max(w, h) * .025), t = Math.round(Math.max(w, h) * .09), c = canvas(w + b * 2 + t, h + b * 2 + t), g = c.getContext("2d");
      const ox = t / 2, oy = t / 2;
      g.shadowColor = "rgba(0,0,0,.3)"; g.shadowBlur = 12; g.shadowOffsetY = 6; g.fillStyle = "#fff"; g.fillRect(ox, oy, w + b * 2, h + b * 2); g.shadowColor = "transparent";
      g.drawImage(im, ox + b, oy + b, w, h);
      const tape = (x, y, a) => { g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = "rgba(244,227,161,.82)"; const tw = t * 2.4, th = t * .75; g.beginPath(); g.moveTo(-tw / 2, -th / 2); for (let k = 0; k <= 4; k++) g.lineTo(-tw / 2 + (k % 2 ? 4 : 0), -th / 2 + th * k / 4); g.lineTo(tw / 2, th / 2); for (let k = 4; k >= 0; k--) g.lineTo(tw / 2 - (k % 2 ? 4 : 0), -th / 2 + th * k / 4); g.closePath(); g.fill(); g.restore(); };
      tape(ox + t * .6, oy + t * .3, -.6); tape(c.width - ox - t * .6, oy + t * .3, .6);
      out = c;
    } else if (style === "stamp") {
      const b = Math.round(Math.max(w, h) * .06), c = canvas(w + b * 2, h + b * 2), g = c.getContext("2d"), hole = b * .32, gap = hole * 2.6;
      g.fillStyle = "#FBF8F1"; g.fillRect(0, 0, c.width, c.height);
      g.globalCompositeOperation = "destination-out";
      for (let x = gap / 2; x < c.width; x += gap) { g.beginPath(); g.arc(x, 0, hole, 0, 7); g.arc(x, c.height, hole, 0, 7); g.fill(); }
      for (let y = gap / 2; y < c.height; y += gap) { g.beginPath(); g.arc(0, y, hole, 0, 7); g.arc(c.width, y, hole, 0, 7); g.fill(); }
      g.globalCompositeOperation = "source-over"; g.drawImage(im, b, b, w, h); g.strokeStyle = "rgba(0,0,0,.15)"; g.lineWidth = 2; g.strokeRect(b, b, w, h);
      out = shadowed(c, 10, 5, .3);
    } else if (style === "circle") {
      const d = Math.min(w, h), b = Math.round(d * .06), c = canvas(d + b * 2, d + b * 2), g = c.getContext("2d");
      g.beginPath(); g.arc(c.width / 2, c.height / 2, c.width / 2, 0, 7); g.fillStyle = "#fff"; g.fill();
      g.save(); g.beginPath(); g.arc(c.width / 2, c.height / 2, d / 2, 0, 7); g.clip(); g.drawImage(im, (w - d) / 2 * -1 + b, (h - d) / 2 * -1 + b, w, h); g.restore();
      out = shadowed(c, 14, 7, .35);
    } else { const c = canvas(w, h); c.getContext("2d").drawImage(im, 0, 0, w, h); out = shadowed(c, 16, 8, .35); }
    return { blob: await toBlob(out), ar: out.width / out.height };
  }

  /* Окно: выбрать вид наклейки (живые превью) */
  async function openDialog(blob, { caption = "", onDone }) {
    const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const m = openModal(`<div class="dialog wide"><div class="dlg-h"><h2>Фото-наклейка</h2><button class="btn ghost x" data-close aria-label="Закрыть">×</button></div><div class="dlg-b">
      <p class="hint">Выберите вид — наклейка встанет поверх слайда, её можно двигать, поворачивать (колёсико) и менять размер (+/−).</p>
      <div class="mat-row"><label class="check"><input type="checkbox" id="psCut"> Вырезать по контуру (убрать фон) — для вида «Вырезка»</label><label>Подпись (для полароида) <input type="text" id="psCap" value="${esc(caption)}" maxlength="40"></label></div>
      <div class="ps-grid" id="psGrid">${Object.entries(STYLES).map(([k, n]) => `<button class="ps-it" data-ps="${k}"><span class="ps-pv"><i>…</i></span><small>${n}</small></button>`).join("")}</div>
      <p class="small" id="psMsg"></p></div></div>`);
    const $m = s => m.querySelector(s);
    let src = blob, cutDone = null;
    const previews = async () => {
      // превью — по уменьшенной копии, чтобы было быстро
      const im = await loadImg(src), [w, h] = fit(im, 260), c = canvas(w, h); c.getContext("2d").drawImage(im, 0, 0, w, h); const small = await toBlob(c);
      for (const b of m.querySelectorAll("[data-ps]")) { try { const r = await make(small, b.dataset.ps, { caption: $m("#psCap").value }); b.querySelector(".ps-pv").innerHTML = `<img src="${URL.createObjectURL(r.blob)}" alt="">`; } catch { } }
    };
    previews();
    $m("#psCut").onchange = async e => {
      if (!e.target.checked) { src = blob; previews(); return; }
      $m("#psMsg").textContent = "Убираю фон… Первый раз загружается модель (около 40 МБ), это может занять минуту.";
      try { cutDone = cutDone || await removeBg(blob); src = cutDone; $m("#psMsg").textContent = "Фон убран — выберите «Вырезка»."; previews(); }
      catch (err) { $m("#psMsg").textContent = "Не получилось убрать фон: " + (err.message || err); e.target.checked = false; }
    };
    let t; $m("#psCap").oninput = () => { clearTimeout(t); t = setTimeout(previews, 500); };
    m.querySelectorAll("[data-ps]").forEach(b => b.onclick = async () => {
      $m("#psMsg").textContent = "Готовлю наклейку…";
      try { const r = await make(src, b.dataset.ps, { caption: $m("#psCap").value }); closeModal(); onDone?.(r); }
      catch (err) { $m("#psMsg").textContent = "Не получилось: " + (err.message || err); }
    });
  }
  return { STYLES, make, openDialog, removeBg };
})();
window.PhotoStk = PhotoStk;
