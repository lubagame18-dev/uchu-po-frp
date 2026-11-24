/* Проверка ИИ-картинок в презентациях для всех предметов и уборки пустых мест.
   Запуск: node test/deck-ai-pics.mjs
   Проверяем:
   1) незаполненные поисковые заготовки удаляются, а настоящие картинки остаются;
   2) ИИ-картинки можно догенерировать вручную из редактора (кнопка «Картинки ИИ»);
   3) при сборке пустые рамки под картинки убираются всегда;
   4) фильтр «не рисуем для реальных портретов/картин» больше не запрещает генерацию:
      такие слайды получают нейтральную иллюстрацию с честной подписью. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = f => fs.readFileSync(path.join(root, f), "utf8");
const app = read("js/app-part2.js");
const slides = read("js/slides.js");
let failed = 0;
const ok = (cond, name, extra = "") => { if (cond) console.log(`  ok   ${name}`); else { failed++; console.log(`  FAIL ${name}${extra ? " — " + extra : ""}`); } };

/* вытаскиваем функцию dropPendingPics и проверяем её на настоящих примерах Markdown */
function extractFn(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) return "";
  let i = src.indexOf("{", start), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (!depth) break; }
  }
  return src.slice(start, i + 1);
}
const fnSrc = extractFn(app, "dropPendingPics");
ok(!!fnSrc, "функция dropPendingPics найдена");
const picLine = (app.split("\n").find(l => l.startsWith("const PIC_PENDING =")) || "").trim();
ok(!!picLine, "правило «что считать незаполненной заготовкой» найдено");
const ctx = vm.createContext({
  window: { Media: { RE: /!\[([^\]]*)\]\(\s*((?:search|commons):[^)"\n]*?|[^)\s]+)(?:\s+"([^"]*)")?\s*\)/g } },
  console: { log() { }, warn() { } },
  String, RegExp
});
vm.runInContext(picLine + "\nconst Media = window.Media;\n" + fnSrc, ctx);
const drop = md => vm.runInContext("dropPendingPics(__md)", Object.assign(ctx, { __md: md }));

const md = `## Слайд 1

- пункт

![Иллюстрация: дроби](search:%D0%B4%D1%80%D0%BE%D0%B1%D0%B8 "q: дроби")

![Карта](commons:%D0%BA%D0%B0%D1%80%D1%82%D0%B0 "q: карта")

![Готовая картинка](idb:img-1)

![Фото](https://example.com/photo.jpg)

## Слайд 2

текст без картинки`;
const out = drop(md);
ok(!/search:/.test(out), "заготовка search: убрана");
ok(!/commons:/.test(out), "заготовка commons: убрана");
ok(/idb:img-1/.test(out), "настоящая картинка из хранилища осталась");
ok(/https:\/\/example\.com\/photo\.jpg/.test(out), "картинка-ссылка осталась");
ok(/## Слайд 2/.test(out) && /текст без картинки/.test(out), "текст слайдов не потерялся");
ok(!/\n{3,}/.test(out), "нет лишних пустых строк после уборки");

console.log("1. Уборка пустых мест (unit) — проверено выше");

console.log("2. Кнопка «Картинки ИИ» в редакторе");
ok(slides.includes('id="sxAiPics"'), "кнопка есть в панели презентации");
ok(slides.includes('title="Нарисовать ИИ-картинки на слайды'), "у кнопки понятная подсказка");
ok(/DeckAiPics\.run\(\)/.test(slides), "кнопка запускает догенерацию картинок");
ok(slides.includes("dropPending"), "«Подобрать картинки» тоже убирает пустые места");

console.log("3. Генерация для всех предметов");
ok(/async function aiDeckPics\(L, opts = \{\}\)/.test(app), "aiDeckPics умеет и сборку, и ручной запуск");
ok(/window\.DeckAiPics = \{ run:/.test(app), "есть точка входа для кнопки");
ok(/manual \? 6 : 4/.test(app), "при ручном запуске больше картинок, при сборке — 4");
ok(!/filter\(i => !realVisual\(slides\[i\]\)\)/.test(app), "старый запрет на портреты/картины убран");
ok(/do not draw a recognisable face/.test(app), "для реальных людей/картин ИИ просят нейтральную иллюстрацию");
ok(/иллюстрация \(нейросеть\)/.test(app), "такая картинка подписана честно");
ok(/for \(const i of pick\)/.test(app) && /spreadIdx/.test(app), "слайды выбираются равномерно по презентации");

console.log("4. При сборке пустые рамки убираются всегда");
ok(/const clean = dropPendingPics\(L\.docs\.slides\)/.test(app), "сборка урока чистит незаполненные места");
ok(/formats\.includes\("slides"\) && L\.docs\?\.slides/.test(app), "делается это для презентаций");
ok(/L\._after = async[\s\S]{0,900}aiDeckPics\(L\)/.test(app), "этап ИИ-картинок подключён к сборке");

if (failed) { console.log(`\nПРОВАЛ: ${failed}`); process.exit(1); }
console.log("\nВсе проверки пройдены.");
