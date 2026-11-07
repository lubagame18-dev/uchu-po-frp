(function () {
  "use strict";
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const root = new URL("../", location.href);
  const url = p => new URL(String(p).replace(/^\/+/, ""), root).href;
  let M = null, subj = null, entries = [], idx = 0;

  function md(text) {
    try { if (window.marked?.parse) return marked.parse(text); } catch { }
    return `<pre>${esc(text)}</pre>`;
  }

  function paintSubject() {
    if (!subj) return;
    entries = subj.entries || [];
    idx = 0;
    const sec = $("#kbSection"); sec.innerHTML = "";
    entries.forEach((e, i) => { const o = document.createElement("option"); o.value = String(i); o.textContent = `${i + 1}. ${e.title}`; sec.appendChild(o); });
    if (!entries.length) { sec.innerHTML = "<option>Нет таблиц</option>"; }
    $("#kbMeta").innerHTML = `<b>${esc(subj.title)}</b><br>Таблиц: ${entries.length}${subj.image_count ? `<br>Изображений: ${subj.image_count}` : ""}`;
    const list = $("#kbImageList"); list.innerHTML = "";
    entries.forEach((e, i) => {
      if (!e.image) return;
      const b = document.createElement("button"); b.type = "button"; b.title = e.title;
      b.innerHTML = `<img loading="lazy" src="${url(e.image)}" alt="">`;
      b.onclick = () => paintEntry(i);
      list.appendChild(b);
    });
    paintEntry(0);
  }

  function paintEntry(i) {
    idx = Math.max(0, Math.min(i, Math.max(0, entries.length - 1)));
    const e = entries[idx];
    if (!e) {
      $("#kbImage").removeAttribute("src");
      $("#kbCounter").textContent = "0 / 0";
      $("#kbCaption").textContent = "Для этого предмета таблицы пока не добавлены.";
      $("#kbText").innerHTML = "<p>Текст появится после добавления таблиц.</p>";
      return;
    }
    const im = $("#kbImage");
    im.onerror = () => { $("#kbCaption").textContent = "Файл изображения не найден на этом сервере. Он есть в папке knowledge-base репозитория."; };
    if (e.image) im.src = url(e.image); else im.removeAttribute("src");
    im.alt = e.title;
    $("#kbCounter").textContent = `${idx + 1} / ${entries.length}`;
    $("#kbCaption").textContent = e.title;
    const pdf = (subj.pdfs || []).map(x => x.split("/").pop()).slice(0, 2).join(" · ");
    $("#kbSource").textContent = pdf ? "Источник: " + pdf : "";
    $("#kbText").innerHTML = md(`## ${e.title}\n\n${e.text || ""}`);
    $("#kbSection").value = String(idx);
    document.querySelectorAll("#kbImageList button").forEach((b, j) => b.classList.toggle("on", j === idx));
  }

  $("#kbPrev").onclick = () => { if (entries.length) paintEntry((idx - 1 + entries.length) % entries.length); };
  $("#kbNext").onclick = () => { if (entries.length) paintEntry((idx + 1) % entries.length); };
  $("#kbSection").onchange = e => paintEntry(+e.target.value || 0);
  $("#kbSubject").onchange = e => { subj = (M.subjects || []).find(s => s.key === e.target.value); paintSubject(); };

  fetch("manifest.json", { cache: "no-store" }).then(r => r.json()).then(m => {
    M = m;
    const sel = $("#kbSubject"); sel.innerHTML = "";
    (m.subjects || []).forEach(s => { const o = document.createElement("option"); o.value = s.key; o.textContent = `${s.title} (${(s.entries || []).length})`; sel.appendChild(o); });
    subj = m.subjects?.[0]; if (subj) { sel.value = subj.key; paintSubject(); }
    else $("#kbText").innerHTML = "<p>Манифест пуст.</p>";
  }).catch(e => { $("#kbText").innerHTML = `<p>Не удалось загрузить manifest.json: ${esc(e.message)}</p>`; });
})();
