# Контракт: инструмент визуализации презентаций «Учу по ФРП»

Версия: 1.0.0 (заморожен для параллельной разработки).
Владелец контракта: Lead. Меняется только через Lead и с перевыпуском версии.

## Задача

Единый инструмент, который для **любого урока сайта** (предмет, класс, тема, слайды)
строит визуальный план каждого слайда строго по 5 правилам главного методиста,
проверяет его машинно и гарантирует, что ни один слайд не остаётся без изображения.

Пять жёстких правил (нарушение = критическая ошибка):

1. Русский текст — только в `title` / `facts` / `editorial_check`. В `image_prompt`
   (FLUX) текста нет вообще; в `svg_markup` — только латинские/греческие символы.
2. Один слайд — один `visual_anchor`. Никакого «всё в одной картинке».
3. FLUX никогда не рисует лица реальных исторических личностей и не подделывает
   известные шедевры. Для таких слайдов — только поиск подлинника; резервный
   промпт — атмосфера эпохи/рабочее место без людей.
4. Никаких карт (политических, контурных, физических, схем сражений) — ни поиском,
   ни генерацией. Вместо них: ландшафты, природные зоны, явления, геологические
   разрезы, исторический быт.
5. `image_prompt` никогда не `null`. Всегда есть безопасный резервный образ.

## Файлы и зоны ответственности

| Файл | Владелец |
|---|---|
| `js/visualplan.js` | engine-dev |
| `test/visualplan.test.mjs` | engine-dev |
| `tools/visual-audit.mjs`, `tools/reports/*`, `tools/visual-plan/README.md` | audit-dev |
| `index.html` (одна script-строка), `js/deck.js`, `js/app-part2.js`, при необходимости `js/slides.js` | integration-dev |
| `tools/visual-plan/CONTRACT.md`, финальная приёмка | Lead |

Новые файлы — только UTF-8 без BOM, LF. Существующие файлы не переформатировать.

## Модуль `js/visualplan.js` (UMD, без зависимостей и DOM)

Должен работать и в браузере (`window.VisualPlan`), и в Node (`module.exports`).

```js
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.VisualPlan = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  /* … */
  return api;
});
```

### Публичный API

```js
VisualPlan.VERSION === "1.0.0"
VisualPlan.STRATEGIES = ["site_library","ru_wikipedia_api","en_wikimedia_api","svg_code","flux_generation"]
VisualPlan.NEG_TAIL =
  "Clean educational visual style, scientifically accurate proportions, soft even studio lighting, " +
  "uncluttered background with ample negative space, strictly zero text, no letters, no numbers, " +
  "no labels, no calligraphy, no watermarks."
```

`planForSlide(input) -> slidePlan`

Вход:

```js
{
  subject: "bio",            // код предмета сайта (bio, ru, lit, math, phys, chem, geo, hist, soc, inf, eng, izo, mus, …)
  grade: "7",                // класс, строка или число
  topic: "Инфузория-туфелька", // тема урока
  slide: {
    title: "Кто такая инфузория-туфелька",
    body: "…",              // markdown слайда (без картинок)
    facts: ["…", "…", "…"]    // факты слайда; если нет — берём тезисы из body
  }
}
```

Выход — ровно такой объект (схема главного методиста):

```js
{
  title: "…",                  // = slide.title
  facts: ["…", "…", "…"],      // 3–5 проверенных тезисов, без выдумывания
  editorial_check: {
    visual_anchor: "Один главный объект/сцена",
    historical_or_scientific_passport: "век/регион/материалы или точные научные признаки",
    cut_out_noise: "что намеренно исключили",
    visual_strategy: "site_library | ru_wikipedia_api | en_wikimedia_api | svg_code | flux_generation"
  },
  image_prompt: "…",           // всегда непустой абзац, заканчивается NEG_TAIL
  extra_sources: {
    library_tags: [],          // заполнен при site_library, иначе []
    ru_wiki_title: null,       // строка при ru_wikipedia_api, иначе null
    en_wiki_query: null,       // строка при en_wikimedia_api, иначе null
    svg_markup: null           // строка <svg …> при svg_code, иначе null
  }
}
```

