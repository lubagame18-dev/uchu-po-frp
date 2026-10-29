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
    hist: ["frpplans"],
    bio: ["frpplans", "frpplans14"],
    geo: ["frpplans2", "frpplans14"],
    phys: ["frpplans3"],
    chem: ["frpplans4"],
    soc: ["frpplans5"],
    inf: ["frpplans6", "frpplans14"],
    okr: ["frpplans7", "frpplans13"],
    izo: ["frpplans8", "frpplans13", "frpplans15"],
    mus: ["frpplans8", "frpplans13", "frpplans15"],
    tech: ["frpplans8", "frpplans13", "frpplans16"],
    pe: ["frpplans8", "frpplans13", "frpplans17"],
    orkse: ["frpplans8", "frpplans12"],
    obzh: ["frpplans9", "frpplans12", "frpplans19"],
    vis: ["frpplans9", "frpplans12", "frpplans18"],
    mhk: ["frpplans9", "frpplans12"],
    ru1: ["frpplans11", "frpplans13"],
    lit1: ["frpplans11", "frpplans13"],
    astr: ["frpplans13"]
  };

  const files = new Map();   // файл -> Promise<boolean>
  const done = new Set();    // предметы, чья программа уже загружена
  const listeners = [];      // кто хочет узнать о загрузке

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
    if (!list) { done.add(subject); return true; } // русский и литература 5–11 — данные в data/frp.js
    for (const name of list) {
      const ok = await load(name);
      if (!ok) return false;
    }
    /* модули-«доработки» дописывают разделы после базовых: убеждаемся,
       что данные действительно применились, прежде чем считать предмет готовым */
    applyExtras();
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
