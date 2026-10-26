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
  const DEF = { provider: "gemini", key: "", base: "", model: "", path: "", proxy: "", on: true };
  const PRESET = {
    gemini: { name: "Google Gemini (Nano Banana)", model: "gemini-2.5-flash-image", base: "https://generativelanguage.googleapis.com", hint: "Ключ из Google AI Studio. Из России напрямую обычно недоступен: тогда используйте посредника или proxy." },
    images: { name: "Посредник: OpenAI-совместимый /images/generations", model: "gemini-2.5-flash-image", base: "", hint: "Адрес API из личного кабинета сервиса (например, https://…/v1) и ключ. Название модели смотрите в кабинете." },
    chat: { name: "Посредник: /chat/completions с картинкой", model: "google/gemini-2.5-flash-image", base: "https://openrouter.ai/api/v1", hint: "Подходит для OpenRouter и сервисов с тем же форматом." },
    proxy: { name: "Своя серверная функция (proxy)", model: "", base: "", hint: "Адрес функции. Ей отправляется POST {prompt, aspect}, ответ — {image: data URL или base64}." }
  };
  const load = () => { try { return { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return { ...DEF }; } };
  const save = c => { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { } };
  const cfg = () => load();
  const own = () => { const c = load(); return !!c.on && (c.provider === "proxy" ? !!c.proxy : !!c.key && (c.provider === "gemini" || !!(c.base || PRESET[c.provider].base))); };
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
      if (c.provider === "images") {
        const size = aspect === "1:1" ? "1024x1024" : aspect === "9:16" || aspect === "3:4" ? "1024x1536" : "1536x1024";
        r = await fetch(`${base}${c.path || "/images/generations"}`, { method: "POST", signal, headers: { "Content-Type": "application/json", Authorization: "Bearer " + c.key }, body: JSON.stringify({ model, prompt: `${prompt} Aspect ratio ${aspect}.`, n: 1, size, response_format: "b64_json" }) });
        j = await r.json().catch(() => ({})); if (!r.ok) throw err(r, j);
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

  async function test() {
    const t0 = Date.now();
    try { const r = await image("A simple friendly smiling sun in pastel colors, flat vector, white background. " + NEG, { aspect: "1:1", maxW: 256, timeout: 60000 }); return { ok: true, ms: Date.now() - t0, url: r.url }; }
    catch (e) { return { ok: false, ms: Date.now() - t0, error: String(e.message || e) }; }
  }
  return { cfg, save, configured, own, siteUrl, isDevUser, PRESET, image, test, banner, spot, DEF };
})();
window.ImageGen = ImageGen;
