/* «Учу по ФРП» — таблицы-опоры для уроков.
   Один инструмент для всех предметов: берёт готовую таблицу из банка Schemes,
   а если по теме таблицы нет — даёт конструктор, который учитель заполняет
   по теме и вставляет в текущий документ. */
const TableKit = (() => {
  "use strict";
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const plain = x => { try { return window.Schemes?.plain ? Schemes.plain(x) : String(x || ""); } catch { return String(x || ""); } };
  const cell = x => plain(x).replace(/\|/g, "/").replace(/\s+/g, " ").trim();

  function fromScheme(sc) {
    if (!sc) return null;
    if (Array.isArray(sc.head) && Array.isArray(sc.rows) && sc.rows.length) {
      return { title: sc.t || "Таблица-опора", head: sc.head.map(cell), rows: sc.rows.map(r => r.map(cell)) };
    }
    const steps = (sc.s || []).map(cell).filter(Boolean);
    if (!steps.length) return null;
    const ex = (sc.ex || []).map(cell).filter(Boolean);
    return {
      title: sc.t || "Таблица-опора",
      head: ["Шаг", "Что делать / признак", "Пример"],
      rows: steps.slice(0, 6).map((x, i) => [String(i + 1), x, ex[i] || ""])
    };
  }

  function bank(p) {
    try {
      if (window.Schemes?.find) { const t = fromScheme(Schemes.find(p.subject, p.topic)); if (t) return t; }
      if (window.Mnemo?.find) {
        const m = Mnemo.find(p.topic, "", p.subject);
        if (m?.tbl?.head?.length && m.tbl.rows?.length) return { title: m.t || p.topic, head: m.tbl.head.map(cell), rows: m.tbl.rows.map(r => r.map(cell)) };
        if (m?.scheme?.length) return { title: m.t || "Схема-опора", head: ["Шаг", "Что делать"], rows: m.scheme.slice(0, 6).map((x, i) => [String(i + 1), cell(x)]) };
      }
    } catch { }
    return null;
  }

  function md(t) {
    if (!t || !t.head?.length || !t.rows?.length) return "";
    const head = `| ${t.head.join(" | ")} |`;
    const line = `|${t.head.map(() => "---").join("|")}|`;
    return `**${t.title || "Таблица-опора"}**\n\n${head}\n${line}\n${t.rows.map(r => `| ${r.join(" | ")} |`).join("\n")}`;
  }

  function brief(p, doc) {
    return `## Обязательная таблица по теме (${doc || "материал"})
- В материал добавь одну настоящую Markdown-таблицу с шапкой и 3–6 строками. Она должна объяснять тему «${String(p?.topic || "")}», а не быть общим оглавлением.
- Колонки выбирай по смыслу темы: «Признак | Как узнать | Пример», «Шаг | Действие | Пример», «Класс | Состав | Пример» и т. п.
- Все примеры и формулировки — только из этой темы; не переноси таблицу из другого предмета или следующей темы.`;
  }

  function ensure(text, p, doc) {
    const src = String(text || "");
    if (!src.trim() || /\n\s*\|[^\n]*\|[^\n]*\n\s*\|?[\s:|-]+\|/.test(src)) return src;
    const t = bank(p); if (!t) return src;
    const block = md(t);
    if (doc === "slides") return src.replace(/\s+$/, "") + "\n\n---\n\n## 📊 " + t.title + "\n\n" + block + "\n";
    if (doc === "worksheet") {
      if (/#\s*🔑/.test(src)) return src.replace(/(\n#\s*🔑)/, "\n\n## 📊 " + t.title + "\n\n" + block + "\n$1");
      return src.replace(/\s+$/, "") + "\n\n## 📊 " + t.title + "\n\n" + block + "\n";
    }
    if (doc === "memo" || doc === "lesson" || doc === "conspect") return src.replace(/\s+$/, "") + "\n\n## 📊 " + t.title + "\n\n" + block + "\n";
    return src.replace(/\s+$/, "") + "\n\n## 📊 " + t.title + "\n\n" + block + "\n";
  }

  function insert(text) {
    const L = window.state?.lesson; if (!L || !window.state?.active) return false;
    const d = window.state.active;
    if (d === "slides" && window.SlideEditor?.replaceAll) {
      const cur = String(L.docs[d] || "");
      const next = ensure(cur.replace(/\s+$/, "") + (cur.trim() ? "\n\n" : "") + text, L.params, "slides");
      SlideEditor.replaceAll(next); L.docs[d] = next;
    } else {
      L.docs[d] = ensure(String(L.docs[d] || "").replace(/\s+$/, "") + (String(L.docs[d] || "").trim() ? "\n\n" : "") + text, L.params, d);
      const ta = document.getElementById("md"); if (ta) ta.value = L.docs[d];
      try { window.renderPreview?.(); } catch { }
    }
    try { window.saveLesson?.(L); } catch { }
    try { window.toast?.("Таблица добавлена в документ.", 4000); } catch { }
    return true;
  }

  function open() {
    const L = window.state?.lesson; if (!L) { window.toast?.("Сначала соберите или откройте урок.", 5000); return; }
    const p = L.params || {}, t = bank(p);
    const title = t?.title || "Таблица по теме";
    const body = t ? md(t) : `| Признак | Как узнать | Пример |\n|---|---|---|\n|  |  |  |\n|  |  |  |`;
    const m = window.openModal?.(`<div class="dialog wide"><div class="dlg-h"><h2>📊 Таблица по теме</h2><button class="btn ghost x" data-close aria-label="Закрыть">×</button></div>
      <div class="dlg-b">
        <p class="small">Тема: <b>${esc(p.topic || L.title || "")}</b>. ${t ? "Готовая таблица из банка сайта." : "Готовой таблицы нет — заполните шаблон под свою тему."}</p>
        <textarea id="tkMd" class="inp" rows="12" spellcheck="false">${esc(body)}</textarea>
        <p class="hint">Это Markdown-таблица. Её можно править: добавлять строки, менять колонки и примеры.</p>
        <div class="row-btn"><button class="btn flame" id="tkGo">Вставить в документ</button><span class="small" id="tkMsg"></span></div>
      </div></div>`);
    if (!m) return;
    m.querySelector("#tkGo").onclick = () => {
      const text = m.querySelector("#tkMd").value.trim();
      if (!text) return;
      insert(text); window.closeModal?.();
    };
  }

  return { bank, fromScheme, md, brief, ensure, insert, open };
})();
window.TableKit = TableKit;
