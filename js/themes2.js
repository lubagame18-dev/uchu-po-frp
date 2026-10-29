/* «Учу по ФРП» — мотивы оформления презентаций, собранные по визуальным
   референсам заказчика (редакционная «книжная» эстетика: гравюры, коллаж,
   крупная антиква, благородные палитры).

   Модуль дополняет ThemeKit новыми темами (META + PAL) и задаёт «пакеты мотивов»:
   для каждого предмета показывается 3–5 подходящих тем, а не все подряд.

   Палитры: base/base2 — фон (60 %), l1/l2 — слои (30 %), acc — акцент (10 %),
   paper/ink — бумага и текст. Контраст текста не ниже 4,5:1. */
(function () {
  const T = window.ThemeKit;
  if (!T || !T.META || !T.PAL) return;

  const MOTIFS = {
    archive: {
      meta: { name: "Архив", desc: "кремовая бумага, антиква, бордо и золото", font: "playcorm", frame: "F4EFE4" },
      pal: { base: "#F4EFE4", base2: "#E8DFCC", l1: "#DCD2BE", l2: "#C8BAA0", acc: "#7A2E2A", paper: "#FFFCF3", ink: "#241E18", line: "#B08D57", torn: 1 }
    },
    bordeaux: {
      meta: { name: "Бордо", desc: "театральная программка, бордо и старое золото", font: "yeseva", frame: "5D181B" },
      pal: { base: "#5D181B", base2: "#7A2A2E", l1: "#8A3A3C", l2: "#43100F", acc: "#C98E3E", paper: "#F2E7D8", ink: "#2A1618", line: "#D9B36A", torn: 0 }
    },
    afisha: {
      meta: { name: "Афиша", desc: "персиковый плакат, крупный гротеск, красный", font: "russo", frame: "EF8E6C" },
      pal: { base: "#F2AB7A", base2: "#EF8E6C", l1: "#F9CD9F", l2: "#D96A45", acc: "#B32808", paper: "#FFF6E9", ink: "#2A1A12", line: "#8E2C10", torn: 2 }
    },
    denim: {
      meta: { name: "Деним", desc: "синий деним, кремовая бумага, латунь", font: "prata", frame: "47679E" },
      pal: { base: "#47679E", base2: "#618CC6", l1: "#8AA9D6", l2: "#2F4C7D", acc: "#C9A14A", paper: "#F0E9D9", ink: "#16233C", line: "#B9A77E", torn: 0 }
    },
    sage: {
      meta: { name: "Шалфей", desc: "тёмно-зелёный музей, персиковый акцент", font: "cormorant", frame: "15241F" },
      pal: { base: "#15241F", base2: "#3B472F", l1: "#4E5C43", l2: "#0E1A15", acc: "#EF8E6C", paper: "#EAF1E4", ink: "#122019", line: "#C9D6B8", torn: 1 }
    },
    noir: {
      meta: { name: "Ноктюрн", desc: "тёмная галерея, умбра и золото", font: "prata", frame: "211D19" },
      pal: { base: "#211D19", base2: "#3A322A", l1: "#594734", l2: "#161311", acc: "#C98E3E", paper: "#EFE6D6", ink: "#1B1611", line: "#927E66", torn: 0 }
    }
  };

  Object.keys(MOTIFS).forEach(key => {
    T.META[key] = MOTIFS[key].meta;
    T.PAL[key] = MOTIFS[key].pal;
  });

  /* Пакеты мотивов: учитель видит компактный выбор под свой предмет,
     а не 20+ тем подряд. */
  const PACKS = {
    literature: { name: "Литература и язык", themes: ["archive", "bordeaux", "museum", "renaissance"] },
    history: { name: "История и общество", themes: ["archive", "noir", "bordeaux"] },
    art: { name: "Искусство", themes: ["renaissance", "noir", "bordeaux", "museum"] },
    sciences: { name: "Естественные науки", themes: ["denim", "sage", "modern", "aqua"] },
    primary: { name: "Начальная школа", themes: ["afisha", "sketch", "haze", "botanic", "collage"] },
    exact: { name: "Точные науки", themes: ["denim", "modern", "night", "aqua"] }
  };

  const SUBJECT_PACK = {
    ru: "literature", lit: "literature", ru1: "primary", lit1: "primary",
    hist: "history", soc: "history", obzh: "history", orkse: "primary",
    mhk: "art", izo: "primary", mus: "art",
    math: "exact", inf: "exact", vis: "exact", astr: "exact", phys: "sciences", chem: "sciences",
    bio: "sciences", geo: "sciences", eng: "literature",
    okr: "primary", tech: "primary", pe: "primary"
  };

  T.PACKS = PACKS;
  T.packFor = subject => {
    const id = SUBJECT_PACK[subject];
    const pack = PACKS[id];
    if (!pack) return null;
    return pack.themes.filter(k => !!T.META[k]);
  };
  T.packName = subject => {
    const id = SUBJECT_PACK[subject];
    return PACKS[id] ? PACKS[id].name : "";
  };
})();
