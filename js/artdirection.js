/* «Учу по ФРП» — арт-дирекция презентации.
   Определяет визуальный жанр урока и единые правила: тему, переходы,
   характер иллюстраций, повторяющийся образ/персонаж и композицию слайдов. */
(function () {
  "use strict";
  const STYLES = {
    cinematic: {
      id: "cinematic", name: "Кинематографично",
      themes: ["bordeaux", "museum", "renaissance", "noir"],
      transition: "soft",
      character: "центральный герой или предмет урока, крупным планом, с драматическим светом",
      imagePrompt: "cinematic digital painting, dramatic side light, deep shadows, muted film palette, atmospheric, one clear subject, no text, no letters, no watermark",
      arc: "завязка — конфликт/вопрос — поворот — прозрение — вывод; каждый слайд как кадр одной истории",
      guide: "Сделай презентацию кинематографичной: на ключевых слайдах — цельная иллюстрация/живопись на весь кадр, поверх неё короткая плашка с 1–2 мыслями. Один слайд = один смысл. Повторяй один образ/персонаж/предмет через всю презентацию. Заголовки 34–42 pt, текст 24–28 pt, не больше 2–4 строк. Чередуй крупный кадр, цитату и вопрос. Не делай стены текста и мелкие таблицы."
    },
    quest: {
      id: "quest", name: "Игровой квест",
      themes: ["afisha", "poster", "sketch", "collage"],
      transition: "bright",
      character: "добрый проводник-персонаж, который ведёт класс по этапам урока",
      imagePrompt: "bright friendly flat vector cartoon illustration, cheerful characters, clear simple objects, warm light, educational game scene, no text, no letters, no watermark",
      arc: "получение задания — препятствие — подсказка — победа — новая задача; в конце — карта пройденного пути",
      guide: "Сделай урок игровым квестом: у класса есть проводник-персонаж и понятная цель. На слайдах — крупные объекты и карточки, с которыми можно работать; задания с выбором/сортировкой; короткие реплики персонажа. Один слайд — один шаг квеста. Крупный округлый шрифт, 2–4 строки, яркие акценты. Не перегружай текстом."
    },
    album: {
      id: "album", name: "Литературный альбом",
      themes: ["archive", "renaissance", "museum", "salon"],
      transition: "soft",
      character: "портрет автора, герой или ключевая деталь произведения",
      imagePrompt: "classical painting reproduction style, soft paper texture, warm muted colors, elegant composition, literary atmosphere, no text, no letters, no watermark",
      arc: "первое впечатление — ключевой эпизод — образы и детали — авторская мысль — личный отклик",
      guide: "Сделай литературный альбом: живопись, портреты, гравюры, цитаты. На слайде с картиной — 2–3 вопроса для анализа. Крупная цитата, короткий комментарий, один образ. Не заменяй живопись случайными фотографиями. Обязательны подписи: художник, название, год."
    },
    poster: {
      id: "poster", name: "Плакат",
      themes: ["poster", "modern", "denim", "bordeaux"],
      transition: "bright",
      character: "крупный графический символ темы",
      imagePrompt: "bold editorial poster illustration, geometric shapes, strong contrast, limited palette, one central symbol, no text, no letters, no watermark",
      arc: "тезис — контраст — доказательство — вывод",
      guide: "Сделай плакатную презентацию: крупные тезисы, графические схемы, контрастные акценты, минимум мелкого текста. Один слайд — один тезис. Используй крупные цифры, стрелки, короткие подписи."
    },
    scientific: {
      id: "scientific", name: "Научная схема",
      themes: ["modern", "denim", "aqua", "sage"],
      transition: "soft",
      character: "объект/явление урока, показанное в разрезе или в действии",
      imagePrompt: "clean educational scientific illustration, precise diagram style, muted blue and warm accents, one clear object or process, no text, no letters, no watermark",
      arc: "вопрос — наблюдение — объяснение — схема — проверка — вывод",
      guide: "Сделай наглядную научную презентацию: схемы, разрезы, процессы, сравнения. Один слайд — одна схема или один опыт. Подписи короткие, термины объясняй. Не вставляй декоративные картинки ради украшения."
    }
  };
  const hash = s => { let h = 0; for (const c of String(s || "")) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
  function forLesson(p) {
    const t = `${p?.topic || ""} ${p?.subject || ""} ${p?.grade || ""}`.toLowerCase().replace(/ё/g, "е");
    let id = "scientific";
    if (p?.subject === "lit") {
      if (/драм|трагед|гроз|войн|битв|смерт|конфликт|судьб|дуэл|бунт|преступлен|роков/.test(t)) id = "cinematic";
      else id = "album";
    } else if (p?.subject === "hist" || p?.subject === "mhk" || p?.subject === "mus" || p?.subject === "izo") {
      id = /анализ|картин|живопис|портрет|музык|стил|эпох/.test(t) ? "album" : "cinematic";
    } else if (+(p?.grade || 0) <= 4) {
      id = "quest";
    } else if (/квест|игр|путешеств|загадк|приключ|турнир|соревнов/.test(t)) {
      id = "quest";
    } else if (/план|тезис|сравн|докаж|аргумент/.test(t) && p?.subject === "soc") {
      id = "poster";
    }
    const st = STYLES[id] || STYLES.scientific;
    const themes = (st.themes || []).filter(k => !window.ThemeKit || window.ThemeKit.META?.[k]);
    const theme = themes.length ? themes[hash(`${p?.topic || ""}${p?.subject || ""}${p?.grade || ""}`) % themes.length] : "modern";
    return { ...st, theme, key: `${p?.subject || ""}|${p?.grade || ""}|${p?.topic || ""}` };
  }
  const guide = p => { const a = forLesson(p); return `## Арт-дирекция: ${a.name}\n${a.guide}\n- Сюжетная линия урока: ${a.arc}.\n- Повторяющийся образ/персонаж: ${a.character}.\n- Соблюдай единый стиль иллюстраций и палитру на всех слайдах.`; };
  const imagePrompt = p => { const a = forLesson(p); return `Art direction: ${a.name}. ${a.imagePrompt}. Recurring subject: ${a.character}. Consistent character design and palette across the deck.`; };
  const transition = p => forLesson(p).transition || "soft";
  window.ArtDirection = { STYLES, forLesson, guide, imagePrompt, transition };
})();
