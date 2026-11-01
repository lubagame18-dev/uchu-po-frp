/* ===================================================================
   «Учу по ФРП» — заметки к уроку перед сборкой (необязательно).
   Учитель может оставить промт, заметки и наблюдения, ссылки, чек-лист
   акцентов, вставить текст произведения и прикрепить файлы к уроку.
   Если что-то заполнено — это учитывается первым; если нет — урок
   собирается по базе и интернету, как обычно. Черновик сохраняется сам.
   =================================================================== */
const Notes = (() => {
  "use strict";
  const KEY = "uchu:notes-draft";
  const empty = () => ({ prompt: "", observe: "", links: "", checklist: [], text: "", files: [] });
  let draft = load();
  function load() { try { return { ...empty(), ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch { return empty(); } }
  const save = debounce5(() => { try { localStorage.setItem(KEY, JSON.stringify(draft)); } catch { toast("Черновик заметок не поместился в память браузера: уберите крупные файлы."); } paintCount(); }, 400);
  function debounce5(fn, ms) { let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; }
  const filled = () => !!(draft.prompt.trim() || draft.observe.trim() || draft.links.trim() || draft.checklist.length || draft.text.trim() || draft.files.length);

  function mount() {
    const btn = document.getElementById("btnCreate"); if (!btn || document.getElementById("notesBox")) return;
    const box = document.createElement("div");
    box.className = "notes-panel"; box.id = "notesBox";
    box.innerHTML = `<div class="np-h"><h3>🧩 Пожелания к уроку</h3><span class="small" id="nbCount"></span></div>
      <p class="np-lead">Окно всегда открыто: напишите, что важно для этого урока — класс, акцент, что сравнить, каких заданий больше. Нейросеть выполнит пожелания в первую очередь, а прикреплённые файлы и фото учебника будут реально использованы в уроке.</p>
      <textarea class="inp" id="nbPrompt" rows="3" placeholder="Например: класс слабый — больше объяснений; нужна групповая работа; сравнить с Тютчевым; больше схем и картинок"></textarea>
      <div class="np-drop" id="nbDrop">
        <span class="np-dt">Перетащите сюда файлы (Word, PDF, фото, txt) — они попадут в урок. Можно нажать кнопку.</span>
        <span class="np-actions"><label class="btn sm ghost file-btn">📎 Прикрепить файлы<input type="file" id="nbFileIn" multiple hidden></label><label class="btn sm flame file-btn" title="Сфотографируйте страницу учебника — сайт распознает задания и учтёт их в уроке">📷 Фото учебника<input type="file" id="nbPhotoIn" accept="image/*" capture="environment" multiple hidden></label><button type="button" class="btn plain" id="nbClear">Очистить</button></span>
      </div>
      <p class="small nb-photo-msg" id="nbPhotoMsg" role="status"></p>
      <div class="np-files" id="nbFiles"></div>
      <div hidden><textarea id="nbObserve"></textarea><textarea id="nbLinks"></textarea><textarea id="nbText"></textarea><div id="nbCheck"></div><input id="nbCheckIn"><button type="button" id="nbCheckAdd"></button></div>`;
    btn.parentNode.insertBefore(box, btn);
    // старое поле «Пожелания» (если осталось в разметке) скрываем: пожелания живут только здесь
    const w = document.getElementById("wishes"); if (w) { w.value = ""; w.closest(".field").hidden = true; }
    const $n = id => document.getElementById(id);
    $n("nbPrompt").value = draft.prompt; $n("nbObserve").value = draft.observe; $n("nbLinks").value = draft.links; $n("nbText").value = draft.text;
    [["nbPrompt", "prompt"], ["nbObserve", "observe"], ["nbLinks", "links"], ["nbText", "text"]].forEach(([id, k]) => $n(id).addEventListener("input", e => { draft[k] = e.target.value; save(); }));
    box.querySelectorAll("[data-nb]").forEach(b => b.onclick = () => {
      box.querySelectorAll("[data-nb]").forEach(x => x.setAttribute("aria-selected", String(x === b)));
      box.querySelectorAll(".nb-pane").forEach(p => p.hidden = p.dataset.pane !== b.dataset.nb);
    });
    const addItem = () => { const v = $n("nbCheckIn").value.trim(); if (!v) return; draft.checklist.push({ t: v, on: true }); $n("nbCheckIn").value = ""; renderCheck(); save(); };
    $n("nbCheckAdd").onclick = addItem; $n("nbCheckIn").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addItem(); } });
    /* файл → текст урока: документы читаем как раньше, картинки/фото распознаём (OCR) */
    const addFile = async (f) => {
      const isImg = /^image\//.test(f.type || "") || /\.(png|jpe?g|webp|bmp|gif|tiff?|heic)$/i.test(f.name || "");
      if (isImg && window.OCR?.text) {
        const t = await OCR.text(f);
        if (!t || t.replace(/\s/g, "").length < 20) throw new Error("на фото не удалось прочитать текст — сфотографируйте ровнее и крупнее");
        draft.files.push({ id: uid(), name: `Фото: ${f.name || "страница"}`, text: t.slice(0, 300000), chars: t.length, scanned: false, fromPhoto: true });
        return t.length;
      }
      const r = await readFile(f);
      if (r.image) throw new Error("это картинка — используйте «Фото учебника», чтобы распознать текст");
      const text = (r.text || "").slice(0, 300000);
      const cl = window.Cleaner ? Cleaner.clean(text, { pdf: /\.pdf$/i.test(f.name) }).text : text;
      draft.files.push({ id: uid(), name: f.name, text: cl, chars: cl.length, scanned: !!r.scanned && !cl });
      return cl.length;
    };
    const accept = async (files, msgEl) => {
      const list = [...(files || [])];
      if (!list.length) return;
      for (let i = 0; i < list.length; i++) {
        if (msgEl) msgEl.textContent = `Читаю файл ${i + 1} из ${list.length}: ${list[i].name}…`;
        try { const n = await addFile(list[i]); if (msgEl && n) msgEl.textContent = `Готово: «${list[i].name}» — ${n} знаков, попадёт в урок.`; }
        catch (err) { toast(`Не удалось прочитать «${list[i].name}»: ${err.message || err}`, 8000); }
      }
      renderFiles(); save();
      if (msgEl) setTimeout(() => { if (msgEl.isConnected) msgEl.textContent = ""; }, 5000);
    };
    const msg = $n("nbPhotoMsg"), drop = $n("nbDrop");
    $n("nbFileIn").onchange = async e => { await accept(e.target.files, msg); e.target.value = ""; };
    $n("nbPhotoIn").onchange = async e => { await accept(e.target.files, msg); e.target.value = ""; };
    /* перетаскивание файлов прямо в панель */
    ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "dragend"].forEach(ev => drop.addEventListener(ev, () => drop.classList.remove("over")));
    drop.addEventListener("drop", async e => { e.preventDefault(); drop.classList.remove("over"); await accept(e.dataTransfer?.files, msg); });
    box.addEventListener("dragover", e => { if ([...(e.dataTransfer?.types || [])].includes("Files")) e.preventDefault(); });
    box.addEventListener("drop", async e => { if (!e.target.closest("#nbDrop")) { e.preventDefault(); await accept(e.dataTransfer?.files, msg); } });
    $n("nbClear").onclick = () => { draft = empty(); ["nbPrompt", "nbObserve", "nbLinks", "nbText"].forEach(id => $n(id).value = ""); renderCheck(); renderFiles(); save(); };
    renderCheck(); renderFiles(); paintCount();
  }
  // после сборки урока пожелания и файлы обнуляются — к следующему уроку они не переходят
  function reset() { draft = empty(); try { localStorage.removeItem(KEY); } catch { } const $n = id => document.getElementById(id); ["nbPrompt", "nbObserve", "nbLinks", "nbText"].forEach(id => { if ($n(id)) $n(id).value = ""; }); if ($n("nbCheck")) renderCheck(); if ($n("nbFiles")) renderFiles(); paintCount(); }
  function renderCheck() {
    const el = document.getElementById("nbCheck"); if (!el) return;
    el.innerHTML = draft.checklist.length ? draft.checklist.map((c, i) => `<label class="check"><input type="checkbox" data-ci="${i}" ${c.on ? "checked" : ""}> <span>${esc(c.t)}</span> <button type="button" class="btn plain" data-cdel="${i}" aria-label="Удалить пункт">×</button></label>`).join("") : `<p class="small">Пунктов пока нет.</p>`;
    el.querySelectorAll("[data-ci]").forEach(c => c.onchange = () => { draft.checklist[+c.dataset.ci].on = c.checked; save(); });
    el.querySelectorAll("[data-cdel]").forEach(b => b.onclick = e => { e.preventDefault(); draft.checklist.splice(+b.dataset.cdel, 1); renderCheck(); save(); });
  }
  function renderFiles() {
    const el = document.getElementById("nbFiles"); if (!el) return;
    if (!draft.files.length) { el.innerHTML = ""; return; }
    el.innerHTML = draft.files.map((f, i) => {
      const used = !!(f.text && f.text.trim());
      const meta = f.fromPhoto ? "фото учебника, распознано" : f.scanned && !used ? "скан — текст не прочитан" : f.chars ? `${f.chars} знаков` : "";
      return `<div class="np-file"><b>${esc(f.name)}</b> ${used ? '<span class="np-ok">✓ используется в уроке</span>' : '<span class="np-meta" style="color:#c0392b">не прочитан</span>'} <span class="np-meta">${meta}</span> <button type="button" class="btn plain" data-fdel="${i}">Убрать</button></div>`;
    }).join("");
    el.querySelectorAll("[data-fdel]").forEach(b => b.onclick = () => { draft.files.splice(+b.dataset.fdel, 1); renderFiles(); save(); });
  }
  function paintCount() {
    const el = document.getElementById("nbCount"); if (!el) return;
    const n = [draft.prompt.trim(), draft.observe.trim(), draft.links.trim(), draft.text.trim()].filter(Boolean).length + (draft.checklist.length ? 1 : 0) + (draft.files.length ? 1 : 0);
    el.textContent = n ? `✓ ${n} учтено в уроке` : "";
  }

  /* Снимок заметок для урока + разбор подсказок (какие типы вопросов и форматы просит учитель) */
  function snapshot() {
    if (!filled()) return null;
    const text = [draft.prompt, draft.observe].join("\n").toLowerCase();
    const cues = {
      cats: [[/эмоци|чувств|настроени/, "E"], [/форм|средств|при[её]м|троп/, "F"], [/образ|представ|воображ|картин/, "S"], [/смысл|иде[яюи]|подтекст/, "M"], [/геро|персонаж|характер/, "H"], [/сравн|сопостав/, "C"], [/истори|эпох|биограф|контекст/, "K"], [/проблем|дискус|спор|дебат/, "P"], [/чтени|наизусть|интонац/, "R"], [/композиц/, "T"]].filter(([re]) => re.test(text)).map(([, c]) => c),
      group: /групп|пар(ах|ы)|команд/.test(text),
      weak: /слаб|трудн|медленн/.test(text), strong: /сильн|углуб|олимпиад/.test(text),
      format: (window.Variety ? Variety.FORMATS : []).find(f => text.includes(f.name.toLowerCase().split(" ")[0].slice(0, 6)))?.id || null
    };
    const links = draft.links.split(/\s+/).filter(x => /^https?:\/\//.test(x));
    return { prompt: draft.prompt.trim(), observe: draft.observe.trim(), links, checklist: draft.checklist.filter(c => c.on).map(c => c.t), text: draft.text.trim(), files: draft.files.map(f => ({ name: f.name, text: f.text, fromPhoto: !!f.fromPhoto })), cues };
  }
  /* Материалы урока из прикреплённых к заметкам файлов: идут первыми, в общие материалы не попадают */
  function lessonMaterials(n) {
    // фото учебника идёт отдельным блоком в промт (Notes.promptBlock) — в материалы не дублируем, чтобы не тратить токены
    return (n?.files || []).filter(f => f.text && !f.fromPhoto).map((f, i) => ({ id: "note-file-" + i, name: f.name, title: "заметки: " + f.name, kind: "other", subject: null, grade: null, text: f.text, chars: f.text.length, fromNotes: true }));
  }
  /* Блок в конспект (без ИИ): что учтено из заметок */
  function conspectBlock(p) {
    const n = p.notes; if (!n) return "";
    const parts = [];
    if (n.prompt) parts.push(`**Пожелания учителя:** ${n.prompt.replace(/\n+/g, " ")}`);
    if (n.observe) parts.push(`**Заметки и наблюдения:** ${n.observe.replace(/\n+/g, " ")}`);
    if (n.checklist.length) parts.push(`**Акценты урока (чек-лист):**\n\n${n.checklist.map(c => `- ☑ ${c}`).join("\n")}`);
    if (n.cues.group) parts.push("**Формы работы:** работа в группах и парах — на этапах анализа и творческого задания.");
    if (n.cues.weak) parts.push("**Уровень класса:** задания базового уровня идут первыми, к сложным даны образцы.");
    if (n.links.length) parts.push(`**Ссылки учителя:**\n\n${n.links.map(l => `- [${l.replace(/^https?:\/\//, "").slice(0, 60)}](${l})`).join("\n")}`);
    if (n.text) parts.push(`**Текст произведения:** взят из заметок учителя.`);
    return parts.length ? `## Учтено из заметок учителя\n\n${parts.join("\n\n")}\n\n---\n\n` : "";
  }
  /* Блок для ИИ: заметки — приоритетнее базы и интернета */
  function promptBlock(p) {
    const n = p.notes; if (!n) return "";
    const photos = (n.files || []).filter(f => f.fromPhoto && f.text);
    return `## Заметки учителя (приоритет выше базы и интернета; учти всё)
${n.prompt ? `Промт заказчика — выполни буквально, это главное требование: ${n.prompt}\n` : ""}${n.observe ? `Заметки и наблюдения (встрой в урок): ${n.observe}\n` : ""}${n.checklist.length ? `Обязательные акценты: ${n.checklist.join("; ")}\n` : ""}${n.links.length ? `Ссылки учителя (укажи в источниках): ${n.links.join(" ")}\n` : ""}${n.text ? `Текст произведения (цитируй только его):\n<text>\n${n.text.slice(0, 12000)}\n</text>\n` : ""}${photos.length ? `Фото учебника (страницы приложены и распознаны — возьми из них упражнения и задания ДОСЛОВНО, с пометкой «по фото учебника» в скобках; не выдумывай номера упражнений и формулировки):\n${photos.map(f => `<учебник название="${f.name}">\n${String(f.text).slice(0, 9000)}\n</учебник>`).join("\n")}\n` : ""}${n.files.length ? `Файлы к уроку: ${n.files.map(f => f.name).join(", ")} (выдержки — в опорных материалах)\n` : ""}`;
  }
  return { mount, reset, snapshot, lessonMaterials, conspectBlock, promptBlock, get draft() { return draft; } };
})();
window.Notes = Notes;
document.addEventListener("DOMContentLoaded", () => Notes.mount());
