/* ===================================================================
   «Учу по ФРП» — публикация в общую базу прямо из режима разработчика.
   Раньше: скачать extra.js / frp.js → открыть GitHub → загрузить файл.
   Теперь: материал встраивается и сразу сохраняется в репозиторий сайта
   (папка data/) через GitHub API. Через 1–2 минуты GitHub Pages обновляет
   сайт, и материал есть у всех учителей; система сама переучивается
   на новых файлах при следующем открытии сайта.
   Нужен токен GitHub с правом записи только в этот репозиторий. Токен
   хранится в браузере разработчика и никуда, кроме api.github.com, не уходит.
   =================================================================== */
const Publish = (() => {
  "use strict";
  const KEY = "uchu:gh";
  const API = "https://api.github.com";
  /* Владелец и имя репозитория по адресу сайта: <логин>.github.io/<репозиторий>/ */
  function detect() {
    const m = location.hostname.match(/^([\w-]+)\.github\.io$/i);
    if (!m) return { owner: "", repo: "" };
    const seg = location.pathname.split("/").filter(Boolean)[0];
    return { owner: m[1], repo: seg && !/\.html?$/.test(seg) ? decodeURIComponent(seg) : `${m[1]}.github.io` };
  }
  function cfg() { let c = {}; try { c = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { } const d = detect(); return { owner: c.owner || d.owner, repo: c.repo || d.repo, branch: c.branch || "main", token: c.token || "", auto: c.auto !== false }; }
  function save(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { } }
  const ready = () => { const c = cfg(); return !!(c.owner && c.repo && c.token); };

  async function api(path, opts = {}) {
    const c = cfg();
    const r = await fetch(API + path, { ...opts, headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", Authorization: "Bearer " + c.token, ...(opts.body ? { "Content-Type": "application/json" } : {}), ...(opts.headers || {}) } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.message || "GitHub ответил " + r.status), { status: r.status });
    return j;
  }
  const repoPath = () => { const c = cfg(); return `/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}`; };
  function b64(str) { const bytes = new TextEncoder().encode(str); let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }

  /* Проверка доступа: есть ли право записи в репозиторий */
  async function check() {
    const j = await api(repoPath());
    if (!j.permissions?.push) throw new Error("токен не даёт права записи в этот репозиторий (нужно Contents: Read and write)");
    return { name: j.full_name, branch: j.default_branch };
  }
  /* Один коммит с несколькими файлами (Git Data API: работает и для больших файлов) */
  async function commit(files, message) {
    const c = cfg(), R = repoPath();
    const ref = await api(`${R}/git/ref/heads/${encodeURIComponent(c.branch)}`);
    const head = ref.object.sha;
    const base = await api(`${R}/git/commits/${head}`);
    const tree = [];
    for (const f of files) {
      const blob = await api(`${R}/git/blobs`, { method: "POST", body: JSON.stringify({ content: b64(f.content), encoding: "base64" }) });
      tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
    }
    const t = await api(`${R}/git/trees`, { method: "POST", body: JSON.stringify({ base_tree: base.tree.sha, tree }) });
    const cm = await api(`${R}/git/commits`, { method: "POST", body: JSON.stringify({ message, tree: t.sha, parents: [head] }) });
    await api(`${R}/git/refs/heads/${encodeURIComponent(c.branch)}`, { method: "PATCH", body: JSON.stringify({ sha: cm.sha }) });
    if (window.Log) Log.add("публикация", `${message} (${files.map(f => f.path).join(", ")})`);
    return cm.sha;
  }
  const dataJs = (varName, obj) => `/* «Учу по ФРП»: файл для папки data/ (опубликован из режима разработчика ${new Date().toLocaleString("ru-RU")}). */\nwindow.${varName} = ${JSON.stringify(obj)};\n`;

  /* Опубликовать файл data/<name>; при сбое — обычное скачивание, чтобы файл не потерялся */
  let busy = false;
  async function publishData(name, varName, obj, message) {
    if (!ready()) return false;
    if (busy) { toast("Публикация уже идёт, подождите."); return true; }
    busy = true; toast("Публикую в репозиторий сайта…", 30000);
    try {
      await commit([{ path: "data/" + name, content: dataJs(varName, obj) }], message || `Обновление базы: ${name}`);
      toast(`Опубликовано: data/${name}. Через 1–2 минуты обновление появится на сайте у всех учителей.`, 9000);
      setStatus(`✓ ${new Date().toLocaleTimeString("ru-RU")}: опубликован data/${name}`);
      return true;
    } catch (e) {
      toast(`Не удалось опубликовать (${e.message}). Файл ${name} скачан — его можно загрузить на GitHub вручную.`, 10000);
      setStatus(`✗ ${e.message}`);
      return false;
    } finally { busy = false; }
  }
  let lastStatus = "";
  function setStatus(t) { lastStatus = t; const el = document.getElementById("ghSt"); if (el) el.textContent = t; }

  /* Подмена скачивания data-файлов: в режиме разработчика с токеном файл сразу публикуется */
  const origDownload = window.downloadDataJs;
  window.downloadDataJs = async (name, varName, obj) => {
    if (window.Dev?.on && ready()) { const ok = await publishData(name, varName, obj); if (ok) return; }
    return origDownload(name, varName, obj);
  };

  /* Автоматически: после загрузки материалов или ФРП в режиме разработчика база публикуется сама */
  let timer = null;
  function schedule(what) {
    if (!window.Dev?.on || !ready() || !cfg().auto) return;
    clearTimeout(timer);
    timer = setTimeout(() => { if (what === "frp" && typeof embedFrp === "function") embedFrp(); else if (window.Dev?.publishBase) Dev.publishBase(); }, 1500);
  }
  const origAdd = window.addMaterials;
  window.addMaterials = async (list, forceKind) => { const r = await origAdd(list, forceKind); schedule(forceKind === "frp" ? "frp" : "extra"); return r; };
  const origFrp = window.loadFrpFrom;
  window.loadFrpFrom = async (...a) => { const r = await origFrp(...a); schedule("frp"); return r; };

  /* Панель настроек в режиме разработчика */
  function panel(box) {
    const c = cfg();
    box.innerHTML = `<h2>Публикация на сайт (без ручной загрузки на GitHub)</h2>
      <p class="hint">Один раз вставьте токен GitHub — и всё, что вы встраиваете в режиме разработчика (материалы, файлы от пользователей, ФРП), сразу сохраняется в папку <code>data</code> репозитория. Через 1–2 минуты сайт обновится у всех, система переучится сама.</p>
      <div class="row2"><div class="field"><label for="ghOwner">Владелец (логин GitHub)</label><input type="text" id="ghOwner" value="${esc(c.owner)}" spellcheck="false"></div><div class="field"><label for="ghRepo">Репозиторий</label><input type="text" id="ghRepo" value="${esc(c.repo)}" spellcheck="false"></div></div>
      <div class="row2"><div class="field"><label for="ghBranch">Ветка</label><input type="text" id="ghBranch" value="${esc(c.branch)}" spellcheck="false"></div><div class="field"><label for="ghToken">Токен GitHub</label><input type="password" id="ghToken" value="${esc(c.token)}" autocomplete="off" placeholder="github_pat_…"></div></div>
      <label class="check"><input type="checkbox" id="ghAuto" ${c.auto ? "checked" : ""}> Публиковать автоматически после каждой загрузки материалов и ФРП в режиме разработчика</label>
      <div class="mat-row"><button class="btn sm flame" id="ghSave">Сохранить и проверить доступ</button><button class="btn sm ghost" id="ghNow">Опубликовать базу сейчас</button><span class="small" id="ghSt">${esc(lastStatus || (ready() ? "токен сохранён" : "токен не задан — пока файлы скачиваются, как раньше"))}</span></div>
      <details><summary>Как получить токен (2 минуты)</summary><ol>
        <li>github.com → аватар справа вверху → <b>Settings</b> → внизу слева <b>Developer settings</b> → <b>Personal access tokens</b> → <b>Fine-grained tokens</b> → <b>Generate new token</b>.</li>
        <li>Token name: «Учу по ФРП». Expiration: на ваш выбор (например, 1 год).</li>
        <li>Repository access: <b>Only select repositories</b> → выберите репозиторий сайта.</li>
        <li>Permissions → Repository permissions → <b>Contents: Read and write</b>.</li>
        <li><b>Generate token</b> → скопируйте его (начинается с <code>github_pat_</code>) и вставьте сюда.</li></ol>
        <p class="hint">Токен хранится только в этом браузере. Не вставляйте его на других сайтах и не публикуйте.</p></details>`;
    const $b = s => box.querySelector(s);
    const collect = () => ({ owner: $b("#ghOwner").value.trim(), repo: $b("#ghRepo").value.trim(), branch: $b("#ghBranch").value.trim() || "main", token: $b("#ghToken").value.trim(), auto: $b("#ghAuto").checked });
    $b("#ghSave").onclick = async () => { save(collect()); setStatus("Проверяю…"); try { const r = await check(); setStatus(`✓ Доступ есть: ${r.name}, ветка по умолчанию ${r.branch}.`); } catch (e) { setStatus("✗ " + e.message); } };
    $b("#ghAuto").onchange = () => save(collect());
    $b("#ghNow").onclick = async () => { save(collect()); if (!ready()) { setStatus("Сначала вставьте токен."); return; } if (window.Dev?.publishBase) await Dev.publishBase(); };
  }
  return { cfg, save, ready, check, commit, publishData, panel, detect };
})();
window.Publish = Publish;
