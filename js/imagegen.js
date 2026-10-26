/* ===================================================================
   «Учу по ФРП» — картинки для рабочих листов и презентаций (Nano Banana).
   Три способа подключения (подходят и прямой Google, и посредники вроде «Арина АИ»):
     gemini — прямой API Google (модель gemini-2.5-flash-image, она же Nano Banana);
     images — OpenAI-совместимый /images/generations (многие посредники);
     chat   — OpenAI-совместимый /chat/completions с картинкой в ответе (OpenRouter и похожие);
     proxy  — ваша серверная функция: сайт шлёт ей {prompt, aspect}, ключи лежат только на сервере.
   Ключ хранится только в этом браузере (localStorage). Для общего доступа используйте proxy.
   Нейросеть рисует только иллюстрации и фоны: текст, подчёркивания и условные обозначения
   на картинку не попадают, их накладывает код (методические обозначения нейросетью не рисуются).
   =================================================================== */
const ImageGen = (() => {
  "use strict";
  const KEY = "uchu:img";
  const DEF = { provider: "hub", key: "", base: "", model: "", path: "", proxy: "", on: true };
  /* модели посредника: один ключ, выбор из списка. via — формат запроса; lit — насколько буквально следует описанию */
  const MODELS = [
    { id: "flux-schnell", name: "FLUX Schnell: дёшево и быстро, рисует ровно описанное (рекомендуется для листов)", via: "images" },
    { id: "gemini-2.5-flash-image", name: "Nano Banana (Gemini 2.5 Flash Image): красиво, хорошо держит стиль", via: "images" },
    { id: "gpt-image-1", name: "GPT Image 1: точно следует описанию, дороже", via: "images" },
    { id: "dall-e-3", name: "DALL·E 3: художественно, но сам переписывает описание и может додумывать", via: "images" },
    { id: "flux-pro", name: "FLUX Pro: максимум качества, дороже", via: "images" }
  ];
  const PRESET = {
    hub: { name: "Один ключ, много нейросетей (AITUNNEL и похожие)", model: "flux-schnell", base: "https://api.aitunnel.ru/v1", hint: "Вставьте ключ один раз и выберите нейросеть из списка. Адрес берётся из личного кабинета сервиса: если проверка не проходит, сверьте адрес и название модели там." },
    gemini: { name: "Google Gemini (Nano Banana)", model: "gemini-2.5-flash-image", base: "https://generativelanguage.googleapis.com", hint: "Ключ из Google AI Studio. Из России напрямую обычно недоступен: тогда используйте посредника или proxy." },
    images: { name: "Посредник: OpenAI-совместимый /images/generations", model: "gemini-2.5-flash-image", base: "", hint: "Адрес API из личного кабинета сервиса (например, https://…/v1) и ключ. Название модели смотрите в кабинете." },
    chat: { name: "Посредник: /chat/completions с картинкой", model: "google/gemini-2.5-flash-image", base: "https://openrouter.ai/api/v1", hint: "Подходит для OpenRouter и сервисов с тем же форматом." },
    proxy: { name: "Своя серверная функция (proxy)", model: "", base: "", hint: "Адрес функции. Ей отправляется POST {prompt, aspect}, ответ — {image: data URL или base64}." }
  };
  const load = () => { try { return { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return { ...DEF }; } };
  const save = c => { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { } };
  const cfg = () => load();
  const own = () => { const c = load(); return !!c.on && (c.provider === "proxy" ? !!c.proxy : !!c.key && (c.provider === "gemini" || c.provider === "hub" || !!(c.base || PRESET[c.provider].base))); };
  /* общий вход сайта: серверная функция разработчика; ключи лежат только на сервере, тариф проверяется там же */
  const siteUrl = () => { const u = String(window.UCHU_SITE?.nanoBanana || "").replace(/\/+$/, ""); return u ? (/functions\.yandexcloud\.net/.test(u) ? `${u}?path=${encodeURIComponent("/image")}` : u + "/image") : ""; };
  const isDevUser = () => !window.Access || !Access.commercial?.() || !!Access.isDev?.();
  const configured = () => (isDevUser() && own()) || !!siteUrl();
  const trim = u => String(u || "").replace(/\/+$/, "");
  const withTimeout = (ms, f) => { const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms); return f(ctl.signal).finally(() => clearTimeout(t)); };
  const toDataUrl = (mime, b64) => `data:${mime || "image/png"};base64,${b64}`;
  const err = (r, body) => { const m = (body && (body.error?.message || body.message || body.detail)) || ""; return new Error(`${r.status} ${r.status === 401 || r.status === 403 ? "ключ не подошёл или нет доступа" : r.status === 429 ? "превышен лимит запросов" : r.status === 402 ? "недостаточно средств на счёте" : "ошибка сервиса"}${m ? ": " + String(m).slice(0, 160) : ""}`); };
  const fromUrl = async (u, signal) => { if (/^data:/.test(u)) return u; const r = await fetch(u, { signal }); const b = await r.blob(); return await new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(b); }); };

  async function raw(prompt, o = {}) {
    const c = load(), P = PRESET[c.provider] || PRESET.gemini, aspect = o.aspect || "16:9", model = c.model || P.model, base = trim(c.base || P.base);
    if (!configured()) throw new Error("Подключение к Nano Banana не настроено");
    if (!(isDevUser() && own())) {
      return withTimeout(o.timeout || 90000, async signal => {
        const tok = window.Account?.session?.access || "";
        const r2 = await fetch(siteUrl(), { method: "POST", signal, headers: { "Content-Type": "application/json", "X-User-Token": tok }, body: JSON.stringify({ prompt, aspect }) });
        const j2 = await r2.json().catch(() => ({}));
        if (r2.status === 401) throw new Error("войдите в личный кабинет");
        if (r2.status === 403) throw new Error("картинки доступны в тарифах «Учитель + ИИ» и «Методист»");
        if (!r2.ok) throw err(r2, j2);
        const im = j2.image || j2.data || j2.url; if (!im) throw new Error("сервер не вернул картинку");
        return /^(data:|https?:)/.test(im) ? fromUrl(im, signal) : toDataUrl("image/png", im);
      });
    }
    return withTimeout(o.timeout || 90000, async signal => {
      let r, j;
      if (c.provider === "gemini") {
        r = await fetch(`${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: "POST", signal, headers: { "Content-Type": "application/json", "x-goog-api-key": c.key }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: aspect } } }) });
        j = await r.json().catch(() => ({})); if (!r.ok) throw err(r, j);
        const part = (j.candidates?.[0]?.content?.parts || []).find(x => x.inlineData || x.inline_data); const d = part?.inlineData || part?.inline_data;
        if (!d?.data) throw new Error("сервис не вернул картинку" + (j.promptFeedback?.blockReason ? ` (заблокировано: ${j.promptFeedback.blockReason})` : ""));
        return toDataUrl(d.mimeType || d.mime_type, d.data);
      }
      if (c.provider === "images" || c.provider === "hub") {
        const dalle = /dall-e-3/.test(model), size = aspect === "1:1" ? "1024x1024" : aspect === "9:16" || aspect === "3:4" ? (dalle ? "1024x1792" : "1024x1536") : (dalle ? "1792x1024" : "1536x1024");
        const go = body => fetch(`${base}${c.path || "/images/generations"}`, { method: "POST", signal, headers: { "Content-Type": "application/json", Authorization: "Bearer " + c.key }, body: JSON.stringify(body) });
        const bd = { model, prompt: `${prompt} Aspect ratio ${aspect}.`, n: 1, size, response_format: "b64_json" };
        r = await go(bd); j = await r.json().catch(() => ({}));
        if (!r.ok && r.status === 400) { delete bd.response_format; r = await go(bd); j = await r.json().catch(() => ({})); }
        if (!r.ok && r.status === 400) { delete bd.size; r = await go(bd); j = await r.json().catch(() => ({})); }
        if (!r.ok) throw err(r, j);
        const d = j.data?.[0]; if (d?.b64_json) return toDataUrl("image/png", d.b64_json); if (d?.url) return fromUrl(d.url, signal);
        throw new Error("сервис не вернул картинку");
      }
      if (c.provider === "chat") {
        r = await fetch(`${base}${c.path || "/chat/completions"}`, { method: "POST", signal, headers: { "Content-Type": "application/json", Authorization: "Bearer " + c.key }, body: JSON.stringify({ model, modalities: ["image", "text"], messages: [{ role: "user", content: `${prompt} Aspect ratio ${aspect}.` }] }) });
        j = await r.json().catch(() => ({})); if (!r.ok) throw err(r, j);
        const m = j.choices?.[0]?.message, u = m?.images?.[0]?.image_url?.url || (Array.isArray(m?.content) ? m.content.find(x => x.type === "image_url")?.image_url?.url : "") || (String(m?.content || "").match(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/) || [])[0];
        if (!u) throw new Error("сервис не вернул картинку"); return fromUrl(u, signal);
      }
      r = await fetch(c.proxy, { method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, aspect }) });
      j = await r.json().catch(() => ({})); if (!r.ok) throw err(r, j);
      const im = j.image || j.data || j.url; if (!im) throw new Error("функция не вернула картинку");
      return /^(data:|https?:)/.test(im) ? fromUrl(im, signal) : toDataUrl("image/png", im);
    });
  }
  /* картинка сжимается до разумного размера: лист хранится в браузере и уходит в Word */
  const shrink = (url, maxW = 1100, q = 0.86, strip = 0) => new Promise((ok, no) => {
    const im = new Image(); im.onload = () => { const k = Math.min(1, maxW / im.width), W = Math.round(im.width * k), H = Math.round(im.height * k), sh = strip ? Math.round(W / strip) : H, c = document.createElement("canvas"); c.width = W; c.height = Math.min(H, sh); const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, -Math.round((H - c.height) / 2), W, H); ok({ url: c.toDataURL("image/jpeg", q), w: c.width, h: c.height }); }; im.onerror = () => no(new Error("картинка не открылась")); im.src = url;
  });
  const image = async (prompt, o = {}) => { let last; for (let i = 0; i < 2; i++) { try { return await shrink(await raw(prompt, o), o.maxW, 0.86, o.strip || 0); } catch (e) { last = e; if (/401|403|402|429|не настроено/.test(String(e.message))) break; } } throw last; };

  /* ---------- описание картинки по теме урока ---------- */
  const NEG = "No text, no letters, no numbers, no words, no logos, no watermark, no arrows, no underlines, no frames.";
  const SUBJ = { ru: "Russian language", lit: "literature", math: "mathematics", hist: "history", eng: "English language", bio: "biology", geo: "geography", phys: "physics", chem: "chemistry", soc: "social studies", inf: "computer science" };
  const banner = p => {
    const g = +p.grade || 7, small = g <= 4;
    const who = small ? "Cute friendly cartoon characters and large simple objects, big rounded shapes, cheerful." : g <= 9 ? "Modern flat vector illustration with a few expressive objects." : "Calm modern flat vector illustration, restrained, a few elegant objects.";
    return `Wide horizontal decorative banner for a school worksheet. Subject: ${SUBJ[p.subject] || "school subject"}. Lesson topic: «${p.topic}». ${who} Light pastel palette (soft violet, pink, cream, pale yellow), clean white background areas, thick friendly outlines, all important objects inside the middle horizontal band because the picture will be cropped to a very wide thin strip, objects grouped toward the right side, calm empty space on the left. Must print well in grayscale: no dark fills, no heavy shadows, no gradients darker than light gray. ${NEG}`;
  };
  const spot = (p, what) => `Small square line-art spot illustration for a school worksheet task about «${what || p.topic}» (${SUBJ[p.subject] || "school"}, grade ${p.grade}). Black outline on white background with at most two light pastel accents, simple clear shapes, no dark fills. ${NEG}`;

  /* Языковая модель (она отвечает за точность) пишет только СЦЕНУ для рисунка. Все жёсткие правила добавляет код,
     а подчёркивания, волнистые линии и надписи в рисунок не входят вообще: их ставит сайт в Word/PDF. */
  const briefViaLM = async p => {
    if (!window.AI?.sample || !(window.AI.configured?.() ?? true)) return "";
    try {
      const q = `Ты помогаешь оформить школьный рабочий лист (${SUBJ[p.subject] || "предмет"}, ${p.grade} класс, тема «${p.topic}»). Опиши ПО-АНГЛИЙСКИ одним абзацем (до 60 слов) только декоративную сцену для широкой тонкой полосы-баннера: 3–4 простых предмета или персонажа, прямо связанных с темой, и их расположение. Строго: никакого текста, букв, цифр, формул, схем, стрелок, линий подчёркивания, рамок, таблиц и условных обозначений; не придумывай факты, исторические детали, надписи и символику; только нейтральные узнаваемые предметы. Верни только описание сцены.`;
      const r = await window.AI.sample(q, { modelTier: "quick" });
      const t = String(r?.text || "").replace(/\s+/g, " ").trim();
      if (!t || t.length > 600 || /[А-Яа-яЁё]/.test(t) || /["«»“”]/.test(t) || /\b(underline|text|letter|caption|label|arrow|formula|equation|diagram|number)\b/i.test(t.replace(/\b(no|without)\s+\w+/gi, ""))) return "";
      return t;
    } catch { return ""; }
  };
  const bannerWithBrief = async p => { const scene = await briefViaLM(p); const base = banner(p); return scene ? base.replace("Lesson topic:", `Scene: ${scene} Lesson topic:`) : base; };

  /* ---------- «галерея листа»: портреты героев и предметы по теме, подписи ставит код ---------- */
  const portraitPrompt = (who, p) => `Artistic illustrated portrait of ${who}, head and shoulders, as an artist's interpretation (not a photograph), painterly flat style, calm expressive face, simple soft pastel background, historically and literarily plausible clothing, no dark fills, printable in grayscale. ${NEG}`;
  const objectPrompt = (what, p) => `Single clear illustration of ${what} for a school worksheet (${SUBJ[p.subject] || "school"}, grade ${p.grade}), flat vector, thick friendly outlines, light pastel colors, centered on a white background, no dark fills. ${NEG}`;
  async function planGallery(p, text) {
    if (!window.AI?.sample || !(window.AI.configured?.() ?? true)) return [];
    try {
      const q = `Рабочий лист: ${SUBJ[p.subject] || "предмет"}, ${p.grade} класс, тема «${p.topic}». Фрагмент листа:\n${String(text || "").slice(0, 1800)}\n\nВыбери 2–3 изображения для украшения листа: портреты РЕАЛЬНО упомянутых в теме или листе писателей, исторических деятелей, учёных или героев произведения (обязательно, если они есть) и/или 1–2 понятных предмета по теме. Ничего не выдумывай: имена и предметы только из темы и текста листа. Верни ТОЛЬКО JSON-массив без пояснений: [{"kind":"portrait"|"object","caption":"подпись по-русски до 3 слов","en":"описание по-английски: для портрета — кто это (имя, эпоха, профессия), для предмета — что нарисовать"}]`;
      const r = await window.AI.sample(q, { modelTier: "quick" });
      const m = String(r?.text || "").match(/\[[\s\S]*\]/); if (!m) return [];
      return JSON.parse(m[0]).filter(x => x && x.caption && x.en && /^(portrait|object)$/.test(x.kind) && !/[А-Яа-яЁё]/.test(x.en) && String(x.caption).length <= 28).slice(0, 3);
    } catch { return []; }
  }
  const loadImg = u => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => no(new Error("картинка не открылась")); im.src = u; });
  async function gallery(p, text) {
    const plan = await planGallery(p, text); if (!plan.length) return null;
    const pics = [];
    for (const it of plan) { try { const r = await image(it.kind === "portrait" ? portraitPrompt(it.en, p) : objectPrompt(it.en, p), { aspect: "1:1", maxW: 520 }); pics.push({ im: await loadImg(r.url), cap: it.caption, kind: it.kind }); } catch (e) { if (/401|403|402|429/.test(String(e.message))) throw e; } }
    if (!pics.length) return null;
    const W = 1320, gap = 28, n = pics.length, cw = Math.min(380, Math.floor((W - gap * (n + 1)) / n)), ch = cw + 52, H = ch + 24, c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
    const x0 = Math.round((W - (cw * n + gap * (n - 1))) / 2);
    pics.forEach((it, i) => {
      const x = x0 + i * (cw + gap), y = 12; g.fillStyle = "#fff8e1"; g.strokeStyle = "#2b1d4a"; g.lineWidth = 4;
      g.beginPath(); g.roundRect(x, y, cw, ch, 22); g.fill(); g.stroke();
      g.save(); g.beginPath(); g.roundRect(x + 8, y + 8, cw - 16, cw - 16, it.kind === "portrait" ? (cw - 16) / 2 : 14); g.clip(); g.drawImage(it.im, x + 8, y + 8, cw - 16, cw - 16); g.restore();
      g.fillStyle = "#2b1d4a"; let fs = 30; g.textAlign = "center"; g.textBaseline = "middle"; do { g.font = `700 ${fs}px system-ui, "Segoe UI", Arial, sans-serif`; fs -= 2; } while (g.measureText(it.cap).width > cw - 24 && fs > 14);
      g.fillText(it.cap, x + cw / 2, y + cw + 26);
    });
    return { url: c.toDataURL("image/jpeg", 0.88), w: W, h: H };
  }

  /* ---------- оформление целой страницы: рисует нейросеть, центр под текст код всегда очищает ---------- */
  const PG = { W: 1240, H: 1754, x0: 1250 / 20 / 595, x1: 1 - 1000 / 20 / 595, y0: 1000 / 20 / 842, y1: 1 - 900 / 20 / 842 };
  const pagePrompt = (p, scene, which) => `Full-page decorative design for a school worksheet, A4 portrait (${which === 1 ? "first page: cheerful opening composition" : "second page: calmer closing composition"}). Subject: ${SUBJ[p.subject] || "school"}, grade ${p.grade}, lesson topic «${p.topic}». ${+p.grade <= 4 ? "Cute friendly cartoon style, big rounded shapes." : "Modern flat vector style, restrained and elegant."} Scene and motifs: ${scene}. COMPOSITION RULES: all illustrations and ornaments only in the outer margins: a decorative header band across the top (about 15% of the height), narrow decorative side margins, a thin footer band at the bottom, and corner accents. The entire large central area (about 80% width and 75% height) must stay completely EMPTY plain white: no pattern, no shapes, no gradient, no texture, no shadows. Soft pastel palette (violet, pink, cream, pale yellow), thick friendly outlines, light fills only, must print well in grayscale, no dark fills. ${NEG}`;
  async function planPages(p, text) {
    if (!window.AI?.sample || !(window.AI.configured?.() ?? true)) return null;
    try {
      const q = `Рабочий лист: ${SUBJ[p.subject] || "предмет"}, ${p.grade} класс, тема «${p.topic}». Фрагмент листа:\n${String(text || "").slice(0, 1500)}\n\nПридумай оформление двух страниц листа (рисует нейросеть, текст она НЕ рисует). Для каждой страницы опиши ПО-АНГЛИЙСКИ до 40 слов: какие 4–6 нейтральных предметов, символов или персонажей по теме расположить по верхней полосе, боковым полям и углам (где именно). Строго: никакого текста, букв, цифр, формул, стрелок, линий, таблиц; не выдумывай факты и символику; только узнаваемые предметы по теме. Верни ТОЛЬКО JSON: {"p1":"...","p2":"..."}`;
      const r = await window.AI.sample(q, { modelTier: "quick" });
      const m = String(r?.text || "").match(/\{[\s\S]*\}/); if (!m) return null; const j = JSON.parse(m[0]);
      const ok = t => typeof t === "string" && t.length > 10 && t.length < 400 && !/[А-Яа-яЁё"«»]/.test(t) && !/\b(underline|letters?|caption|label|arrow|formula|equation|diagram)\b/i.test(t.replace(/\b(no|without)\s+\w+/gi, ""));
      return ok(j.p1) && ok(j.p2) ? [j.p1, j.p2] : null;
    } catch { return null; }
  }
  const finishPage = async (url, withFrame) => {
    const im = await loadImg(url), c = document.createElement("canvas"); c.width = PG.W; c.height = PG.H; const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, PG.W, PG.H);
    const k = Math.max(PG.W / im.width, PG.H / im.height), w = im.width * k, h = im.height * k; g.drawImage(im, (PG.W - w) / 2, (PG.H - h) / 2, w, h);
    const pad = 14, x = PG.x0 * PG.W - pad, y = PG.y0 * PG.H - pad, X = PG.x1 * PG.W + pad, Y = PG.y1 * PG.H + pad;
    g.fillStyle = "#fff"; g.beginPath(); g.roundRect(x, y, X - x, Y - y, 26); g.fill();
    if (withFrame) { g.strokeStyle = "#b9a4e8"; g.lineWidth = 5; g.beginPath(); g.roundRect(x, y, X - x, Y - y, 26); g.stroke(); }
    return { url: c.toDataURL("image/jpeg", 0.86), w: PG.W, h: PG.H };
  };
  async function pages(p, text) {
    const plan = (await planPages(p, text)) || [`a few friendly objects typical for the lesson topic «${p.topic}» spread along the top band and the corners`, `a few small calm objects typical for the lesson topic «${p.topic}» along the bottom band and the corners`];
    const out = [];
    for (let i = 0; i < 2; i++) { const r = await raw(pagePrompt(p, plan[i], i + 1), { aspect: "3:4", timeout: 120000 }); out.push(await finishPage(r, true)); }
    return out;
  }

  async function test() {
    const t0 = Date.now();
    try { const r = await image("A simple friendly smiling sun in pastel colors, flat vector, white background. " + NEG, { aspect: "1:1", maxW: 256, timeout: 60000 }); return { ok: true, ms: Date.now() - t0, url: r.url }; }
    catch (e) { return { ok: false, ms: Date.now() - t0, error: String(e.message || e) }; }
  }
  return { pages, gallery, bannerWithBrief, MODELS, cfg, save, configured, own, siteUrl, isDevUser, PRESET, image, test, banner, spot, DEF };
})();
window.ImageGen = ImageGen;
