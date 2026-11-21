/* «Учу по ФРП» — ленивая загрузка программ предметов.
   Раньше все 13 модулей планирования (2,3 МБ) грузились при открытии сайта,
   хотя учителю нужен один предмет. Теперь модуль подгружается при выборе
   предмета и кэшируется сервис-воркером: после первого открытия предмет
   работает без интернета.
   Порядок в списке важен: модули-«доработки» (frpplans12, frpplans13)
   дописывают разделы в уже загруженные планы. */
window.Plans = (() => {
  "use strict";

  const MAP = {
    /* предмет: [файлы в порядке загрузки] */
    math: ["frpplans", "frpplans7"],
    eng: ["frpplans", "frpplans10"],
    hist: ["frpplans", "frpplans22"],
    bio: ["frpplans", "frpplans14"],
    geo: ["frpplans2", "frpplans14", "frpplans22"],
    phys: ["frpplans3"],
    chem: ["frpplans4"],
    soc: ["frpplans5", "frpplans22"],
    inf: ["frpplans6", "frpplans14"],
    okr: ["frpplans7", "frpplans13"],
    izo: ["frpplans8", "frpplans13", "frpplans15"],
    mus: ["frpplans8", "frpplans13", "frpplans15"],
    tech: ["frpplans8", "frpplans13", "frpplans16"],
    pe: ["frpplans8", "frpplans13", "frpplans17"],
    orkse: ["frpplans8", "frpplans12", "frpplans21"],
    obzh: ["frpplans9", "frpplans12", "frpplans19"],
    vis: ["frpplans9", "frpplans12", "frpplans18"],
    mhk: ["frpplans9", "frpplans12", "frpplans20"],
    ru1: ["frpplans11", "frpplans13"],
    lit1: ["frpplans11", "frpplans13"],
    astr: ["frpplans13", "frpplans23"]
  };

  const files = new Map();   // файл -> Promise<boolean>
  const done = new Set();    // предметы, чья программа уже загружена
  const listeners = [];      // кто хочет узнать о загрузке
  let indexPromise = null;   // data/frp2025/index.js — один раз

  function load(name) {
    if (files.has(name)) return files.get(name);
    const p = new Promise(resolve => {
      const s = document.createElement("script");
      s.src = "js/" + name + ".js";
      s.async = true;
      s.onload = () => { applyExtras(); resolve(true); };
      s.onerror = () => { files.delete(name); resolve(false); };
      document.head.appendChild(s);
    });
    files.set(name, p);
    return p;
  }

  /* ---------- официальные планы 2025 (data/frp2025) ----------
     Аддитивный слой: если для предмета/класса есть собранный план 2025,
     он перекрывает старый модуль; нет — остаётся старый план (фолбэк). */
  function loadScript(src) {
    if (files.has(src)) return files.get(src);
    const p = new Promise(resolve => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => resolve(true);
      s.onerror = () => { files.delete(src); resolve(false); };
      document.head.appendChild(s);
    });
    files.set(src, p);
    return p;
  }

  function loadIndex() {
    if (window.UCHU_FRP2025) return Promise.resolve(true);
    if (!indexPromise) indexPromise = loadScript("data/frp2025/index.js");
    return indexPromise;
  }

  async function load2025(subject) {
    const ok = await loadIndex();
    if (!ok) return false;
    const cfg = window.UCHU_FRP2025 || {};
    const file = (cfg.files || {})[subject];
    if (!file || !(cfg.subjects || {})[subject]) return false;
    const loaded = await loadScript(file);
    if (!loaded) return false;
    if (subject === "lit" || subject === "ru") return true; // rich-данные читает движок FRP
    const D = window.FRPPlans2025 && window.FRPPlans2025[subject];
    if (!D) return false;
    window.FRPPlans[subject] = window.FRPPlans[subject] || {};
    for (const grade of Object.keys(D)) window.FRPPlans[subject][grade] = D[grade];
    return true;
  }

  const hasPlan = subject => {
    const P = window.FRPPlans;
    return !!(P && P[subject] && Object.keys(P[subject]).length);
  };

  /* модули-«доработки» (frpplans12/13) дописывают разделы в базовые планы.
     Их можно применять повторно — это делает порядок загрузки неважным. */
  function applyExtras() {
    (window.FRP_EXTRAS || []).forEach(fn => { try { fn(); } catch (e) { } });
  }

  async function ensure(subject) {
    if (done.has(subject)) return true;
    const list = MAP[subject];
    if (!list) {
      // ru/lit: планы в data/frp.js; для литературы поверх — rich-данные 2025
      try { await load2025(subject); } catch (e) { console.warn("frp2025:", e); }
      done.add(subject);
      return true;
    }
    for (const name of list) {
      const ok = await load(name);
      if (!ok) return false;
    }
    /* модули-«доработки» дописывают разделы после базовых: убеждаемся,
       что данные действительно применились, прежде чем считать предмет готовым */
    applyExtras();
    try { await load2025(subject); } catch (e) { console.warn("frp2025:", e); }
    if (!hasPlan(subject)) return false;
    done.add(subject);
    listeners.forEach(fn => { try { fn(subject); } catch (e) { } });
    return true;
  }

  /* синхронная проверка: нужна ли ещё загрузка */
  const pending = subject => !!MAP[subject] && !done.has(subject);

  /* все модули сразу — только для служебных страниц (материалы, поиск по всем темам) */
  function ensureAll() {
    return Object.keys(MAP).reduce((p, s) => p.then(() => ensure(s)), Promise.resolve(true));
  }

  function onChange(fn) { if (typeof fn === "function") listeners.push(fn); }

  return { ensure, ensureAll, pending, onChange, applyExtras, MAP };
})();
