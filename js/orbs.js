/* Шарики-предметы в шапке: плавают сами, сталкиваются, их можно хватать и бросать. */
(() => {
  const SUBJ = [
    ["ru", "Русский язык", "Aa", "#FF8FA3", "#FFC93C"], ["lit", "Литература", "📖", "#B58CFF", "#FF8FA3"],
    ["math", "Математика", "∑", "#4FC3F7", "#6C63FF"], ["inf", "Информатика", "💻", "#2DD4BF", "#3B82F6"],
    ["phys", "Физика", "⚛", "#8A6BFF", "#FF5A3C"], ["chem", "Химия", "⚗", "#A3E635", "#14B8A6"],
    ["bio", "Биология", "🌱", "#86EFAC", "#1F7A70"], ["geo", "География", "🌍", "#38BDF8", "#34D399"],
    ["hist", "История", "🏛", "#FFC93C", "#FB923C"], ["soc", "Обществознание", "⚖", "#F9A8D4", "#A78BFA"],
    ["eng", "Английский язык", "EN", "#60A5FA", "#F472B6"], ["art", "ИЗО", "🎨", "#FDE047", "#F43F5E"],
    ["mus", "Музыка", "♪", "#C084FC", "#FB7185"], ["tech", "Технология", "🔧", "#FDBA74", "#EF4444"],
    ["obzr", "ОБЗР", "🛟", "#FCA5A5", "#F97316"], ["pe", "Физкультура", "⚽", "#5EEAD4", "#84CC16"]
  ];
  const root = document.getElementById("orbs"); if (!root) return;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const COL = ["#FFC93C", "#FF8FA3", "#1F7A70", "#FF5A36", "#3CB043"];
  const SHAPES = ["38% 62% 63% 37%/41% 44% 56% 59%", "58% 42% 38% 62%/52% 60% 40% 48%", "45% 55% 60% 40%/55% 38% 62% 45%", "62% 38% 46% 54%/40% 58% 42% 60%"];
  const KS = [1.5, 0.7, 1.0, 1.25, 0.8, 1.1, 0.6, 1.35, 0.9, 1.15, 0.75, 1.4, 0.65, 1.0, 0.85, 1.2];
  const B = SUBJ.map(([id, name, ico], i) => {
    const el = document.createElement("div"); el.className = "orb"; el.dataset.id = id; el.title = name;
    el.style.background = COL[i % COL.length]; el.style.borderRadius = SHAPES[i % SHAPES.length];
    el.style.color = COL[i % COL.length] === "#1F7A70" ? "#fff" : "#1B1330";
    el.innerHTML = `<span class="oi">${ico}</span><span class="on">${name}</span>`;
    root.appendChild(el);
    return { el, id, name, x: 0, y: 0, vx: 0, vy: 0, r: 30, k: KS[i], drag: false };
  });
  let W = 0, H = 0, started = false;
  const layout = () => {
    const w = root.clientWidth, h = root.clientHeight; if (!w || !h) return false;
    const d = Math.max(42, Math.min(90, Math.sqrt(w * h * 0.26 * 4 / (Math.PI * B.length * 1.1))));
    B.forEach(b => { b.r = d * b.k / 2; b.el.style.width = b.el.style.height = b.r * 2 + "px"; b.el.style.fontSize = Math.max(16, b.r * 0.72) + "px"; });
    if (!started) {
      B.forEach((b, i) => { b.x = b.r + Math.random() * Math.max(1, w - 2 * b.r); b.y = b.r + Math.random() * Math.max(1, h - 2 * b.r); const a = Math.random() * 6.28; b.vx = Math.cos(a) * 0.18; b.vy = Math.sin(a) * 0.18; });
      started = true;
    }
    B.forEach(b => { b.x = Math.min(Math.max(b.x, b.r), w - b.r); b.y = Math.min(Math.max(b.y, b.r), h - b.r); });
    W = w; H = h; return true;
  };
  const paint = () => B.forEach(b => { b.el.style.transform = `translate(${b.x - b.r}px,${b.y - b.r}px)`; });
  const step = () => {
    for (const b of B) {
      if (b.drag) continue;
      b.vx += (Math.random() - .5) * 0.012; b.vy += (Math.random() - .5) * 0.012;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 0.6) { b.vx *= 0.98; b.vy *= 0.98; } else if (sp < 0.1) { const k = 0.1 / (sp || 1); b.vx *= k; b.vy *= k; if (!sp) b.vx = 0.1; }
      b.x += b.vx; b.y += b.vy;
    }
    for (const b of B) {
      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); } if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx); }
      if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy); } if (b.y > H - b.r) { b.y = H - b.r; b.vy = -Math.abs(b.vy); }
    }
    for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
      const a = B[i], c = B[j], dx = c.x - a.x, dy = c.y - a.y, min = a.r + c.r, d2 = dx * dx + dy * dy;
      if (d2 >= min * min || !d2) continue;
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, ov = min - d;
      const ma = a.r * a.r, mc = c.r * c.r, t = ma + mc;
      const wa = a.drag ? 0 : mc / t, wc = c.drag ? 0 : ma / t, ws = (wa + wc) || 1;
      a.x -= nx * ov * wa / ws; a.y -= ny * ov * wa / ws; c.x += nx * ov * wc / ws; c.y += ny * ov * wc / ws;
      const rv = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny; if (rv > 0) continue;
      const imp = -1.6 * rv / (1 / ma + 1 / mc);
      if (!a.drag) { a.vx -= imp * nx / ma; a.vy -= imp * ny / ma; } if (!c.drag) { c.vx += imp * nx / mc; c.vy += imp * ny / mc; }
    }
  };
  let run = false, vis = true, raf = 0;
  const loop = () => { raf = 0; if (!vis || document.hidden) { run = false; return; } step(); paint(); raf = requestAnimationFrame(loop); };
  const go = () => { if (!run && vis && !still) { run = true; raf = requestAnimationFrame(loop); } };
  new ResizeObserver(() => { if (layout()) { paint(); go(); } }).observe(root);
  new IntersectionObserver(e => { vis = e[0].isIntersecting; if (vis) go(); }).observe(root);
  document.addEventListener("visibilitychange", go);

  // перетаскивание и бросок
  B.forEach(b => {
    let ox = 0, oy = 0, moved = 0, last = 0, lx = 0, ly = 0, sx = 0, sy = 0;
    b.el.addEventListener("pointerdown", e => {
      b.el.setPointerCapture(e.pointerId); b.drag = true; moved = 0; sx = e.clientX; sy = e.clientY;
      const r = root.getBoundingClientRect(); ox = e.clientX - r.left - b.x; oy = e.clientY - r.top - b.y;
      lx = b.x; ly = b.y; last = performance.now(); b.vx = b.vy = 0; b.el.classList.add("on-drag"); root.appendChild(b.el); e.preventDefault();
    });
    b.el.addEventListener("pointermove", e => {
      if (!b.drag) return; const r = root.getBoundingClientRect();
      moved = Math.max(moved, Math.hypot(e.clientX - sx, e.clientY - sy));
      b.x = Math.min(Math.max(e.clientX - r.left - ox, b.r), W - b.r); b.y = Math.min(Math.max(e.clientY - r.top - oy, b.r), H - b.r);
      const t = performance.now(), dt = Math.max(8, t - last); b.vx = (b.x - lx) / dt * 16; b.vy = (b.y - ly) / dt * 16; lx = b.x; ly = b.y; last = t;
      if (still) paint();
    });
    const end = e => {
      if (!b.drag) return; b.drag = false; b.el.classList.remove("on-drag");
      if (performance.now() - last > 80) b.vx = b.vy = 0;
      const sp = Math.hypot(b.vx, b.vy); if (sp > 3) { b.vx *= 3 / sp; b.vy *= 3 / sp; }
            go();
    };
    b.el.addEventListener("pointerup", end); b.el.addEventListener("pointercancel", end);
    
  });
})();