`planForLesson(lesson, slides) -> lessonPlan`

```js
{ lesson_meta: { subject, grade, topic, visual_theme }, slides: [ slidePlan, … ] }
```

`slidePlan` получает дополнительно `slide_number` (с 1). `visual_theme` — единый
визуальный стиль презентации (например: «Тёплая научная иллюстрация: бумага, акварель,
спокойная палитра»); одинаковый для всех слайдов урока.

`resolveQuery(plan) -> { kind, value }`

Как представить план для существующего механизма картинок сайта:

- `site_library` → `{ kind: "library", value: tags.join(" ") }` (сначала ищется в локальной базе);
- `ru_wikipedia_api` → `{ kind: "search", value: plan.extra_sources.ru_wiki_title }`;
- `en_wikimedia_api` → `{ kind: "commons", value: plan.extra_sources.en_wiki_query }`;
- `svg_code` → `{ kind: "data", value: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg_markup) }`;
- `flux_generation` → `{ kind: "flux", value: plan.image_prompt }`.

`acquire(plan, adapters) -> Promise<{ url, source }>`

Адаптеры (все могут вернуть `null`, бросать нельзя):

```js
{
  library: async (tags, query) => url|null,
  wikiRu: async (title) => url|null,
  wikiEn: async (query) => url|null,
  flux: async (prompt) => url|null,     // data:URL
  svg: async (markup) => url|null,     // по умолчанию data:URL из markup
  fallback: async (seed) => url        // обязан вернуть непустой data:URL
}
```

Порядок обхода (гарантия «ни одного пустого слайда»):

1. `site_library`: library → wikiRu (если тема про персону) → flux → fallback;
2. `ru_wikipedia_api`: wikiRu → flux (безопасный резервный образ) → fallback;
3. `en_wikimedia_api`: wikiEn → (flux только если интент не портрет/шедевр) → fallback;
4. `svg_code`: svg → fallback;
5. `flux_generation`: flux → fallback.

`acquire` всегда возвращает непустой `url`; если упали все — `fallback(seed)`.
`source` — имя сработавшего шага (`"library" | "wikiRu" | "wikiEn" | "flux" | "svg" | "fallback"`).
`seed` детерминированный: `subject|grade|topic|slide.title`.

`validate(x) -> { ok, errors: [{ code, path, message }] }`

Проверяет и один slidePlan, и lessonPlan (обходит slides). Коды ошибок:

`EMPTY_SLIDE`, `TITLE_EMPTY`, `FACTS_EMPTY`, `FACTS_NOT_ARRAY`, `STRATEGY_INVALID`,
`NO_STRATEGY`, `NULL_PROMPT`, `PROMPT_CYRILLIC`, `PROMPT_DIGITS`, `PROMPT_TAIL_MISSING`,
`PROMPT_TAG_LIST`, `PROMPT_TEXT_WORDS`, `PROMPT_PERSON_NAME`, `PROMPT_TOO_SHORT`,
`MAP_REQUEST`, `PORTRAIT_VIA_FLUX`, `WIKI_TITLE_MISSING`, `EN_QUERY_MISSING`,
`LIBRARY_TAGS_MISSING`, `EXTRA_SOURCE_STRAY`, `SVG_MISSING`, `SVG_INVALID`,
`SVG_HAS_WORDS`, `SVG_TOO_MANY_ELEMENTS`, `SVG_OUT_OF_BOUNDS`, `SVG_NO_BACKGROUND`,
`SVG_TEXT_ON_VERTEX`, `EDITORIAL_FIELD_EMPTY`.

Требования валидатора (минимально):

