/* ===================================================================
   «Учу по ФРП» — оформление сайта: цветовые темы (как на репетиторской платформе) и шарики в шапке.
   Тема меняет только цвета: фон, кнопки, акценты, плашки. Раскладка и форма элементов остаются.
   Контраст обеспечивается расчётом: из палитры темы берутся максимально разные по оттенку цвета,
   затем каждый подгоняется под читаемость текста (белого на тёмных кнопках, тёмного на светлых).
   Выбор хранится в этом браузере; открыть его можно из личного кабинета и кнопкой 🎨 в шапке.
   =================================================================== */
const Look = (() => {
  "use strict";
  const KEY = "uchu:theme";
  const THEMES = [
    { k: "classic", n: "Классика", mode: "light", base: "#FFFCF3", bg: ["#FFC93C", "#FF8FA3", "#1F7A70", "#DCEBFF"], ink: "#1B1330", accent: "#FF5A36", accent2: "#1F7A70", sun: "#FFC93C", folders: ["#FF5A36", "#1F7A70", "#FFC93C", "#FF8FA3", "#3CB043", "#6B2BD9"], plain: true },

    {k:"lavender", n:"Лаванда", mode:"light", base:"#efe8f8", bg:["#7b4cf5","#ee5fa8","#ffb37a","#7fd6c2"], ink:"#231a3a", accent:"#7b4cf5", accent2:"#ee5fa8", sun:"#ffd23f",
      folders:["#8b6cf0","#ee7fb4","#b48cf2","#f2a07c","#7fc8c0","#c77dd8","#9fa8f5","#e58fb0"]},
    {k:"hvoya", n:"Хвоя", mode:"dark", base:"#173a24", bg:["#1f4a2a","#4f7f45","#9cbf7a","#d9e6a8"], ink:"#f2f6e6", accent:"#b7d98c", accent2:"#6f9c5a", sun:"#e9e48a",
      folders:["#4f7f45","#7da35f","#2f6a3c","#9cbf7a","#5c8a6a","#a8b86a","#3e7350","#c2cf8a"]},
    {k:"bordo", n:"Бордо", mode:"dark", base:"#4a0f1c", bg:["#5e1220","#8c2a35","#b85560","#e3a6a0"], ink:"#fbeff0", accent:"#f0a1a6", accent2:"#c4545f", sun:"#f3d29a",
      folders:["#a8323f","#c4545f","#8c2a35","#d9837f","#7a1f2e","#b8606a","#9e4250","#cf7b72"]},
    {k:"lemon", n:"Лимон", mode:"light", base:"#c9c9bd", bg:["#b5b6a6","#e9e6a0","#8c8d80","#f4f1c4"], ink:"#2c2d24", accent:"#6b6a2a", accent2:"#a39b3a", sun:"#ece27a",
      folders:["#d4c96a","#a8aa95","#e3dc8c","#8f907f","#c7bd55","#b9bba6","#e9e1a0","#9c9d8a"]},
    {k:"peach", n:"Персик", mode:"light", base:"#f6cdb4", bg:["#e8765f","#f2a07a","#f6c99a","#e9b6a8"], ink:"#3d1d16", accent:"#c4513f", accent2:"#e8765f", sun:"#ffd08a",
      folders:["#e8765f","#f2a07a","#e39a8c","#f0b77c","#d4685a","#f4b39a","#e08a6c","#ebc08e"]},
    {k:"coast", n:"Побережье", mode:"light", base:"#dbd4cc", bg:["#7d929e","#0f3b59","#dba12c","#efe9e2"], ink:"#0f2335", accent:"#0f3b59", accent2:"#2e6a8f", sun:"#dba12c",
      folders:["#0f3b59","#7d929e","#dba12c","#4f7590","#3e251e","#b48a3a","#2d5878","#a3b1b9"]},
    {k:"still", n:"Натюрморт", mode:"dark", base:"#25271a", bg:["#343723","#7d2826","#898861","#4a2a1e"], ink:"#efe9d7", accent:"#e0a49c", accent2:"#898861", sun:"#e9d9a6",
      folders:["#7d2826","#898861","#9b4a3f","#5f613f","#a8a67c","#6e3a2c","#b46a5c","#77785a"]},
    {k:"gold", n:"Золото", mode:"light", base:"#ffedca", bg:["#f19502","#897523","#fffdf2","#e8c27a"], ink:"#250e02", accent:"#8a4a00", accent2:"#c27a06", sun:"#f19502",
      folders:["#f19502","#897523","#d9a83a","#b8742a","#a89040","#e0b35a","#7a6420","#efc070"]},
    {k:"galaxy", n:"Галактика", mode:"dark", base:"#16153a", bg:["#3d2645","#03045e","#c9184a","#89c2d9","#f49cbb"], ink:"#fff4f8", accent:"#f49cbb", accent2:"#89c2d9", sun:"#fbb02d",
      folders:["#c9184a","#89c2d9","#f49cbb","#bacdb0","#fbb02d","#7a5aa8","#3d6fb0","#d95f8a"]},
    {k:"sunset", n:"Закат", mode:"light", base:"#f7c8b0", bg:["#ffa67a","#cf4a4d","#dc7668","#572f48"], ink:"#3a1f30", accent:"#a8363a", accent2:"#572f48", sun:"#ffa67a",
      folders:["#cf4a4d","#dc7668","#ffa67a","#817965","#4e4c5e","#572f48","#e88a6e","#9a6a74"]},
    {k:"forest", n:"Лес", mode:"dark", base:"#182818", bg:["#213722","#41644a","#595082","#f8c662"], ink:"#f7f0dc", accent:"#f8c662", accent2:"#8a7fd0", sun:"#f8c662",
      folders:["#41644a","#595082","#c9a24e","#6f8f62","#7a6fb0","#2f5a3a","#a28a4a","#4f4878"]},
    {k:"cream", n:"Ваниль", mode:"dark", base:"#3a0a1c", bg:["#450c21","#a33e43","#75c3d1","#fbf2da"], ink:"#fbf2da", accent:"#9fd8e2", accent2:"#d9666b", sun:"#fbf2da",
      folders:["#a33e43","#4f9fae","#c96b6f","#6fb3c0","#7e2234","#8fbfa0","#b8545a","#3f8090"]},
    {k:"rose", n:"Пыльная роза", mode:"light", base:"#efe2c2", bg:["#795c5f","#a69658","#d9b26f","#fadf7f"], ink:"#3b2a2c", accent:"#6a4d50", accent2:"#a69658", sun:"#fadf7f",
      folders:["#795c5f","#a69658","#d9b26f","#c9a07a","#9c7f6e","#b8a560","#8a6a6c","#e2c27a"]},
    {k:"jelly", n:"Медуза", mode:"dark", base:"#0e2a5c", bg:["#043473","#28518a","#476998","#d7d6ae"], ink:"#f4f3e4", accent:"#d7d6ae", accent2:"#7f9cc8", sun:"#e9e7b0",
      folders:["#476998","#28518a","#8b9091","#6f8fbf","#b2b39d","#3a5f92","#9aa0a0","#5878a8"]},
    {k:"cherry", n:"Вишня", mode:"dark", base:"#3d0810", bg:["#640d14","#ad2831","#d8973c","#fd9bb7"], ink:"#f3e6bd", accent:"#fd9bb7", accent2:"#d8973c", sun:"#e8b260",
      folders:["#ad2831","#d8973c","#d96a8a","#8e1f28","#c27a3a","#e08aa0","#9a3a2a","#b85a70"]},
    {k:"emerald", n:"Изумруд", mode:"dark", base:"#111a19", bg:["#284139","#809076","#b86830","#f8d794"], ink:"#f6ecd0", accent:"#f8d794", accent2:"#c97a3f", sun:"#f8d794",
      folders:["#284139","#809076","#b86830","#4f6b5c","#a0a98f","#8a5a30","#3c5a4c","#c9a26a"]}
  ];
  /* ---------- цвет ---------- */
  const rgb = h => { h = h.replace("#", ""); if (h.length === 3) h = h.replace(/./g, "$&$&"); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const hex = a => "#" + a.map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");
  const mix = (a, b, k) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * k)); };
  const lum = h => { const [r, g, b] = rgb(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const hsl = h => { const [r, g, b] = rgb(h).map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2; let H = 0; if (d) { H = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; H *= 60; if (H < 0) H += 360; } return [H, d ? d / (1 - Math.abs(2 * l - 1)) : 0, l]; };
  const fromHsl = (H, S, L) => { const c = (1 - Math.abs(2 * L - 1)) * S, x = c * (1 - Math.abs((H / 60) % 2 - 1)), m = L - c / 2; const [r, g, b] = H < 60 ? [c, x, 0] : H < 120 ? [x, c, 0] : H < 180 ? [0, c, x] : H < 240 ? [0, x, c] : H < 300 ? [x, 0, c] : [c, 0, x]; return hex([(r + m) * 255, (g + m) * 255, (b + m) * 255]); };
  const hd = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  const darken = (c, bg, min) => { for (let i = 0; i < 12 && contrast(c, bg) < min; i++) c = mix(c, "#000000", .12); return c; };
  const lighten = (c, fg, min) => { for (let i = 0; i < 12 && contrast(c, fg) < min; i++) c = mix(c, "#ffffff", .12); return c; };
  /* пять заметно разных по оттенку цветов из палитры темы; если палитра однотонная, недостающие получаются поворотом оттенка */
  function spread(t) {
    const norm = c => { const h = hsl(c); return fromHsl(h[0], Math.max(h[1], .62), Math.min(.58, Math.max(.42, h[2]))); };
    const pool = [t.accent, t.accent2, t.sun, ...(t.bg || []), ...(t.folders || [])].filter(Boolean).map(c => ({ c: norm(c), h: hsl(c) })).filter(x => x.h[1] > .18 && x.h[2] > .12 && x.h[2] < .92).map(x => ({ c: x.c, h: hsl(x.c), s0: x.h[1] }));
    const seed = pool.find(x => x.s0 >= .3) || pool[0] || { c: norm(t.accent), h: hsl(norm(t.accent)) };
    const out = [seed];
    while (out.length < 5) {
      let best = null, bd = -1;
      for (const x of pool) { const d = Math.min(...out.map(o => hd(o.h[0], x.h[0]))); if (d > bd) { bd = d; best = x; } }
      if (best && bd >= 32) { out.push(best); continue; }
      const H = (seed.h[0] + [140, 215, 80, 280, 25][out.length - 1]) % 360;
      const c = fromHsl(H, .62, .48); out.push({ c, h: hsl(c) });
    }
    return out.map(x => x.c);
  }
  /* ---------- применить тему ---------- */
  const get = () => { try { return localStorage.getItem(KEY) || "lavender"; } catch { return "lavender"; } };
  let cur = "lavender";
  function apply(key) {
    const t = THEMES.find(x => x.k === key) || THEMES[0]; cur = t.k;
    const s = document.documentElement.style, names = ["--ink", "--paper", "--soft", "--rule", "--muted", "--muted-2", "--flame", "--teal", "--sun", "--coral", "--leaf", "--sky", "--aurora", "--on-sun"];
    document.documentElement.dataset.look = t.k; document.documentElement.dataset.skin = t.plain ? "sticker" : "glass";
    if (t.plain) { names.forEach(n => s.removeProperty(n)); ["--grad", "--edge", "--glass", "--glass-2", "--soft-shadow", "--chip", "--field", "--bd", "--sh", "--blur"].forEach(n => s.removeProperty(n)); document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#FFFCF3"); return; }
    const dark = t.mode === "dark";
    const paper = dark ? mix(t.base, "#ffffff", .88) : mix(t.base, "#ffffff", .72);
    const ink = (() => { const c = dark ? mix(t.base, "#000000", .78) : mix(t.ink, "#000000", .35); return lum(c) < .045 ? c : mix(c, "#000000", .5); })();
    const [c0, c1, c2, c3, c4] = spread(t);
    const flame = darken(c0, "#ffffff", 4.6), teal = darken(c1, "#ffffff", 4.6), leaf = darken(c4, "#ffffff", 3.6);
    const sun = lighten(c2, ink, 8), coral = lighten(c3, ink, 6.5);
    const sky = mix(c1, "#ffffff", .84), soft = mix(paper, c0, .08), rule = mix(paper, ink, .16);
    let muted = mix(ink, paper, .3); for (let i = 0; i < 8 && contrast(muted, paper) < 6; i++) muted = mix(muted, ink, .2);
    let muted2 = mix(ink, paper, .45); for (let i = 0; i < 8 && contrast(muted2, paper) < 4.6; i++) muted2 = mix(muted2, ink, .2);
    const spots = [c1, c0, c3, c2].map((c, i) => `radial-gradient(${["42% 38% at 10% 6%", "40% 36% at 94% 12%", "44% 40% at 82% 94%", "38% 34% at 6% 90%"][i]}, ${c}8c, transparent 70%)`).join(",");
    const shadowC = mix(flame, "#000000", .35), v = { "--edge": "rgba(255,255,255,.78)", "--glass": "rgba(255,255,255,.46)", "--glass-2": "rgba(255,255,255,.7)", "--blur": "blur(22px) saturate(165%)", "--chip": mix(paper, flame, .14) + "cc", "--field": "rgba(255,255,255,.78)", "--soft-shadow": `0 18px 44px -18px ${shadowC}66, 0 2px 6px ${shadowC}14`, "--bd": "var(--edge)", "--grad": `linear-gradient(120deg,${flame},${mix(flame, coral, .55)})`, "--sh": "transparent", "--ink": ink, "--paper": paper, "--soft": soft, "--rule": rule, "--muted": muted, "--muted-2": muted2, "--flame": flame, "--teal": teal, "--sun": sun, "--coral": coral, "--leaf": leaf, "--sky": sky, "--aurora": spots };
    Object.entries(v).forEach(([k, x]) => s.setProperty(k, x));
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", paper);
  }
  function set(key) { try { localStorage.setItem(KEY, key); } catch { } apply(key); document.querySelectorAll("[data-look-pick]").forEach(b => b.setAttribute("aria-pressed", b.dataset.lookPick === key)); }

  /* ---------- выбор темы (в кабинете и по кнопке 🎨) ---------- */
  const swatch = t => { const c = spread(t); return `<span class="lk-sw" style="background:${t.plain ? "#FFFCF3" : mix(t.base, "#ffffff", .6)}">${c.map(x => `<i style="background:${x}"></i>`).join("")}</span>`; };
  const pickerHTML = () => `<div class="lk-grid" role="group" aria-label="Цветовая тема сайта">${THEMES.map(t => `<button type="button" class="lk-opt" data-look-pick="${t.k}" aria-pressed="${cur === t.k}">${swatch(t)}<b>${t.n}</b></button>`).join("")}</div>`;
  function bindPicker(root) { root.querySelectorAll("[data-look-pick]").forEach(b => b.onclick = () => set(b.dataset.lookPick)); }
  function open() {
    const m = window.openModal ? window.openModal(`<div class="dialog narrow"><div class="dlg-h"><h2>Оформление сайта</h2><button class="btn ghost x" data-close aria-label="Закрыть">×</button></div><div class="dlg-b"><p class="small" style="margin:0 0 10px">Цвета сайта меняются сразу. Выбор запоминается в этом браузере. Документы урока (листы, презентации) это не меняет.</p>${pickerHTML()}</div></div>`) : null;
    if (m) bindPicker(m);
  }

  /* ---------- шарики в шапке: двигаются сами, пока их не взяли; можно перетащить ---------- */
  function orbs() {
    const hero = document.querySelector("#view-builder .hero"); if (!hero || hero.querySelector(".orbs-box")) return;
    hero.querySelectorAll(".blob").forEach(b => b.remove());
    const box = document.createElement("div"); box.className = "orbs-box"; box.setAttribute("role", "group"); box.setAttribute("aria-label", "Шарики: их можно перетаскивать");
    const defs = [["--sun", 150, 6, 12], ["--coral", 96, 24, 62], ["--teal", 120, 10, 58], ["--leaf", 70, 36, 18], ["--flame", 84, 18, 34], ["--sky", 58, 30, 70]];
    defs.forEach(([col, size, rx, ty], i) => {
      const o = document.createElement("div"); o.className = "orb-d"; o.style.cssText = `width:${size}px;height:${size}px;right:${rx}%;top:${ty}%;background:var(${col});animation-delay:${-i * 1.3}s`;
      o.setAttribute("aria-hidden", "true"); box.appendChild(o);
      let sx, sy, ox, oy, drag = false;
      o.addEventListener("pointerdown", e => {
        const r = o.getBoundingClientRect(), b = box.getBoundingClientRect(); o.setPointerCapture(e.pointerId); drag = true;
        o.style.animation = "none"; o.style.right = "auto"; o.style.left = (r.left - b.left) + "px"; o.style.top = (r.top - b.top) + "px";
        sx = e.clientX; sy = e.clientY; ox = r.left - b.left; oy = r.top - b.top; o.classList.add("grab"); e.preventDefault();
      });
      o.addEventListener("pointermove", e => {
        if (!drag) return; const b = box.getBoundingClientRect();
        const x = Math.max(-o.offsetWidth / 3, Math.min(b.width - o.offsetWidth * .67, ox + e.clientX - sx)), y = Math.max(-o.offsetHeight / 3, Math.min(b.height - o.offsetHeight * .67, oy + e.clientY - sy));
        o.style.left = x + "px"; o.style.top = y + "px";
      });
      const end = () => { drag = false; o.classList.remove("grab"); };
      o.addEventListener("pointerup", end); o.addEventListener("pointercancel", end);
    });
    hero.insertBefore(box, hero.firstChild);
  }
  const SKIN = `
/* ---------- стеклянное оформление (как на платформе репетитора): прозрачные панели, размытие, мягкие тени, скруглённые формы ---------- */
html[data-skin="glass"]{--line:1px;--r:22px;--f-body:"Manrope",system-ui,-apple-system,"Segoe UI",sans-serif;--f-display:"Manrope",system-ui,-apple-system,"Segoe UI",sans-serif}
html[data-skin="glass"] .sheet,html[data-skin="glass"] .slide,html[data-skin="glass"] .ws-pages{--bd:var(--ink);--sh:var(--ink)}
html[data-skin="glass"] .help .sheet{--bd:var(--edge);--sh:transparent}
html[data-skin="glass"] h1,html[data-skin="glass"] .hero h1{font-family:"Playfair Display",Georgia,"Times New Roman",serif;font-weight:700;letter-spacing:-.01em}
html[data-skin="glass"] .sheet h1,html[data-skin="glass"] .slide h1{font-family:var(--f-display)}
html[data-skin="glass"] .card,html[data-skin="glass"] .workspace,html[data-skin="glass"] .lcard,html[data-skin="glass"] .plan,html[data-skin="glass"] .frp-card,html[data-skin="glass"] .send-card,html[data-skin="glass"] .learn-card,html[data-skin="glass"] .dev-card,html[data-skin="glass"] .help .sheet{background:var(--glass);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);border:1px solid var(--edge);border-radius:22px;box-shadow:var(--soft-shadow),inset 0 1px 0 rgba(255,255,255,.55)}
html[data-skin="glass"] .dialog{background:var(--glass-2);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);border:1px solid var(--edge);border-radius:24px;box-shadow:var(--soft-shadow),inset 0 1px 0 rgba(255,255,255,.6)}
html[data-skin="glass"] .modal{background:rgba(30,18,60,.28);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}
html[data-skin="glass"] .dlg-h{border-bottom:1px solid var(--rule)}
html[data-skin="glass"] .topbar{position:sticky;top:8px;margin:8px max(12px,env(safe-area-inset-left)) 0;border-radius:20px;border:1px solid var(--edge);background:var(--glass-2);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);box-shadow:var(--soft-shadow)}
html[data-skin="glass"] .topbar .wrap{padding-block:9px}
html[data-skin="glass"] .btn{border:0;border-radius:14px;background:var(--grad);color:#fff;box-shadow:0 8px 20px -10px var(--flame);font-family:var(--f-body);font-weight:800;letter-spacing:0}
html[data-skin="glass"] .btn:hover{transform:translateY(-1px);box-shadow:0 12px 24px -10px var(--flame)}
html[data-skin="glass"] .btn:active{transform:translateY(1px);box-shadow:0 4px 10px -6px var(--flame)}
html[data-skin="glass"] .btn.sm{border-radius:11px;box-shadow:0 6px 14px -8px var(--flame)}
html[data-skin="glass"] .btn.ghost{background:var(--glass-2);color:var(--ink);box-shadow:inset 0 0 0 1px var(--edge)}
html[data-skin="glass"] .btn.flame,html[data-skin="glass"] .btn.primary{background:var(--flame);box-shadow:0 8px 20px -10px var(--flame)}
html[data-skin="glass"] .btn.teal{background:var(--teal);box-shadow:0 8px 20px -10px var(--teal)}
html[data-skin="glass"] .btn.leaf{background:var(--leaf);box-shadow:0 8px 20px -10px var(--leaf)}
html[data-skin="glass"] .btn.coral{background:var(--coral);color:var(--ink);box-shadow:0 8px 20px -10px var(--coral)}
html[data-skin="glass"] .btn.plain{background:transparent;box-shadow:none;color:var(--ink)}
html[data-skin="glass"] .btn[disabled]{box-shadow:none;opacity:.5}
html[data-skin="glass"] .chip,html[data-skin="glass"] .doc-tab,html[data-skin="glass"] .plan-chip{border:1px solid var(--edge);background:var(--glass-2);box-shadow:inset 0 1px 0 rgba(255,255,255,.5)}
html[data-skin="glass"] .chip[aria-pressed="true"],html[data-skin="glass"] .chip[aria-selected="true"],html[data-skin="glass"] .chip.on,html[data-skin="glass"] .nav button[aria-current="page"],html[data-skin="glass"] .doc-tab[aria-selected="true"]{background:var(--grad);color:#fff;border-color:transparent}
html[data-skin="glass"] .topic-panel{background:var(--paper);border:1px solid var(--edge);border-radius:16px;box-shadow:var(--soft-shadow)}
html[data-skin="glass"] .dl-panel{background:var(--glass-2);border:1px solid var(--edge);border-radius:20px;box-shadow:var(--soft-shadow)}
html[data-skin="glass"] .dl-panel .dl-row{border:1px solid var(--edge);background:var(--glass-2)}
html[data-skin="glass"] .topic-panel button:hover,html[data-skin="glass"] .topic-panel button:focus-visible{background:var(--chip)}
html[data-skin="glass"] .seg button{border:1px solid var(--edge);background:var(--glass-2);border-radius:12px}
html[data-skin="glass"] .seg button[aria-pressed="true"]{background:var(--grad);color:#fff;border-color:transparent}
html[data-skin="glass"] .marquee::after{background:linear-gradient(90deg,var(--paper),transparent 8%,transparent 92%,var(--paper))}
html[data-skin="glass"] .orb-d{border:2px solid rgba(255,255,255,.8);box-shadow:0 16px 30px -12px var(--flame),inset 0 -6px 12px rgba(0,0,0,.12)}
html[data-skin="glass"] .orb-d.grab{box-shadow:0 24px 40px -14px var(--flame),inset 0 -6px 12px rgba(0,0,0,.12)}
html[data-skin="glass"] select,html[data-skin="glass"] input[type=text],html[data-skin="glass"] input[type=email],html[data-skin="glass"] input[type=password],html[data-skin="glass"] textarea.inp{border:1px solid var(--edge);border-radius:14px;background-color:var(--field)}
html[data-skin="glass"] .marquee{background:var(--glass-2);color:var(--ink);border-block:1px solid var(--edge);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur)}
html[data-skin="glass"] .marquee-track b{color:var(--flame)}
html[data-skin="glass"] .hero h1 em{background:var(--sun);border:0;box-shadow:0 10px 22px -12px var(--flame);border-radius:16px}
html[data-skin="glass"] .sheetwrap{border:1px solid var(--edge);border-radius:16px}
html[data-skin="glass"] body{font-family:var(--f-body)}
html[data-skin="glass"] .hero{padding-block:30px 24px}
`;
  /* ---------- стили и кнопка в шапке ---------- */
  function mount() {
    const st = document.createElement("style");
    st.textContent = `html[data-look]:not([data-look="classic"]) body{background:var(--aurora) fixed,var(--paper)}
html[data-look]:not([data-look="classic"]) .topbar{background:color-mix(in srgb,var(--paper) 94%,transparent)}
.orbs-box{position:absolute;inset:0;z-index:0;pointer-events:none}
.orb-d{position:absolute;border:3px solid var(--ink);border-radius:50%;pointer-events:auto;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;box-shadow:4px 5px 0 var(--ink);animation:orbf 7s ease-in-out infinite}
.orb-d::after{content:"";position:absolute;left:18%;top:14%;width:26%;height:20%;border-radius:50%;background:#fff;opacity:.55;transform:rotate(-30deg)}
.orb-d.grab{cursor:grabbing;box-shadow:7px 9px 0 var(--ink);z-index:6}
@keyframes orbf{0%,100%{transform:translate(0,0)}50%{transform:translate(-14px,18px)}}
@media (prefers-reduced-motion:reduce){.orb-d{animation:none}}
@media (max-width:600px){.orb-d{scale:.62}.orbs-box{top:-30px}}
.lk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:10px}
.lk-opt{display:flex;flex-direction:column;gap:6px;align-items:stretch;padding:8px;border:2.5px solid var(--ink);border-radius:16px;background:var(--card);font-weight:800;font-size:12.5px;text-align:center}
.lk-opt[aria-pressed="true"]{background:var(--sun);box-shadow:3px 3px 0 var(--ink)}
.lk-sw{display:flex;height:34px;border-radius:10px;overflow:hidden;border:2px solid var(--ink)}.lk-sw i{flex:1}
.lk-btn{font-size:16px;padding:6px 11px}`;
    document.head.appendChild(st);
    const sg = document.createElement("style"); sg.textContent = SKIN; document.head.appendChild(sg);
    const fl = document.createElement("link"); fl.rel = "stylesheet"; fl.href = "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&display=swap"; document.head.appendChild(fl);
    const acc = document.querySelector(".topbar .account");
    if (acc && !document.getElementById("lookBtn")) { const b = document.createElement("button"); b.id = "lookBtn"; b.className = "btn sm ghost lk-btn"; b.type = "button"; b.title = "Оформление сайта"; b.setAttribute("aria-label", "Оформление сайта"); b.textContent = "🎨"; b.onclick = open; acc.parentNode.insertBefore(b, acc); }
    orbs();
  }
  apply(get());
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
  return { THEMES, apply, set, open, pickerHTML, bindPicker, current: () => cur };
})();
window.Look = Look;
