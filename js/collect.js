/* ===================================================================
   «Учу по ФРП» — сбор и отправка материалов разработчику.
   • Инкрементально: в файл попадают только материалы, которые ещё не
     отправлялись. У каждой записи уникальный ID, повторов нет.
   • Прозрачно: перед отправкой видно, что попадёт в файл (список,
     количество, дата), и история прошлых отправок.
   • Отправка на почту pedagogruslit@gmail.com, тема «Методические
     наработки для сайта», файл — вложением. Статический сайт сам письма
     отправлять не умеет, поэтому используется бесплатный сервис форм
     FormSubmit (адрес можно сменить в UCHU_SITE.mail). Если отправить не
     вышло — файл сразу скачивается на компьютер и открывается письмо,
     к которому его остаётся приложить.
   • Пользователь отправляет только свои материалы; разработчик получает
     файлы и встраивает понравившееся в режиме разработчика.
   =================================================================== */
const Collect = (() => {
  "use strict";
  const SITE = window.UCHU_SITE || {};
  const MAIL = Object.assign({ to: "pedagogruslit@gmail.com", subject: "Методические наработки для сайта", endpoint: "https://formsubmit.co/" }, SITE.mail || {});
  const KEY = "uchu:sent";
  const ledger = () => { try { return Object.assign({ ids: {}, hashes: {}, batches: [], from: "", note: "" }, JSON.parse(localStorage.getItem(KEY)) || {}); } catch { return { ids: {}, hashes: {}, batches: [], from: "", note: "" }; } };
  const saveLedger = l => { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { } };

  const own = () => (state.materials || []).filter(m => !m.builtin && !m.fromNotes && m.kind !== "frp");
  function fresh() { const l = ledger(); return own().filter(m => !l.ids[m.id] && !(m.hash && l.hashes[m.hash])); }

  function pack(items, extra) {
    const l = ledger();
    return {
      app: "uchu-po-frp-materials", version: 2, kind: "submission",
      id: "sub-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6),
      from: (extra.from || "").trim(), note: (extra.note || "").trim(), createdAt: new Date().toISOString(), site: location.href.split("#")[0], sender: window.UCHU?.uid || null,
      count: items.length, previouslySent: Object.keys(l.ids).length,
      items: items.map(({ builtin, _snip, original, ocrParts, ...m }) => m)
    };
  }
  const fileName = p => `uchu-po-frp_materialy_${p.createdAt.slice(0, 10)}_${p.count}sht_${p.id.slice(-4)}.json`;
  function download(name, blob) { const u = URL.createObjectURL(blob), a = document.createElement("a"); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 30000); }

  /* Отправка формой в скрытый фрейм (так FormSubmit принимает вложения); ждём загрузки ответа */
  function sendForm(p, blob) {
    return new Promise(resolve => {
      if (!navigator.onLine) return resolve(false);
      const name = "uchuSend" + Date.now();
      const ifr = document.createElement("iframe"); ifr.name = name; ifr.hidden = true; ifr.setAttribute("aria-hidden", "true");
      const f = document.createElement("form"); f.method = "POST"; f.enctype = "multipart/form-data"; f.target = name; f.hidden = true;
      f.action = MAIL.endpoint.replace(/\/+$/, "/") + encodeURIComponent(MAIL.to);
      const field = (k, v) => { const i = document.createElement("input"); i.type = "hidden"; i.name = k; i.value = v; f.appendChild(i); };
      field("_subject", MAIL.subject); field("_captcha", "false"); field("_template", "table");
      field("Отправитель", p.from || "не указан"); field("Описание", p.note || "—"); field("Материалов", String(p.count));
      field("Список", p.items.map((m, i) => `${i + 1}. ${m.title || m.name} (${m.chars || 0} знаков)`).join("\n").slice(0, 3000));
      const fi = document.createElement("input"); fi.type = "file"; fi.name = "attachment";
      try { const dt = new DataTransfer(); dt.items.add(new File([blob], fileName(p), { type: "application/json" })); fi.files = dt.files; } catch { return resolve(false); }
      f.appendChild(fi);
      let done = false; const finish = ok => { if (done) return; done = true; setTimeout(() => { ifr.remove(); f.remove(); }, 2000); resolve(ok); };
      ifr.onload = () => finish(true); ifr.onerror = () => finish(false);
      setTimeout(() => finish(false), 25000);
      document.body.append(ifr, f); f.submit();
    });
  }
  function mailto(p) {
    const body = `Здравствуйте!\n\nОтправляю новые материалы для сайта «Учу по ФРП» (${p.count} шт.).\nФайл ${fileName(p)} скачался на компьютер — прикладываю его к письму.\n\n${p.note ? "Описание: " + p.note + "\n" : ""}${p.from ? "От: " + p.from + "\n" : ""}`;
    location.href = `mailto:${MAIL.to}?subject=${encodeURIComponent(MAIL.subject)}&body=${encodeURIComponent(body)}`;
  }
  function mark(p, method) {
    const l = ledger();
    p.items.forEach(m => { l.ids[m.id] = p.createdAt; if (m.hash) l.hashes[m.hash] = p.createdAt; });
    l.batches.push({ id: p.id, at: p.createdAt, count: p.count, method, file: fileName(p), titles: p.items.map(m => m.title || m.name).slice(0, 50) });
    saveLedger(l);
    if (window.Log) Log.add("отправка", `${method}: ${p.count} материал(ов), файл ${fileName(p)}`);
  }

  async function send(items, extra, onlyDownload) {
    if (!items.length) { toast("Новых материалов нет: всё уже отправлено."); return; }
    const p = pack(items, extra), blob = new Blob([JSON.stringify(p)], { type: "application/json" });
    if (onlyDownload) { download(fileName(p), blob); mark(p, "скачан файл"); toast(`Файл ${fileName(p)} скачан: ${p.count} материал(ов).`, 6000); return; }
    toast("Отправляю на почту…", 20000);
    const ok = await sendForm(p, blob);
    if (ok) { mark(p, "отправлено на почту"); toast(`Отправлено на ${MAIL.to}: ${p.count} материал(ов). Если это первая отправка, владельцу почты придёт письмо FormSubmit для подтверждения адреса.`, 9000); }
    else { download(fileName(p), blob); mark(p, "почта не ответила — файл скачан"); toast("Почта не ответила. Файл скачан на компьютер — откроется письмо, приложите к нему этот файл.", 9000); setTimeout(() => mailto(p), 800); }
  }

  function render(box) {
    if (!box) return;
    const l = ledger(), news = fresh(), sentN = own().length - news.length;
    box.innerHTML = `<h2>Отправить материалы разработчику</h2>
      <p class="hint" style="font-size:14px">Если ваши разработки могут пригодиться всем учителям, отправьте их автору сайта. В файл попадают только <b>новые</b> материалы — те, что ещё не отправлялись, поэтому повторов не будет.</p>
      ${news.length ? `<div class="send-list"><p><b>В файл попадёт: ${news.length}</b> · дата: ${new Date().toLocaleDateString("ru-RU")}${sentN ? ` · уже отправлено раньше: ${sentN}` : ""}</p><ul>${news.map(m => `<li><label class="check"><input type="checkbox" data-sid="${esc(m.id)}" checked> ${esc(m.title || m.name)} <span class="small">(${(m.chars || 0).toLocaleString("ru-RU")} знаков, ${new Date(m.addedAt).toLocaleDateString("ru-RU")})</span></label></li>`).join("")}</ul></div>` : `<p><b>Новых материалов нет.</b> ${sentN ? `Все ваши материалы (${sentN}) уже отправлены.` : "Сначала прикрепите материалы выше."}</p>`}
      <div class="row2"><div class="field"><label for="snFrom">Ваше имя, школа <span class="small">(необязательно)</span></label><input type="text" id="snFrom" value="${esc(l.from)}"></div><div class="field"><label for="snNote">Что предлагаете встроить <span class="small">(необязательно)</span></label><input type="text" id="snNote" value="${esc(l.note)}" placeholder="например: конспекты по Бунину, 11 класс"></div></div>
      <div class="mat-row"><button class="btn flame" id="snSend" ${news.length ? "" : "disabled"}>Отправить на почту</button><button class="btn sm ghost" id="snDl" ${news.length ? "" : "disabled"}>Только скачать файл</button><button class="btn plain" id="snAll" ${own().length ? "" : "disabled"}>Собрать все мои материалы заново</button></div>
      <p class="small">Адрес: ${esc(MAIL.to)} · тема письма: «${esc(MAIL.subject)}». Если почта недоступна, файл скачается сам.</p>
      ${l.batches.length ? `<details><summary>История отправок (${l.batches.length})</summary><ul>${l.batches.slice().reverse().map(b => `<li>${new Date(b.at).toLocaleString("ru-RU")} — ${b.count} шт., ${esc(b.method)} <span class="small">(${esc(b.file)})</span></li>`).join("")}</ul></details>` : ""}`;
    const sel = () => news.filter(m => box.querySelector(`[data-sid="${CSS.escape(m.id)}"]`)?.checked);
    const keep = () => { const ll = ledger(); ll.from = box.querySelector("#snFrom").value; ll.note = box.querySelector("#snNote").value; saveLedger(ll); return { from: ll.from, note: ll.note }; };
    box.querySelector("#snFrom").onchange = keep; box.querySelector("#snNote").onchange = keep;
    box.querySelector("#snSend").onclick = async () => { await send(sel(), keep()); render(box); };
    box.querySelector("#snDl").onclick = async () => { await send(sel(), keep(), true); render(box); };
    box.querySelector("#snAll").onclick = async e => { if (!e.target.dataset.sure) { e.target.dataset.sure = 1; e.target.textContent = "Точно? В файл попадут все материалы, включая отправленные"; return; } await send(own(), keep(), true); render(box); };
  }
  function forget(id) { const l = ledger(); delete l.ids[id]; saveLedger(l); }
  return { render, fresh, ledger, forget, pack, MAIL };
})();
window.Collect = Collect;
