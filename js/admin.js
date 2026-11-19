/* Владельческий экран: список аккаунтов PocketBase и ручные компенсации.
   Никаких service-ключей в браузере: запросы идут с обычной сессией владельца,
   сервер PocketBase сам проверяет site_admins. */
(() => {
  "use strict";
  const $ = s => document.querySelector(s);
  const cfg = window.AccountsBackend?.config?.() || {};
  const gate = $("#gate"), app = $("#app"), list = $("#list"), msg = $("#msg"), summary = $("#summary");
  let users = [];
  const esc = x => String(x ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const session = () => { try { return JSON.parse(localStorage.getItem("uchu:account") || "null"); } catch { return null; } };
  const saveSession = s => { try { localStorage.setItem("uchu:account", JSON.stringify(s)); } catch { } };
  const login = async e => {
    e.preventDefault();
    const email = String($("#loginEmail")?.value || "").trim().toLowerCase();
    const password = String($("#loginPass")?.value || "");
    const box = $("#loginMsg");
    if (!email || !password) return;
    if (box) box.textContent = "Вхожу…";
    try {
      const r = await fetch(cfg.url + "/auth/v1/token?grant_type=password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.message || j?.msg || "Неверная почта или пароль");
      const origin = cfg.url.replace(/\/api\/uchu\/?$/, "");
      saveSession({ endpoint: origin, uid: j.user?.id || "", email: j.user?.email || email, access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (j.expires_in || 3600) * 1000, profileState: "ready" });
      if (box) box.textContent = "";
      await load();
    } catch (err) { if (box) box.textContent = err.message || String(err); }
  };
  const num = n => Number(n || 0).toLocaleString("ru-RU");
  const credits = n => { const v = Math.floor(Math.max(0, Number(n) || 0) / 9000 * 10) / 10; return v > 0 && v < 0.1 ? "<0,1 ⚡" : v.toLocaleString("ru-RU") + " ⚡"; };
  const planName = p => ({ ai: "С ИИ", aiYear: "С ИИ, год", single: "1 урок", free: "Бесплатный", promo: "Промокод", none: "Без тарифа" }[p] || p || "—");
  const date = s => { if (!s) return "—"; const d = new Date(s); return Number.isFinite(d.getTime()) ? d.toLocaleDateString("ru-RU") : "—"; };
  const api = async (path, opt = {}, retry = true) => {
    const s = session();
    if (!s?.access) { gate.hidden = false; app.hidden = true; throw new Error("Нужно войти на сайте"); }
    const r = await fetch(cfg.url + path, { ...opt, headers: { "Content-Type": "application/json", Authorization: "Bearer " + s.access, ...(opt.headers || {}) } });
    if (r.status === 401 && retry && s.refresh) {
      const rr = await fetch(cfg.url + "/auth/v1/token?grant_type=refresh_token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: s.refresh }) });
      if (rr.ok) { const j = await rr.json(); s.access = j.access_token; s.refresh = j.refresh_token || s.refresh; s.exp = Date.now() + (j.expires_in || 3600) * 1000; saveSession(s); return api(path, opt, false); }
      gate.hidden = false; app.hidden = true;
    }
    const text = await r.text(); let j = null; try { j = text ? JSON.parse(text) : null; } catch { }
    if (!r.ok) throw new Error(j?.message || j?.msg || ("HTTP " + r.status));
    return j;
  };
  const note = (text, cls = "") => { msg.innerHTML = text ? `<div class="${cls || "good"}">${esc(text)}</div>` : ""; };
  const render = () => {
    const q = ($("#q")?.value || "").trim().toLowerCase();
    const rows = users.filter(u => !q || String(u.email || "").toLowerCase().includes(q));
    const byPlan = users.reduce((a, u) => { const k = u.plan || "none"; a[k] = (a[k] || 0) + 1; return a; }, {});
    if (summary) summary.innerHTML = `Всего пользователей: <b>${num(users.length)}</b> · ${Object.entries(byPlan).map(([k, n]) => `${esc(planName(k))}: ${num(n)}`).join(" · ")}`;
    list.innerHTML = rows.length ? `<div class="card">${rows.map(u => {
      const left = Math.max(0, (+u.tokens_limit || 0) - (+u.tokens_used || 0));
      return `<div class="user" data-id="${esc(u.id)}">
        <div><div class="email">${esc(u.email || "без почты")}</div><div class="muted">${u.verified ? '<span class="pill ok">подтверждён</span>' : '<span class="pill bad">не подтверждён</span>'} ${u.created ? `<span class="muted">с ${date(u.created)}</span>` : ""}</div><div class="muted">уроков в аккаунте: ${num(u.lessons)}</div></div>
        <div><span class="pill">${esc(planName(u.plan))}</span><div class="muted">до ${date(u.paid_until)}</div></div>
        <div><b>${num(u.ai_left)}</b> <span class="muted">из ${num(u.ai_limit)}</span><div class="muted">уроков осталось</div></div>
        <div><b>${credits(left)}</b><div class="muted">токенов: ${num(u.tokens_used)} / ${num(u.tokens_limit)}</div></div>
        <div class="acts">
          <button class="btn small" data-add="1" data-kind="lesson">+1 урок</button>
          <button class="btn small" data-add="5" data-kind="lesson">+5</button>
          <button class="btn small" data-add="10" data-kind="lesson">+10</button>
          <button class="btn small" data-add="100000" data-kind="tokens">+100 тыс. ⚡</button>
          <button class="btn small" data-custom="1">Другое</button>
          <button class="btn small" data-plan="1">Тариф</button>
          <button class="btn small" data-del="1" title="Удалить аккаунт и его данные">Удалить</button>
        </div>
      </div>`;
    }).join("")}</div>` : `<div class="card empty">Пользователей не найдено.</div>`;
  };
  const load = async () => {
    note("");
    try { const j = await api("/admin/v1/users"); users = j.users || []; gate.hidden = true; app.hidden = false; render(); }
    catch (e) {
      gate.hidden = false; app.hidden = true;
      note(/404/.test(e.message) ? "Сервер ещё не обновлён: загрузите pb_hooks/uchu.js и uchu.pb.js на PocketBase и перезапустите его." : e.message, "err");
    }
  };
  const adjust = async (u, lessons, tokens, plan = "") => {
    const what = [lessons ? `${lessons} урок(ов)` : "", tokens ? `${num(tokens)} токенов` : "", plan ? `тариф «${planName(plan)}»` : ""].filter(Boolean).join(" и ");
    if (!what) return;
    if (!confirm(`Изменить ${what} для ${u.email}?`)) return;
    try { await api("/admin/v1/adjust", { method: "POST", body: JSON.stringify({ id: u.id, lessons, tokens, plan }) }); note(`Готово: ${what} для ${u.email}.`, "good"); await load(); }
    catch (e) { note("Не удалось изменить: " + e.message, "err"); }
  };
  const removeUser = async u => {
    if (!confirm(`Удалить аккаунт ${u.email}? Это удалит профиль и уроки. Действие необратимо.`)) return;
    const typed = prompt(`Для подтверждения введите почту пользователя:\n${u.email}`);
    if (typed == null) return;
    if (String(typed).trim().toLowerCase() !== String(u.email || "").toLowerCase()) { note("Почта не совпала — удаление отменено.", "err"); return; }
    try { await api("/admin/v1/delete-user", { method: "POST", body: JSON.stringify({ id: u.id, email: u.email }) }); note(`Аккаунт ${u.email} удалён.`, "good"); await load(); }
    catch (e) { note("Не удалось удалить: " + e.message, "err"); }
  };
  const changePlan = u => {
    const plan = prompt("Тариф: none, single, free, promo, ai, aiYear", u.plan || "none");
    if (plan == null) return;
    return adjust(u, 0, 0, String(plan).trim());
  };
  list.addEventListener("click", e => {
    const row = e.target.closest("[data-id]"); if (!row) return;
    const u = users.find(x => x.id === row.dataset.id); if (!u) return;
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.add) return adjust(u, b.dataset.kind === "lesson" ? +b.dataset.add : 0, b.dataset.kind === "tokens" ? +b.dataset.add : 0);
    if (b.dataset.custom) {
      const lessons = Math.max(0, Math.trunc(Number(prompt("Сколько уроков начислить? (0 — не начислять)", "1")) || 0));
      const tokens = Math.max(0, Math.trunc(Number(prompt("Сколько токенов начислить? (0 — не начислять)", "100000")) || 0));
      return adjust(u, lessons, tokens);
    }
    if (b.dataset.plan) return changePlan(u);
    if (b.dataset.del) return removeUser(u);
  });
  $("#q")?.addEventListener("input", render);
  $("#reload")?.addEventListener("click", load);
  $("#loginForm")?.addEventListener("submit", login);
  load();
})();
