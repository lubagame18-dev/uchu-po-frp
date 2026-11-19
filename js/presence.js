/* Онлайн-статус: лёгкий heartbeat раз в минуту, только для вошедшего пользователя.
   Сервер пишет отметку в закрытую коллекцию login_state; админка читает её через owner-endpoint. */
(() => {
  "use strict";
  const cfg = () => window.AccountsBackend?.config?.() || {};
  const session = () => { try { return JSON.parse(localStorage.getItem("uchu:account") || "null"); } catch { return null; } };
  const save = s => { try { localStorage.setItem("uchu:account", JSON.stringify(s)); } catch { } };
  let timer = null, busy = false, last = 0;

  async function refresh(s) {
    if (!s?.refresh) return false;
    const c = cfg(); if (!c.url) return false;
    try {
      const r = await fetch(c.url + "/auth/v1/token?grant_type=refresh_token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: s.refresh }) });
      if (!r.ok) return false;
      const j = await r.json();
      s.access = j.access_token; s.refresh = j.refresh_token || s.refresh; s.exp = Date.now() + (j.expires_in || 3600) * 1000;
      save(s); return true;
    } catch { return false; }
  }

  async function ping(force = false) {
    const s = session(); const c = cfg();
    if (!s?.access || !c.url || busy) return;
    if (!force && document.visibilityState === "hidden") return;
    if (!force && Date.now() - last < 45000) return;
    busy = true;
    try {
      const send = () => fetch(c.url + "/presence/v1/ping", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + s.access }, body: "{}" });
      let r = await send();
      if (r.status === 401 && await refresh(s)) r = await send();
      if (r.ok) last = Date.now();
    } catch { }
    finally { busy = false; }
  }

  function start() {
    stop();
    ping(true);
    timer = setInterval(() => ping(false), 60000);
  }
  function stop() { if (timer) clearInterval(timer); timer = null; }

  document.addEventListener("uchu:auth", () => { if (session()?.access) start(); else stop(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") ping(true); });
  window.addEventListener("focus", () => ping(true));
  if (session()?.access) start();
  window.Presence = { ping, start, stop };
})();