- `image_prompt` — непустая строка, английский: без `[А-Яа-яЁё]`, без цифр `\d`;
  заканчивается ровно `NEG_TAIL`; нет списка тегов через запятую (эвристика:
  ≥7 запятых без служебных слов `with, its, inside, showing, floating, on, in, from, that, which`);
  нет положительных упоминаний `text|letters|numbers|labels|calligraphy|watermark|logo`
  вне отрицания (`no|without|zero|strictly zero` + слово); длина 50–900 символов;
  без имён реальных людей (эвристика: 2+ слова с заглавной в середине промпта).
- `svg_markup`: начинается с `<svg`, `viewBox="0 0 800 600"`, есть `#F8FAFC`;
  в тексте SVG нет кириллицы и латинских слов (только одиночные символы из
  `A B C D E F M N P Q R S T U I V W x y z α β γ δ θ λ μ π σ φ ω Δ Ω` и знаки `+ − − = · × ° % < >`);
  элементов (всех тегов, кроме `svg`) ≤ 12; все числовые координаты
  (`x,y,cx,cy,x1,y1,x2,y2,points`) внутри x∈[120,680], y∈[100,500];
  буквы-подписи (`<text x y>`) не ближе 20 px к вершине/центру, к которой относятся.
- `extra_sources`: заполнено ровно одно поле под выбранную стратегию, остальные
  `null`/`[]`; для `svg_code` обязателен `svg_markup`; для `ru_wikipedia_api` — непустой
  `ru_wiki_title`; для `en_wikimedia_api` — непустой `en_wiki_query`; для
  `site_library` — непустой `library_tags` (2–4 тега); для `flux_generation` — все пустые.
- `editorial_check`: все четыре текстовых поля непустые; `visual_strategy` из списка.
- `MAP_REQUEST`: если в `visual_anchor`/`historical_or_scientific_passport`/`cut_out_noise`
  или в промпте есть `карт[аыуе]`, `map`, `atlas`, `атлас`, `план местности`,
  `схема сражения`, `контурная` — ошибка (кроме отрицаний «без карт», «никакой карты»).
- `PORTRAIT_VIA_FLUX`: стратегия `flux_generation`, если в теме/слайде/фактах найден
  реальный человек (см. `isRealPerson`) и интент портрета — ошибка.
- `EMPTY_SLIDE`: пустой `title` И пустые `facts`.

`fallbackSvg(seed) -> string`

Детерминированный `<svg viewBox="0 0 800 600" …>` со светлым фоном `#F8FAFC`,
абстрактной композицией (круг/дуги/линии, палитра от subject/seed), **без текста**
вообще, все элементы внутри x∈[120,680], y∈[100,500], ≤ 12 элементов.
Используется как последний резерв и как резервный фон для пустого слайда.

`svgTemplates` — готовые валидные шаблоны (≤ 12 элементов, подписи только латиницей):

- `functionGraph({ kind: "linear"|"parabola"|"sine", … })` — оси с подписями `x`, `y`,
  сама кривая, 2–3 опорные точки;
- `triangle({ kind: "right"|"isosceles" })` — треугольник с вершинами `A`, `B`, `C`;
- `circleWithTriangle()` — окружность + вписанный треугольник `A`, `B`, `C`;
- `circuit({ kind: "series"|"parallel" })` — резистор-прямоугольник по ГОСТу,
  источник, провода; подписи `R`, `U`, `I`;
- `forces({ kind: "two"|"three" })` — векторы из одной точки, подписи `F`, `N`, `R`.

`templateFor(input) -> string|null` — выбирает шаблон по предмету/теме/слайду.

### Эвристики выбора стратегии (обязательны)

Порядок принятия решения:

1. **Карта?** Если тема/слайд просит карту (`карта`, `атлас`, `план местности`,
   `сражение на карте`, `контурная карта`, `map`) — стратегия НЕ картографическая:
   `flux_generation` с натуральным ландшафтом/разрезом; паспорт: «вид местности
   без картографических обозначений». Это правило важнее всех остальных.
