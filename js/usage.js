/* ===================================================================
   «Учу по ФРП» — расход ИИ в понятных единицах.
   ⚡ 1 кредит = 4 000 токенов (≈ 2–3 страницы текста туда и обратно).
   Урок с ИИ целиком ≈ 10 ⚡, пересборка одного документа ≈ 3 ⚡, правка по просьбе ≈ 1–2 ⚡.
   Каждый ответ нейросети записывается сюда: сколько токенов ушло и на что
   (сборка урока, правка, пересборка). Если сервис не прислал точную цифру,
   токены оцениваются по длине текста. Журнал хранится в этом браузере,
   а расход ИИ сайта по тарифу считает сервер (личный кабинет).
   Себестоимость (видит только разработчик): DeepSeek flash, дневной тариф —
   $0,30 за 1 млн входящих и $1,20 за 1 млн исходящих токенов.
   =================================================================== */
const Usage = (() => {
  "use strict";
  const KEY = "uchu:usage", PER = 4000, USD = { in: 0.30, out: 1.20 }, RUB = 95;
  let label = "", topic = "", lastAt = 0;
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || { ops: [] }; } catch { return { ops: [] }; } };
  const store = d => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { } };
  const month = (t = Date.now()) => new Date(t).toISOString().slice(0, 7);
  /* что сейчас делает учитель — так операция и подпишется в журнале */
  function begin(what, about = "") { label = what; topic = String(about || "").slice(0, 80); lastAt = 0; }
  // грубая оценка, если сервис не прислал usage: русский текст ≈ 2,8 знака на токен
  const est = s => Math.ceil(String(s || "").length / 2.8);
  function add({ prompt = "", text = "", usage = null, provider = "" } = {}) {
    const i = usage ? (usage.prompt_tokens ?? usage.input_tokens ?? 0) : est(prompt), o = usage ? (usage.completion_tokens ?? usage.output_tokens ?? 0) : est(text);
    if (!i && !o) return;
    const d = load(), now = Date.now(), lb = label || "Правки и доработка";
    const last = d.ops[0];
    // вызовы одной операции (сборка урока — это 5–10 запросов) складываются в одну строку
    if (last && last.label === lb && last.topic === topic && now - last.at < 30 * 60e3 && (lastAt || last.at) && now - (lastAt || last.at) < 10 * 60e3) { last.in += i; last.out += o; last.n++; last.at = now; last.exact = last.exact && !!usage; }
    else d.ops.unshift({ at: now, label: lb, topic, in: i, out: o, n: 1, exact: !!usage, provider });
    lastAt = now;
    d.ops = d.ops.slice(0, 200); store(d);
    try { window.dispatchEvent(new CustomEvent("uchu:usage")); } catch { }
  }
  const credits = tok => tok / PER;
  /* ⚡ без огромных чисел: 0,4 ⚡ · 3 ⚡ · 12 ⚡ */
  const fmt = tok => { const c = credits(tok); return (c < 10 ? (Math.round(c * 10) / 10).toLocaleString("ru-RU") : Math.round(c).toLocaleString("ru-RU")) + " ⚡"; };
  const rub = op => ((op.in * USD.in + op.out * USD.out) / 1e6) * RUB;
  const fmtRub = r => r < 1 ? r.toFixed(2).replace(".", ",") + " ₽" : (Math.round(r * 10) / 10).toLocaleString("ru-RU") + " ₽";
  function stats() {
    const d = load(), m = month(), cur = d.ops.filter(x => month(x.at) === m);
    const sum = a => a.reduce((s, x) => s + x.in + x.out, 0);
    const avg = re => { const a = d.ops.filter(x => re.test(x.label)); return a.length ? sum(a) / a.length : 0; };
    return { ops: d.ops, month: cur, monthTok: sum(cur), monthRub: cur.reduce((s, x) => s + rub(x), 0), avgLesson: avg(/^Сборка урока/), avgRedo: avg(/^Пересборка/), avgEdit: avg(/^Прав/) };
  }
  /* Блок для личного кабинета */
  function html({ dev = false, planTok = 0, usedTok = null } = {}) {
    const s = stats();
    let h = `<div class="use-box"><h3>⚡ ИИ</h3>`;
    if (planTok) {
      const used = usedTok ?? s.monthTok, left = Math.max(0, planTok - used), pct = Math.min(100, Math.round(used / planTok * 100));
      h += `<div class="use-big"><b>${fmt(left)}</b><span>из ${fmt(planTok)}</span></div><div class="tok-bar" role="img" aria-label="Потрачено ${pct}%"><span style="width:${pct}%"></span></div>`;
    } else h += `<div class="use-big"><b>${fmt(s.monthTok)}</b><span>потрачено в этом месяце${dev ? ` · себестоимость ≈ ${fmtRub(s.monthRub)}` : ""}</span></div>`;
    if (s.ops.length) h += `<details class="use-log"><summary class="small">История</summary><ul>${s.ops.slice(0, 30).map(x => `<li><span>${new Date(x.at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} · ${esc(x.label)}${x.topic ? ` «${esc(x.topic)}»` : ""}</span><b>${fmt(x.in + x.out)}${dev ? ` · ${fmtRub(rub(x))}` : ""}</b></li>`).join("")}</ul></details>`;
    if (dev) h += `<details class="use-log"><summary class="small">Себестоимость и тарифы (только разработчику)</summary>${econ(s)}</details>`;
    return h + `</div>`;
  }
  /* Сколько ⚡ уйдёт на действие — для подписи на кнопках («Создать урок · ≈ 10 ⚡») */
  function cost(kind) {
    const s = stats(), v = kind === "lesson" ? s.avgLesson || 40000 : kind === "redo" ? s.avgRedo || 12000 : s.avgEdit || 4000;
    return "≈ " + fmt(v);
  }
  /* Экономика тарифов: сколько стоит ИИ при полном расходе лимитов и что остаётся после комиссии и налога.
     «С ИИ»: 400 ₽/мес, 50 уроков ≈ 2 млн токенов ≈ 125 ₽ текста, 6 листов с картинками ≈ 156 ₽,
     комиссия и налог ≈ 10% (≈ 40 ₽) → остаётся ≈ 80 ₽.
     «С ИИ, год»: 3900 ₽/год ≈ 325 ₽/мес (−19%), за год 600 уроков и 72 листа. */
  function econ(s) {
    const perTok = (0.6 * USD.in + 0.4 * USD.out) / 1e6 * RUB; // смесь: 60% входящих, 40% исходящих
    const IMG_UNIT = 26; // ₽ за один лист с картинками при полном наборе (6 листов ≈ 156 ₽)
    const LESSON_TOK = 40000; // ≈ токенов на один урок с ИИ
    const row = (name, price, lessons, imgs, priceCell) => {
      const tok = lessons * LESSON_TOK, ai = tok * perTok, im = imgs * IMG_UNIT, fee = price * 0.10, net = price - fee - ai - im;
      return `<tr><td>${name}</td><td>${priceCell}</td><td>${lessons}</td><td>${fmt(tok)} ≈ ${Math.round(ai)} ₽</td><td>${imgs} листов ≈ ${Math.round(im)} ₽</td><td>≈ ${Math.round(fee)} ₽</td><td><b>≈ ${Math.round(net)} ₽</b></td></tr>`;
    };
    const rows = row("С ИИ", 400, 50, 6, "400 ₽/мес") + row("С ИИ, год", 3900, 600, 72, `3900 ₽/год<br><span class="small">≈ 325 ₽/мес</span>`);
    return `<table class="pc-t"><tr><th>Тариф</th><th>Цена</th><th>Уроков с ИИ (за период)</th><th>Себестоимость текста ИИ</th><th>Картинки</th><th>Комиссия и налог ≈ 10%</th><th>Остаётся вам</th></tr>${rows}</table>
      <p class="small">Расчёт: DeepSeek flash днём $0,30 / $1,20 за 1 млн токенов (ночью вдвое дешевле), курс ${RUB} ₽ за $. Один урок с ИИ ≈ 40 тыс. токенов ≈ ${fmtRub(LESSON_TOK * perTok)}; лист с картинками ≈ ${IMG_UNIT} ₽. Комиссия платёжного сервиса и налог самозанятой — ≈ 10%: с 400 ₽ это ≈ 40 ₽. В пересчёте на месяц годовой тариф даёт ≈ 325 ₽, себестоимость ИИ при полном расходе лимитов ≈ 281 ₽, комиссия и налог ≈ 32 ₽ — остаётся ≈ 12 ₽/мес (≈ 133 ₽ за год). 1 ⚡ ≈ ${fmtRub(PER * perTok)}. Урок с ИИ по вашему журналу ≈ ${fmtRub((s.avgLesson || LESSON_TOK) * perTok)}${s.avgLesson ? " (по вашим урокам)" : ""}. $2 на балансе DeepSeek ≈ ${Math.round(2 * RUB / ((s.avgLesson || LESSON_TOK) * perTok))} уроков с ИИ.</p>`;
  }
  const esc = x => String(x ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  return { begin, add, stats, html, cost, fmt, credits, PER };
})();
window.Usage = Usage;
