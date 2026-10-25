/* ===================================================================
   «Учу по ФРП» — художественные темы презентаций.
   Каждая тема — фон-рисунок (SVG: звёзды, туман, ботаника, обои,
   плакат, скетч, коллаж из рваной бумаги, музей, винтаж), светлая плашка
   под крупный текст и своё оформление картинок (рамы, полароид, арка,
   рваный край). Рисунок фона один и тот же в редакторе, в показе и в
   PowerPoint (там он кладётся картинкой под редактируемый текст).
   Стикеры — отдельные элементы поверх слайда: их можно добавлять,
   двигать, поворачивать и убирать; в PowerPoint они переносятся картинками.
   Автоподбор: по произведению, эпохе и разделу русского языка.
   =================================================================== */
const ThemeKit = (() => {
  "use strict";
  /* ---------- темы ----------
     Принципы (открытые руководства по дизайну презентаций):
     • палитра 60/30/10 — основной тон фона, второй тон того же семейства, акцент для заголовков;
     • контраст текста не ниже 4,5:1 — тёмные буквы на светлой бумаге, крупный кегль;
     • одна мысль — один слайд, воздух вокруг текста, выравнивание по сетке;
     • картинка «в обрез» (на всю высоту) и бумага с рваным краем поверх неё — глубина без пёстрых узоров;
     • единый язык: те же фактуры, шрифты и цвета на каждом слайде. */
  const META = {
    renaissance: { name: "Ренессанс", desc: "чёрный, живопись крупно, красный круг, рваные края", font: "playcorm", frame: "161412" },
    glow:    { name: "Сияние", desc: "ночное сияние, стекло, мерцание и свет", font: "cormorant", frame: "120E2E" },
    art:     { name: "По картине", desc: "цвета берутся из иллюстрации урока", font: "kurale", frame: "26292C" },
    museum:  { name: "Галерея", desc: "графит и олива, пергамент, рваный край", font: "kurale", frame: "23262A" },
    salon:   { name: "Усадьба", desc: "приглушённый зелёный, сливки, золото", font: "oranien", frame: "55624F" },
    sepia:   { name: "Хроника", desc: "сепия, старая фотобумага", font: "oldstd", frame: "3A2E24" },
    night:   { name: "Ночная лазурь", desc: "глубокий синий, звёздная пыль, слоновая кость", font: "prata", frame: "0F1A33" },
    mystic:  { name: "Изумрудная ночь", desc: "тёмный изумруд и тонкое золото", font: "yeseva", frame: "1D2619" },
    haze:    { name: "Тёплый свет", desc: "персиковый туман, матовая бумага", font: "cormorant", frame: "F3B07A" },
    aqua:    { name: "Акварель", desc: "голубая и сиреневая акварель, белая бумага", font: "alice", frame: "E9EEF5" },
    botanic: { name: "Ботаника", desc: "шалфей и олива, умбра", font: "playfair", frame: "C9CFBC" },
    poster:  { name: "Ретро-плакат", desc: "горчица и бордо, рваная бумага", font: "russo", frame: "D6A13A" },
    collage: { name: "Коллаж", desc: "серая бумага, крафт, красный акцент", font: "oswald", frame: "D9D5CE" },
    sketch:  { name: "Скетчбук", desc: "крем, тёмно-синий и красный, от руки", font: "caveat", frame: "EFE8DA" },
    modern:  { name: "Модерн", desc: "светлый фон, кобальт, крупный гротеск", font: "unbounded", frame: "F3F1EC" },
    grad:    { name: "Градиент", desc: "кремовый фон, цветные пятна, линейные значки, заглавные заголовки", font: "onest", frame: "EFE8E0" },
    board:   { name: "Школьная доска", desc: "зелёная доска, мел, дерево", font: "caveat", frame: "6B4A2B" }
  };
  // палитры: base/base2 — фон (60 %), l1/l2 — слои того же семейства (30 %), acc — акцент (10 %), paper/ink — бумага и текст
  const PAL = {
    renaissance: { base: "#161412", base2: "#1E1B18", l1: "#4B5D6E", l2: "#5B5E3A", acc: "#B5432A", paper: "#D8CBB0", ink: "#EDE4D3", line: "#C08A2E", torn: 6 },
    glow:    { base: "#120E2E", base2: "#2A1650", l1: "#6C4BD8", l2: "#E07AC8", acc: "#F6D77C", paper: "rgba(255,255,255,.1)", ink: "#F5F1FF", line: "#CDB8FF", torn: 7 },
    museum:  { base: "#23262A", base2: "#30353B", l1: "#3C4856", l2: "#525240", acc: "#8C1C2B", paper: "#EAE3D2", ink: "#1B1714", line: "#B69B62", torn: 1 },
    salon:   { base: "#55624F", base2: "#6E7D6A", l1: "#7F8E78", l2: "#46523F", acc: "#34502F", paper: "#F6F0E1", ink: "#1F241D", line: "#B9975B", torn: 0 },
    sepia:   { base: "#3A2E24", base2: "#4E3E30", l1: "#6B5643", l2: "#2C231B", acc: "#7A3E1D", paper: "#EFE4CC", ink: "#2A2018", line: "#A88A62", torn: 1 },
    night:   { base: "#0F1A33", base2: "#1F3157", l1: "#24365F", l2: "#162447", acc: "#8E6212", paper: "#F4EEDF", ink: "#182038", line: "#C9A14A", torn: 0 },
    mystic:  { base: "#1A2317", base2: "#2A3624", l1: "#34442E", l2: "#141B12", acc: "#5E4A12", paper: "#F1EAD6", ink: "#1A1F16", line: "#C2A35A", torn: 0 },
    haze:    { base: "#F7C9A0", base2: "#EE9A62", l1: "#FCE3C8", l2: "#E5793F", acc: "#A8401A", paper: "#FFF8EF", ink: "#3A2416", line: "#E9B48C", torn: 0 },
    aqua:    { base: "#E9EEF5", base2: "#DCE4F0", l1: "#AFC3E3", l2: "#C9B8E0", acc: "#43398A", paper: "#FFFFFF", ink: "#1E2440", line: "#B9C4DA", torn: 2 },
    botanic: { base: "#C9CFBC", base2: "#B5BEA4", l1: "#A6B192", l2: "#DDE1D2", acc: "#5A3726", paper: "#F6F3EA", ink: "#23281E", line: "#8A9877", torn: 2 },
    poster:  { base: "#D6A13A", base2: "#C98F2A", l1: "#7A2328", l2: "#A9452E", acc: "#7A2328", paper: "#F4E6C3", ink: "#2B1513", line: "#7A2328", torn: 1 },
    collage: { base: "#D9D5CE", base2: "#CBC6BD", l1: "#BFA98A", l2: "#B5212E", acc: "#A51E2A", paper: "#FBFAF6", ink: "#121212", line: "#1E1E1E", torn: 1 },
    sketch:  { base: "#EFE8DA", base2: "#E6DCC8", l1: "#1F2A5A", l2: "#D2382F", acc: "#1F2A5A", paper: "#FBF7EE", ink: "#1F2A5A", line: "#1F2A5A", torn: 3 },
    modern:  { base: "#F3F1EC", base2: "#ECE8E0", l1: "#2B4BD8", l2: "#E3DED3", acc: "#2B4BD8", paper: "#FFFFFF", ink: "#111111", line: "#111111", torn: 4 },
    grad:    { base: "#F0E9E1", base2: "#EBE3D9", l1: "#8A6BFF", l2: "#FF5A3C", acc: "#111111", paper: "transparent", ink: "#111111", line: "#111111", torn: 0 },
    board:   { base: "#6B4A2B", base2: "#5A3D22", l1: "#24493A", l2: "#1D3A2C", acc: "#F2C94C", paper: "transparent", ink: "#F4F1E8", line: "#F4F1E8", torn: 5 }
  };
  const has = k => !!META[k];

  /* ---------- палитра из картинки (тема «По картине») ---------- */
  const hex2 = (r, g, b) => "#" + [r, g, b].map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");
  function rgb2hsl(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; if (mx === mn) return [0, 0, l]; const d = mx - mn, s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h * 60, s, l]; }
  function hsl(h, s, l) { s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l)); const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return hex2(f(0) * 255, f(8) * 255, f(4) * 255); }
  async function paletteFrom(blob) {
    const im = await new Promise((res, rej) => { const u = URL.createObjectURL(blob), x = new Image(); x.onload = () => res(x); x.onerror = rej; x.src = u; });
    const c = document.createElement("canvas"); c.width = 48; c.height = 48; const g = c.getContext("2d"); g.drawImage(im, 0, 0, 48, 48);
    const d = g.getImageData(0, 0, 48, 48).data, bins = new Map();
    for (let i = 0; i < d.length; i += 4) { const [h, s, l] = rgb2hsl(d[i], d[i + 1], d[i + 2]); const k = `${Math.round(h / 24)}|${Math.round(s * 3)}|${Math.round(l * 4)}`; const b = bins.get(k) || { n: 0, h: 0, s: 0, l: 0 }; b.n++; b.h += h; b.s += s; b.l += l; bins.set(k, b); }
    const cl = [...bins.values()].map(b => ({ n: b.n, h: b.h / b.n, s: b.s / b.n, l: b.l / b.n })).sort((a, b) => b.n - a.n);
    const dom = cl[0], dark = cl.filter(x => x.l < .45)[0] || dom;
    const vivid = cl.slice(0, 12).filter(x => x.s > .25 && Math.abs(x.h - dark.h) > 20).sort((a, b) => b.s * Math.sqrt(b.n) - a.s * Math.sqrt(a.n))[0] || cl.find(x => x.s > .2) || dom;
    const H = dark.h, S = Math.min(.28, dark.s * .7 + .05);
    return { base: hsl(H, S, .15), base2: hsl(H, S, .21), l1: hsl(H, S * 1.1, .28), l2: hsl((H + 25) % 360, S * .8, .24), acc: hsl(vivid.h, Math.min(.65, vivid.s + .1), .3), paper: hsl(vivid.h, .28, .91), ink: hsl(H, .3, .1), line: hsl(vivid.h, .35, .6), torn: 1 };
  }
  const palOf = (key, pal) => key === "art" ? (pal || PAL.museum) : PAL[key];

  /* ---------- утилиты рисования ---------- */
  const rnd = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const f1 = n => Math.round(n * 10) / 10;
  function starPts(cx, cy, R, r, n = 5, rot = -90) { const p = []; for (let k = 0; k < n * 2; k++) { const a = (rot + k * 180 / n) * Math.PI / 180, rr = k % 2 ? r : R; p.push(f1(cx + rr * Math.cos(a)) + "," + f1(cy + rr * Math.sin(a))); } return p.join(" "); }
  const sparkle = (cx, cy, R, fill, op = 1) => `<path d="M${cx} ${cy - R}Q${cx} ${cy} ${cx + R} ${cy}Q${cx} ${cy} ${cx} ${cy + R}Q${cx} ${cy} ${cx - R} ${cy}Q${cx} ${cy} ${cx} ${cy - R}Z" fill="${fill}" opacity="${op}"/>`;
  // рваный (или ровный) прямоугольник: амплитуда по сторонам [верх, право, низ, лево]
  function tornRect(x, y, w, h, amp, step, R) {
    const pts = [], E = [[x, y, x + w, y, amp[0]], [x + w, y, x + w, y + h, amp[1]], [x + w, y + h, x, y + h, amp[2]], [x, y + h, x, y, amp[3]]];
    for (const [x1, y1, x2, y2, A] of E) {
      const L = Math.hypot(x2 - x1, y2 - y1), n = Math.max(2, Math.round(L / (A ? step : L))), nx = -(y2 - y1) / L, ny = (x2 - x1) / L;
      let drift = 0;
      for (let j = 0; j < n; j++) { const t = j / n; drift = drift * .6 + (R() - .5) * A; const d = A ? drift + (R() - .5) * A * .5 : 0; pts.push(f1(x1 + (x2 - x1) * t + nx * d) + "," + f1(y1 + (y2 - y1) * t + ny * d)); }
    }
    return pts.join(" ");
  }
  function branch(x, y, len, ang, col, R, w = 2.4) {
    const a = ang * Math.PI / 180, ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len, cx = x + Math.cos(a + .35) * len * .55, cy = y + Math.sin(a + .35) * len * .55;
    let s = `<path d="M${f1(x)} ${f1(y)}Q${f1(cx)} ${f1(cy)} ${f1(ex)} ${f1(ey)}" stroke="${col}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
    for (let k = 1; k <= 7; k++) { const t = k / 8, px = (1 - t) * (1 - t) * x + 2 * (1 - t) * t * cx + t * t * ex, py = (1 - t) * (1 - t) * y + 2 * (1 - t) * t * cy + t * t * ey, side = k % 2 ? 1 : -1, la = ang + side * (48 + R() * 14), L = len * (.16 - t * .07), lx = px + Math.cos(la * Math.PI / 180) * L, ly = py + Math.sin(la * Math.PI / 180) * L; s += `<ellipse cx="${f1((px + lx) / 2)}" cy="${f1((py + ly) / 2)}" rx="${f1(L / 2)}" ry="${f1(L / 5.5)}" transform="rotate(${f1(la)} ${f1((px + lx) / 2)} ${f1((py + ly) / 2)})" fill="none" stroke="${col}" stroke-width="${w * .8}"/>`; }
    return s;
  }
  const burst = (cx, cy, R, fill, n = 12, stroke = "") => `<polygon points="${starPts(cx, cy, R, R * .62, n, -90)}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="4" stroke-linejoin="round"` : ""}/>`;
  const grain = (id, op, freq = .85) => `<filter id="${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="3" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${op} 0"/></filter>`;

  /* ---------- геометрия: где бумага, где картинка (в процентах слайда) ---------- */
  const W = 1600, H = 900;
  function panelRect(side, kind) {
    if (side === "image") return null;
    if (side === "right") return [4, 7, 53, 86];
    if (side === "left") return [43, 7, 53, 86];
    if (side === "top") return [5, 38, 90, 57];
    if (side === "bg") return [5, 9, 53, 82];
    if (kind === "title" || kind === "section") return [13, 16, 74, 68];
    return [5.5, 8, 89, 84];
  }

  /* ---------- фон (60 + 30 %) ---------- */
  function bgSvg(key, v, kind, side, P, R) {
    let s = `<defs>${grain("g", key === "modern" || key === "aqua" ? .05 : .12)}<linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${P.base}"/><stop offset="1" stop-color="${P.base2}"/></linearGradient><radialGradient id="vg" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${/museum|sepia|night|mystic|art|renaissance|glow/.test(key) ? .5 : .08}"/></radialGradient><filter id="bl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="80"/></filter></defs>`;
    s += `<rect width="${W}" height="${H}" fill="url(#b)"/>`;
    const L = v % 2 === 0; // сторона крупного слоя чередуется — ритм без повторов
    const tornLayer = (x, y, w, h, col, op, amp = 26) => `<polygon points="${tornRect(x, y, w, h, [amp, amp, amp, amp], 22, R)}" fill="${col}" opacity="${op}"/>`;
    if (key === "board") {
      s = `<defs>${grain("g", .14, .5)}<radialGradient id="bb" cx=".5" cy=".45" r=".8"><stop offset="0" stop-color="#2F5A45"/><stop offset="1" stop-color="#1D3A2C"/></radialGradient></defs><rect width="${W}" height="${H}" fill="#6B4A2B"/><rect x="34" y="34" width="${W - 68}" height="${H - 68}" fill="url(#bb)"/><rect x="34" y="34" width="${W - 68}" height="${H - 68}" fill="none" stroke="#3E2A17" stroke-width="6"/>`;
      for (let k = 0; k < 6; k++) { const x = 80 + R() * (W - 300), y = 80 + R() * (H - 200); s += `<path d="M${f1(x)} ${f1(y)}q${f1(80 + R() * 120)} ${f1(-20 + R() * 40)} ${f1(200 + R() * 140)} ${f1(-10 + R() * 20)}" stroke="#fff" stroke-width="${f1(18 + R() * 30)}" opacity=".035" fill="none" stroke-linecap="round"/>`; }
      s += `<rect x="34" y="${H - 34}" width="${W - 68}" height="20" fill="#4E351D"/><rect x="${W - 360}" y="${H - 46}" width="70" height="12" rx="4" fill="#F4F1E8"/>`;
      return s + `<rect width="${W}" height="${H}" filter="url(#g)"/>`;
    }
    if (key === "grad") {
      // кремовый фон, две вертикальные линии, цветные пятна (размытые, обрезанные косым краем) и чёрные линейные значки
      const C = { mint: "#34E8B0", violet: "#A57BFF", orange: "#FF5A2C", pink: "#FF4DB0", yellow: "#FFD83A", blue: "#2F6BFF", cyan: "#27D6E8" };
      const PRE = [
        { q: [[.58, 0], [1, 0], [1, .5], [.7, .62]], c: [["mint", .92, .12, 300], ["blue", .75, .45, 240]], b: [["violet", .06, .96, 300], ["orange", .22, 1.02, 230]], ic: "burst", icx: .93, icy: .1 },
        { q: [[0, .5], [.34, .42], [.3, 1], [0, 1]], c: [["violet", .05, .8, 280], ["cyan", .22, .95, 240]], b: [["orange", .96, .05, 280], ["pink", .84, .0, 220]], ic: "rings", icx: .9, icy: .12 },
        { q: [[.66, 0], [1, 0], [1, .38], [.78, .22]], c: [["orange", .92, .08, 250], ["pink", .8, .16, 220]], b: [["blue", .1, 1, 280], ["mint", .3, 1.04, 230], ["violet", .02, .8, 200]], ic: "dots", icx: .08, icy: .93 },
        { q: [[0, 0], [.3, 0], [.22, .26], [0, .34]], c: [["yellow", .04, .06, 250], ["pink", .16, .12, 220]], b: [["mint", .94, .96, 300], ["violet", .78, 1.04, 240]], ic: "burst", icx: .92, icy: .92 },
        { q: [[.52, 1], [1, .7], [1, 1]], c: [["cyan", .9, .96, 280], ["violet", .7, 1.02, 240]], b: [["orange", .02, .04, 260], ["yellow", .12, 0, 200]], ic: "rings", icx: .9, icy: .1 },
        { q: [[.74, 0], [1, 0], [1, .62], [.88, .5]], c: [["mint", .96, .1, 260], ["blue", .86, .4, 220]], b: [["pink", .04, .96, 260], ["orange", .2, 1.03, 220]], ic: "dots", icx: .9, icy: .92 }
      ];
      const Z = PRE[v % 6], big = kind === "title" || kind === "section";
      s = `<defs>${grain("g", .05)}<filter id="gb" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${big ? 70 : 58}"/></filter><clipPath id="gq"><polygon points="${Z.q.map(([x, y]) => `${f1(x * W)},${f1(y * H)}`).join(" ")}"/></clipPath></defs><rect width="${W}" height="${H}" fill="${P.base}"/>`;
      s += `<g filter="url(#gb)" opacity=".92">${Z.b.map(([c, x, y, r]) => `<circle cx="${f1(x * W)}" cy="${f1(y * H)}" r="${r * (big ? 1.25 : 1)}" fill="${C[c]}"/>`).join("")}</g>`;
      s += `<g clip-path="url(#gq)"><rect width="${W}" height="${H}" fill="${C[Z.c[1][0]]}" opacity=".35"/><g filter="url(#gb)">${Z.c.map(([c, x, y, r]) => `<circle cx="${f1(x * W)}" cy="${f1(y * H)}" r="${r}" fill="${C[c]}"/>`).join("")}</g></g>`;
      s += `<line x1="${W * .1}" y1="0" x2="${W * .1}" y2="${H}" stroke="#111" stroke-width="1.4" opacity=".85"/><line x1="${W * .9}" y1="0" x2="${W * .9}" y2="${H}" stroke="#111" stroke-width="1.4" opacity=".85"/>`;
      const ix = Z.icx * W, iy = Z.icy * H;
      if (Z.ic === "burst") { for (let k = 0; k < 28; k++) { const a = k / 28 * Math.PI * 2, r1 = 26, r2 = 66 + (k % 2) * 26; s += `<line x1="${f1(ix + Math.cos(a) * r1)}" y1="${f1(iy + Math.sin(a) * r1)}" x2="${f1(ix + Math.cos(a) * r2)}" y2="${f1(iy + Math.sin(a) * r2)}" stroke="#111" stroke-width="2"/>`; } }
      else if (Z.ic === "rings") { for (let k = 1; k <= 6; k++) s += `<circle cx="${f1(ix)}" cy="${f1(iy)}" r="${k * 11}" fill="none" stroke="#111" stroke-width="1.6"/>`; }
      else { for (let a = 0; a < 5; a++) for (let b = 0; b < 8; b++) s += `<circle cx="${f1(ix - 70 + b * 20)}" cy="${f1(iy - 40 + a * 20)}" r="2.6" fill="#111"/>`; }
      s += `<line x1="${W * .1}" y1="${f1(H * .075)}" x2="${W * .9}" y2="${f1(H * .075)}" stroke="#111" stroke-width="1.2" opacity=".5"/>`;
      return s + `<rect width="${W}" height="${H}" filter="url(#g)"/>`;
    }
    if (key === "renaissance") {
      // строгий чёрный, тонкие линейки, номер, лилия, красный круг у края картины, лёгкие «наброски» сангиной
      // круг — у края картины (частично под ней) или в углу, никогда поверх текста
      const edge = side === "right" || side === "left", cx = side === "right" ? W * .535 : side === "left" ? W * .465 : L ? W * .96 : W * .04, cy = edge ? (v % 2 ? H * .76 : H * .26) : H * .9;
      s += `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${edge ? 82 : 120}" fill="${P.acc}" opacity=".9"/>`;
      for (let k = 0; k < 7; k++) { const x = R() * W, y = R() * H; s += `<path d="M${f1(x)} ${f1(y)}c${f1(40 + R() * 80)} ${f1(-20 + R() * 40)} ${f1(90 + R() * 80)} ${f1(-30 + R() * 60)} ${f1(160 + R() * 90)} ${f1(-10 + R() * 20)}" stroke="#8C6A48" stroke-width="1" fill="none" opacity=".18"/>`; }
      s += `<line x1="60" y1="46" x2="${W - 60}" y2="46" stroke="${P.line}" stroke-width="1" opacity=".55"/><line x1="60" y1="${H - 46}" x2="${W - 60}" y2="${H - 46}" stroke="${P.line}" stroke-width="1" opacity=".55"/>`;
      s += `<path d="M${W / 2} 22c-8 7-8 18 0 25c8-7 8-18 0-25zm-18 15c3 8 11 11 18 10c-5-7-11-10-18-10zm36 0c-3 8-11 11-18 10c5-7 11-10 18-10z" fill="${P.line}" opacity=".85"/>`;
      s += `<text x="64" y="80" fill="${P.line}" font-family="Georgia,serif" font-size="20" letter-spacing="4" opacity=".85">${String(v + 1).padStart(2, "0")}</text>`;
      return s + `<rect width="${W}" height="${H}" fill="url(#vg)"/><rect width="${W}" height="${H}" filter="url(#g)"/>`;
    }
    if (key === "glow") {
      s += `<g filter="url(#bl)">${[[P.l1, .2, .25, 420], [P.l2, .85, .2, 360], ["#3BC4E8", .7, .95, 380], ["#8E5CF2", .1, .9, 320]].map(([c, x, y, r]) => `<circle cx="${f1((L ? x : 1 - x) * W)}" cy="${f1(y * H)}" r="${r}" fill="${c}" opacity=".55"/>`).join("")}</g>`;
      for (let k = 0; k < 140; k++) s += `<circle cx="${f1(R() * W)}" cy="${f1(R() * H)}" r="${f1(.5 + R() * 1.7)}" fill="#FFFFFF" opacity="${f1(.2 + R() * .7)}"/>`;
      for (let k = 0; k < 7; k++) s += sparkle(f1(R() * W), f1(R() * H), f1(6 + R() * 12), "#FFF3C8", .9);
      s += `<path d="M0 ${H * .78}C${W * .3} ${H * .66} ${W * .6} ${H * .92} ${W} ${H * .72}" stroke="#FFFFFF" stroke-opacity=".18" stroke-width="2" fill="none"/>`;
      return s + `<rect width="${W}" height="${H}" fill="url(#vg)"/>`;
    }
    if (key === "haze" || key === "aqua") {
      const blobs = key === "haze" ? [P.base2, P.l1, P.l2, P.base] : [P.l1, P.l2, "#F2C9D4", P.base2];
      s += `<g filter="url(#bl)" opacity="${key === "aqua" ? .85 : .9}">${blobs.map((c, k) => `<circle cx="${f1((L ? [.15, .8, .5, .9] : [.85, .2, .5, .1])[k] * W)}" cy="${f1([.2, .75, .95, .1][k] * H)}" r="${[460, 520, 420, 300][k]}" fill="${c}"/>`).join("")}</g>`;
      if (key === "haze") for (let k = 0; k < 4; k++) s += sparkle(f1(80 + R() * (W - 160)), f1(50 + R() * (H - 100)), f1(10 + R() * 14), "#FFF6E6", .9);
    } else if (key === "modern") {
      // крупная геометрия: круг-акцент и тонкая сетка
      const cx = L ? W * .86 : W * .14;
      s += `<circle cx="${f1(cx)}" cy="${f1(v % 3 ? H * .82 : H * .18)}" r="${kind === "title" ? 330 : 230}" fill="${P.l1}"/><rect x="${L ? 0 : W - 18}" y="0" width="18" height="${H}" fill="${P.ink}"/>`;
      for (let x = 100; x < W; x += 100) s += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="${P.ink}" stroke-opacity=".04"/>`;
    } else if (key === "night") {
      s += `<radialGradient id="gl" cx="${L ? .2 : .8}" cy=".15" r=".6"><stop offset="0" stop-color="#E9C77A" stop-opacity=".22"/><stop offset="1" stop-color="#E9C77A" stop-opacity="0"/></radialGradient><rect width="${W}" height="${H}" fill="url(#gl)"/>`;
      for (let k = 0; k < 110; k++) s += `<circle cx="${f1(R() * W)}" cy="${f1(R() * H)}" r="${f1(.5 + R() * 1.6)}" fill="#FFF8E1" opacity="${f1(.25 + R() * .55)}"/>`;
      for (let k = 0; k < 4; k++) s += sparkle(f1(R() * W), f1(R() * H), f1(5 + R() * 6), "#F2DFA8", .8);
      s += tornLayer(L ? -40 : W * .62, H * .7, W * .45, H * .4, P.l1, .7, 18);
    } else if (key === "mystic") {
      const cx = L ? W - 170 : 170, cy = v % 3 === 0 ? H - 150 : 160;
      s += `<g fill="none" stroke="${P.line}" opacity=".45"><circle cx="${cx}" cy="${cy}" r="250" stroke-width="1.5"/><circle cx="${cx}" cy="${cy}" r="214" stroke-width="1"/>`;
      for (let k = 0; k < 48; k++) { const a = k * 7.5 * Math.PI / 180, r2 = k % 4 ? 224 : 240; s += `<line x1="${f1(cx + Math.cos(a) * 214)}" y1="${f1(cy + Math.sin(a) * 214)}" x2="${f1(cx + Math.cos(a) * r2)}" y2="${f1(cy + Math.sin(a) * r2)}" stroke-width="1"/>`; }
      s += `</g>`;
      for (let k = 0; k < 8; k++) s += sparkle(f1(R() * W), f1(R() * H), f1(4 + R() * 6), P.line, .6);
    } else if (key === "sketch") {
      s += `<path d="M${L ? 60 : W - 60} ${H - 60}C${W * .3} ${H - 230} ${W * .25} 110 ${W * .55} 80S${W * .85} 230 ${L ? W - 80 : 80} 50" fill="none" stroke="${P.l1}" stroke-width="2.5" stroke-dasharray="10 12" opacity=".35"/>`;
      s += `<polygon points="${starPts(L ? W - 110 : 110, H - 110, 54, 32, 12)}" fill="${P.l2}" opacity=".9"/>`;
    } else {
      // бумажные слои того же семейства: крупный рваный лист и узкая полоса
      s += tornLayer(L ? W * .58 : -60, -40, W * .5, H * .62, P.l1, .85);
      s += tornLayer(L ? -60 : W * .7, H * .55, W * .38, H * .55, P.l2, .8);
      if (key === "collage") s += tornLayer(L ? W * .1 : W * .74, -20, 150, 120, P.l2, .9, 14) + `<rect x="${L ? W * .78 : W * .12}" y="${H - 70}" width="210" height="34" fill="#1E1E1E" opacity=".85" transform="rotate(-4 ${L ? W * .78 : W * .12} ${H - 70})"/>`;
      if (key === "botanic") { s += branch(L ? W - 30 : 30, H - 10, 380, L ? -125 : -55, P.line, R, 2.2); s += branch(L ? 30 : W - 30, 0, 240, L ? 25 : 155, P.line, R, 1.8); }
      if (key === "salon") s += `<rect x="22" y="22" width="${W - 44}" height="${H - 44}" fill="none" stroke="${P.line}" stroke-width="2" opacity=".7"/><rect x="34" y="34" width="${W - 68}" height="${H - 68}" fill="none" stroke="${P.line}" stroke-width="1" opacity=".5"/>`;
      if (key === "poster") s += `<polygon points="${starPts(L ? 150 : W - 150, H - 140, 70, 46, 16)}" fill="${P.paper}" opacity=".85"/>`;
    }
    s += `<rect width="${W}" height="${H}" fill="url(#vg)"/><rect width="${W}" height="${H}" filter="url(#g)"/>`;
    if (/museum|art|sepia/.test(key)) s += `<text x="70" y="${H - 28}" fill="${P.line}" font-family="Georgia,serif" font-size="20" letter-spacing="6" opacity=".75">${String(v + 1).padStart(2, "0")}</text>`;
    return s;
  }

  /* ---------- бумага под текст: рваный край к картинке, фактура, тень ---------- */
  function paperSvg(key, v, kind, side, P, R, flat = false) {
    const pr = panelRect(side, kind); if (!pr || key === "board" || key === "renaissance" || key === "glow" || key === "grad") return "";
    const [px, py, pw, ph] = [pr[0] / 100 * W, pr[1] / 100 * H, pr[2] / 100 * W, pr[3] / 100 * H];
    const T = P.torn, big = 30, small = T === 2 ? 7 : 5;
    // сторона к картинке рвётся сильно, остальные — едва заметно (или ровно — «Модерн», «Усадьба», «Ночь»)
    const amp = T === 4 || T === 0 ? [0, 0, 0, 0] : T === 3 ? [3, 3, 3, 3] : [small, small, small, small];
    if (T === 1 || T === 2) { if (side === "right") amp[1] = big; else if (side === "left") amp[3] = big; else if (side === "top") amp[0] = big; else if (side === "bg") amp[1] = big; }
    const poly = tornRect(px, py, pw, ph, amp, 16, R), rim = tornRect(px - 3, py - 3, pw + 6, ph + 6, amp.map(a => a * 1.25), 13, R);
    let s = `<defs>${grain("pg", .07, 1.1)}<filter id="sh" x="-10%" y="-10%" width="120%" height="130%"><feGaussianBlur stdDeviation="${T === 4 ? 0.01 : 14}"/></filter><clipPath id="pc"><polygon points="${poly}"/></clipPath></defs>`;
    if (T !== 4) s += `<polygon points="${poly}" fill="#000" opacity=".35" filter="url(#sh)" transform="translate(0 10)"/>`;
    if (T === 1 || T === 2) s += `<polygon points="${rim}" fill="${T === 2 ? "#FFFFFF" : "#F7F3EA"}"/>`; // светлые волокна по рваному краю
    s += `<polygon points="${poly}" fill="${P.paper}"/>${flat ? "" : `<g clip-path="url(#pc)"><rect x="${px - 40}" y="${py - 40}" width="${pw + 80}" height="${ph + 80}" filter="url(#pg)"/></g>`}`;
    if (key === "salon" || key === "night" || key === "mystic" || key === "museum" || key === "art") s += `<rect x="${f1(px + 18)}" y="${f1(py + 18)}" width="${f1(pw - 36)}" height="${f1(ph - 36)}" fill="none" stroke="${P.line}" stroke-width="1.6" opacity=".8"/>`;
    if (key === "sketch") s += `<polygon points="${tornRect(px + 4, py + 4, pw - 8, ph - 8, [4, 4, 4, 4], 40, R)}" fill="none" stroke="${P.line}" stroke-width="3" stroke-linejoin="round"/>`;
    if (key === "modern") s += `<rect x="${px}" y="${py}" width="10" height="${ph}" fill="${P.acc}"/>`;
    return s;
  }
  const cache = new Map();
  const sideOf = (lay, acc) => lay === "image" ? "image" : acc || "";
  function svg(key, i = 0, kind = "", side = "", pal = null, layer = "bg") {
    const P = palOf(key, pal); if (!P) return "";
    const flat = layer === "paperflat"; if (flat) layer = "paper";
    const v = i % 6, k2 = /title|section/.test(kind) ? kind : "", ck = `${flat ? "f" : ""}${layer}|${key}|${v}|${k2}|${side}|${key === "art" ? JSON.stringify(P) : ""}`;
    if (cache.has(ck)) return cache.get(ck);
    const R = rnd(v * 977 + key.length * 131 + (layer === "bg" ? 7 : 91));
    const body = layer === "bg" ? bgSvg(key, v, k2, side, P, R) : paperSvg(key, v, k2, side, P, R, flat);
    const out = body ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${body}</svg>` : "";
    cache.set(ck, out); return out;
  }
  const dataUrl = s => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s).replace(/'/g, "%27");
  function decoHtml(key, i, kind, side = "", pal = null) { const s = svg(key, i, kind, side, pal, "bg"); return s ? `<div class="sx-deco" aria-hidden="true" style="background-image:url('${dataUrl(s)}')"></div>` : ""; }
  function paperHtml(key, i, kind, side = "", pal = null) { const s = svg(key, i, kind, side, pal, "paper"); return s ? `<div class="sx-paper" aria-hidden="true" style="background-image:url('${dataUrl(s)}')"></div>` : ""; }
  // CSS-переменные темы (для «По картине» — из палитры урока)
  function vars(key, pal) { const P = palOf(key, pal); if (!P) return ""; return `--sx-bg:${P.paper};--sx-ink:${P.ink};--sx-accent:${P.acc};--sx-line:${P.line};--tk-l1:${P.l1};--tk-base:${P.base};`; }

  /* ---------- стикеры ---------- */
  const T = (txt, fill, ink, rot = -4) => `<g transform="rotate(${rot} 100 100)"><rect x="18" y="30" width="164" height="140" rx="6" fill="${fill}"/><rect x="18" y="30" width="164" height="22" fill="#000" opacity=".06"/><text x="100" y="118" text-anchor="middle" font-family="Caveat,'Marck Script','Comic Sans MS',cursive" font-size="44" font-weight="700" fill="${ink}">${txt}</text></g>`;
  const STK = {
    star:    { n: "Звезда", svg: `<polygon points="${starPts(100, 104, 86, 38)}" fill="#F2C14E" stroke="#B8801E" stroke-width="5" stroke-linejoin="round"/>` },
    sparkle: { n: "Искра", svg: sparkle(100, 100, 86, "#F29B38") + sparkle(158, 46, 26, "#F6C27A") },
    burst:   { n: "Взрыв", svg: burst(100, 100, 92, "#E23B3B", 14) },
    tape:    { n: "Скотч", svg: `<g transform="rotate(-12 100 100)"><rect x="10" y="74" width="180" height="52" fill="#F4E3A1" opacity=".85"/><path d="M10 74l6 8-6 8 6 8-6 8 6 8-6 8M190 74l-6 8 6 8-6 8 6 8-6 8 6 8" fill="none" stroke="#fff" stroke-width="3" opacity=".6"/></g>` },
    pin:     { n: "Кнопка", svg: `<circle cx="100" cy="74" r="44" fill="#D33B3B"/><circle cx="86" cy="60" r="12" fill="#fff" opacity=".45"/><path d="M100 118l-6 66h12z" fill="#888"/>` },
    clip:    { n: "Скрепка", svg: `<path d="M120 30v120a28 28 0 0 1-56 0V50a18 18 0 0 1 36 0v96" fill="none" stroke="#8A8F98" stroke-width="10" stroke-linecap="round"/>` },
    leaf:    { n: "Листик", svg: `<path d="M30 170C40 70 110 30 176 24C170 100 120 168 30 170z" fill="#7C9A62"/><path d="M30 170C80 120 120 80 176 24" stroke="#4E6B3A" stroke-width="5" fill="none"/>` },
    moon:    { n: "Луна", svg: `<path d="M120 20a82 82 0 1 0 60 140a64 64 0 1 1-60-140z" fill="#E6CF8E"/>` },
    plane:   { n: "Самолётик", svg: `<path d="M20 110L180 40L110 170L90 120Z" fill="#fff" stroke="#1F2A5A" stroke-width="6" stroke-linejoin="round"/><path d="M90 120L180 40" stroke="#1F2A5A" stroke-width="5"/>` },
    bulb:    { n: "Лампочка", svg: `<circle cx="100" cy="84" r="56" fill="#FFD54A" stroke="#C99A12" stroke-width="5"/><rect x="78" y="136" width="44" height="34" rx="6" fill="#9AA0A8"/><path d="M84 92l16 18 16-18" fill="none" stroke="#C99A12" stroke-width="5"/>` },
    pencil:  { n: "Карандаш", svg: `<g transform="rotate(-35 100 100)"><rect x="20" y="82" width="130" height="36" fill="#F2B233"/><rect x="20" y="82" width="22" height="36" fill="#E77"/><path d="M150 82l36 18-36 18z" fill="#F3D9A4"/><path d="M174 94l12 6-12 6z" fill="#333"/></g>` },
    check:   { n: "Галочка", svg: `<circle cx="100" cy="100" r="80" fill="#3E9B5C"/><path d="M60 102l28 28 56-60" fill="none" stroke="#fff" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>` },
    ask:     { n: "Вопрос", svg: `<path d="M30 40h140a14 14 0 0 1 14 14v76a14 14 0 0 1-14 14H90l-36 30v-30H30a14 14 0 0 1-14-14V54a14 14 0 0 1 14-14z" fill="#fff" stroke="#1F2A5A" stroke-width="6"/><text x="100" y="124" text-anchor="middle" font-family="Georgia,serif" font-size="80" font-weight="700" fill="#E23B3B">?</text>` },
    note:    { n: "Запомни!", svg: T("Запомни!", "#FFE680", "#7A3B00") },
    imp:     { n: "Важно!", svg: `<g transform="rotate(-10 100 100)"><circle cx="100" cy="100" r="80" fill="none" stroke="#C8202F" stroke-width="8"/><circle cx="100" cy="100" r="66" fill="none" stroke="#C8202F" stroke-width="3"/><text x="100" y="114" text-anchor="middle" font-family="Oswald,Arial Narrow,Arial,sans-serif" font-size="40" font-weight="700" fill="#C8202F">ВАЖНО!</text></g>` },
    think:   { n: "Подумай", svg: T("Подумай…", "#BFE3FF", "#123B66", 3) },
    write:   { n: "Запиши", svg: T("Запиши ✎", "#D8F2C2", "#24521A", -2) },
    heart:   { n: "Сердце", svg: `<path d="M100 170C30 120 20 80 40 54c20-24 52-18 60 8c8-26 40-32 60-8c20 26 10 66-60 116z" fill="#E4576B"/>` },
    flower:  { n: "Цветок", svg: [0, 72, 144, 216, 288].map(a => `<ellipse cx="100" cy="58" rx="26" ry="42" fill="#F2A7B5" transform="rotate(${a} 100 100)"/>`).join("") + `<circle cx="100" cy="100" r="22" fill="#F2C14E"/>` },
    arrow:   { n: "Стрелка", svg: `<path d="M24 150C60 70 120 50 168 66" fill="none" stroke="#E23B3B" stroke-width="9" stroke-linecap="round"/><path d="M146 44l26 22-32 14" fill="none" stroke="#E23B3B" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>` }
  };
  const stkSvg = n => STK[n] ? `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">${STK[n].svg}</svg>` : "";
  // стикеры темы по умолчанию — на ключевых слайдах, в свободном углу
  const THEME_STK = { night: "star", haze: "sparkle", botanic: "leaf", salon: "flower", poster: "burst", sketch: "plane", collage: "tape", museum: "", mystic: "moon", board: "" };
  const THEME_STK2 = { night: "star", glow: "sparkle", haze: "sparkle", aqua: "sparkle", botanic: "leaf", salon: "flower", poster: "burst", sketch: "plane", collage: "tape", mystic: "moon", modern: "", museum: "", art: "", sepia: "", renaissance: "", board: "", grad: "" };
  function autoStickers(key, kind, i) {
    const out = [], byKind = { rule: "note", big: "ask", hw: "pencil", task: "pin", mnemo: "bulb" }[kind];
    if (byKind && !/renaissance|museum|art|sepia|modern|grad/.test(key)) out.push({ n: byKind, x: 84, y: 4, s: 11, r: 6 });
    else if (THEME_STK2[key] && i % 3 === 1) out.push({ n: THEME_STK2[key], x: 89, y: 78, s: 7, r: -8 });
    return out;
  }
  function stickersHtml(list, edit) {
    const q = s => String(s).replace(/"/g, "&quot;");
    return (list || []).filter(x => STK[x.n] || x.img).map((x, k) => `<div class="stk${x.auto ? " auto" : ""}${x.img ? " ph" : ""}" data-k="${k}" data-n="${x.n || "photo"}" style="left:${x.x}%;top:${x.y}%;width:${x.s}%;transform:rotate(${x.r || 0}deg)${x.img ? `;aspect-ratio:${x.ar || 1}` : ""}" ${edit ? 'tabindex="0" title="Перетащите; колёсико — повернуть; +/− — размер; двойной щелчок — убрать"' : 'aria-hidden="true"'}>${x.img ? `<img class="stk-img" data-src="${q(x.img)}" alt="">` : stkSvg(x.n)}</div>`).join("");
  }
  const rcache = new Map();
  async function rasterSvg(svgStr, w, h, type = "image/png") {
    const ck = type + w + "|" + svgStr; if (rcache.has(ck)) return rcache.get(ck);
    const r = await rasterSvg0(svgStr, w, h, type); rcache.set(ck, r); return r;
  }
  async function rasterSvg0(svgStr, w, h, type) {
    const img = await new Promise(r => { const im = new Image(); im.onload = () => r(im); im.onerror = () => r(null); im.src = dataUrl(svgStr); });
    if (!img) return null;
    const c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d").drawImage(img, 0, 0, w, h);
    try { return c.toDataURL(type, .86); } catch { return null; }
  }

  /* ---------- автоподбор оформления по теме урока ---------- */
  const RULES = [
    [/грин|алые паруса|экзюпери|ершов|конёк|ночь перед/i, ["glow", "night"]],
    [/войн|блокад|фронт|тёркин|теркин|шолохов|судьба человека|сотников|ленинград|победа|афганист|борис васильев|зори здесь/i, ["sepia", "collage"]],
    [/живопис|картин|художник|репродукц|икон|рублёв|рублев|музей|портрет|возрожден|ренессанс|шекспир|данте|сервантес|антич|миф/i, ["renaissance", "art"]],
    [/сказк|чудес|волшеб|мечт|сон|звезд|звёзд|новогод|рождеств|снегурочк|щелкунчик|андерсен/i, ["glow", "night"]],
    [/гоголь|вий|вечера на хуторе|баллад|жуковск|светлана|людмила|мистик|страшн|пиковая дама|мцыри|демон|кавказ/i, ["mystic"]],
    [/онегин|пушкин|лермонтов|герой нашего времени|тургенев|толстой|бал|дворян|капитанская дочка|горе от ума|грибоедов|карамзин|бедная лиза|ася|первая любовь|гончаров|обломов|островск|гроза|бесприданниц/i, ["salon", "renaissance", "art"]],
    [/слово о полку|древнерус|летопис|житие|повесть временных|былин|средневек|ренессанс|возрожден|шекспир|данте|сервантес|дон кихот|мифолог|миф|антич|гомер|одиссе|илиад|легенд|библ/i, ["museum"]],
    [/есенин|блок|ахматов|цветаев|пастернак|серебрян|лирик|любов|элеги|фет|тютчев|чувств|настроени/i, ["haze", "aqua"]],
    [/природ|осен|весн|зим|лето|лес|берёз|берез|пришвин|паустовск|бианки|сад|цвет|растени|экологи|чехов.*сад|вишнёв/i, ["botanic"]],
    [/чехов|зощенко|тэффи|аверченко|юмор|сатир|басн|крылов|салтыков|щедрин|драгунск|носов|пародия/i, ["sketch", "poster"]],
    [/подрост|школ|друж|современ|распутин|уроки французского|железников|чучело|маяковск|плакат|революц|футур/i, ["poster", "modern"]],
    [/достоевск|преступлен|бедные люди|униженн|петербург|шинель|нос|мёртвые души|ревизор/i, ["museum", "mystic"]],
    // русский язык
    [/орфограф|правописан|корн|приставк|суффикс|чередован|безударн|н и нн|\bнн\b|не с |ь после|ы.*ц|ё после/i, ["sketch", "modern", "aqua"]],
    [/пунктуац|запят|тире|двоеточ|обособл|однородн|сложн.*предлож|прям.*реч|синтаксис|словосочетан|член.*предлож/i, ["modern", "botanic", "board"]],
    [/лексик|фразеолог|этимолог|происхожден|заимствован|старослав|истори.*язык|диалект|архаизм|историзм/i, ["museum", "salon"]],
    [/текст|сочинени|изложени|рассуждени|описани|повествован|стил|речь|риторик|публицист/i, ["haze", "botanic"]],
    [/морфолог|част.*реч|существительн|прилагательн|глагол|причаст|деепричаст|наречи|местоимени|числительн|предлог|союз|частиц/i, ["sketch", "poster", "board"]],
    [/фонетик|звук|буква|ударени|орфоэп/i, ["sketch", "board"]]
  ];
  function hash(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }
  function auto(p) {
    if (p?.subject === "phys" || p?.subject === "chem" || p?.subject === "soc" || p?.subject === "inf") return "grad";
    const t = `${p?.topic || ""} ${p?.plan?.kit?.work || ""}`;
    for (const [re, list] of RULES) if (re.test(t)) return list[hash(t) % list.length];
    return p?.subject === "lit" ? ["renaissance", "art", "glow", "haze", "salon", "aqua"][hash(t) % 6] : ["modern", "sketch", "aqua", "botanic"][hash(t) % 4];
  }
  function why(p) { const k = auto(p); return `${META[k].name} — ${META[k].desc}`; }

  return { META, PAL, has, svg, decoHtml, paperHtml, vars, paletteFrom, sideOf, panelRect, dataUrl, STK, stkSvg, stickersHtml, autoStickers, rasterSvg, auto, why };
})();
window.ThemeKit = ThemeKit;
