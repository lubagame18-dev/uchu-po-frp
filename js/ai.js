/* ===================================================================
   «Учу по ФРП» — подключение нейросетей (v5).
   Несколько провайдеров и автоматический выбор доступного:
     1. OpenRouter — бесплатный роутер «openrouter/free» (DeepSeek, Llama, Qwen…).
        Вход в один клик: «Войти через OpenRouter» — ключ создаётся сам (OAuth PKCE).
     2. Pollinations — ключ из личного кабинета или вход в один клик (BYOP),
        если владелец сайта указал ключ приложения в UCHU_SITE.pollinationsAppKey.
     3. DeepSeek — свой ключ.
     4. Gemini (Google AI Studio) — свой ключ; из России без VPN обычно недоступен.
     5. GigaChat через Яндекс-функцию — неприоритетный вариант, прокси не требует.
     6. Claude (свой ключ) и любой OpenAI-совместимый сервис.
   v5.5: «Любая нейросеть по одному ключу» — вставьте ключ, сайт сам узнаёт сервис
   (OpenAI, DeepSeek, Gemini, Claude, Grok, Groq, Mistral, Qwen, Kimi, Together,
   Perplexity, Hugging Face, NVIDIA, Cerebras, Fireworks, OpenRouter…), получает
   список моделей, выбирает подходящую и проверяет. Подключений может быть сколько угодно.
   Если провайдер не ответил, сайт сам переключается на следующий и пишет,
   какой и почему. Можно выбрать предпочитаемый вручную. Прокси — крайняя мера,
   настраивается только вручную (адрес, порт, логин, пароль, Split Tunneling).
   GitHub Models не используется: GitHub закрыл сервис 30.07.2026.
   =================================================================== */
