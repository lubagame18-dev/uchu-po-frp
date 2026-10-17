/* ===================================================================
   «Учу по ФРП» — видеофрагменты в презентации.
   • Ссылка на RuTube, VK Видео, YouTube или файл (Викисклад, .mp4/.webm)
     + начало и конец: фрагмент проигрывается только с нужной секунды
     до нужной — вырезать и скачивать ничего не нужно.
   • Поиск: кнопки RuTube / VK Видео / YouTube / Культура.РФ по запросу
     (например, «Мцыри экранизация фрагмент»); архивные видео со
     свободной лицензией — прямо из Викисклада, их можно и скачать.
   • В показе — встроенный плеер; в PowerPoint видео YouTube вставляется
     в слайд, остальные — кнопкой-ссылкой «▶ Смотреть фрагмент».
   =================================================================== */
const VideoKit = (() => {
  "use strict";
  const sec = t => { const s = String(t ?? "").trim(); if (!s) return 0; if (/^\d+$/.test(s)) return +s; const p = s.split(/[:.]/).map(Number); return p.reduce((a, x) => a * 60 + (x || 0), 0); };
  const hms = n => { n = Math.max(0, Math.round(+n || 0)); const h = Math.floor(n / 3600), m = Math.floor(n % 3600 / 60), s = n % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0"); };
  function parse(url) {
    const u = String(url || "").trim(); let m;
    if ((m = u.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/))) return { kind: "youtube", id: m[1] };
    if ((m = u.match(/rutube\.ru\/(?:video|play\/embed|shorts)\/([\w]{16,})/))) return { kind: "rutube", id: m[1] };
    if ((m = u.match(/(?:vk\.com|vkvideo\.ru|vk\.ru)\/(?:.*[?&]z=)?video(-?\d+)_(\d+)/))) return { kind: "vk", oid: m[1], id: m[2] };
    if ((m = u.match(/[?&]oid=(-?\d+)&id=(\d+)/)) && /vk/.test(u)) return { kind: "vk", oid: m[1], id: m[2] };
    if ((m = u.match(/commons\.wikimedia\.org\/wiki\/(File:[^?#]+)/))) return { kind: "file", src: "https://commons.wikimedia.org/wiki/Special:FilePath/" + m[1].slice(5), page: u };
    if (/^https?:\/\/\S+\.(mp4|webm|ogv|ogg|mov)(\?|#|$)/i.test(u)) return { kind: "file", src: u };
    return null;
  }
  function embed(v) {
    const p = parse(v.u); if (!p) return null; const s = sec(v.s), e = sec(v.e);
    if (p.kind === "youtube") return `https://www.youtube-nocookie.com/embed/${p.id}?rel=0&modestbranding=1${s ? "&start=" + s : ""}${e ? "&end=" + e : ""}`;
    if (p.kind === "rutube") return `https://rutube.ru/play/embed/${p.id}/?${s ? "t=" + s : ""}${e ? "&stopTime=" + e : ""}`;
    if (p.kind === "vk") return `https://vkvideo.ru/video_ext.php?oid=${p.oid}&id=${p.id}&hd=2${s ? "&t=" + s + "s" : ""}`;
    return null;
  }
  function watchUrl(v) {
    const p = parse(v.u); if (!p) return v.u || ""; const s = sec(v.s);
    if (p.kind === "youtube") return `https://www.youtube.com/watch?v=${p.id}${s ? "&t=" + s + "s" : ""}`;
    if (p.kind === "rutube") return `https://rutube.ru/video/${p.id}/${s ? "?t=" + s : ""}`;
    if (p.kind === "vk") return `https://vkvideo.ru/video${p.oid}_${p.id}${s ? "?t=" + Math.floor(s / 60) + "m" + (s % 60) + "s" : ""}`;
    return p.page || p.src;
  }
  const thumb = v => { const p = parse(v.u); return v.th || (p?.kind === "youtube" ? `https://i.ytimg.com/vi/${p.id}/hqdefault.jpg` : ""); };
  const span = v => (sec(v.s) || sec(v.e)) ? `${hms(sec(v.s))}${sec(v.e) ? "–" + hms(sec(v.e)) : ""}` : "";
  const SITE = { youtube: "YouTube", rutube: "RuTube", vk: "VK Видео", file: "Викисклад / файл" };
  /* Плеер: сначала обложка (лёгкая), по щелчку — встроенный плеер */
  function html(v) {
    if (!v?.u) return `<div class="sx-video empty" data-q="${esc(v?.q || "")}"><div class="vposter"><b>▶</b><span>Видеофрагмент: вставьте ссылку и время</span><small>«⋯» → «Видео» или кнопка «▶ Видео» слева</small></div></div>`;
    const p = parse(v.u), em = embed(v), th = thumb(v), sp = span(v);
    const fileSrc = p?.kind === "file" ? p.src + (sec(v.s) || sec(v.e) ? `#t=${sec(v.s)}${sec(v.e) ? "," + sec(v.e) : ""}` : "") : "";
    return `<div class="sx-video" data-embed="${esc(em || "")}" data-file="${esc(fileSrc)}" data-watch="${esc(watchUrl(v))}" data-span="${esc(sp)}" data-site="${esc(SITE[p?.kind] || "")}"><a class="vposter" href="${esc(watchUrl(v))}" target="_blank" rel="noopener">${th ? `<img src="${esc(th)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}<b>▶</b><span>${esc(v.c || "Видеофрагмент")}${sp ? ` · ${sp}` : ""}</span><small>${esc(SITE[p?.kind] || "")}</small></a></div>`;
  }
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  /* Включить плеер на месте обложки (в редакторе и в показе) */
  function play(box) {
    const em = box.dataset.embed, f = box.dataset.file;
    if (em) box.innerHTML = `<iframe src="${esc(em)}${em.includes("?") ? "&" : "?"}autoplay=1" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    else if (f) box.innerHTML = `<video src="${esc(f)}" controls autoplay playsinline></video>`;
    else return false;
    return true;
  }
  function bind(root) {
    root.querySelectorAll(".sx-video:not(.empty) .vposter").forEach(a => a.addEventListener("click", e => { const box = a.closest(".sx-video"); if (play(box)) e.preventDefault(); }));
  }
  /* Скрипт для показа (выгруженный HTML) */
  const SHOW_JS = `document.querySelectorAll('.sx-video:not(.empty) .vposter').forEach(a=>a.addEventListener('click',e=>{const b=a.closest('.sx-video'),em=b.dataset.embed,f=b.dataset.file;if(em){b.innerHTML='<iframe src="'+em+(em.includes('?')?'&':'?')+'autoplay=1" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>';e.preventDefault();}else if(f){b.innerHTML='<video src="'+f+'" controls autoplay></video>';e.preventDefault();}}));`;

  /* ---------- поиск ---------- */
  function searchLinks(q) {
    const e = encodeURIComponent(q);
    return [
      ["RuTube", `https://rutube.ru/search/?query=${e}`],
      ["VK Видео", `https://vkvideo.ru/?q=${e}`],
      ["YouTube", `https://www.youtube.com/results?search_query=${e}`],
      ["Культура.РФ", `https://www.culture.ru/search?query=${encodeURIComponent(q.replace(/\s*(экранизация|фрагмент|фильм)\s*/gi, " ").trim())}`],
      ["Викисклад (свободные видео)", `https://commons.wikimedia.org/w/index.php?search=${e}+filetype%3Avideo&ns6=1`]
    ];
  }
  async function commons(q, limit = 12) {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=${limit}&gsrsearch=${encodeURIComponent(q + " filetype:video")}&prop=imageinfo&iiprop=url|mime|size&iiurlwidth=320`;
    try {
      const j = await (await fetch(url)).json();
      return Object.values(j.query?.pages || {}).map(p => ({ title: p.title.replace(/^File:|\.\w+$/g, "").replace(/_/g, " "), page: p.imageinfo?.[0]?.descriptionurl, src: p.imageinfo?.[0]?.url, th: p.imageinfo?.[0]?.thumburl, dur: p.imageinfo?.[0]?.duration })).filter(x => x.src);
    } catch { return []; }
  }

  /* ---------- окно «Видеофрагмент» ---------- */
  function openDialog({ q = "", v = {}, onDone }) {
    const m = openModal(`<div class="dialog wide"><div class="dlg-h"><h2>▶ Видеофрагмент</h2><button class="btn ghost x" data-close aria-label="Закрыть">×</button></div>
      <div class="dlg-b vk-dlg">
        <p class="hint">Найдите фрагмент (экранизация, спектакль, чтение актёром, хроника), скопируйте ссылку и укажите начало и конец — <b>вырезать и скачивать не нужно</b>: в показе проиграется только этот отрезок.</p>
        <div class="vk-search"><input type="text" id="vkQ" value="${esc(q)}" aria-label="Что ищем"><span class="vk-links" id="vkLinks"></span></div>
        <div class="vk-row"><label>Ссылка на видео <input type="url" id="vkU" placeholder="https://rutube.ru/video/… или vkvideo.ru/video-… или youtube.com/watch?v=…" value="${esc(v.u || "")}"></label></div>
        <div class="vk-row"><label>Начало <input type="text" id="vkS" placeholder="1:20" value="${esc(v.s || "")}" inputmode="numeric"></label><label>Конец <input type="text" id="vkE" placeholder="3:05" value="${esc(v.e || "")}" inputmode="numeric"></label><label class="grow">Подпись <input type="text" id="vkC" placeholder="Например: «Мцыри», фильм 1985 г., фрагмент" value="${esc(v.c || "")}"></label></div>
        <div id="vkPrev" class="vk-prev"></div>
        <details class="vk-cm" open><summary>Свободные архивные видео (Викисклад) — можно и скачать</summary><div id="vkCm" class="vk-grid"><p class="small">Ищу…</p></div></details>
        <p class="small">PowerPoint: видео с YouTube встанет в слайд и будет играть с указанной секунды; RuTube и VK — кнопкой-ссылкой «▶ Смотреть фрагмент». Скачивайте только то, что разрешено правообладателем (например, видео Викисклада).</p>
        <div class="pk-foot"><button class="btn flame" id="vkOk">Вставить на слайд</button><span class="small" id="vkMsg"></span></div>
      </div></div>`);
    const $m = s => m.querySelector(s);
    const links = () => { $m("#vkLinks").innerHTML = searchLinks($m("#vkQ").value.trim() || q).map(([n, u]) => `<a class="btn sm ghost" href="${esc(u)}" target="_blank" rel="noopener">🔎 ${esc(n)}</a>`).join(""); };
    const cur = () => ({ u: $m("#vkU").value.trim(), s: $m("#vkS").value.trim(), e: $m("#vkE").value.trim(), c: $m("#vkC").value.trim(), th: $m("#vkU").dataset.th || "" });
    const prev = () => { const v2 = cur(); const ok = parse(v2.u); $m("#vkMsg").textContent = v2.u && !ok ? "Не узнаю ссылку: подходят RuTube, VK Видео, YouTube, Викисклад или прямая ссылка на .mp4/.webm." : ""; $m("#vkPrev").innerHTML = ok ? `<div class="sx">${html(v2)}</div>` : ""; bind($m("#vkPrev")); };
    const cm = async () => {
      const box = $m("#vkCm"); box.innerHTML = `<p class="small">Ищу…</p>`;
      const qq = ($m("#vkQ").value.trim() || q).replace(/\s*(экранизация|фрагмент|фильм)\s*/gi, " ").trim();
      const res = await commons(qq);
      box.innerHTML = res.length ? res.map((r, i) => `<button class="vk-it" data-i="${i}">${r.th ? `<img src="${esc(r.th)}" alt="">` : "<span>▶</span>"}<small>${esc(r.title.slice(0, 70))}${r.dur ? " · " + hms(r.dur) : ""}</small></button>`).join("") + "" : `<p class="small">На Викискладе по запросу «${esc(qq)}» видео нет — воспользуйтесь кнопками поиска выше.</p>`;
      box.querySelectorAll(".vk-it").forEach(b => b.onclick = () => { const r = res[+b.dataset.i]; $m("#vkU").value = r.page || r.src; $m("#vkU").dataset.th = r.th || ""; if (!$m("#vkC").value) $m("#vkC").value = r.title + " (Викисклад)"; prev(); box.querySelectorAll(".vk-it").forEach(x => x.classList.toggle("on", x === b)); $m("#vkMsg").innerHTML = `Свободная лицензия. <a href="${esc(r.src)}" download target="_blank" rel="noopener">⬇ Скачать файл</a>`; });
    };
    links(); prev(); cm();
    let t; $m("#vkQ").oninput = () => { links(); clearTimeout(t); t = setTimeout(cm, 700); };
    ["#vkU", "#vkS", "#vkE", "#vkC"].forEach(s => $m(s).oninput = prev);
    $m("#vkOk").onclick = () => { const v2 = cur(); if (!parse(v2.u)) { $m("#vkMsg").textContent = "Сначала вставьте ссылку на видео."; return; } closeModal(); onDone?.({ ...v2, q: $m("#vkQ").value.trim() }); };
  }
  return { parse, embed, watchUrl, thumb, html, play, bind, SHOW_JS, searchLinks, commons, openDialog, sec, hms, span };
})();
window.VideoKit = VideoKit;
