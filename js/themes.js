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
  /* ---------- темы ---------- */
  const META = {
    night:  { name: "Звёздная ночь", desc: "тёмное небо, золотые звёзды на нитях", font: "marck", frame: "0E1B3D" },
    haze:   { name: "Туман и свет", desc: "тёплый туман, искры ✦, мягкая плашка", font: "cormorant", frame: "F2A35E" },
    botanic:{ name: "Ботаника", desc: "кремовый, бордо и олива, веточки", font: "playfair", frame: "F6EEDF" },
    salon:  { name: "Салон XIX века", desc: "шалфейные обои, рамы, кружево", font: "cormorant", frame: "8FA58A" },
    poster: { name: "Плакат-ретро", desc: "горчица и бордо, полароиды", font: "russo", frame: "D9A62E" },
    sketch: { name: "Скетч", desc: "звёзды-взрывы, пунктир, самолётик", font: "caveat", frame: "F2ECDD" },
    collage:{ name: "Коллаж", desc: "мятая бумага, рваные края, скотч", font: "oswald", frame: "EDEAE4" },
    museum: { name: "Тёмный музей", desc: "чёрный, пергамент, красный круг", font: "forum", frame: "141210" },
    mystic: { name: "Винтаж-мистика", desc: "оливковая ночь, луна, золото", font: "yeseva", frame: "26301F" },
    board:  { name: "Школьная доска", desc: "зелёная доска, мел, деревянная рама", font: "caveat", frame: "6B4A2B" }
  };
  const has = k => !!META[k];

  /* ---------- утилиты рисования ---------- */
  const rnd = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const f1 = n => Math.round(n * 10) / 10;
  function starPts(cx, cy, R, r, n = 5, rot = -90) {
    const p = [];
    for (let k = 0; k < n * 2; k++) { const a = (rot + k * 180 / n) * Math.PI / 180, rr = k % 2 ? r : R; p.push(f1(cx + rr * Math.cos(a)) + "," + f1(cy + rr * Math.sin(a))); }
    return p.join(" ");
  }
  const sparkle = (cx, cy, R, fill, op = 1) => `<path d="M${cx} ${cy - R}Q${cx} ${cy} ${cx + R} ${cy}Q${cx} ${cy} ${cx} ${cy + R}Q${cx} ${cy} ${cx - R} ${cy}Q${cx} ${cy} ${cx} ${cy - R}Z" fill="${fill}" opacity="${op}"/>`;
  function jag(pts, amp, step, R) { // рваный край: ломаная по контуру
    const out = [];
    for (let k = 0; k < pts.length; k++) {
      const [x1, y1] = pts[k], [x2, y2] = pts[(k + 1) % pts.length], L = Math.hypot(x2 - x1, y2 - y1), n = Math.max(2, Math.round(L / step));
      for (let j = 0; j < n; j++) { const t = j / n, nx = -(y2 - y1) / L, ny = (x2 - x1) / L, d = (R() - .5) * amp; out.push(f1(x1 + (x2 - x1) * t + nx * d) + "," + f1(y1 + (y2 - y1) * t + ny * d)); }
    }
    return out.join(" ");
  }
  function branch(x, y, len, ang, col, R, w = 2.4) { // веточка с листьями (линия)
    const a = ang * Math.PI / 180, ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len, cx = x + Math.cos(a + .35) * len * .55, cy = y + Math.sin(a + .35) * len * .55;
    let s = `<path d="M${f1(x)} ${f1(y)}Q${f1(cx)} ${f1(cy)} ${f1(ex)} ${f1(ey)}" stroke="${col}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
    for (let k = 1; k <= 7; k++) {
      const t = k / 8, px = (1 - t) * (1 - t) * x + 2 * (1 - t) * t * cx + t * t * ex, py = (1 - t) * (1 - t) * y + 2 * (1 - t) * t * cy + t * t * ey;
      const side = k % 2 ? 1 : -1, la = ang + side * (48 + R() * 14), L = len * (.16 - t * .07);
      const lx = px + Math.cos(la * Math.PI / 180) * L, ly = py + Math.sin(la * Math.PI / 180) * L;
      s += `<ellipse cx="${f1((px + lx) / 2)}" cy="${f1((py + ly) / 2)}" rx="${f1(L / 2)}" ry="${f1(L / 5.5)}" transform="rotate(${f1(la)} ${f1((px + lx) / 2)} ${f1((py + ly) / 2)})" fill="none" stroke="${col}" stroke-width="${w * .8}"/>`;
    }
    return s;
  }
  const burst = (cx, cy, R, fill, n = 12, stroke = "") => `<polygon points="${starPts(cx, cy, R, R * .62, n, -90)}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="4" stroke-linejoin="round"` : ""}/>`;
  const noise = (id, op, freq = .9) => `<filter id="${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${op} 0"/></filter>`;

  /* ---------- фоны тем (1600×900) ---------- */
  const W = 1600, H = 900;
  const BG = {
    night(v, kind, R) {
      let s = `<defs><linearGradient id="n1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0B1636"/><stop offset=".65" stop-color="#18295A"/><stop offset="1" stop-color="#2B3F78"/></linearGradient><radialGradient id="n2" cx="${v % 2 ? .82 : .18}" cy=".12" r=".55"><stop offset="0" stop-color="#F7D88A" stop-opacity=".35"/><stop offset="1" stop-color="#F7D88A" stop-opacity="0"/></radialGradient><linearGradient id="n3" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE7A3"/><stop offset=".55" stop-color="#E2A93B"/><stop offset="1" stop-color="#B9761C"/></linearGradient></defs>`;
      s += `<rect width="${W}" height="${H}" fill="url(#n1)"/><rect width="${W}" height="${H}" fill="url(#n2)"/>`;
      for (let k = 0; k < 140; k++) s += `<circle cx="${f1(R() * W)}" cy="${f1(R() * H)}" r="${f1(.6 + R() * 2.2)}" fill="#FFF8E1" opacity="${f1(.35 + R() * .6)}"/>`;
      for (let k = 0; k < 9; k++) s += sparkle(f1(R() * W), f1(R() * H), f1(7 + R() * 10), "#FFF1C2", .85);
      // висящие звёзды на нитях
      const hang = [[v % 2 ? 90 : 1510, 120 + R() * 60, 46], [v % 2 ? 230 : 1370, 60 + R() * 40, 30], [v % 3 ? 1480 : 120, 70, 24]];
      for (const [x, y, r] of hang) s += `<line x1="${f1(x)}" y1="0" x2="${f1(x)}" y2="${f1(y - r)}" stroke="#E8C77A" stroke-width="2" opacity=".8"/><polygon points="${starPts(x, y, r, r * .45)}" fill="url(#n3)" stroke="#FFF0BF" stroke-width="2" stroke-linejoin="round"/>`;
      if (kind === "title" || kind === "section") {
        s += `<path d="M0 ${H}V760Q300 690 620 735T1200 720T${W} 700V${H}Z" fill="#1E3B3A" opacity=".9"/><path d="M0 ${H}V810Q400 760 820 800T${W} 780V${H}Z" fill="#244B3F"/>`;
        s += `<path d="M1405 160a70 70 0 1 0 50 120a56 56 0 1 1 -50 -120z" fill="#FFE7A3" opacity=".95"/>`;
      }
      return s;
    },
    haze(v, kind, R) {
      const blobs = [["#F08A24", .18 + R() * .2, .2 + R() * .6, 520], ["#F9C27D", .6 + R() * .3, .2 + R() * .4, 620], ["#FFE9C9", .4, .9, 700], ["#E3672A", v % 2 ? .95 : .05, v % 2 ? .1 : .85, 380]];
      let s = `<defs><filter id="h1" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="90"/></filter></defs><rect width="${W}" height="${H}" fill="#FCEBD3"/>`;
      s += `<g filter="url(#h1)">${blobs.map(([c, x, y, r]) => `<circle cx="${f1(x * W)}" cy="${f1(y * H)}" r="${r}" fill="${c}" opacity=".85"/>`).join("")}</g>`;
      for (let k = 0; k < 6; k++) s += sparkle(f1(60 + R() * (W - 120)), f1(40 + R() * (H - 80)), f1(12 + R() * 22), k % 2 ? "#E8742A" : "#FFF6E6", .9);
      return s;
    },
    botanic(v, kind, R) {
      const left = v % 2 === 0;
      let s = `<rect width="${W}" height="${H}" fill="#F6EEDF"/>`;
      s += `<rect x="${left ? 0 : W - 150}" y="0" width="150" height="${H}" fill="#6B1E2A"/>`;
      if (v % 3 === 1) s += `<rect x="0" y="${H - 70}" width="${W}" height="70" fill="#5E6B4E"/>`;
      s += branch(left ? W - 40 : 40, H - 30, 380, left ? -125 : -55, "#A9946C", R);
      s += branch(left ? W - 120 : 120, 10, 260, left ? 160 : 20, "#C2AE88", R, 2);
      if (kind === "title") s += `<circle cx="${left ? 75 : W - 75}" cy="${H / 2}" r="34" fill="none" stroke="#E9D9B8" stroke-width="2"/>`;
      return s;
    },
    salon(v, kind, R) {
      let s = `<defs><pattern id="s1" width="120" height="140" patternUnits="userSpaceOnUse"><path d="M60 20c14 18 14 34 0 50c-14-16-14-32 0-50zM60 70c18 4 28 16 30 34c-18-2-28-14-30-34zM60 70c-18 4-28 16-30 34c18-2 28-14 30-34zM60 104v24" fill="none" stroke="#DCE6D4" stroke-width="2.4" opacity=".55"/><circle cx="0" cy="0" r="4" fill="#DCE6D4" opacity=".45"/><circle cx="120" cy="140" r="4" fill="#DCE6D4" opacity=".45"/></pattern><pattern id="s2" width="40" height="34" patternUnits="userSpaceOnUse"><circle cx="20" cy="0" r="18" fill="#FBF8F1"/><circle cx="20" cy="4" r="5" fill="#E7E0D0"/><circle cx="8" cy="16" r="2.6" fill="#E7E0D0"/><circle cx="32" cy="16" r="2.6" fill="#E7E0D0"/></pattern></defs>`;
      s += `<rect width="${W}" height="${H}" fill="#8FA58A"/><rect width="${W}" height="${H}" fill="url(#s1)"/>`;
      s += `<rect x="0" y="${H - 120}" width="${W}" height="120" fill="#DCD6C6"/>`;
      for (let x = 30; x < W; x += 260) s += `<rect x="${x}" y="${H - 100}" width="220" height="80" fill="none" stroke="#C5BDA8" stroke-width="3"/>`;
      s += `<rect x="0" y="${H - 132}" width="${W}" height="16" fill="#FBF8F1"/><rect x="0" y="${H - 116}" width="${W}" height="34" fill="url(#s2)"/>`;
      s += `<rect x="0" y="0" width="${W}" height="12" fill="#C7B07A"/>`;
      return s;
    },
    poster(v, kind, R) {
      let s = `<defs>${noise("p1", .32)}</defs><rect width="${W}" height="${H}" fill="#D9A62E"/>`;
      const side = v % 2;
      const shape = side ? [[W * .62, 0], [W, 0], [W, H], [W * .7, H]] : [[0, 0], [W * .36, 0], [W * .28, H], [0, H]];
      s += `<polygon points="${jag(shape, 22, 26, R)}" fill="#7E1F23"/>`;
      s += `<polygon points="${jag(shape.map(([x, y]) => [x + (side ? -18 : 18), y]), 22, 26, R)}" fill="none" stroke="#F3D27A" stroke-width="5"/>`;
      if (kind === "title" || v % 3 === 0) s += burst(side ? 240 : W - 240, H - 150, 90, "#F3E6C4", 14, "#7E1F23");
      s += `<rect width="${W}" height="${H}" filter="url(#p1)"/>`;
      return s;
    },
    sketch(v, kind, R) {
      const dark = kind === "title" || kind === "section" || v % 4 === 3;
      const bg = dark ? "#1F2A5A" : "#F2ECDD", ink = dark ? "#F2ECDD" : "#1F2A5A";
      let s = `<rect width="${W}" height="${H}" fill="${bg}"/>`;
      s += `<path d="M${v % 2 ? 80 : 1520} ${H - 80}C${W * .3} ${H - 260} ${W * .2} 120 ${W * .55} 90S${W * .85} 260 ${v % 2 ? 1480 : 120} 60" fill="none" stroke="${ink}" stroke-width="3" stroke-dasharray="12 12" opacity=".55"/>`;
      const px = v % 2 ? 1490 : 110, py = 60;
      s += `<path d="M${px - 34} ${py + 6}L${px + 30} ${py - 16}L${px - 8} ${py + 24}Z" fill="none" stroke="#E23B3B" stroke-width="4" stroke-linejoin="round"/><path d="M${px - 8} ${py + 24}L${px - 4} ${py + 6}L${px + 30} ${py - 16}" fill="none" stroke="#E23B3B" stroke-width="4"/>`;
      s += burst(v % 2 ? 120 : W - 120, H - 120, 76, "#E23B3B", 12);
      s += burst(v % 2 ? 230 : W - 250, H - 70, 44, "none", 10, ink);
      if (kind === "title") s += `<path d="M160 ${H - 160}l130 -170l90 110l60 -60l140 160" fill="none" stroke="${ink}" stroke-width="4" stroke-linejoin="round"/>`;
      return s;
    },
    collage(v, kind, R) {
      let s = `<defs>${noise("c1", .22, .7)}<linearGradient id="c2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F4F1EC"/><stop offset=".5" stop-color="#E4DFD6"/><stop offset="1" stop-color="#F1EDE6"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#c2)"/>`;
      const a = v % 2 ? [[W - 420, 0], [W, 0], [W, 330], [W - 260, 240]] : [[0, H - 330], [380, H - 240], [460, H], [0, H]];
      const b = v % 2 ? [[0, H - 180], [260, H - 120], [300, H], [0, H]] : [[W - 300, 0], [W, 0], [W, 200], [W - 200, 150]];
      s += `<polygon points="${jag(a, 26, 22, R)}" fill="#C8202F"/><polygon points="${jag(b, 22, 22, R)}" fill="#E04A4A" opacity=".9"/>`;
      // каракуля
      const cx = v % 2 ? W - 230 : 220, cy = v % 2 ? 140 : H - 160; let d = `M${cx} ${cy}`;
      for (let k = 0; k < 9; k++) d += `c${f1(40 + R() * 40)} ${f1(-30 - R() * 30)} ${f1(70 + R() * 30)} ${f1(30 + R() * 30)} ${f1(-20 - R() * 40)} ${f1(40 + R() * 20)}`;
      s += `<path d="${d}" fill="none" stroke="#111" stroke-width="5" stroke-linecap="round" opacity=".85"/>`;
      s += `<rect width="${W}" height="${H}" filter="url(#c1)"/>`;
      return s;
    },
    museum(v, kind, R) {
      let s = `<defs>${noise("m1", .18, .6)}<radialGradient id="m2" cx=".5" cy=".45" r=".75"><stop offset="0" stop-color="#2A2420"/><stop offset="1" stop-color="#0E0C0A"/></radialGradient></defs><rect width="${W}" height="${H}" fill="url(#m2)"/>`;
      s += `<circle cx="${v % 2 ? 300 : W - 300}" cy="${v % 3 === 0 ? 230 : H - 220}" r="170" fill="#9E2B1E" opacity=".92"/>`;
      s += `<line x1="70" y1="54" x2="${W - 70}" y2="54" stroke="#B89A5E" stroke-width="2" opacity=".7"/><line x1="70" y1="${H - 54}" x2="${W - 70}" y2="${H - 54}" stroke="#B89A5E" stroke-width="2" opacity=".7"/>`;
      s += `<path d="M${W / 2} 36c-10 8-10 22 0 30c10-8 10-22 0-30zm-22 18c4 10 14 14 22 12c-6-8-14-12-22-12zm44 0c-4 10-14 14-22 12c6-8 14-12 22-12z" fill="#B89A5E"/>`;
      s += `<text x="80" y="${H - 22}" fill="#B89A5E" font-family="Georgia,serif" font-size="22" letter-spacing="6" opacity=".8">${String(v + 1).padStart(2, "0")}</text>`;
      s += `<rect width="${W}" height="${H}" filter="url(#m1)"/>`;
      return s;
    },
    mystic(v, kind, R) {
      let s = `<defs><radialGradient id="y1" cx=".5" cy=".5" r=".75"><stop offset="0" stop-color="#3D4B36"/><stop offset="1" stop-color="#141A12"/></radialGradient></defs><rect width="${W}" height="${H}" fill="url(#y1)"/>`;
      const cx = v % 2 ? W - 160 : 160, cy = v % 3 === 0 ? H - 140 : 150;
      s += `<g fill="none" stroke="#C9A85C" opacity=".75"><circle cx="${cx}" cy="${cy}" r="230" stroke-width="2"/><circle cx="${cx}" cy="${cy}" r="196" stroke-width="1.4"/><circle cx="${cx}" cy="${cy}" r="120" stroke-width="1.4"/>`;
      for (let k = 0; k < 36; k++) { const a = k * 10 * Math.PI / 180; s += `<line x1="${f1(cx + Math.cos(a) * 196)}" y1="${f1(cy + Math.sin(a) * 196)}" x2="${f1(cx + Math.cos(a) * (k % 3 ? 210 : 226))}" y2="${f1(cy + Math.sin(a) * (k % 3 ? 210 : 226))}" stroke-width="1.4"/>`; }
      s += `</g>`;
      const mx = v % 2 ? 150 : W - 150;
      s += `<path d="M${mx} 70a62 62 0 1 0 44 106a50 50 0 1 1 -44 -106z" fill="#E6CF8E"/>`;
      for (let k = 0; k < 14; k++) s += sparkle(f1(R() * W), f1(R() * H), f1(5 + R() * 9), "#E6CF8E", .8);
      s += branch(v % 2 ? 40 : W - 40, H, 300, v % 2 ? -60 : -120, "#6E8160", R, 3);
      return s;
    },
    board(v, kind, R) {
      let s = `<defs>${noise("b1", .12, .5)}<radialGradient id="b2" cx=".5" cy=".45" r=".8"><stop offset="0" stop-color="#2F5A45"/><stop offset="1" stop-color="#1D3A2C"/></radialGradient></defs>`;
      s += `<rect width="${W}" height="${H}" fill="#6B4A2B"/><rect x="34" y="34" width="${W - 68}" height="${H - 68}" fill="url(#b2)"/><rect x="34" y="34" width="${W - 68}" height="${H - 68}" fill="none" stroke="#3E2A17" stroke-width="6"/>`;
      // меловые разводы
      for (let k = 0; k < 6; k++) { const x = 80 + R() * (W - 300), y = 80 + R() * (H - 200); s += `<path d="M${f1(x)} ${f1(y)}q${f1(80 + R() * 120)} ${f1(-20 + R() * 40)} ${f1(200 + R() * 140)} ${f1(-10 + R() * 20)}" stroke="#FFFFFF" stroke-width="${f1(18 + R() * 30)}" opacity=".035" fill="none" stroke-linecap="round"/>`; }
      s += `<rect x="34" y="${H - 34}" width="${W - 68}" height="20" fill="#4E351D"/><rect x="${W - 360}" y="${H - 46}" width="70" height="12" rx="4" fill="#F4F1E8"/><rect x="${W - 270}" y="${H - 44}" width="46" height="10" rx="4" fill="#F2C94C"/>`;
      s += `<rect width="${W}" height="${H}" filter="url(#b1)"/>`;
      return s;
    }
  };
  const cache = new Map();
  function svg(key, i = 0, kind = "") {
    if (!BG[key]) return "";
    const v = i % 6, k2 = /title|section/.test(kind) ? kind : "", ck = `${key}|${v}|${k2}`;
    if (cache.has(ck)) return cache.get(ck);
    const body = BG[key](v, k2, rnd(v * 977 + key.length * 131 + 7));
    const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">${body}</svg>`;
    cache.set(ck, out); return out;
  }
  const dataUrl = s => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s).replace(/'/g, "%27");
  function decoHtml(key, i, kind) { const s = svg(key, i, kind); return s ? `<div class="sx-deco" aria-hidden="true" style="background-image:url('${dataUrl(s)}')"></div>` : ""; }

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
  function autoStickers(key, kind, i) {
    const out = [];
    const byKind = { rule: "note", big: "ask", hw: "pencil", task: "pin", goal: "bulb", mnemo: "bulb", board: "write", video: "" }[kind];
    if (byKind) out.push({ n: byKind, x: 86, y: 3, s: 12, r: 6 });
    else if (THEME_STK[key] && i % 3 === 1) out.push({ n: THEME_STK[key], x: 88, y: 76, s: 9, r: -8 });
    return out;
  }
  function stickersHtml(list, edit) {
    return (list || []).filter(x => STK[x.n]).map((x, k) => `<div class="stk${x.auto ? " auto" : ""}" data-k="${k}" data-n="${x.n}" style="left:${x.x}%;top:${x.y}%;width:${x.s}%;transform:rotate(${x.r || 0}deg)" ${edit ? 'tabindex="0" title="Перетащите; двойной щелчок — убрать"' : 'aria-hidden="true"'}>${stkSvg(x.n)}</div>`).join("");
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
    [/сказк|мечт|звезд|звёзд|грин|алые паруса|экзюпери|андерсен|ершов|конёк|чудес|новогод|рождеств|ночь перед/i, ["night"]],
    [/войн|блокад|фронт|тёркин|теркин|шолохов|судьба человека|сотников|ленинград|победа|афганист|борис васильев|зори здесь/i, ["collage", "poster"]],
    [/гоголь|вий|вечера на хуторе|баллад|жуковск|светлана|людмила|мистик|страшн|пиковая дама|мцыри|демон|кавказ/i, ["mystic"]],
    [/онегин|пушкин|лермонтов|герой нашего времени|тургенев|толстой|бал|дворян|капитанская дочка|горе от ума|грибоедов|карамзин|бедная лиза|ася|первая любовь|гончаров|обломов|островск|гроза|бесприданниц/i, ["salon"]],
    [/слово о полку|древнерус|летопис|житие|повесть временных|былин|средневек|ренессанс|возрожден|шекспир|данте|сервантес|дон кихот|мифолог|миф|антич|гомер|одиссе|илиад|легенд|библ/i, ["museum"]],
    [/есенин|блок|ахматов|цветаев|пастернак|серебрян|лирик|любов|элеги|фет|тютчев|чувств|настроени/i, ["haze"]],
    [/природ|осен|весн|зим|лето|лес|берёз|берез|пришвин|паустовск|бианки|сад|цвет|растени|экологи|чехов.*сад|вишнёв/i, ["botanic"]],
    [/чехов|зощенко|тэффи|аверченко|юмор|сатир|басн|крылов|салтыков|щедрин|драгунск|носов|пародия/i, ["sketch", "poster"]],
    [/подрост|школ|друж|современ|распутин|уроки французского|железников|чучело|маяковск|плакат|революц|футур/i, ["poster"]],
    [/достоевск|преступлен|бедные люди|униженн|петербург|шинель|нос|мёртвые души|ревизор/i, ["museum", "mystic"]],
    // русский язык
    [/орфограф|правописан|корн|приставк|суффикс|чередован|безударн|н и нн|\bнн\b|не с |ь после|ы.*ц|ё после/i, ["sketch", "botanic", "board"]],
    [/пунктуац|запят|тире|двоеточ|обособл|однородн|сложн.*предлож|прям.*реч|синтаксис|словосочетан|член.*предлож/i, ["board", "botanic", "poster"]],
    [/лексик|фразеолог|этимолог|происхожден|заимствован|старослав|истори.*язык|диалект|архаизм|историзм/i, ["museum", "salon"]],
    [/текст|сочинени|изложени|рассуждени|описани|повествован|стил|речь|риторик|публицист/i, ["haze", "botanic"]],
    [/морфолог|част.*реч|существительн|прилагательн|глагол|причаст|деепричаст|наречи|местоимени|числительн|предлог|союз|частиц/i, ["sketch", "poster", "board"]],
    [/фонетик|звук|буква|ударени|орфоэп/i, ["sketch", "board"]]
  ];
  function hash(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }
  function auto(p) {
    const t = `${p?.topic || ""} ${p?.plan?.kit?.work || ""}`;
    for (const [re, list] of RULES) if (re.test(t)) return list[hash(t) % list.length];
    return p?.subject === "lit" ? ["haze", "botanic", "salon", "museum"][hash(t) % 4] : ["sketch", "botanic", "board"][hash(t) % 3];
  }
  function why(p) { const k = auto(p); return `${META[k].name} — ${META[k].desc}`; }

  return { META, has, svg, decoHtml, dataUrl, STK, stkSvg, stickersHtml, autoStickers, rasterSvg, auto, why };
})();
window.ThemeKit = ThemeKit;