const AI = (() => {
  "use strict";
  const SITE = window.UCHU_SITE || {};
  const KEY = "uchu:ai2";
  const DEF = {
    prefer: "auto",
    keys: { openrouter: "", pollinations: "", deepseek: "", gemini: "", anthropic: "", gigachat: "" },
    models: { openrouter: "openrouter/free", openrouterDeep: "openrouter/free", pollinations: "openai", deepseek: "deepseek-flash", gemini: "gemini-2.5-flash", anthropic: "claude-sonnet-5-5", gigachat: "GigaChat-2-Pro" },
    custom: { base: "", key: "", model: "" },
    extra: [], // любые подключённые по одному ключу: [{ id, name, base, key, model }]
    yandexFn: SITE.yandexFunction || "",
    proxy: { on: false, url: "", port: "", login: "", password: "", split: true }
  };
  const P = {
    openrouter: { name: "OpenRouter", sub: "бесплатные модели (DeepSeek, Llama, Qwen)", limits: "бесплатно: до 20 запросов в минуту и 50 в день (1000 в день, если на счёте когда-либо было от $10)", foreign: true },
    pollinations: { name: "Pollinations", sub: "бесплатный тариф по ключу", limits: "бесплатный баланс «пыльцы» в личном кабинете; при исчерпании — ошибка 402", foreign: true },
    deepseek: { name: "DeepSeek", sub: "свой ключ", limits: "по тарифу DeepSeek (платно, недорого)", foreign: true },
    gemini: { name: "Gemini", sub: "Google AI Studio, свой ключ", limits: "бесплатный тариф Google; из России без VPN обычно недоступен", foreign: true },
    yandexfn: { name: "GigaChat через Яндекс-функцию", sub: "неприоритетный вариант", limits: "по ключу GigaChat, который лежит в функции", foreign: false },
    anthropic: { name: "Claude", sub: "свой ключ Anthropic", limits: "по тарифу Anthropic; из России недоступен", foreign: true },
    custom: { name: "Свой сервис", sub: "любой OpenAI-совместимый", limits: "по условиям сервиса", foreign: true },
    site: { name: "ИИ", sub: "по тарифу", limits: "по тарифу", foreign: false }
  };
  const ORDER = ["site", "openrouter", "pollinations", "deepseek", "gemini", "yandexfn", "anthropic", "custom"];
  /* Любая нейросеть по одному ключу: провайдер узнаётся по виду ключа, модели — из списка сервиса */
  const DETECT = [
    { re: /^sk-or-/, slot: "openrouter", name: "OpenRouter" },
    { re: /^sk-ant-/, slot: "anthropic", name: "Claude (Anthropic)" },
    { re: /^AIza/, slot: "gemini", name: "Gemini" },
    { re: /^sk_[\w-]{10,}$/, slot: "pollinations", name: "Pollinations" },
    { re: /^gsk_/, name: "Groq", base: "https://api.groq.com/openai/v1" },
    { re: /^xai-/, name: "xAI Grok", base: "https://api.x.ai/v1" },
    { re: /^pplx-/, name: "Perplexity", base: "https://api.perplexity.ai" },
    { re: /^hf_/, name: "Hugging Face", base: "https://router.huggingface.co/v1" },
    { re: /^nvapi-/, name: "NVIDIA", base: "https://integrate.api.nvidia.com/v1" },
    { re: /^csk-/, name: "Cerebras", base: "https://api.cerebras.ai/v1" },
    { re: /^fw_/, name: "Fireworks", base: "https://api.fireworks.ai/inference/v1" },
    { re: /^sk-proj-|^sk-svcacct-/, name: "OpenAI", base: "https://api.openai.com/v1" },
    { re: /^sk-[a-f0-9]{32}$/, name: "DeepSeek", slot: "deepseek", try: ["https://api.deepseek.com/v1", "https://api.moonshot.ai/v1", "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"] },
    { re: /^sk-/, name: "OpenAI-совместимый", try: ["https://api.openai.com/v1", "https://api.deepseek.com/v1", "https://api.moonshot.ai/v1", "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", "https://api.together.xyz/v1"] },
    { re: /^[A-Za-z0-9]{32}$/, name: "Mistral", try: ["https://api.mistral.ai/v1"] },
    { re: /^[a-f0-9]{64}$/, name: "Together", try: ["https://api.together.xyz/v1"] }
  ];
  const HOSTNAMES = { "api.openai.com": "OpenAI", "api.deepseek.com": "DeepSeek", "api.moonshot.ai": "Moonshot Kimi", "dashscope-intl.aliyuncs.com": "Qwen", "api.together.xyz": "Together", "api.mistral.ai": "Mistral", "api.groq.com": "Groq", "api.x.ai": "xAI Grok", "openrouter.ai": "OpenRouter", "llm.api.cloud.yandex.net": "YandexGPT", "gigachat.devices.sberbank.ru": "GigaChat" };
  // модель по умолчанию: быстрая и недорогая, если есть; иначе первая из списка
  const PREF = [/deepseek-flash|deepseek-chat|deepseek-v3/i, /gpt-5-mini|gpt-4\.1-mini|gpt-4o-mini/i, /gemini-[\d.]+-flash(?!-lite)/i, /llama-3\.3-70b|llama-4/i, /qwen.*(max|plus|72b)/i, /mistral-(large|medium)-latest/i, /grok-[\d]+(-fast|-mini)?/i, /kimi|moonshot-v1-32k/i, /sonnet/i, /chat|instruct/i];
  function pickModel(ids) { for (const re of PREF) { const m = ids.find(x => re.test(x) && !/embed|whisper|tts|image|vision-only|moderation|audio|realtime|search/i.test(x)); if (m) return m; } return ids.find(x => !/embed|whisper|tts|image|moderation|audio/i.test(x)) || ids[0]; }
  async function listModels(base, key, ms = 12000) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(base.replace(/\/+$/, "") + "/models", { headers: key ? { Authorization: "Bearer " + key } : {}, signal: ctl.signal });
      if (r.status === 401 || r.status === 403) return { ok: false, auth: true };
      if (!r.ok) return { ok: false, status: r.status };
      const j = await r.json(); const ids = (j.data || j.models || []).map(m => m.id || m.name).filter(Boolean).map(x => String(x).replace(/^models\//, ""));
      return { ok: true, ids };
    } catch (e) { return { ok: false, network: true }; } finally { clearTimeout(t); }
  }
  /* Подключить по ключу (и, если нужно, адресу): найти сервис, модели, проверить — одним нажатием */
  async function connectKey(key, baseHint = "", onStep = () => { }) {
    key = String(key || "").trim(); baseHint = String(baseHint || "").trim();
    if (!key && !baseHint) throw new Error("вставьте ключ");
    const c = cfg();
    const det = DETECT.find(d => d.re.test(key)) || {};
    if (det.slot && !baseHint && ["openrouter", "anthropic", "gemini", "pollinations"].includes(det.slot)) {
      c.keys[det.slot] = key;
      if (det.slot === "gemini") { onStep("Gemini: получаю список моделей…"); const lm = await listModels("https://generativelanguage.googleapis.com/v1beta/openai", key); if (lm.ok && lm.ids.length) c.models.gemini = pickModel(lm.ids.filter(x => /gemini/.test(x))) || c.models.gemini; }
      save(c); onStep(`${det.name}: проверяю…`);
      const t = await test(det.slot); return { id: det.slot, name: det.name, model: c.models[det.slot], ok: t.ok, text: t.text };
    }
    const bases = baseHint ? [baseHint.replace(/\/chat\/completions\/?$/, "")] : det.base ? [det.base] : det.try || ["https://api.openai.com/v1", "https://api.deepseek.com/v1", "https://api.mistral.ai/v1", "https://api.together.xyz/v1"];
    let found = null, netFail = false;
    for (const b of bases) {
      onStep(`Пробую ${HOSTNAMES[new URL(b).hostname] || new URL(b).hostname}…`);
      const lm = await listModels(b, key);
      if (lm.ok) { found = { base: b, ids: lm.ids }; break; }
      if (lm.network) netFail = true;
    }
    if (!found) throw new Error(netFail ? "сервис не открывается из этой сети или не принимает запросы со страниц (CORS). Попробуйте указать адрес вручную или включить прокси" : "ключ не подошёл ни к одному известному сервису — укажите адрес сервиса (…/v1)");
    const host = new URL(found.base).hostname, name = HOSTNAMES[host] || det.name || host;
    const model = pickModel(found.ids || []) || "";
    const id = "x" + Date.now().toString(36);
    c.extra = (c.extra || []).filter(x => !(x.base === found.base && x.key === key));
    c.extra.push({ id, name, base: found.base, key, model, models: (found.ids || []).slice(0, 300) });
    save(c); onStep(`${name}: проверяю модель ${model}…`);
    const t = await test(id);
    return { id, name, model, ok: t.ok, text: t.text };
  }

  /* ---------- настройки ---------- */
  function cfg() {
    let c = {}; try { c = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { }
    // перенос ключей из прежней версии сайта
    if (!c.migrated) { try { const old = JSON.parse(localStorage.getItem("uchu:ai")) || {}; c.keys = { ...(c.keys || {}), ...(old.anthropicKey ? { anthropic: old.anthropicKey } : {}), ...(old.gigaKey ? { gigachat: old.gigaKey } : {}), ...(old.openaiKey && /openrouter/.test(old.openaiBase || "") ? { openrouter: old.openaiKey } : {}), ...(old.openaiKey && /deepseek/.test(old.openaiBase || "") ? { deepseek: old.openaiKey } : {}) }; c.migrated = true; } catch { } }
    const out = { ...DEF, ...c, keys: { ...DEF.keys, ...(c.keys || {}) }, models: { ...DEF.models, ...(c.models || {}) }, custom: { ...DEF.custom, ...(c.custom || {}) }, proxy: { ...DEF.proxy, ...(c.proxy || {}) }, yandexFn: c.yandexFn || DEF.yandexFn, extra: Array.isArray(c.extra) ? c.extra : [] };
    // DeepSeek: старые имена моделей (deepseek-chat, deepseek-reasoner) с 24.07.2026 не поддерживаются — теперь deepseek-flash
    if (/^deepseek-(chat|reasoner|v3|v4-flash)/i.test(out.models.deepseek || "")) out.models.deepseek = "deepseek-flash";
    for (const x of out.extra) if (/api\.deepseek\.com/.test(x.base || "") && /^deepseek-(chat|reasoner)/i.test(x.model || "")) x.model = "deepseek-flash";
    for (const x of out.extra) P[x.id] = { name: x.name, sub: x.model, limits: "по условиям сервиса", foreign: !/yandex|sber/.test(x.base) };
    return out;
  }
  function save(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { toast("Не удалось сохранить настройки ИИ."); } paint(); }
  const has = (c, id) => id[0] === "x" ? !!c.extra.find(x => x.id === id && x.model) : ({ openrouter: !!c.keys.openrouter, pollinations: !!c.keys.pollinations, deepseek: !!c.keys.deepseek, gemini: !!c.keys.gemini, anthropic: !!c.keys.anthropic, yandexfn: !!c.yandexFn, site: !!(window.UCHU_SITE?.siteAi && c.yandexFn), custom: !!(c.custom.base && c.custom.model) })[id];
  function chain(c = cfg()) {
    let avail = [...c.extra.map(x => x.id), ...ORDER].filter(id => has(c, id));
    // коммерческая версия: свои ключи — только в свободной зоне (по промокоду); иначе — только ИИ сайта по тарифу
    if (window.Access?.commercial() && !Access.ownAi()) avail = Access.aiAllowed() ? avail.filter(id => id === "site") : [];
    return c.prefer !== "auto" && avail.includes(c.prefer) ? [c.prefer, ...avail.filter(x => x !== c.prefer)] : avail;
  }
  const configured = () => chain().length > 0;

  /* ---------- состояние провайдеров (для прозрачности и паузы после сбоев) ---------- */
  const ST = "uchu:ai-status";
  const status = () => { try { return JSON.parse(localStorage.getItem(ST)) || {}; } catch { return {}; } };
  function setStatus(id, s) { const all = status(); all[id] = { ...s, at: Date.now() }; try { localStorage.setItem(ST, JSON.stringify(all)); } catch { } }
  let active = null;

  /* ---------- сеть ---------- */
  function viaRelay(c, id, url, init) {
    // прокси (крайняя мера): Split Tunneling — российские сервисы напрямую, остальное через прокси
    const p = c.proxy;
    if (!p.on || !p.url) return [url, init];
    if (p.split && !P[id]?.foreign) return [url, init];
    let base = p.url.replace(/\/+$/, ""); if (p.port && !/:\d+$/.test(base.replace(/^https?:\/\//, ""))) base = base.replace(/^(https?:\/\/[^/]+)/, `$1:${p.port}`);
    const headers = { ...(init.headers || {}) };
    if (p.login || p.password) headers["X-Proxy-Auth"] = "Basic " + btoa(unescape(encodeURIComponent(p.login + ":" + p.password)));
    const ep = /functions\.yandexcloud\.net/.test(base) ? `${base}?path=${encodeURIComponent("/relay")}&url=${encodeURIComponent(url)}` : `${base}/relay?url=${encodeURIComponent(url)}`;
    return [ep, { ...init, headers }];
  }
  async function readSSE(res, onData, signal) {
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) { const j = await res.json(); if (j.error) throw { code: "upstream_error", message: j.error.message || String(j.error) }; const t = j.choices?.[0]?.message?.content || j.content?.map?.(x => x.text).join("") || ""; if (t) onData({ text: t, finish: j.choices?.[0]?.finish_reason }); return; }
    const reader = res.body.getReader(), dec = new TextDecoder(); let buf = "";
    const handle = block => { let ev = "message", data = ""; for (const line of block.split("\n")) { if (line.startsWith("event:")) ev = line.slice(6).trim(); else if (line.startsWith("data:")) data += line.slice(5).trim(); } if (data && data !== "[DONE]") onData({ ev, data }); };
    while (true) {
      if (signal?.aborted) { try { reader.cancel(); } catch { } throw { code: "cancelled" }; }
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true }).replace(/\r/g, "");
      let i; while ((i = buf.indexOf("\n\n")) >= 0) { handle(buf.slice(0, i)); buf = buf.slice(i + 2); }
    }
    if (buf.trim()) handle(buf);
  }
  function httpErr(status, text) {
    if (status === 401 || status === 403) return { code: "auth_failed", message: text };
    if (status === 402) return { code: "payment_required", message: text };
    if (status === 407) return { code: "proxy_auth", message: text };
    if (status === 413) return { code: "prompt_too_large", message: text };
    if (status === 429) return { code: "rate_limited", message: text };
    return { code: "upstream_error", message: `HTTP ${status}: ${String(text).slice(0, 300)}` };
  }
  async function openaiCompat(id, url, headers, model, prompt, opts, emit) {
    const c = cfg();
    const [u, init] = viaRelay(c, id, url, { method: "POST", signal: opts.signal, headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ model, stream: true, messages: [{ role: "user", content: prompt }] }) });
    const res = await fetch(u, init);
    if (!res.ok) throw httpErr(res.status, await res.text());
    let stop = null;
    await readSSE(res, x => {
      if (x.text) { emit(x.text); stop = x.finish; return; }
      const j = JSON.parse(x.data); if (j.error) throw { code: "upstream_error", message: j.error.message || String(j.error) };
      const ch = j.choices?.[0]; if (ch?.delta?.content) emit(ch.delta.content); if (ch?.finish_reason) stop = ch.finish_reason;
    }, opts.signal);
    return { truncated: stop === "length" };
  }
  const RUN = {
    openrouter: (c, p, o, e) => openaiCompat("openrouter", "https://openrouter.ai/api/v1/chat/completions", { Authorization: "Bearer " + c.keys.openrouter, "HTTP-Referer": location.origin, "X-Title": "Uchu po FRP" }, o.modelTier === "complex" ? c.models.openrouterDeep : c.models.openrouter, p, o, e),
    pollinations: (c, p, o, e) => openaiCompat("pollinations", "https://gen.pollinations.ai/v1/chat/completions", { Authorization: "Bearer " + c.keys.pollinations }, c.models.pollinations, p, o, e),
    deepseek: (c, p, o, e) => openaiCompat("deepseek", "https://api.deepseek.com/chat/completions", { Authorization: "Bearer " + c.keys.deepseek }, c.models.deepseek, p, o, e),
    gemini: (c, p, o, e) => openaiCompat("gemini", "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", { Authorization: "Bearer " + c.keys.gemini }, c.models.gemini, p, o, e),
    custom: (c, p, o, e) => openaiCompat("custom", c.custom.base.replace(/\/+$/, "") + "/chat/completions", c.custom.key ? { Authorization: "Bearer " + c.custom.key } : {}, c.custom.model, p, o, e),
    site: (c, p, o, e) => { const base = c.yandexFn.replace(/\/+$/, ""); const url = /functions\.yandexcloud\.net/.test(base) ? `${base}?path=${encodeURIComponent("/deepseek/v1/chat/completions")}` : base + "/deepseek/v1/chat/completions"; const tok = window.Account?.session?.access; return openaiCompat("site", url, tok ? { "X-User-Token": tok } : {}, "deepseek-flash", p, o, e); },
    yandexfn: (c, p, o, e) => { const base = c.yandexFn.replace(/\/+$/, ""); const url = /functions\.yandexcloud\.net/.test(base) ? `${base}?path=${encodeURIComponent("/gigachat/v1/chat/completions")}` : base + "/gigachat/v1/chat/completions"; return openaiCompat("yandexfn", url, c.keys.gigachat ? { "X-GigaChat-Key": (gigaKey(c.keys.gigachat).key || c.keys.gigachat) } : {}, o.modelTier === "complex" ? "GigaChat-2-Max" : c.models.gigachat, p, o, e); },
    anthropic: async (c, p, o, emit) => {
      const [u, init] = viaRelay(c, "anthropic", "https://api.anthropic.com/v1/messages", { method: "POST", signal: o.signal, headers: { "content-type": "application/json", "x-api-key": c.keys.anthropic, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }, body: JSON.stringify({ model: c.models.anthropic, max_tokens: 16000, stream: true, messages: [{ role: "user", content: p }] }) });
      const res = await fetch(u, init); if (!res.ok) throw httpErr(res.status, await res.text());
      let stop = null;
      await readSSE(res, x => { if (x.text) return emit(x.text); const j = JSON.parse(x.data); if (j.type === "content_block_delta" && j.delta?.type === "text_delta") emit(j.delta.text); else if (j.type === "message_delta") stop = j.delta?.stop_reason; else if (j.type === "error") throw { code: "upstream_error", message: j.error?.message }; }, o.signal);
      return { truncated: stop === "max_tokens" };
    }
  };
  const runExtra = id => (c, p, o, e) => { const x = c.extra.find(y => y.id === id); return openaiCompat(id, x.base.replace(/\/+$/, "") + "/chat/completions", x.key ? { Authorization: "Bearer " + x.key } : {}, x.model, p, o, e); };
  /* Понятная причина сбоя */
  function why(e) {
    const c = e?.code;
    if (c === "network") return "не открывается из этой сети (блокировка, нет интернета или сервис не принимает запросы со страниц)";
    if (c === "auth_failed") return "ключ не принят";
    if (c === "payment_required") return "закончился бесплатный лимит или нужна оплата";
    if (c === "rate_limited") return "превышен лимит запросов";
    if (c === "proxy_auth") return "прокси не принял логин и пароль";
    if (c === "empty_completion") return "пустой ответ";
    return "сбой сервиса: " + String(e?.message || "").slice(0, 120);
  }

  /* ---------- главный вызов: перебор провайдеров с автопереключением ---------- */
  async function sample(input, opts = {}) {
    const c = cfg(), list = chain(c);
    if (!list.length) throw { code: "not_configured", message: "ИИ не подключён" };
    const prompt = Array.isArray(input) ? input.map(t => (t.role === "assistant" ? "Ассистент: " : "") + t.content).join("\n\n") : String(input);
    const st = status(), now = Date.now();
    // провайдеры, упавшие по лимиту в последние 10 минут, — в конец очереди
    const order = [...list.filter(id => !(st[id] && !st[id].ok && /лимит/.test(st[id].why || "") && now - st[id].at < 600000)), ...list.filter(id => st[id] && !st[id].ok && /лимит/.test(st[id].why || "") && now - st[id].at < 600000)];
    let lastErr = null, prev = null;
    for (const id of order) {
      let text = "";
      const emit = d => { if (!d) return; text += d; try { opts.onText && opts.onText({ text, delta: d }); } catch (er) { console.error(er); } };
      try {
        if (prev) { toast(`${P[prev.id].name}: ${prev.why}. Переключаюсь на ${P[id].name}.`, 6000); if (window.Log) Log.add("ИИ", `${P[prev.id].name} → ${P[id].name}: ${prev.why}`); }
        const r = await (RUN[id] || runExtra(id))(c, prompt, opts, emit);
        if (!text.trim()) throw { code: "empty_completion" };
        setStatus(id, { ok: true }); active = id; paint();
        return { text, truncated: !!r.truncated, modelTierApplied: opts.modelTier || "default", provider: id };
      } catch (e) {
        if (e?.name === "AbortError" || opts.signal?.aborted || e?.code === "cancelled") throw { code: "cancelled", text };
        const err = e instanceof TypeError ? { code: "network", message: e.message } : { code: e?.code || "upstream_error", message: e?.message || String(e) };
        if (text.trim().length > 400) throw { ...err, text }; // ответ шёл и оборвался — не начинаем заново у другого
        const w = why(err); setStatus(id, { ok: false, why: w }); prev = { id, why: w }; lastErr = err;
        if (opts.onText && text) try { opts.onText({ text: "", delta: "" }); } catch { }
      }
    }
    throw { ...(lastErr || { code: "upstream_error" }), message: `ни одна нейросеть не ответила (последняя: ${prev ? P[prev.id].name + " — " + prev.why : "—"})` };
  }
  sample.json = async (input, opts) => {
    const { text } = await sample(input, opts);
    const a = Math.min(...["{", "["].map(ch => { const i = text.indexOf(ch); return i < 0 ? Infinity : i; })), b = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]")) + 1;
    for (const t of [text, (text.match(/```(?:json)?\s*([\s\S]*?)```/) || [])[1], isFinite(a) ? text.slice(a, b) : ""]) { if (!t) continue; try { return JSON.parse(t); } catch { } }
    throw { code: "invalid_json", message: "ответ не JSON", text };
  };
  sample.limits = async () => ({ maxPromptBytes: 262144 });

  /* ---------- OpenRouter: вход в один клик (OAuth PKCE, без регистрации приложения) ---------- */
  const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  async function openrouterLogin() {
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    sessionStorage.setItem("uchu:or-verifier", verifier);
    const back = location.origin + location.pathname + "?or=1";
    location.href = `https://openrouter.ai/auth?callback_url=${encodeURIComponent(back)}&code_challenge=${challenge}&code_challenge_method=S256`;
  }
  async function finishOpenrouter() {
    const q = new URLSearchParams(location.search); const code = q.get("code");
    if (!q.get("or") || !code) return;
    const verifier = sessionStorage.getItem("uchu:or-verifier");
    try {
      const r = await fetch("https://openrouter.ai/api/v1/auth/keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: "S256" }) });
      const j = await r.json();
      if (!j.key) throw new Error(j.error?.message || "ключ не выдан");
      const c = cfg(); c.keys.openrouter = j.key; save(c);
      toast("OpenRouter подключён: бесплатные модели готовы к работе.", 7000); if (window.Log) Log.add("ИИ", "OpenRouter подключён через вход");
    } catch (e) { toast("Не удалось подключить OpenRouter: " + (e.message || e), 8000); }
    finally { sessionStorage.removeItem("uchu:or-verifier"); history.replaceState(history.state, "", location.pathname + location.hash); }
  }
  /* ---------- Pollinations: вход в один клик (BYOP), если владелец сайта указал ключ приложения ---------- */
  function pollinationsLogin() {
    const app = SITE.pollinationsAppKey;
    if (!app) { window.open("https://enter.pollinations.ai", "_blank", "noopener"); return; }
    location.href = `https://enter.pollinations.ai/authorize?client_id=${encodeURIComponent(app)}&redirect_uri=${encodeURIComponent(location.origin + location.pathname)}&scope=usage`;
  }
  function finishPollinations() {
    const m = location.hash.match(/api_key=(sk_[\w-]+)/); if (!m) return;
    const c = cfg(); c.keys.pollinations = m[1]; save(c);
    history.replaceState(history.state, "", location.pathname + location.search);
    toast("Pollinations подключён.", 6000);
  }

  /* ---------- ключ GigaChat: приводим к Authorization key ----------
     Убираем «Basic », кавычки и пробелы; пару «Client ID:Client Secret» (или два поля) кодируем в base64.
     Только Client ID — ошибка с подсказкой. */
  const UUIDRE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function gigaKey(raw, id2, secret2) {
    let k = String(raw || "").replace(/^\s*(authorization\s*:\s*)?basic\s+/i, "").replace(/["'«»\s]/g, "");
    if (!k && id2 && secret2) k = id2.trim() + ":" + secret2.trim();
    if (UUIDRE.test(k) && secret2) k = k + ":" + secret2.trim();
    const pair = k.match(/^([0-9a-f-]{36})[:;,|/]([0-9a-f-]{36})$/i);
    if (pair) return { key: btoa(pair[1] + ":" + pair[2]), note: "Client ID и Client Secret превращены в ключ авторизации" };
    if (UUIDRE.test(k)) return { key: "", note: "Это Client ID, а нужен ключ авторизации (Authorization key) — или вставьте ещё Client Secret в поле ниже." };
    return { key: k, note: "" };
  }
  /* ---------- проверка: Яндекс-функция и диагностика GigaChat ---------- */
  async function probeYandex(c = cfg()) {
    if (!c.yandexFn) return { ok: false, text: "адрес функции не задан" };
    const base = c.yandexFn.replace(/\/+$/, ""), u = p => /functions\.yandexcloud\.net/.test(base) ? `${base}?path=${encodeURIComponent(p)}` : base + p;
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 15000);
    try {
      const h = await (await fetch(u("/health"), { signal: ctl.signal, cache: "no-store" })).json();
      if (h.service !== "uchu-po-frp-proxy") return { ok: false, text: "по адресу отвечает не прокси «Учу по ФРП»" };
      if (!h.keys?.gigachat && !c.keys.gigachat) return { ok: false, text: "функция работает, но ключа GigaChat в ней нет (переменная GIGACHAT_KEY)" };
      const d = await (await fetch(u("/diagnose"), { signal: ctl.signal, cache: "no-store", headers: c.keys.gigachat ? { "X-GigaChat-Key": (gigaKey(c.keys.gigachat).key || c.keys.gigachat) } : {} }).catch(() => null))?.json?.().catch(() => null);
      if (d && !d.ok) return { ok: false, text: d.message || "Сбер отказал", reason: d.reason };
      if (!d && !(h.version >= 5)) return { ok: h.cert, text: h.cert ? "функция отвечает (старая версия прокси без диагностики — обновите код функции)" : "функция старой версии: нет сертификата Минцифры — обновите код функции (proxy.js v5)" };
      return { ok: true, text: `GigaChat доступен. ${h.certMode || ""}` };
    } catch (e) { return { ok: false, text: e.name === "AbortError" ? "функция не ответила за 15 секунд (облако недоступно или перегружено)" : "функция недоступна из этой сети" }; }
    finally { clearTimeout(t); }
  }
  async function test(id) {
    const c = cfg();
    if (id === "yandexfn") return probeYandex(c);
    let text = "";
    try { await (RUN[id] || runExtra(id))(c, "Ответь одним словом: готово", { modelTier: "quick", signal: AbortSignal.timeout ? AbortSignal.timeout(40000) : undefined }, d => (text += d)); setStatus(id, { ok: true }); return { ok: true, text: "✓ отвечает: " + text.trim().slice(0, 40) }; }
    catch (e) { const err = e instanceof TypeError ? { code: "network" } : e; const w = why(err); setStatus(id, { ok: false, why: w }); return { ok: false, text: w }; }
  }

  /* ---------- кнопка в шапке и окно настроек ---------- */
  const btn = document.createElement("button"); btn.className = "btn sm"; btn.id = "btnAi"; btn.onclick = () => open();
  function label() { const l = chain(); if (!l.length) return null; return P[active && l.includes(active) ? active : l[0]].name; }
  function paint() {
    const ok = configured(), n = label();
    btn.textContent = ok ? "⚙ ИИ: " + (n.length > 18 ? n.split(" ")[0] : n) : "⚙ Подключить ИИ";
    btn.classList.toggle("flame", !ok);
    if (typeof syncBuild === "function") try { syncBuild(); } catch { }
  }
  const v = x => esc(x || "");
  function open() {
    const c = cfg(), st = status(), l = chain(c);
    const row = id => { const s = st[id]; return s ? (s.ok ? `<span class="tag ok">✓ работал ${ago(s.at)}</span>` : `<span class="tag red" title="${esc(s.why)}">✗ ${esc(s.why.slice(0, 50))}</span>`) : ""; };
    const m = openModal(`<div class="dialog"><div class="dlg-h"><h2>Нейросеть</h2><button class="btn ghost x" data-close aria-label="Закрыть">×</button></div>
    <form class="dlg-b" id="aiForm">
      <div class="auto-box ai-status"><b>${l.length ? `Сейчас работает: ${esc(P[active && l.includes(active) ? active : l[0]].name)}` : "Нейросеть ещё не подключена"}</b>
        <p class="hint">${l.length ? `Очередь: ${l.map(id => esc(P[id].name)).join(" → ")}. Если первая не ответит, сайт сам перейдёт к следующей и скажет почему.` : "Самый простой способ — «Войти через OpenRouter»: один клик, без прокси и без оплаты. Можно и без нейросети: урок соберётся по алгоритму."}</p>
        <div class="field"><label for="aiPrefer">Предпочитаемая нейросеть</label><select id="aiPrefer"><option value="auto">Автоматически — первая доступная</option>${[...c.extra.map(x => x.id), ...ORDER].map(id => `<option value="${id}" ${c.prefer === id ? "selected" : ""}>${esc(P[id].name)}</option>`).join("")}</select></div>
        <button type="button" class="btn sm teal" id="aiTestAll">Проверить все подключённые</button><div id="aiTestBox" class="small"></div></div>

      <div class="prov uni"><div class="prov-h"><b>Любая нейросеть по одному ключу</b> <span class="small">OpenAI, DeepSeek, Gemini, Claude, Grok, Groq, Mistral, Qwen, Kimi, Together, Perplexity, Hugging Face, OpenRouter…</span></div>
        <p class="hint">Вставьте ключ и нажмите «Подключить» — сайт сам узнает сервис, найдёт список моделей, выберет подходящую и проверит. Для другого сервиса укажите ещё его адрес (…/v1).</p>
        <div class="mat-row"><input type="text" class="secret" id="uniKey" data-lpignore="true" data-1p-ignore="true" data-form-type="other" spellcheck="false" autocomplete="off" placeholder="ключ API" style="flex:1 1 260px"><input type="text" id="uniBase" spellcheck="false" placeholder="адрес (необязательно)" style="flex:1 1 220px"><button type="button" class="btn sm flame" id="uniGo">Подключить</button></div>
        <p class="small" id="uniSt"></p>
        ${c.extra.length ? `<div class="uni-list">${c.extra.map(x => `<div class="uni-row" data-x="${x.id}"><b>${esc(x.name)}</b> ${row(x.id)} <select data-xm="${x.id}" aria-label="Модель">${[...new Set([x.model, ...(x.models || [])])].filter(Boolean).map(mm => `<option ${mm === x.model ? "selected" : ""}>${esc(mm)}</option>`).join("")}</select><button type="button" class="btn sm ghost" data-xt="${x.id}">Проверить</button><button type="button" class="btn sm ghost" data-xd="${x.id}" aria-label="Отключить">×</button></div>`).join("")}</div>` : ""}</div>

      <div class="prov"><div class="prov-h"><b>1. OpenRouter</b> <span class="small">${esc(P.openrouter.sub)}</span> ${row("openrouter")}</div>
        <div class="mat-row"><button type="button" class="btn sm flame" id="orLogin">${c.keys.openrouter ? "Войти заново" : "Войти через OpenRouter"}</button><span class="small">или вставьте ключ:</span></div>
        <input type="text" class="secret" id="kOR" data-lpignore="true" data-1p-ignore="true" data-form-type="other" spellcheck="false" autocomplete="off" placeholder="sk-or-…" value="${v(c.keys.openrouter)}"><p class="hint">Лимиты: ${esc(P.openrouter.limits)}. Модель: <input type="text" id="mOR" class="mini-inp" value="${v(c.models.openrouter)}" spellcheck="false"></p></div>

      <div class="prov"><div class="prov-h"><b>2. Pollinations</b> <span class="small">${esc(P.pollinations.sub)}</span> ${row("pollinations")}</div>
        <div class="mat-row"><button type="button" class="btn sm ghost" id="plLogin">${SITE.pollinationsAppKey ? "Войти через Pollinations" : "Получить ключ ↗"}</button></div>
        <input type="text" class="secret" id="kPL" data-lpignore="true" data-1p-ignore="true" data-form-type="other" spellcheck="false" autocomplete="off" placeholder="sk_…" value="${v(c.keys.pollinations)}"><p class="hint">${esc(P.pollinations.limits)}. Без ключа Pollinations тексты больше не выдаёт.</p></div>

      <div class="prov"><div class="prov-h"><b>3. DeepSeek</b> <span class="small">свой ключ</span> ${row("deepseek")}</div><input type="text" class="secret" id="kDS" data-lpignore="true" data-1p-ignore="true" data-form-type="other" spellcheck="false" autocomplete="off" placeholder="sk-…" value="${v(c.keys.deepseek)}"><p class="hint"><a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener">Получить ключ ↗</a> · ${esc(P.deepseek.limits)}</p></div>
      <div class="prov"><div class="prov-h"><b>4. Gemini</b> <span class="small">Google AI Studio</span> ${row("gemini")}</div><input type="text" class="secret" id="kGM" data-lpignore="true" data-1p-ignore="true" data-form-type="other" spellcheck="false" autocomplete="off" placeholder="AIza…" value="${v(c.keys.gemini)}"><p class="hint"><a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Получить ключ ↗</a> · ${esc(P.gemini.limits)}</p></div>
      <div class="prov"><div class="prov-h"><b>5. GigaChat через Яндекс-функцию</b> <span class="small">неприоритетный вариант</span> ${row("yandexfn")}</div>
        <input type="text" id="yFn" spellcheck="false" placeholder="https://functions.yandexcloud.net/…" value="${v(c.yandexFn)}">
        <label for="kGG" class="small">Свой ключ GigaChat (не нужен, если ключ лежит в функции)</label><input type="text" class="secret" id="kGG" data-lpignore="true" data-1p-ignore="true" data-form-type="other" spellcheck="false" autocomplete="off" value="${v(c.keys.gigachat)}">
        <details class="small"><summary>Нет «ключа авторизации», есть Client ID и Client Secret?</summary><div class="mat-row"><input type="text" id="kGGid" placeholder="Client ID" spellcheck="false" autocomplete="off"><input type="text" class="secret" id="kGGsec" data-lpignore="true" data-1p-ignore="true" data-form-type="other" spellcheck="false" placeholder="Client Secret" autocomplete="off"></div><p class="hint">Сайт сам соберёт из них ключ. Подходит любой из вариантов: ключ авторизации, «Basic …», пара «ID:Secret».</p></details>
        <div class="mat-row"><button type="button" class="btn sm ghost" id="yProbe">Проверить функцию и Сбер</button><span class="small" id="yProbeSt"></span></div></div>
      <details class="prov"><summary><b>6. Claude и свой сервис</b></summary>
        <label for="kAN" class="small">Ключ Anthropic (из России недоступен)</label><input type="text" class="secret" id="kAN" data-lpignore="true" data-1p-ignore="true" data-form-type="other" spellcheck="false" autocomplete="off" placeholder="sk-ant-…" value="${v(c.keys.anthropic)}">
        <label for="cuBase" class="small">Свой OpenAI-совместимый сервис: адрес (…/v1), ключ, модель</label><input type="text" id="cuBase" spellcheck="false" placeholder="https://api.example.com/v1" value="${v(c.custom.base)}"><input type="text" class="secret" id="cuKey" data-lpignore="true" data-1p-ignore="true" data-form-type="other" spellcheck="false" autocomplete="off" placeholder="ключ" value="${v(c.custom.key)}"><input type="text" id="cuModel" spellcheck="false" placeholder="модель" value="${v(c.custom.model)}"></details>
      <details class="prov"><summary><b>Прокси — крайняя мера</b> <span class="small">только вручную</span></summary>
        <p class="hint">Нужен, только если из сети школы зарубежные нейросети не открываются. Браузер не умеет ходить через системный прокси сам, поэтому здесь указывается сервер-посредник «Учу по ФРП» (файл proxy/proxy.js на любом своём сервере или в Яндекс Облаке).</p>
        <label class="check"><input type="checkbox" id="pxOn" ${c.proxy.on ? "checked" : ""}> Включить прокси</label>
        <div class="row2"><div class="field"><label for="pxUrl">Адрес</label><input type="text" id="pxUrl" spellcheck="false" placeholder="https://proxy.школа.рф" value="${v(c.proxy.url)}"></div><div class="field"><label for="pxPort">Порт</label><input type="text" id="pxPort" inputmode="numeric" placeholder="443" value="${v(c.proxy.port)}"></div></div>
        <div class="row2"><div class="field"><label for="pxLogin">Логин</label><input type="text" id="pxLogin" autocomplete="off" value="${v(c.proxy.login)}"></div><div class="field"><label for="pxPass">Пароль</label><input type="text" class="secret" id="pxPass" data-lpignore="true" data-1p-ignore="true" data-form-type="other" spellcheck="false" autocomplete="off" value="${v(c.proxy.password)}"></div></div>
        <label class="check"><input type="checkbox" id="pxSplit" ${c.proxy.split ? "checked" : ""}> Split Tunneling: российские сервисы напрямую, остальное через прокси</label>
        <div class="mat-row"><button type="button" class="btn sm ghost" id="pxTest">Проверить подключение</button><span class="small" id="pxSt">${c.proxy.on ? "прокси включён" : "прокси выключен"}</span></div></details>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><button class="btn flame" type="submit">Сохранить</button><span class="small" id="aiSaved"></span></div>
      <details class="transfer"><summary>Другие устройства (телефон, второй компьютер)</summary>
        <p class="hint">Настройте один раз здесь — на другом устройстве откройте ссылку или QR-код. В ссылке лежат ваши ключи, не публикуйте её.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn sm teal" id="trQr">Показать QR-код</button><button type="button" class="btn sm ghost" id="trCopy">Скопировать ссылку</button></div><div id="trBox"></div></details>
    </form></div>`);
    const $m = s => m.querySelector(s);
    const collect = () => { const n = cfg(); n.prefer = $m("#aiPrefer").value; n.keys = { ...n.keys, openrouter: $m("#kOR").value.trim(), pollinations: $m("#kPL").value.trim(), deepseek: $m("#kDS").value.trim(), gemini: $m("#kGM").value.trim(), gigachat: (() => { const g = gigaKey($m("#kGG").value, $m("#kGGid")?.value || "", $m("#kGGsec")?.value || ""); if (g.note) toast(g.note, 7000); if (g.key) { $m("#kGG").value = g.key; if ($m("#kGGid")) $m("#kGGid").value = ""; if ($m("#kGGsec")) $m("#kGGsec").value = ""; } return g.key; })(), anthropic: $m("#kAN").value.trim() }; n.models.openrouter = $m("#mOR").value.trim() || "openrouter/free"; n.yandexFn = $m("#yFn").value.trim(); n.custom = { base: $m("#cuBase").value.trim(), key: $m("#cuKey").value.trim(), model: $m("#cuModel").value.trim() }; n.proxy = { on: $m("#pxOn").checked, url: $m("#pxUrl").value.trim(), port: $m("#pxPort").value.trim(), login: $m("#pxLogin").value.trim(), password: $m("#pxPass").value, split: $m("#pxSplit").checked }; return n; };
    $m("#aiForm").onsubmit = e => { e.preventDefault(); save(collect()); closeModal(); toast(configured() ? "Сохранено. Очередь нейросетей: " + chain().map(id => P[id].name).join(" → ") + "." : "Сохранено. Чтобы включить нейросеть, войдите через OpenRouter или вставьте ключ."); };
    $m("#orLogin").onclick = () => { save(collect()); openrouterLogin(); };
    $m("#uniGo").onclick = async () => {
      save(collect()); const st = $m("#uniSt"), b = $m("#uniGo"); b.disabled = true;
      try { const r = await connectKey($m("#uniKey").value, $m("#uniBase").value, t => (st.textContent = t)); st.textContent = `${r.ok ? "✓" : "✗"} ${r.name}, модель ${r.model}: ${r.text}`; if (r.ok) { toast(`${r.name} подключена.`); setTimeout(() => { closeModal(); open(); }, 900); } }
      catch (e) { st.textContent = "✗ " + (e.message || e); } finally { b.disabled = false; }
    };
    m.querySelectorAll("[data-xm]").forEach(sel => sel.onchange = () => { const n = cfg(); const x = n.extra.find(y => y.id === sel.dataset.xm); if (x) { x.model = sel.value; save(n); } });
    m.querySelectorAll("[data-xt]").forEach(b => b.onclick = async () => { b.textContent = "…"; const r = await test(b.dataset.xt); b.textContent = r.ok ? "✓ работает" : "✗ " + r.text.slice(0, 40); });
    m.querySelectorAll("[data-xd]").forEach(b => b.onclick = () => { const n = cfg(); n.extra = n.extra.filter(y => y.id !== b.dataset.xd); save(n); b.closest(".uni-row").remove(); });
    $m("#plLogin").onclick = () => { save(collect()); pollinationsLogin(); };
    $m("#yProbe").onclick = async () => { save(collect()); const s = $m("#yProbeSt"); s.textContent = "Проверяю…"; const r = await probeYandex(); s.textContent = (r.ok ? "✓ " : "✗ ") + r.text; setStatus("yandexfn", r.ok ? { ok: true } : { ok: false, why: r.text }); };
    $m("#aiTestAll").onclick = async () => { save(collect()); const box = $m("#aiTestBox"); const ids = chain(); if (!ids.length) { box.textContent = "Нечего проверять: ни одна нейросеть не подключена."; return; } box.innerHTML = ids.map(id => `<div id="t-${id}">${esc(P[id].name)}: проверяю…</div>`).join(""); for (const id of ids) { const r = await test(id); const el = box.querySelector("#t-" + id); if (el) el.textContent = `${P[id].name}: ${r.ok ? "✓" : "✗"} ${r.text}`; } };
    $m("#pxTest").onclick = async () => {
      const n = collect(), s = $m("#pxSt"); if (!n.proxy.url) { s.textContent = "Укажите адрес."; return; }
      s.textContent = "Проверяю…";
      try { const base = n.proxy.url.replace(/\/+$/, "") + (n.proxy.port && !/:\d+$/.test(n.proxy.url) ? ":" + n.proxy.port : ""); const u = /functions\.yandexcloud\.net/.test(base) ? `${base}?path=%2Fhealth` : base + "/health"; const h = await (await fetch(u, { cache: "no-store" })).json(); s.textContent = h.service === "uchu-po-frp-proxy" ? `✓ Прокси на связи${h.relay ? `, пересылает к: ${h.relay.hosts.slice(0, 4).join(", ")}…` : " (старая версия без /relay — обновите proxy.js)"}${h.relay?.auth ? "; требует логин и пароль" : ""}.` : "✗ По адресу отвечает не прокси «Учу по ФРП»."; }
      catch { s.textContent = "✗ Прокси не отвечает: проверьте адрес, порт и HTTPS."; }
    };
    $m("#trQr").onclick = async () => { save(collect()); await loadScript("qr"); const q = window.qrcode(0, "L"); q.addData(transferLink()); q.make(); $m("#trBox").innerHTML = `<div class="qr"><div class="code">${q.createSvgTag({ cellSize: 3, margin: 0, scalable: true })}</div><p class="hint" style="max-width:30ch">Наведите камеру телефона и откройте ссылку.</p></div>`; };
    $m("#trCopy").onclick = async () => { save(collect()); const link = transferLink(); try { await navigator.clipboard.writeText(link); toast("Ссылка скопирована."); } catch { $m("#trBox").innerHTML = `<input type="text" value="${esc(link)}" readonly onclick="this.select()">`; } };
  }
  const ago = t => { const s = Math.round((Date.now() - t) / 60000); return s < 1 ? "только что" : s < 60 ? s + " мин назад" : Math.round(s / 60) + " ч назад"; };
  const b64e = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const b64d = s => decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));
  function transferLink() { const c = cfg(); return location.origin + location.pathname + "#ai2=" + b64e(JSON.stringify({ prefer: c.prefer, keys: c.keys, models: c.models, custom: c.custom, extra: c.extra, yandexFn: c.yandexFn, proxy: c.proxy })); }
  function offerTransfer() {
    const m = location.hash.match(/#ai2=([\w-]+)/); if (!m) return;
    let t; try { t = JSON.parse(b64d(m[1])); } catch { return; }
    const bar = document.createElement("div"); bar.className = "banner";
    bar.innerHTML = `<b>Настройки нейросети с другого устройства.</b> <button class="btn sm flame" id="trYes">Применить</button> <button class="btn sm ghost" id="trNo">Не надо</button>`;
    document.body.prepend(bar);
    const done = () => { bar.remove(); try { history.replaceState(history.state, "", location.pathname + location.search); } catch { } };
    bar.querySelector("#trYes").onclick = () => { save({ ...cfg(), ...t }); done(); toast("Готово: нейросеть подключена на этом устройстве."); };
    bar.querySelector("#trNo").onclick = done;
  }

  /* подмена возможностей ядра: sample — наш перебор провайдеров */
  const prevUse = window.claude?.use;
  window.claude = { use: async name => name === "sample" ? sample : prevUse ? prevUse(name) : null };
  if (window.UCHU) { window.UCHU.configured = configured; window.UCHU.findProxy = async () => null; }
  window.openAiSettingsImpl = open;
  document.addEventListener("DOMContentLoaded", () => { document.querySelector(".account")?.append(btn); paint(); });
  document.addEventListener("uchu:ready", () => { finishOpenrouter(); finishPollinations(); offerTransfer(); paint(); });
  return { sample, cfg, save, chain, configured, label, open, test, probeYandex, connectKey, listModels, P, ORDER, status };
})();
window.AI = AI;
