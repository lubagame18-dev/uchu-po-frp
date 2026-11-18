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
      const sep = before && !/\s$/.test(before) ? " " : "";
      textarea.value = before + sep + t + after;
      const pos = (before + sep + t).length;
      try { textarea.setSelectionRange(pos, pos); } catch { }
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.focus();
    };
    const stop = () => {
      setActive(false);
      setStatus("");
      if (rec) { try { rec.stop(); } catch { } rec = null; }
    };
    const start = () => {
      if (active) return;
      rec = new SR();
      rec.lang = "ru-RU";
      rec.continuous = true;
      rec.interimResults = true;
      setActive(true);
      setStatus("Слушаю… говорите, текст появится в поле.");
      rec.onresult = e => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) insert(r[0].transcript);
          else interim += r[0].transcript;
        }
        if (interim) setStatus("Слушаю: " + interim);
        else setStatus("Слушаю… говорите, текст появится в поле.");
      };
      rec.onerror = e => {
        const map = {
          "not-allowed": "Нет доступа к микрофону. Разрешите его в настройках браузера.",
          "service-not-allowed": "Браузер запретил распознавание речи.",
          "no-speech": "Не слышу речь. Попробуйте ещё раз.",
          "network": "Нет связи с сервисом распознавания. Проверьте интернет.",
          "audio-capture": "Микрофон не найден."
        };
        setStatus(map[e.error] || ("Ошибка распознавания: " + e.error), "err");
        if (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "audio-capture") stop();
      };
      rec.onend = () => {
        if (!active) return;
        /* Chrome часто завершает сессию после паузы — продолжаем, пока учитель не нажал «Остановить» */
        restartTimer = setTimeout(() => { try { if (active) rec.start(); } catch { stop(); } }, 250);
      };
      try { rec.start(); } catch (e) { setStatus("Не удалось включить микрофон: " + (e.message || e), "err"); stop(); }
    };
    button.onclick = () => active ? stop() : start();
    return { supported: true, start, stop };
  }

  window.Dictation = { supported, attach };
})();
