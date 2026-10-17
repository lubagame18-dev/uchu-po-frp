/* ===================================================================
   «Учу по ФРП» — общая база материалов в облаке.
   Материал, загруженный в режиме разработчика, сразу попадает в облако (таблица
   base_materials) и становится частью сайта для всех учителей — без одобрения
   и без публикации на GitHub. Каждый посетитель подтягивает новые материалы сам
   (только изменённые), копия хранится в браузере и работает без интернета.
   Читать может любой; добавлять и удалять — только разработчики (site_admins).
   =================================================================== */
const CloudBase = (() => {
  "use strict";
  const C = () => window.UCHU_SITE?.cloud || {};
  const ok = () => !!(C().url && C().anonKey);
  let cache = { items: [] }, loaded = false;
  async function rest(path, opt = {}) {
    const tok = window.Account?.session?.access;
    const r = await fetch(C().url.replace(/\/+$/, "") + path, { ...opt, headers: { apikey: C().anonKey, Authorization: "Bearer " + (tok || C().anonKey), "Content-Type": "application/json", ...(opt.headers || {}) } });
    const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch { }
    if (!r.ok) throw new Error(j?.message || j?.error || "HTTP " + r.status);
    return j;
  }
  async function load() { if (loaded) return; loaded = true; try { cache = (await Store.get("kv", "cloudbase")) || cache; } catch { } }
  const keep = () => Store.put("kv", "cloudbase", cache).catch(() => null);
  const items = () => cache.items.map(m => ({ ...m, builtin: true, cloud: true }));
  async function refreshUi() {
    try { await loadMaterials(); if (typeof refreshTopics === "function") refreshTopics(); if (state.view === "materials") renderMaterials(); } catch (e) { console.warn(e); }
  }
  /* подтянуть новое и убрать удалённое */
  let busy = false;
  async function sync() {
    if (!ok() || busy) return 0; busy = true;
    try {
      await load();
      const list = await rest("/rest/v1/base_materials?select=id,updated_at&limit=5000") || [];
      const have = new Map(cache.items.map(m => [m.id, m]));
      const need = list.filter(r => !have.has(r.id) || String(have.get(r.id).updated_at) < String(r.updated_at)).map(r => r.id);
      const fresh = new Map();
      for (let i = 0; i < need.length; i += 15) {
        const part = need.slice(i, i + 15).map(id => `"${String(id).replace(/"/g, "")}"`).join(",");
        for (const m of await rest(`/rest/v1/base_materials?select=*&id=in.(${encodeURIComponent(part)})`) || []) fresh.set(m.id, m);
      }
      const next = list.map(r => fresh.get(r.id) || have.get(r.id)).filter(Boolean);
      const changed = need.length || next.length !== cache.items.length;
      cache = { items: next, at: new Date().toISOString() };
      if (changed) { await keep(); await refreshUi(); }
      return need.length;
    } catch (e) { console.warn("cloudbase", e.message); return 0; }
    finally { busy = false; }
  }
  /* разработчик: материал — сразу в общую базу */
  async function publish(m) {
    if (!ok() || !window.Account?.session || !(m.text || "").trim()) return false;
    const row = { id: "cb_" + String(m.hash || m.id), name: m.name, title: m.title || null, kind: m.kind || null, type: m.type || null, subject: m.subject || "ru", grade: Number.isFinite(+m.grade) && m.grade ? +m.grade : null, topic: m.topic || null, tags: m.tags || null, text: String(m.text).slice(0, 600000), chars: (m.text || "").length, hash: m.hash || null, added_by: window.Account.session.email, updated_at: new Date().toISOString() };
    await window.Account.db("/rest/v1/base_materials?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(row) });
    await load(); cache.items = cache.items.filter(x => x.id !== row.id).concat(row); await keep();
    return true;
  }
  async function unpublish(id) {
    await window.Account.db(`/rest/v1/base_materials?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
    cache.items = cache.items.filter(x => x.id !== id); await keep(); await refreshUi();
  }
  /* загруженное разработчиком раньше (только в его браузере) — тоже в общую базу */
  async function pushPending() {
    if (!window.Dev?.on || !ok() || !window.Account?.session) return 0;
    let n = 0;
    for (const m of await Store.all("materials")) {
      if (!m.devEmbed || m.cloudAt || !(m.text || "").trim()) continue;
      try { if (await publish(m)) { m.cloudAt = new Date().toISOString(); await Store.put("materials", m.id, m); n++; } } catch (e) { console.warn("cloudbase push", e.message); break; }
    }
    if (n) { await refreshUi(); toast(`В общую базу сайта отправлено материалов: ${n}.`, 5000); }
    return n;
  }
  document.addEventListener("uchu:ready", async () => { await load(); if (cache.items.length) await refreshUi(); sync(); setInterval(sync, 10 * 60e3); });
  return { sync, publish, unpublish, pushPending, items, load, get count() { return cache.items.length; } };
})();
window.CloudBase = CloudBase;
