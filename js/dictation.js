/* «Учу по ФРП» — голосовой ввод в пожелания к уроку.
   Использует встроенный Web Speech API браузера (Chrome/Edge): без ключей,
   без отправки аудио на сторонние платные сервисы. Если браузер не умеет —
   кнопка честно отключается и объясняет почему. */
(function () {
  "use strict";
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  function supported() { return !!SR; }

  function attach({ textarea, button, status } = {}) {
    if (!textarea || !button) return null;
    if (!SR) {
      button.disabled = true;
      button.title = "В этом браузере нет распознавания речи. Откройте сайт в Chrome или Edge.";
      button.textContent = "🎤 Надиктовать";
      if (status) status.textContent = "Голосовой ввод доступен в Chrome и Edge.";
      return { supported: false, start() { }, stop() { } };
    }
    let rec = null, active = false, restartTimer = null;
    let lastFinal = "", lastFinalAt = 0, lastValue = "";
    const setStatus = (t, cls = "") => { if (status) { status.textContent = t; status.className = "small " + cls; } };
    const setActive = on => {
      active = on;
      button.classList.toggle("rec", on);
      button.setAttribute("aria-pressed", String(on));
      button.textContent = on ? "⏹ Остановить" : "🎤 Надиктовать";
      clearTimeout(restartTimer);
    };
    const insert = text => {
      const t = String(text || "").trim();
      if (!t) return;
      const start = textarea.selectionStart ?? textarea.value.length;
      const end = textarea.selectionEnd ?? textarea.value.length;
      const before = textarea.value.slice(0, start);
      const after = textarea.value.slice(end);
      const leftSpace = before && !/[\s(«\[]$/.test(before) && !/^[,.;:!?…»)]/.test(t) ? " " : "";
      const rightSpace = after && !/^[\s,.;:!?…»)\]]/.test(after) && !/[(«\[]$/.test(t) ? " " : "";
      const first = before + leftSpace + t;
      textarea.value = first + rightSpace + after;
      const pos = first.length;
      try { textarea.setSelectionRange(pos, pos); } catch { }
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.focus();
    };
    const stop = (message = "") => {
      const current = rec;
      rec = null;
      setActive(false);
      setStatus(message, message ? "err" : "");
      if (current) { try { current.stop(); } catch { } }
    };
    const start = () => {
      if (active) return;
      const current = new SR();
      rec = current;
      current.lang = "ru-RU";
      current.continuous = true;
      current.interimResults = true;
      const live = () => rec === current && active;
      const seen = new Set();
      setActive(true);
      setStatus("Слушаю… говорите, текст появится в поле.");
      current.onstart = () => { seen.clear(); };
      current.onresult = e => {
        if (!live()) return;
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (!r.isFinal) { interim += r[0].transcript; continue; }
          if (seen.has(i)) continue; // Chrome иногда присылает уже финальные результаты повторно
          seen.add(i);
          const text = String(r[0].transcript || "").replace(/\s+/g, " ").trim();
          if (!text) continue;
          const norm = text.toLowerCase().replace(/[.,!?;:«»()\s]+/g, " ").trim();
          if (norm && norm === lastFinal && textarea.value === lastValue && Date.now() - lastFinalAt < 4000) continue;
          insert(text);
          lastFinal = norm; lastFinalAt = Date.now(); lastValue = textarea.value;
        }
        if (interim) setStatus("Слушаю: " + interim);
        else setStatus("Слушаю… говорите, текст появится в поле.");
      };
      current.onerror = e => {
        if (!live()) return;
        const map = {
          "not-allowed": "Нет доступа к микрофону. Разрешите его в настройках браузера.",
          "service-not-allowed": "Браузер запретил распознавание речи.",
          "no-speech": "Не слышу речь. Попробуйте ещё раз.",
          "network": "Нет связи с сервисом распознавания. Проверьте интернет.",
          "audio-capture": "Микрофон не найден."
        };
        const message = map[e.error] || ("Ошибка распознавания: " + e.error);
        if (["not-allowed", "service-not-allowed", "audio-capture"].includes(e.error)) stop(message);
        else setStatus(message, "err");
      };
      current.onend = () => {
        if (!live()) return;
        /* Chrome часто завершает сессию после паузы — продолжаем, пока учитель не нажал «Остановить» */
        clearTimeout(restartTimer);
        restartTimer = setTimeout(() => { try { if (live()) current.start(); } catch { stop(); } }, 250);
      };
      try { current.start(); } catch (e) { stop("Не удалось включить микрофон: " + (e.message || e)); }
    };
    button.onclick = () => active ? stop() : start();
    return { supported: true, start, stop };
  }

  window.Dictation = { supported, attach };
})();
