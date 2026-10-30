/* «Учу по ФРП» — ленивая загрузка предметных модулей.
   Раньше математика, история, английский, биология, физика, химия,
   обществознание и информатика грузили свои данные (всего ~3,4 МБ)
   при открытии сайта. Теперь модули подгружаются при выборе предмета
   и кешируются сервис-воркером: после первого открытия предмет
   работает без интернета. */
window.Kits = (() => {
  "use strict";

  const MAP = {
    math: ["mathsecondary", "mathprimary", "mathkit"],
  ru1: ["ruprimary"],
  okr: ["frpkit", "okrprimary"],
  izo: ["izoprimary", "frpkit", "speciallocal"],
  mus: ["musicprimary", "frpkit", "speciallocal"],
  tech: ["techprimary", "frpkit", "speciallocal"],
  pe: ["frpkit", "speciallocal"],
  orkse: ["orkseprimary", "frpkit", "speciallocal"],
  obzh: ["frpkit", "speciallocal"],
  astr: ["frpkit", "speciallocal"],
  vis: ["frpkit", "speciallocal"],
  mhk: ["frpkit", "speciallocal"],
  lit1: ["litprimary", "ruprimary"],
    hist: ["histdata", "histlessons", "histkit"],
    eng: ["engprimary", "engdata", "engkit", "engsec"],
    bio: ["biolessons", "biokit", "biosec"],
    geo: ["geomethod", "frpkit", "geosec"],
    phys: ["phydata", "phymethod"],
    chem: ["chemdata", "chemmethod"],
    soc: ["socdata", "socmethod"],
    inf: ["infgen", "infdata", "infmethod"]
  };

  const VER = (window.UCHU_VER || "5.300");
  const files = new Map();   // файл -> Promise<boolean>
  const done = new Set();
  const listeners = [];

  function load(name) {
    if (files.has(name)) return files.get(name);
    const p = new Promise(resolve => {
      const s = document.createElement("script");
      s.src = "js/" + name + ".js?v=" + encodeURIComponent(VER);
      s.async = true;
      s.onload = () => resolve(true);
      s.onerror = () => { files.delete(name); resolve(false); };
      document.head.appendChild(s);
    });
    files.set(name, p);
    return p;
  }

  /* ожидаемый объект модуля: позволяет убедиться, что он действительно применился */
  const EXPECT = {
    math: () => window.MathKit,
    hist: () => window.HistKit,
    eng: () => window.EngKit,
    bio: () => window.BioKit,
    geo: () => window.GeoMethod,
    phys: () => window.PhyMethod,
    chem: () => window.ChemMethod,
    soc: () => window.SocMethod,
    inf: () => window.InfMethod
  };

  async function ensure(subject) {
    if (done.has(subject)) return true;
    const list = MAP[subject];
    if (!list) { done.add(subject); return true; }
    for (const name of list) {
      const ok = await load(name);
      if (!ok) return false;
    }
    const check = EXPECT[subject];
    if (check && !check()) await new Promise(r => setTimeout(r, 80));
    if (check && !check()) return false;
    done.add(subject);
    listeners.forEach(fn => { try { fn(subject); } catch (e) { } });
    return true;
  }

  const pending = subject => !!MAP[subject] && !done.has(subject);
  const ensureAll = () => Object.keys(MAP).reduce((p, s) => p.then(() => ensure(s)), Promise.resolve(true));
  const onChange = fn => { if (typeof fn === "function") listeners.push(fn); };

  return { ensure, ensureAll, pending, onChange, MAP };
})();