2. **Реальная персона** (писатель, поэт, учёный, полководец, правитель, художник,
   композитор; определяем по имени/фамилии из темы, базе `data/people.js`, словам
   «портрет», «биография», «жизнь и творчество») →
   - Россия/СССР/СНГ → `ru_wikipedia_api`, `ru_wiki_title` — точное энциклопедическое
     название («Пушкин, Александр Сергеевич»);
   - зарубежная персона → `en_wikimedia_api`, `en_wiki_query` — «Имя Фамилия portrait».
3. **Картина/шедевр/скульптура** (литература, МХК, ИЗО; слова «картина»,
   «репродукция», «иллюстрация», «портрет», «фреска», «икона») →
   `ru_wikipedia_api` для русских художников/картин, `en_wikimedia_api` для мировых;
   `en_wiki_query` точный («Ivan Shishkin Morning in a Pine Forest painting»).
   FLUX для шедевров запрещён.
4. **Строгая схема** (математика/физика/информатика; «график функции», «треугольник»,
   «окружность», «электрическая цепь», «векторы сил», «структурная формула»;
   ≤ 12 элементов) → `svg_code` + `svgTemplates`/`templateFor`.
5. **Микромир, анатомия в разрезе, исторический быт/архитектура до фото,
   лабораторный опыт, природные процессы, ландшафты/природные зоны, редкие
   животные и растения** → `flux_generation`.
6. **Типовые темы из библиотеки сайта** (природные зоны России, базовые школьные
   символы, типовые фоны предметов, стандартные схемы) → `site_library`
   с 2–4 русскими тегами из `library_tags`.
7. Иначе — `flux_generation` (безопасный общий случай), но только если интент не
   персона и не шедевр (иначе шаги 2–3).

Промпт `image_prompt` для FLUX: 60–120 слов, один абзац, «слепой художник»
(форма, цвет, прозрачность, текстура, среда), точный век/регион/материалы или
научные признаки, один объект в центре, свободное место по краям, заканчивается
`NEG_TAIL`. Никаких имён реальных людей и названий картин.

## Интеграция в сайт (integration-dev)

1. `index.html`: добавить `<script src="js/visualplan.js"></script>` после
   `js/artdirection.js` (строка ~1103), до `js/deck.js`.
2. `js/deck.js`:
   - в `fillImages` для карточек без картинки — план из `VisualPlan.planForSlide`
     (передаём `subject, grade, topic, slide:{title, points/body}`), карточке
     ставим `card.vp = plan`, а `card.img` — из `VisualPlan.resolveQuery(plan)`
     (`search:`/`commons:` значения, `data:` — как есть); `acc` как сейчас;
   - карточка-приложение `map` («Работа с картой») больше **не получает карту**:
     её изображение заменяется планом с натуральным ландшафтом по теме
     (без картографических символов), либо карточка остаётся без изображения,
     если тема не географическая; текст вопросов не переписывать без Lead.
   - если `window.VisualPlan` отсутствует — прежнее поведение без ошибок.
3. `js/app-part2.js` `deckImagePrompt(p, sl, wish)`:
   - если у слайда есть `sl.vp?.image_prompt` — вернуть его (плюс пожелание учителя
     отдельной строкой в конце перед `NEG_TAIL`, если помещается);
   - иначе построить план через `VisualPlan.planForSlide` и вернуть `image_prompt`.
   - сохранить обратную совместимость: без `VisualPlan` — прежний текст.
4. `js/slides.js` (только если нужно для нулевого процента пустых слайдов):
   при автоподборе картинок неразрешённые `search:`/`commons:`-заготовки на
   содержательных слайдах заменяются на `data:image/svg+xml` из
   `VisualPlan.fallbackSvg(seed)` вместо пустого «Нет картинки» — только в режиме
   показа/экспорта, не в редакторе. Решение и точка вставки — за integration-dev,
   согласовать с Lead до правки `slides.js`.

## Тесты (обязательные)

