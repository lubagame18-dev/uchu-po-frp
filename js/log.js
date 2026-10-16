/* ===================================================================
   «Учу по ФРП» — журнал событий (виден в режиме разработчика → «Логи»).
   Пишет: ошибки страницы, сообщения пользователю, переключения нейросетей,
   сборку уроков, отправку материалов. Хранится в браузере, последние 300 записей.
   =================================================================== */
const Log = (() => {
  "use strict";
  const KEY = "uchu:log", MAX = 300;
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
  function add(type, text, data) {
    const arr = read(); arr.push({ at: new Date().toISOString(), type, text: String(text).slice(0, 500), ...(data ? { data } : {}) });
    while (arr.length > MAX) arr.shift();
    try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch { }
  }
  window.addEventListener("error", e => add("ошибка", `${e.message} (${(e.filename || "").split("/").pop()}:${e.lineno})`));
  window.addEventListener("unhandledrejection", e => add("ошибка", "необработанный отказ: " + (e.reason?.message || e.reason?.code || String(e.reason)).slice(0, 300)));
  // сообщения пользователю тоже попадают в журнал
  if (typeof toast === "function") { const orig = toast; window.toast = (msg, ms) => { add("сообщение", msg); return orig(msg, ms); }; }
  return { add, read, clear() { try { localStorage.removeItem(KEY); } catch { } } };
})();
window.Log = Log;
