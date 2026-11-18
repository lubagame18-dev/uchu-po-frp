/* «Учу по ФРП» — вставка культурных материалов в слайд: аудио и живопись. */
(function () {
  "use strict";
  const C = window.UCHU_CULTURE || { audio: [], paintings: [] };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function close() { const r = document.getElementById("cultureModal"); if (r) r.remove(); }
  function open(html) {
    close();
    const r = document.createElement("div");
    r.id = "cultureModal";
    r.className = "modal";
    r.setAttribute("role", "dialog");
    r.setAttribute("aria-modal", "true");
    r.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(20,16,28,.55);padding:18px";
    r.innerHTML = html;
    r.addEventListener("click", e => { if (e.target === r || e.target.closest("[data-close]")) close(); });
    document.body.appendChild(r);
    return r;
  }

  function openAudio() {
    if (!C.audio.length) { window.toast?.("Аудиотека пока пуста."); return; }
    const body = C.audio.map((a, i) => `<button type="button" data-a="${i}" style="display:block;width:100%;text-align:left;margin:6px 0;padding:10px 12px;border:1.5px solid #1a1a1a;border-radius:10px;background:#fff;font:16px/1.35 'Times New Roman',serif"><b>🎧 ${esc(a.title)}</b><br><span class="small" style="font:12px/1.35 Arial,sans-serif;color:#666">${esc(a.excerpt || "")} · ${esc(a.license || "")} · ${esc(a.source || "")}</span></button>`).join("");
    const r = open(`<div class="dialog" style="max-width:560px;width:100%;background:#fff;border:2px solid #1a1a1a;border-radius:16px;padding:16px">
      <div class="dlg-h" style="display:flex;justify-content:space-between;align-items:center;gap:10px"><h2 style="margin:0">Аудио для урока</h2><button class="btn ghost" data-close type="button">×</button></div>
      <p class="hint">Фрагмент вставится на текущий слайд. В PowerPoint будет встроен звук — учителю не нужно ничего петь.</p>
      ${body}
      <p class="small">Источники и лицензии указаны на слайде. Музыка — public domain / CC.</p>
    </div>`);
    r.querySelectorAll("[data-a]").forEach(b => b.onclick = () => {
      const a = C.audio[+b.dataset.a];
      window.SlideEditor?.addAudio?.(a);
      close();
      window.toast?.("Аудио вставлено на слайд. В PPTX звук встроится автоматически.", 5000);
    });
  }

  function openPaintings() {
    if (!C.paintings.length) { window.toast?.("Коллекция живописи пока пуста."); return; }
    const body = C.paintings.map((p, i) => `<button type="button" data-p="${i}" style="display:block;width:100%;text-align:left;margin:6px 0;padding:8px 10px;border:1.5px solid #1a1a1a;border-radius:10px;background:#fff;font:16px/1.35 'Times New Roman',serif"><img src="${esc(p.file)}" alt="" style="width:100%;max-height:110px;object-fit:cover;border-radius:6px;margin-bottom:6px"><b>🖼 ${esc(p.title)}</b><br><span class="small" style="font:12px/1.35 Arial,sans-serif;color:#666">${esc(p.author || "")}${p.year ? ", " + esc(p.year) : ""} · ${esc(p.license || "")}</span></button>`).join("");
    const r = open(`<div class="dialog" style="max-width:620px;width:100%;background:#fff;border:2px solid #1a1a1a;border-radius:16px;padding:16px">
      <div class="dlg-h" style="display:flex;justify-content:space-between;align-items:center;gap:10px"><h2 style="margin:0">Живопись для урока</h2><button class="btn ghost" data-close type="button">×</button></div>
      <p class="hint">Репродукция вставится на текущий слайд как картинка. Подпись и автор сохранятся.</p>
      ${body}
      <p class="small">Только public domain; источник — Wikimedia Commons.</p>
    </div>`);
    r.querySelectorAll("[data-p]").forEach(b => b.onclick = () => {
      const p = C.paintings[+b.dataset.p];
      window.SlideEditor?.insertImage?.(`${p.title} — ${p.author || ""}${p.year ? ", " + p.year : ""}`, p.file);
      close();
      window.toast?.("Картина вставлена на слайд.", 4000);
    });
  }

  window.Culture = { openAudio, openPaintings, audio: C.audio, paintings: C.paintings };
})();