`test/visualplan.test.mjs` (Node 24, `node --test`), без внешних пакетов:

- схема `planForSlide`/`planForLesson`;
- 5 стратегий достижимы на наборе примеров (биология, литература, история,
  география-карта, математика, английский, ИЗО, музыка);
- карта никогда не выбирается, `MAP_REQUEST` ловится;
- портрет никогда не уходит в FLUX, `PORTRAIT_VIA_FLUX` ловится;
- промпт всегда непустой, английский, без цифр, с `NEG_TAIL`;
- SVG-шаблоны проходят `validate`, ломающий SVG — нет;
- `acquire` при всех `null`-адаптерах возвращает fallback-url;
- фузз: 500+ случайных тем из списка не дают ни одного `EMPTY_SLIDE`/`NULL_PROMPT`;
- валидатор отрицает: кириллицу, цифры, отсутствие хвоста, карту, портрет во FLUX.

`tools/visual-audit.mjs` (Node, zero-dep):

- загружает `data/frp2025/*.js` через `node:vm` с заглушкой `window`;
- перечисляет ВСЕ уроки всех предметов/классов (темы `l[][0]`, дедуп),
  для каждого строит 6 синтетических слайдов урока (титул, цели, 3 содержательных,
  итог) с фактами из `th` (тематические блоки) или темы;
- прогоняет `planForSlide` + `validate` по каждому уроку, собирает статистику;
- критерии приёмки: **0** `EMPTY_SLIDE`, **0** `NULL_PROMPT`, **0** `MAP_REQUEST`,
  **0** `PROMPT_CYRILLIC`, **0** `PROMPT_DIGITS`, **0** `SVG_*` при валидных
  шаблонах; каждый урок даёт ≥ 1 слайд с непустым планом; распределение стратегий
  выводится в отчёт;
- пишет `tools/reports/visual-audit.json` и `tools/reports/visual-audit.md`
  (числа, проценты, примеры 3 JSON-планов, список нарушений);
- CLI: `node tools/visual-audit.mjs [--limit N] [--subject bio] [--out dir]`.
- Работает < 120 с на полном объёме.

## Приёмка (Definition of Done)

- [ ] `node --test test/visualplan.test.mjs` — зелёный.
- [ ] `node tools/visual-audit.mjs` — все критерии выше, отчёты записаны.
- [ ] `node --check js/visualplan.js js/deck.js js/app-part2.js js/slides.js`.
- [ ] На сайте (открыть `index.html`, сгенерировать/открыть урок с презентацией)
      нет ошибок в консоли, картинки подставляются/резерв срабатывает.
- [ ] Ни одного запроса карты и ни одного FLUX-портрета реального человека.
- [ ] Изменённые файлы перечислены, `git status` не содержит мусора.

---

# v1.2 (27.11.2026): запрет фантазий (grounded-only)

## Причина

Движок подставлял **предметные шаблоны по предмету**, когда тема не распознана:
`SUBJECT_OBJECT` (строки ~1445–1465) давал «one translucent living organism…»,
«one period artifact…», «one wooden musical instrument…», «one open exercise book…»,
«tuning fork», «safety demonstration object», «small electronic device»,
«clean sports object», «layered natural landscape», «artist palette»,
«quiet architectural detail» и т. п. Скан всех уроков: **11 674 из 21 313**
flux-слайдов (54,8 %) получали объект, которого нет в теме/фактах, и
**10 115** слайдов — обобщённый anchor («живой объект», «прибор и явление»,
«предметы эпохи»). Это и есть «придумывает и фантазирует»: ребёнок видит
инфузорию на уроке «Биология — наука о живой природе», артефакт на уроке
«Историческое познание» и т. п.

## Обязательные правила v1.2

