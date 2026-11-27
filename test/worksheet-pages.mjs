/* Проверка: рабочий лист с картинками печатается/показывается страницами A4,
   а не одной длинной страницей.
   Запуск: node test/worksheet-pages.mjs */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = f => fs.readFileSync(path.join(root, f), "utf8");
const app = read("js/app-part2.js");
const css = read("css/v5.css");
let failed = 0;
const ok = (cond, name, extra = "") => { if (cond) console.log(`  ok   ${name}`); else { failed++; console.log(`  FAIL ${name}${extra ? " — " + extra : ""}`); } };

console.log("1. Масштаб вписывания страницы (unit)");
{
  const line = app.split("\n").find(l => l.startsWith("const wsFitScale = ")) || "";
  ok(!!line, "функция wsFitScale есть");
  const ctx = vm.createContext({ Math });
  vm.runInContext(line + "\nthis.fn = wsFitScale;", ctx);
  const fit = ctx.fn;
  ok(fit(1000, 1000) === 1, "ровно в лист — масштаб 1");
  ok(fit(500, 1000) === 1, "меньше листа — масштаб 1");
  ok(fit(1250, 1000) === 0.8, "на 25% выше — 0.8", String(fit(1250, 1000)));
  ok(fit(2000, 1000) === 0.5, "вдвое выше — 0.5", String(fit(2000, 1000)));
  ok(fit(5000, 1000) === 0.2, "высокое содержимое не выходит за нижний край");
  ok(fit(500, 0) === 1, "нет ёмкости — без масштаба");
}

console.log("2. Страница больше не растягивается («одна большая» убрана)");
ok(!/page\.style\.height\s*=\s*"auto"/.test(app), "нет растягивания страницы на авто-высоту");
ok(app.includes("page.dataset.scaled"), "факт ужатия помечается");
ok(app.includes("wsFitScale(body.getBoundingClientRect().height"), "вписание применяется к содержимому страницы");
ok(/!page\.dataset\.scaled && page\.scrollHeight/.test(app), "проверка при выгрузке учитывает ужатые страницы");

console.log("3. Высокие задания с картинками делятся на страницы");
ok(app.includes("ws-cont"), "есть признак продолжения задания");
ok(app.includes("Продолжение задания"), "продолжение подписано");
ok(/img\.style\.maxHeight/.test(app), "высокая картинка сначала ужимается, чтобы влезть в лист");
ok(/row\.getBoundingClientRect\(\)\.height \+ WS_GAP/.test(app), "высота строк пересчитывается");

console.log("4. Печать в браузере: каждый лист — отдельная страница A4");
ok(/@media print\s*\{[\s\S]*?\.ws-page\.sheet\s*\{\s*break-after:\s*page/.test(css), "в CSS печати есть разрыв страницы после каждого листа");
ok(/break-inside:\s*avoid/.test(css.slice(css.indexOf("@media print"))), "лист не рвётся внутри");

if (failed) { console.log(`\nПРОВАЛ: ${failed}`); process.exit(1); }
console.log("\nВсе проверки пройдены.");
