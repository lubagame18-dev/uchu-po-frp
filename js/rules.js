/* ===================================================================
   «Учу по ФРП» — обучение сайта на самом сайте.
   Разработчики меняют правила сборки (переключатели) и пишут правила словами.
   Правила хранятся в облаке (таблица site_rules) и сразу действуют у всех учителей:
     • переключатели — в сборке без ИИ (рабочий лист, презентация);
     • правила словами — добавляются к каждому запросу к нейросети.
   С подключённой нейросетью можно просто написать, что не нравится, —
   она сама предложит, какие переключатели поменять и какие правила добавить.
   =================================================================== */
const Rules = (() => {
  "use strict";
  const KEY = "uchu:rules";
  const SCHEMA = [
    { k: "ws_goal", label: "Цель в рабочем листе", type: "choice", options: { kids: "для детей: «Сегодня на уроке мы…»", frp: "формулировки ФРП", none: "не писать" } },
    { k: "ws_selfcheck", label: "«Оцени себя» в рабочем листе", type: "choice", options: { kids: "простые фразы для детей", frp: "предметные результаты ФРП", none: "не писать" } },
    { k: "slide_goal", label: "Цель на слайде", type: "choice", options: { kids: "для детей, живо и понятно", frp: "формулировки ФРП" } },
    { k: "slide_goal_title", label: "Заголовок цели для детей", type: "text" }
  ];
  const DEF = {
    ws_goal: "kids", ws_selfcheck: "kids", slide_goal: "kids", slide_goal_title: "Сегодня на уроке мы:",
    ai_rules: [
      "В рабочих листах не пиши предметные результаты ФРП: ученикам они не нужны. Результаты ФРП — только в техкарте и конспекте для учителя.",
      "Цель урока для детей (на слайде и в рабочем листе) формулируй живо и понятно, от первого лица класса: что мы сегодня узнаем, сделаем и чему научимся. Не переписывай формулировки ФРП."
    ]
  };
  let R = { ...DEF }, meta = {};
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s?.data) { R = { ...DEF, ...s.data }; meta = s.meta || {}; } } catch { }
  const keep = () => { try { localStorage.setItem(KEY, JSON.stringify({ data: R, meta })); } catch { } };
  const get = k => R[k] ?? DEF[k];
  const all = () => ({ ...R, ai_rules: [...(R.ai_rules || [])] });

  const C = () => window.UCHU_SITE?.cloud || {};
  const ok = () => !!(C().url && C().anonKey);
  async function sync() {
    if (!ok()) return;
    try {
      const r = await fetch(C().url.replace(/\/+$/, "") + "/rest/v1/site_rules?id=eq.main&select=data,updated_by,updated_at", { headers: { apikey: C().anonKey, Authorization: "Bearer " + C().anonKey } });
      if (!r.ok) return; const row = (await r.json())?.[0]; if (!row?.data) return;
      R = { ...DEF, ...row.data }; meta = { by: row.updated_by, at: row.updated_at }; keep();
    } catch { }
  }
  /* сохранить для всех (только разработчики) */
  async function save(data, note) {
    const next = { ...R, ...data };
    await window.Account.db("/rest/v1/site_rules?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ id: "main", data: next, updated_by: window.Account.session?.email, updated_at: new Date().toISOString() }) });
    R = next; meta = { by: window.Account.session?.email, at: new Date().toISOString(), note }; keep();
    if (window.Log) Log.add("правила", note || "изменены правила сборки");
  }
  /* добавка к каждому запросу к нейросети */
  function aiSuffix() {
    const L = (get("ai_rules") || []).filter(Boolean);
    const soft = window.Learn2 && Learn2.hintsSuffix ? Learn2.hintsSuffix() : "";
    return (L.length ? "\n\n# Правила сайта «Учу по ФРП» (обязательно соблюдай)\n" + L.map((x, i) => `${i + 1}. ${x}`).join("\n") : "") + soft;
  }
  /* «научить словами»: нейросеть превращает пожелание в изменения настроек */
  /* через какую нейросеть: личная (id из «⚙ ИИ») или общий ключ сайта (ячейка 1–5) */
  async function ask(prompt, via) {
    if (via && /^slot:\d$/.test(via)) {
      const fn = (window.UCHU_AI_CFG?.yandexFn || window.UCHU_SITE?.yandexFunction || "").replace(/\/+$/, ""), tok = window.Account?.session?.access;
      if (!fn || !tok) throw new Error("войдите в личный кабинет — общие ключи доступны разработчикам");
      const u = /functions\.yandexcloud\.net/.test(fn) ? `${fn}?path=${encodeURIComponent("/deepseek/v1/chat/completions")}` : fn + "/deepseek/v1/chat/completions";
      const r = await fetch(u, { method: "POST", headers: { "Content-Type": "application/json", "X-User-Token": tok, "X-Uchu-Slot": via.slice(5) }, body: JSON.stringify({ messages: [{ role: "user", content: prompt }], max_tokens: 1500 }) });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "HTTP " + r.status);
      return j.choices?.[0]?.message?.content || "";
    }
    if (!window.AI?.configured?.()) throw new Error("подключите личный ключ нейросети (раздел «Ключи ИИ» → «Личный ключ») или выберите общий ключ");
    return (await window.AI.sample(prompt, { modelTier: "quick", noRules: true, ...(via && via !== "auto" ? { only: via } : {}) })).text;
  }
  async function teach(wish, via) {
    const prompt = `Ты настраиваешь сайт-конструктор уроков русского языка и литературы «Учу по ФРП».
Пожелание разработчика: «${wish}»

Настройки (переключатели) и их текущие значения:
${SCHEMA.map(s => `- ${s.k} (${s.label}) = ${JSON.stringify(get(s.k))}${s.options ? "; варианты: " + Object.entries(s.options).map(([k, v]) => `${k} — ${v}`).join("; ") : ""}`).join("\n")}

Правила словами для нейросети (действуют при сборке уроков с ИИ), сейчас:
${(get("ai_rules") || []).map((x, i) => `${i}. ${x}`).join("\n") || "— нет"}

Ответь ТОЛЬКО JSON без пояснений вокруг:
{"set": {ключ: значение — только те переключатели, которые надо поменять}, "add_rules": ["новое правило, коротко и конкретно, в повелительном наклонении"], "remove_rules": [номера правил, которые теперь противоречат пожеланию], "explain": "1–2 предложения: что изменится"}`;
    const text = await ask(prompt, via);
    const m = String(text).match(/\{[\s\S]*\}/); if (!m) throw new Error("нейросеть ответила не по форме — попробуйте сформулировать иначе");
    let j; try { j = JSON.parse(m[0]); } catch { throw new Error("нейросеть ответила не по форме — попробуйте ещё раз"); }
    const set = {};
    for (const [k, v] of Object.entries(j.set || {})) { const s = SCHEMA.find(x => x.k === k); if (!s) continue; if (s.options && !s.options[v]) continue; if (s.type === "text" && typeof v !== "string") continue; if (v !== get(k)) set[k] = v; }
    return { set, add: [].concat(j.add_rules || []).map(String).filter(x => x.trim().length > 5).slice(0, 5), remove: [].concat(j.remove_rules || []).map(Number).filter(n => Number.isInteger(n) && n >= 0 && n < (get("ai_rules") || []).length), explain: String(j.explain || "") };
  }
  document.addEventListener("uchu:ready", () => { sync(); setInterval(sync, 15 * 60e3); });
  return { SCHEMA, DEF, get, all, save, sync, aiSuffix, teach, get meta() { return meta; } };
})();
window.Rules = Rules;
