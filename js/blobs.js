/* Три пятна в шапке: их можно сдвинуть, и они очень медленно возвращаются на место. */
(() => {
  const hero = document.querySelector(".hero"), els = [...document.querySelectorAll(".hero .blob")];
  if (!hero || !els.length) return;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const TAU = 7000; // мс: чем больше, тем медленнее возврат
  const S = els.map(el => ({ el, x: 0, y: 0, drag: false }));
  let raf = 0, last = 0;
  const apply = s => { s.el.style.translate = `${s.x}px ${s.y}px`; };
  const tick = t => {
    const dt = Math.min(60, t - last || 16); last = t; let busy = false;
    for (const s of S) {
      if (s.drag || (!s.x && !s.y)) continue;
      const k = 1 - Math.exp(-dt / TAU), d = Math.hypot(s.x, s.y), step = Math.max(d * k, 0.05 * dt / 16);
      if (d <= step) { s.x = s.y = 0; } else { s.x -= s.x / d * step; s.y -= s.y / d * step; busy = true; }
      apply(s);
    }
    raf = busy || S.some(s => s.drag) ? requestAnimationFrame(tick) : 0;
  };
  const go = () => { if (!raf && !still) { last = 0; raf = requestAnimationFrame(tick); } };
  S.forEach(s => {
    let px = 0, py = 0;
    s.el.style.pointerEvents = "auto"; s.el.style.cursor = "grab"; s.el.style.touchAction = "none";
    s.el.addEventListener("pointerdown", e => { s.el.setPointerCapture(e.pointerId); s.drag = true; px = e.clientX; py = e.clientY; s.el.style.cursor = "grabbing"; e.preventDefault(); });
    s.el.addEventListener("pointermove", e => {
      if (!s.drag) return;
      const hr = hero.getBoundingClientRect(), cx = Math.min(Math.max(e.clientX, hr.left), hr.right), cy = Math.min(Math.max(e.clientY, hr.top), hr.bottom);
      s.x += cx - px; s.y += cy - py; px = cx; py = cy; apply(s);
    });
    const end = () => { if (!s.drag) return; s.drag = false; s.el.style.cursor = "grab"; go(); };
    s.el.addEventListener("pointerup", end); s.el.addEventListener("pointercancel", end);
  });
})();