1. **Никаких предметных объектов вне темы.** Конкретный объект (существо,
   растение, орган, прибор, вещество, артефакт, инструмент, здание, еда,
   спортивный инвентарь) допустим в `image_prompt`/anchor только если он
   **распознан из `topic` / `slide.title` / `slide.facts`** через grounded-лексикон
   (словоформы темы → точное английское описание). Совпадение по предмету
   (subject) само по себе не является опорой.
2. **Если объект не распознан — символический план.** Стратегия остаётся
   `flux_generation`, но промпт строится без предметов:
   `A clean educational symbolic composition of soft geometric shapes, gentle light
   and muted colour, expressing the idea of the lesson without any recognizable
   objects, specimens, tools, artifacts, people or buildings, …` (плюс
   `NEG_TAIL`). Anchor: `Символический образ темы: формы, свет и цвет, без конкретных
   объектов`. Паспорт: `Предметная атрибуция отсутствует: тема передаётся
   символически, чтобы не выдумывать объекты`.
3. **Убрать `SUBJECT_OBJECT` целиком.** Ни один фолбэк по предмету не должен
   добавлять предмет в промпт. Лексиконы объектов — только привязка
   «русская словоформа темы/факта → английский объект».
4. **Эпоха/регион — только по источнику.** В паспорте `Эпоха/регион` пишутся,
   только если они явно следуют из `topic`/`facts` (годы, века, названия эпох,
   страны, города, имена правителей). Никаких фолбэков «XIX век», «Древний мир»,
   «Европа».
5. **Внутренняя мета (без изменения публичной схемы).** `planForSlide` хранит
   `WeakMap`-мету: `{ grounded, objectKey, sourceWords, symbolic }`.
   Новые функции API: `VisualPlan.isSymbolic(plan) -> boolean`,
   `VisualPlan.grounding(plan) -> { grounded, objectKey, sourceWords, symbolic }`.
   В JSON плана поля не добавляются.
6. **Валидатор — новые коды:**
   - `UNGROUNDED_OBJECT` — в промпте конкретный объект, но meta.grounded=false
     либо нет опоры в теме/фактах (для внешних JSON — эвристика по словарю
     предметных шаблонов);
   - `GENERIC_ANCHOR` — anchor из запрещённого бойлерплейта («живой объект»,
     «прибор и явление», «предметы эпохи», «объекты безопасности», …);
   - `FAKE_OBJECT` — в промпте один из старых шаблонных объектов при отсутствии
     опоры (translucent living organism, period artifact, wooden musical
     instrument, open exercise book, tuning fork, safety demonstration object,
     small electronic device, clean sports object, layered natural landscape,
     artist palette, quiet architectural detail, …);
   - `UNSUPPORTED_ERA` — паспорт называет эпоху/регион, которых нет в источнике;
   - `SYMBOLIC_WITH_OBJECT` — план помечен символическим, но промпт содержит
     предмет.
   Для планов без meta (внешний JSON) применяются только эвристики по тексту.
7. **Аудит:** независимый детектор фантазий в `tools/visual-audit.mjs`
   (не полагаться только на `validate`): 0 `UNGROUNDED_OBJECT` / `FAKE_OBJECT` /
   `GENERIC_ANCHOR` / `UNSUPPORTED_ERA` на всех уроках; в отчёт добавить долю
   символических планов и распределение стратегий.
8. **Интеграция:** `aiDeckPics` не тратит FLUX на символические планы
   (`VisualPlan.isSymbolic(plan)`); для таких слайдов — собственные изображения
   урока из библиотеки (data/lesson-images.js), иначе локальный SVG-резерв.
   `deckImagePrompt` для символического плана возвращает символический промпт
   (без объектов).
9. **Тесты-регрессии (обязательно):** «Биология — наука о живой природе» →
   символический план без организма; «Историческое познание» → без артефакта;
   «Жанры музыки» → без инструмента; ru1 «Приставки» → без пера/тетради;
   lit1 «Сказки» → без tuning fork; физкультура «Значение физической культуры»
   → без мяча; ОБЖ «Безопасность в быту» → без «demonstration object»; химия
   «Атомы и молекулы» → только модель молекулы, если слово в теме; география
   «Население России» → без ландшафта; математика «Функции» → символический
   или svg, но без счётных кубиков. Плюс тесты на новые коды и на то, что
   grounded-темы («Инфузория-туфелька», «Сердце человека», «Вулканы») объект
   сохраняют.

