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
    const box = document.createElement("details");
    box.className = "notes-box"; box.id = "notesBox";
    box.innerHTML = `<summary><span class="nb-t">Пожелания к уроку</span> <span class="nb-count" id="nbCount"></span></summary>
      <textarea class="inp" id="nbPrompt" rows="3" placeholder="Например: класс слабый — больше работы в группах; сравнить с Тютчевым"></textarea>
      <div class="nb-files" id="nbFiles"></div>
      <div class="nb-foot"><label class="btn sm ghost file-btn">📎 Прикрепить файлы<input type="file" id="nbFileIn" multiple hidden></label><button type="button" class="btn plain" id="nbClear">Очистить</button></div>
      <div hidden><textarea id="nbObserve"></textarea><textarea id="nbLinks"></textarea><textarea id="nbText"></textarea><div id="nbCheck"></div><input id="nbCheckIn"><button type="button" id="nbCheckAdd"></button></div>`;
    btn.parentNode.insertBefore(box, btn);
    // старое поле «Пожелания» (было только для ИИ) теперь живёт в заметках
    const w = document.getElementById("wishes"); if (w) { if (w.value && !draft.prompt) draft.prompt = w.value; w.closest(".field").hidden = true; }
    const $n = id => document.getElementById(id);
    $n("nbPrompt").value = draft.prompt; $n("nbObserve").value = draft.observe; $n("nbLinks").value = draft.links; $n("nbText").value = draft.text;
    [["nbPrompt", "prompt"], ["nbObserve", "observe"], ["nbLinks", "links"], ["nbText", "text"]].forEach(([id, k]) => $n(id).addEventListener("input", e => { draft[k] = e.target.value; save(); }));
    box.querySelectorAll("[data-nb]").forEach(b => b.onclick = () => {
      box.querySelectorAll("[data-nb]").forEach(x => x.setAttribute("aria-selected", String(x === b)));
      box.querySelectorAll(".nb-pane").forEach(p => p.hidden = p.dataset.pane !== b.dataset.nb);
    });
    const addItem = () => { const v = $n("nbCheckIn").value.trim(); if (!v) return; draft.checklist.push({ t: v, on: true }); $n("nbCheckIn").value = ""; renderCheck(); save(); };
    $n("nbCheckAdd").onclick = addItem; $n("nbCheckIn").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addItem(); } });
    $n("nbFileIn").onchange = async e => {
      for (const f of e.target.files) {
        try { const r = await readFile(f); const text = (r.text || "").slice(0, 300000); const cl = window.Cleaner ? Cleaner.clean(text, { pdf: /\.pdf$/i.test(f.name) }).text : text; draft.files.push({ id: uid(), name: f.name, text: cl, chars: cl.length, scanned: !!r.scanned }); }
        catch (err) { toast(`Не удалось прочитать «${f.name}»: ${err.message || err}`); }
      }
      e.target.value = ""; renderFiles(); save();
    };
    $n("nbClear").onclick = () => { draft = empty(); ["nbPrompt", "nbObserve", "nbLinks", "nbText"].forEach(id => $n(id).value = ""); renderCheck(); renderFiles(); save(); };
    renderCheck(); renderFiles(); paintCount();
    if (filled()) box.open = true;
  }
  // после сборки урока пожелания и файлы обнуляются — к следующему уроку они не переходят
  function reset() { draft = empty(); try { localStorage.removeItem(KEY); } catch { } const $n = id => document.getElementById(id); ["nbPrompt", "nbObserve", "nbLinks", "nbText"].forEach(id => { if ($n(id)) $n(id).value = ""; }); if ($n("nbCheck")) renderCheck(); if ($n("nbFiles")) renderFiles(); paintCount(); const box = $n("notesBox"); if (box) box.open = false; }
  function renderCheck() {
    const el = document.getElementById("nbCheck"); if (!el) return;
    el.innerHTML = draft.checklist.length ? draft.checklist.map((c, i) => `<label class="check"><input type="checkbox" data-ci="${i}" ${c.on ? "checked" : ""}> <span>${esc(c.t)}</span> <button type="button" class="btn plain" data-cdel="${i}" aria-label="Удалить пункт">×</button></label>`).join("") : `<p class="small">Пунктов пока нет.</p>`;
    el.querySelectorAll("[data-ci]").forEach(c => c.onchange = () => { draft.checklist[+c.dataset.ci].on = c.checked; save(); });
    el.querySelectorAll("[data-cdel]").forEach(b => b.onclick = e => { e.preventDefault(); draft.checklist.splice(+b.dataset.cdel, 1); renderCheck(); save(); });
  }
  function renderFiles() {
    const el = document.getElementById("nbFiles"); if (!el) return;
    el.innerHTML = draft.files.map((f, i) => `<div class="nb-file"><b>${esc(f.name)}</b> ${f.scanned ? ' <span class="small">(скан — текст не читается)</span>' : ""} <button type="button" class="btn plain" data-fdel="${i}">Убрать</button></div>`).join("");
    el.querySelectorAll("[data-fdel]").forEach(b => b.onclick = () => { draft.files.splice(+b.dataset.fdel, 1); renderFiles(); save(); });
  }
  function paintCount() {
    const el = document.getElementById("nbCount"); if (!el) return;
    const n = [draft.prompt.trim(), draft.observe.trim(), draft.links.trim(), draft.text.trim()].filter(Boolean).length + (draft.checklist.length ? 1 : 0) + (draft.files.length ? 1 : 0);
    el.textContent = n ? "✓" : "";
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
    return { prompt: draft.prompt.trim(), observe: draft.observe.trim(), links, checklist: draft.checklist.filter(c => c.on).map(c => c.t), text: draft.text.trim(), files: draft.files.map(f => ({ name: f.name, text: f.text })), cues };
  }
  /* Материалы урока из прикреплённых к заметкам файлов: идут первыми, в общие материалы не попадают */
  function lessonMaterials(n) {
    return (n?.files || []).filter(f => f.text).map((f, i) => ({ id: "note-file-" + i, name: f.name, title: "заметки: " + f.name, kind: "other", subject: null, grade: null, text: f.text, chars: f.text.length, fromNotes: true }));
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
    return `## Заметки учителя (приоритет выше базы и интернета; учти всё)
${n.prompt ? `Промт: ${n.prompt}\n` : ""}${n.observe ? `Заметки и наблюдения (встрой в урок): ${n.observe}\n` : ""}${n.checklist.length ? `Обязательные акценты: ${n.checklist.join("; ")}\n` : ""}${n.links.length ? `Ссылки учителя (укажи в источниках): ${n.links.join(" ")}\n` : ""}${n.text ? `Текст произведения (цитируй только его):\n<text>\n${n.text.slice(0, 12000)}\n</text>\n` : ""}${n.files.length ? `Файлы к уроку: ${n.files.map(f => f.name).join(", ")} (выдержки — в опорных материалах)\n` : ""}`;
  }
  return { mount, reset, snapshot, lessonMaterials, conspectBlock, promptBlock, get draft() { return draft; } };
})();
window.Notes = Notes;
document.addEventListener("DOMContentLoaded", () => Notes.mount());
