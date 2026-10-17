/* ===================================================================
   «Учу по ФРП» — технический макет первых 3 слайдов (гайдлайн автора):
   стили №3 «Журнальный радикализм» и №4 «Минималистичный брендбук»
   чередуются по слайдам. Для каждого слайда: стиль, фон и доминанта,
   HEX-палитра, координаты и размеры наклеек (макет 1920×1080 px), углы,
   кегли (pt), ультракороткие тезисы и промт для Midjourney (по-английски).
   Без нейросети — расчёт по слайдам урока; с нейросетью — она уточняет
   тезисы и пишет промты осмысленно.
   =================================================================== */
const LayoutSpec = (() => {
  "use strict";
  const STYLES = {
    3: { name: "№3 «Журнальный радикализм» (Neo-Brutalism Collage)", bg: "крафт / охра", hex: { "фон": "#D7C49E", "наклейка-заголовок": "#FFFFFF", "контур и тень": "#000000", "наклейка-содержание": "#1A1A1A", "текст содержания": "#FFFFFF" },
      boxes: [["Фото (доминанта)", 800, 0, 1120, 1080, 0, "обрезка грубая, без скруглений, 100 % высоты справа"], ["Наклейка-заголовок (белая)", 80, 120, 850, 180, 0, "контур 4 px #000, плоская тень X/Y 14 px, размытие 0; перекрывает фото на 130 px"], ["Наклейка-содержание (угольная)", 80, 400, 650, 550, 0, "контур 2 px #FFFFFF"]],
      fonts: "Заголовок — Montserrat Black / Impact, 90 pt, ПРОПИСНЫЕ; содержание — геометрический гротеск (Montserrat SemiBold), 34 pt, #FFFFFF",
      mj: (subj) => `editorial neo-brutalist collage photograph for a school literature slide, ${subj}, hyper-realistic large vertical photo, dramatic natural light, rough hard crop, visible paper grain, kraft and ochre tones (#D7C49E), high contrast, documentary texture, no text, no watermark, empty left third for overlays --ar 28:27 --style raw --v 6.1` },
    4: { name: "№4 «Минималистичный брендбук» (Line Art & Airy Layout)", bg: "молочный, ≥ 50 % площади свободно", hex: { "фон": "#FDFBF7", "линии и стрелки": "#333333", "стикер-нотатка": "#FFF2CC", "текст содержания": "#555555" },
      boxes: [["Стикер-нотатка (лимонный)", 200, 200, 450, 450, -5, "мягкая тень: размытие 10 px, непрозрачность 8 %"], ["Линер-иллюстрация (PNG, прозрачный фон)", 1110, 240, 700, 600, 0, "тонкие линии 1,5 px #333333"], ["Стрелка-указатель", 650, 360, 460, 120, 0, "1,5 px #333333, соединяет стикер и рисунок"]],
      fonts: "Заголовок — тонкий гротеск (Futura Light / Jost Light), 36 pt, строчные; содержание — аккуратный рукописный (Caveat), 28 pt, #555555",
      mj: (subj) => `minimalist hand-drawn line art illustration, ${subj}, single continuous fine liner pencil sketch, graphite #333333 lines 1.5px, lots of negative space, isolated on transparent background, clean architectural sketch style, no shading, no color, no text --ar 7:6 --style raw --v 6.1` }
  };
  const TR = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya" };
  const lat = s => String(s || "").replace(/[А-ЯЁа-яё]/g, c => { const l = c.toLowerCase(), t = TR[l] ?? c; return c === l ? t : t.charAt(0).toUpperCase() + t.slice(1); });
  const thesis = s => String(s || "").replace(/\*\*|__|[*_`>#«»"]/g, "").replace(/\s*\([^)]*\)/g, "").split(/[.;:!?]/)[0].split(/\s+/).slice(0, 6).join(" ").trim();
  function subjOf(sl, p) {
    const work = (String(p.topic).match(/«([^»]+)»/) || [])[1], author = typeof Engine !== "undefined" ? Engine.authorOf(p.topic) : "";
    const img = (String(sl.body).match(/!\[([^\]]*)\]\(\s*(?:search:|commons:)?([^)"]*)/) || [])[2] || "";
    // по-английски: известные слова переводим, имена и названия — латиницей
    const EN = { иллюстрация: "illustration", портрет: "portrait", море: "sea", парус: "sail", лес: "forest", зима: "winter", осень: "autumn", весна: "spring", лето: "summer", кавказ: "Caucasus mountains", монастырь: "monastery", гроза: "thunderstorm", буря: "storm", дорога: "road", степь: "steppe", река: "river", усадьба: "manor house", бал: "ballroom", война: "war", солдат: "soldier", деревня: "village", город: "city", ночь: "night", утро: "morning", книга: "old book", дуэль: "duel", корабль: "ship", поле: "field", берёза: "birch tree", сад: "garden", дом: "house" };
    const en = q => String(q).toLowerCase().split(/[\s,]+/).map(w => EN[w.replace(/[^а-яё]/g, "")] || "").filter(Boolean);
    const words = [...new Set([...en(work || ""), ...en(img)])];
    return [work ? `"${lat(work)}"` : lat(String(p.topic).slice(0, 60)), author ? `by ${lat(author)}` : "", words.length ? `(${words.join(", ")})` : "", `19th-century Russian ${p.subject === "lit" ? "literature" : "school"} atmosphere`].filter(Boolean).join(" ");
  }
  function build(L) {
    const p = L.params || {}, arr = window.SlideEditor && L.docs?.slides ? splitSlides(L.docs.slides).map(SlideEditor.parse).slice(0, 3) : [];
    if (!arr.length) return "Сначала соберите презентацию.";
    return arr.map((sl, i) => {
      const k = i % 2 ? 4 : 3, S = STYLES[k];
      const pts = [sl.title, ...String(sl.body || "").replace(/!\[[^\]]*\]\([^)]*\)/g, "").split(/\n+/).map(x => x.replace(/^\s*([-*]|\d+\.)\s*/, "")).filter(x => x.trim())].map(thesis).filter(Boolean);
      const uniq = [...new Set(pts)].slice(0, 4);
      return `## Слайд ${i + 1}. ${sl.title || "без заголовка"}
1. **Стиль:** ${S.name}.
2. **Фон и доминанта:** ${S.bg}; ${k === 3 ? `крупная реалистичная фотография справа — ${subjOf(sl, p).includes("(") ? "иллюстрация по запросу слайда" : "портрет, здание эпохи или текстура старой книги по теме урока"}` : "линер-зарисовка по теме урока (PNG без фона), стрелка ведёт от стикера к рисунку"}.
3. **Палитра (HEX):** ${Object.entries(S.hex).map(([n, h]) => `${n} ${h}`).join("; ")}.
4. **Координаты и размеры (макет 1920×1080 px):**
${S.boxes.map(([n, x, y, w, h, r, note]) => `   - ${n}: X=${x}, Y=${y}, ширина ${w}, высота ${h}, наклон ${r}° — ${note}`).join("\n")}
5. **Шрифты:** ${S.fonts}.
6. **Тезисы в наклейках:** ${uniq.map(t => `«${k === 3 && t === uniq[0] ? t.toUpperCase() : t}»`).join(" · ")}
7. **Midjourney:** \`${S.mj(subjOf(sl, p))}\``;
    }).join("\n\n");
  }
  // запрос к нейросети — гайдлайн автора дословно по смыслу + материалы урока
  function aiPrompt(L) {
    const arr = window.SlideEditor && L.docs?.slides ? splitSlides(L.docs.slides).map(SlideEditor.parse).slice(0, 3) : [];
    return `Ты — арт-директор учебных презентаций. Технический гайдлайн:
СТИЛЬ №3 «ЖУРНАЛЬНЫЙ РАДИКАЛИЗМ»: фон крафт #D7C49E; огромная реалистичная фотография на 100 % высоты справа (X=800, Y=0, 1120×1080 px), обрезка грубая; заголовок — белая наклейка #FFFFFF с чёрным контуром 4 px и плоской тенью 14/14 px без размытия (X=80, Y=120, 850×180 px, перекрывает фото на 130 px); содержание — угольная наклейка #1A1A1A, белый контур 2 px (X=80, Y=400, 650×550 px); заголовок Impact/Montserrat Black 90 pt ПРОПИСНЫМИ, содержание — крупный геометрический гротеск 34 pt белым.
СТИЛЬ №4 «МИНИМАЛИСТИЧНЫЙ БРЕНДБУК»: фон #FDFBF7, не менее 50 % свободно; только линер-графика PNG без фона, стрелки 1,5 px #333333; стикер-нотатка #FFF2CC (X=200, Y=200, 450×450 px, наклон −5°, тень размытие 10 px, 8 %); заголовок тонкий гротеск (Futura Light) 36 pt строчными; содержание — крупный архитектурный или аккуратный рукописный шрифт 28 pt #555555.
ЗАДАНИЕ: рассчитай макет первых 3 слайдов урока «${L.params?.topic}» (${L.params?.grade} класс), чередуя стили (1 — №3, 2 — №4, 3 — №3). Для каждого: 1) название стиля; 2) фон и доминанта (что изображено, конкретно по теме — подлинная живопись, фотография эпохи, текстура); 3) HEX-палитра; 4) координаты X, Y и размеры наклеек, углы наклона; 5) кегли в pt; 6) ультракороткие тезисы без воды (по смыслу слайдов ниже, методически точно, без готовых ответов на проблемный вопрос); 7) подробный промт для Midjourney на английском.
Слайды урока:
${arr.map((s, i) => `Слайд ${i + 1}: ${s.title}\n${String(s.body || "").replace(/!\[[^\]]*\]\([^)]*\)/g, "").slice(0, 500)}`).join("\n\n")}`;
  }
  return { build, aiPrompt, STYLES };
})();
window.LayoutSpec = LayoutSpec;