# v1.2.1 (27.11.2026): объект только для предметной темы

Дополнительная причина фантазий: недостаточно убрать `SUBJECT_OBJECT`. Лексикон
матчил слова внутри абстрактных тем и подставлял предмет:
«Нейрогуморальная регуляция» → инфузория, «Генетика» → инфузория,
«Дыхание» → разрез органа, «Классификация животных» → домашнее животное,
«Биология в системе наук» → инфузория. Таких планов — **1 615** на абстрактных
темах (bio 57, geo 242, ru1 245, tech 174, hist 156, okr 136, lit1 135…).

Правила:

1. **Классификация темы** (по `topic` + `slide.title`):
   - `object` — тема называет **один конкретный предмет/существо/орган/
     вещество/прибор/произведение/персону**: «Инфузория-туфелька», «Сердце
     человека», «Вулканы», «Треугольник», «Электрическая цепь», «Кислоты? » —
     нет, это класс; «Строение инфузории» — да, объект в родительном падеже;
   - `group` — множества/классы/таксоны: «Простейшие», «Животные», «Растения»,
     «Грибы», «Бактерии», «Кислоты», «Металлы», «Жанры», «Виды», «Типы»;
   - `abstract` — процессы, свойства, теории, методы, отношения, институты:
     «Обмен веществ», «Фотосинтез», «Дыхание», «Развитие», «Эволюция»,
     «Генетика», «Классификация», «Систематика», «Методы», «История изучения»,
     «Строение вещества» (вещество — не единичный объект), «Значение»,
     «Охрана», «Безопасность», «Правила», «Отношения», «Деятельность»,
     «Культура», «Государство», «Право», «Экономика», «Информация», «Алгоритм»,
     «Модель», «Система», «Теория», «Закон», «Функция», «Технология» и т. п.
2. Конкретный объект в `image_prompt`/anchor допустим **только для `object`**.
   Для `group` — либо реальное изображение из библиотеки/поиска (с честной
   подписью), либо символический план; для `abstract` — только символический
   план (или `svg_code` для строгих схем), никаких предметов, органов, животных,
   приборов «по ассоциации».
3. Матчинг слов — по границам русских слов (кириллический word-boundary),
   не подстрокой; «животного» в «Классификация животных» не даёт объект.
4. WeakMap-мета дополняется `topicType: "object"|"group"|"abstract"`;
   `grounding()` возвращает и его. Валидатор: если `topicType !== "object"`,
   а в промпте есть предмет — `UNGROUNDED_OBJECT`.
5. Убрать «tuning fork» для lit1/ru1 (слишком широкие стемы «звук/колебан/волн»;
   камертон — только физика/музыка, и только если слово есть в теме).
6. «Репродукция» — только точное произведение: либо название в «ёлочках»
   совпадает с найденной статьёй, либо известная картина/художник из реестра.
   Если в теме только жанр («Пейзаж», «Натюрморт») — честный anchor
   «Пример произведения живописи по теме: пейзаж (атрибуция — по карточке
   статьи)» либо символический план, но не «Репродукция: «<тема>»».
7. Критерий приёмки v1.2.1: `work/abstract_scan.mjs` — 0 абстрактных тем с
   предметным промптом; `work/halluc_scan.mjs` — 0 UNGROUNDED/FAKE_OBJECT/
   GENERIC_ANCHOR/UNSUPPORTED_ERA; grounded-темы («Инфузория-туфелька»,
   «Сердце человека», «Вулканы», «Треугольник», «Шишкин», «Пушкин») объект
   сохраняют; доля символических планов выводится в отчёт.
